"""효과음 — 컷에서 보이는 것에 맞는 소리(사과 → 아삭)와 경계 · 등장의 소리(이음 · 전환 효과 · 분할 칸 · 얼굴 스티커)를 음원 위에 얹는다.

- 무엇을: `sfx-vocabulary.json` — 내용 개념(content id)과 키워드(분석의 자유 문자열)로 점수를 매겨 minScore 이상만
- 언제: 컷 안에서 움직임이 치솟는 순간(동작 — `accent_fit.peak_ms`) 또는 컷 시작. 경계 소리는 경계보다 조금 먼저
- 얼마나: 장면이 맞는 컷마다 하나, 같은 소리는 cooldownCuts 컷 안에 다시 쓰지 않고 한 편에 maxPerSound 번까지. 레시피의 max 가 있으면 점수 높은 순으로 거기까지
  (트렌드 레시피는 없음). 경계 소리는 다른 효과음과 minSpacingMs 안에 겹치면 뺀다
- 렌더: 효과음마다 앞을 잘라(maxMs) 끝을 줄이고 adelay 로 제자리에 놓아 amix(정규화 없이) — 영상은 다시 인코딩하지 않는다

실패하면 효과음 없이 간다(호출하는 쪽에서). 결정: docs/decisions/trend-recipes.md
"""

import subprocess
from dataclasses import dataclass, replace
from functools import lru_cache

import numpy as np

import config
from pipeline import accent_fit, text_accent as ta
from pipeline import vocabulary as _vocabulary

VOCABULARY: dict = _vocabulary.load("sfx-vocabulary.json")
SFX_VOCABULARY_VERSION: int = VOCABULARY["sfxVocabularyVersion"]
SOUNDS: dict[str, dict] = VOCABULARY["sounds"]
SEAMS: dict[str, dict] = VOCABULARY["seams"]
SFX_DIR = config.WORKER_ROOT / "assets" / "sfx"
TEXT_FIELDS = ("summary", "topics", "places", "objects", "actions")
OUT_FADE_MS = 80


@dataclass(frozen=True)
class SfxEvent:
    at_ms: int
    file: str
    max_ms: int
    gain_db: float
    reason: str


def _text(analysis: dict) -> str:
    parts = [analysis.get("summary") or ""]
    for fld in TEXT_FIELDS[1:]:
        parts += list(analysis.get(fld) or [])
    return " ".join(parts)


def score(sound: dict, cut: ta.CutContext, analysis: dict) -> tuple[int, list[str]]:
    total, hits = 0, []
    for fld, wanted in sound["evokedBy"].items():
        if any(ta.lineage(fld, c) & set(wanted) for c in cut.concepts.get(fld, ())):
            total += VOCABULARY["fieldWeights"][fld]
            hits.append(f"{fld}:{','.join(wanted)}")
    text = _text(analysis)
    for word in sound.get("notKeywords", ()):
        text = text.replace(word, " ")
    found = [k for k in sound["keywords"] if k in text]
    if found:
        total += VOCABULARY["keywordWeight"]
        hits.append(f"키워드:{found[0]}")
    return total, hits


@lru_cache(maxsize=64)
def transient_ms(file: str) -> int:
    """효과음 파일에서 소리가 '탁' 터지는 순간(ms) — 앞 0.6초의 20ms 창 에너지가 가장 크게 오르는 곳. 이 순간을 동작 피크에 맞춘다
    (파일 앞에 숨이 있으면 그만큼 일찍 시작해야 한다). 읽지 못하면 0."""
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-t", "0.6", "-i", str(SFX_DIR / file), "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], capture_output=True).stdout
    y = np.frombuffer(pcm, np.float32)
    hop = 320  # 20ms
    if len(y) < hop * 2:
        return 0
    energy = np.array([float(np.sum(y[i:i + hop] ** 2)) for i in range(0, len(y) - hop, hop)])
    rise = np.diff(energy, prepend=0.0)
    return int(np.argmax(rise)) * 20


def _at(sound: dict, cut: ta.CutContext) -> int:
    if sound["anchor"] == "action":
        peak = accent_fit.peak_ms(cut.motion, cut.start_ms)
        return peak if peak is not None else cut.start_ms + (cut.end_ms - cut.start_ms) * 3 // 10
    return cut.start_ms + 80


def plan(cuts: list[ta.CutContext], analyses: list[dict], seams: list[tuple[int, str]], cfg: dict) -> list[SfxEvent]:
    """컷 소리 + 경계 소리. seams 는 (결과물 ms, 종류) — 종류는 사전 seams 의 키. cfg 는 레시피의 sfx(max · minScore · seams)."""
    picks = []
    for i, (cut, analysis) in enumerate(zip(cuts, analyses)):
        scored = [(score(s, cut, analysis), sid) for sid, s in SOUNDS.items()]
        scored = [((pts, hits), sid) for (pts, hits), sid in scored if pts >= cfg.get("minScore", 3)]
        if scored:
            (pts, hits), sid = max(scored, key=lambda item: (item[0][0], item[1]))
            picks.append((pts, i, sid, hits))
    chosen: list[tuple[int, str, list[str]]] = []
    for pts, i, sid, hits in sorted(picks, key=lambda p: (-p[0], p[1])):
        if cfg.get("max") is not None and len(chosen) >= cfg["max"]:
            break
        same = [other_i for other_i, other_sid, _ in chosen if other_sid == sid]
        # 같은 소리는 cooldownCuts 컷 안에 다시 쓰지 않고, 한 편에 maxPerSound 번까지(같은 '바스락'이 세 번 났다 — 2026-10-22)
        if all(abs(other_i - i) > VOCABULARY["cooldownCuts"] for other_i in same) and len(same) < VOCABULARY["maxPerSound"]:
            chosen.append((i, sid, hits))
    events = []
    for i, sid, hits in sorted(chosen):
        sound = SOUNDS[sid]
        at = _at(sound, cuts[i])
        if sound["anchor"] == "action":
            at = max(0, at - transient_ms(sound["file"]))  # 소리가 터지는 순간이 동작 피크에 오게
        events.append(SfxEvent(at, sound["file"], sound["maxMs"], sound["gainDb"], f"{sound['label']} ← {' · '.join(hits)}"))
    if cfg.get("seams"):
        spacing = VOCABULARY["minSpacingMs"]
        for boundary, kind in sorted(seams):
            s = SEAMS.get(kind)
            if s is None:
                continue
            at = max(0, boundary - s["leadMs"])
            if all(abs(at - e.at_ms) >= spacing for e in events):
                events.append(SfxEvent(at, s["file"], s["maxMs"], s["gainDb"], f"경계 {kind}"))
    return arrange(sorted(events, key=lambda e: e.at_ms))


def arrange(events: list[SfxEvent]) -> list[SfxEvent]:
    """동시에 울리는 효과음을 maxVoices 개까지(넘으면 경계 소리부터 뺀다), 앞 소리의 꼬리는 다음 소리와 tailOverlapMs 까지만 겹치게."""
    voices, overlap = VOCABULARY["maxVoices"], VOCABULARY["tailOverlapMs"]
    kept: list[SfxEvent] = []
    for e in events:
        sounding = [k for k in kept if k.at_ms + k.max_ms > e.at_ms]
        if len(sounding) >= voices:
            if e.reason.startswith("경계") or all(not k.reason.startswith("경계") for k in sounding):
                continue  # 새 소리가 경계 소리거나 울리는 것이 전부 장면 소리면 새 소리를 뺀다
            drop = next(k for k in sounding if k.reason.startswith("경계"))
            kept.remove(drop)
        kept.append(e)
    out = []
    for k, e in enumerate(kept):
        nxt = kept[k + 1] if k + 1 < len(kept) else None
        if nxt is not None and e.at_ms + e.max_ms > nxt.at_ms + overlap:
            e = replace(e, max_ms=max(120, nxt.at_ms + overlap - e.at_ms))
        out.append(e)
    return out


def mix_into(video_in: str, events: list[SfxEvent], out: str, duck: bool = False) -> str:
    """효과음을 무비 소리에 얹는다. 효과음이 없으면 입력 그대로. duck 이면 효과음이 날 때 음원을 잠깐 낮춘다(sidechaincompress)."""
    if not events:
        return video_in
    inputs, parts = ["-i", video_in], []
    for k, e in enumerate(events, start=1):
        inputs += ["-i", str(SFX_DIR / e.file)]
        fade_at = max(0, e.max_ms - OUT_FADE_MS) / 1000
        parts.append(f"[{k}:a]atrim=0:{e.max_ms / 1000:.3f},afade=t=out:st={fade_at:.3f}:d={OUT_FADE_MS / 1000:.3f},"
                     f"aresample=48000,aformat=channel_layouts=stereo,volume={e.gain_db:g}dB,"
                     f"adelay={e.at_ms}|{e.at_ms}[s{k}]")
    labels = "".join(f"[s{k}]" for k in range(1, len(events) + 1))
    if duck:
        # 효과음 묶음은 마지막 효과음에서 끝난다 — 그대로 사이드체인에 넣으면 압축기가 거기서 멈춰 음원까지 끊긴다(2026-10-22, 15.5초 무비의
        # 소리가 9.2초에서 끝남). 무음으로 늘려 두고 길이는 음원(duration=first)이 정한다
        d = VOCABULARY["duck"]
        graph = (";".join(parts) + f";{labels}amix=inputs={len(events)}:normalize=0,apad[fx];[fx]asplit=2[sc][fxout];"
                 f"[0:a]aresample=48000,aformat=channel_layouts=stereo[music];"
                 f"[music][sc]sidechaincompress=threshold={d['threshold']}:ratio={d['ratio']}:attack={d['attackMs']}:"
                 f"release={d['releaseMs']}[ducked];[ducked][fxout]amix=inputs=2:duration=first:normalize=0[a]")
    else:
        graph = ";".join(parts) + f";[0:a]{labels}amix=inputs={len(events) + 1}:duration=first:normalize=0[a]"
    result = subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[a]",
                             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", out], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"효과음 합성 실패: {result.stderr[-500:]}")
    return out
