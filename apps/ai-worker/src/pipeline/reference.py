"""레퍼런스 분석 — 마음에 드는 숏브이로그 한 편에서 레시피 값을 읽는다(컷 길이 · 박자 맞춤 · 이음 · 원본 음성).

2026-10-22 레퍼런스 릴스 4편을 손으로 분석한 방법을 코드로 옮긴 것이다(docs/decisions/trend-recipes.md). 트렌드가 바뀌면 새 레퍼런스를
넣어 레시피를 고치거나 더한다 — 이 모듈은 값을 제안할 뿐 레시피를 쓰지 않는다.

- 컷: 이웃 프레임의 밝기 분포(히스토그램)가 크게 바뀌는 곳. 휩팬(카메라를 휙 돌림)은 화면이 흘러갈 뿐 분포가 비슷해 컷으로 세지 않는다
- 박자: 소리의 비트 그리드(`beat_grid`) — 컷이 박자에서 80ms 안이면 '박자에 맞은 컷'
- 경계 쌍(`boundaries`): 컷마다 앞 컷 끝 · 다음 컷 시작의 범용 특징(`match_cut.ShotEnd` — 피사체 · 구도 · 움직임 · 색)과 연결 점수.
  사용자 클립을 이을 때와 **같은 특징**이라, 레퍼런스의 경계 쌍이 쌓이면 묶어서(군집화) 전환 패턴을 찾고 그대로 적용할 수 있다
  (docs/decisions/trend-recipes.md §8, backlog). 원본 영상은 남기지 않고 이 특징값만 남긴다
"""

from dataclasses import dataclass

import numpy as np

from pipeline import continuity, match_cut, recipe

CUT_HIST = 0.35
ON_BEAT_MS = 80


@dataclass
class Reading:
    duration_ms: int
    cuts_ms: list[int]
    shot_median_ms: int
    shot_p20_ms: int
    shot_p80_ms: int
    covers: int
    whips: int
    bpm: float | None
    on_beat_ratio: float | None
    speech: bool | None
    suggestion: str


def cuts_of(s: continuity.Series) -> list[int]:
    """히스토그램이 크게 바뀌는 프레임(ms). 붙어 있는 후보는 하나로."""
    hist = [np.histogram(f, bins=16, range=(0, 1))[0] / f.size for f in s.thumbs]
    jumps = [i for i in range(1, len(hist)) if 0.5 * np.abs(hist[i] - hist[i - 1]).sum() > CUT_HIST]
    merged = [j for k, j in enumerate(jumps) if k == 0 or j - jumps[k - 1] > 2]
    return [j * continuity.STEP_MS for j in merged]


def suggest(shot_median_ms: int, speech: bool | None, letterbox: bool = False, on_beat: float | None = None) -> str:
    """가장 가까운 포맷 — 원본 음성이 남아 있으면 하루로그, 레터박스면 시네마틱, 짧은 컷은 박자에 맞으면 비트싱크 · 아니면 빠른 컷,
    중간은 루틴, 긴 컷은 하루 타임스탬프."""
    if speech:
        return "daylog"
    if letterbox:
        return "cinematic"
    if shot_median_ms < 650:
        return "beat-sync" if (on_beat or 0) >= 0.6 else "fast-cut"
    if shot_median_ms <= 1300:
        return "trend-routine"
    return "day-stamp"


def letterbox(s: continuity.Series) -> bool:
    """세로 화면 위아래가 내내 검은가(시네마틱 레터박스) — 가운데 프레임들에서 위 · 아래 20% 행이 거의 검으면."""
    if not len(s.thumbs):
        return False
    frames = s.thumbs[len(s.thumbs) // 4: max(len(s.thumbs) // 4 + 1, 3 * len(s.thumbs) // 4)]
    rows = frames.mean(axis=(0, 2))
    edge = max(1, int(len(rows) * 0.2))
    return float(rows[:edge].mean()) < 0.06 and float(rows[-edge:].mean()) < 0.06 and float(rows[edge:-edge].mean()) > 0.15


def to_recipe(reading: "Reading", is_letterbox: bool = False) -> tuple[str, dict]:
    """레퍼런스 따라 하기(§11) — 가까운 포맷을 바탕으로 레퍼런스에서 잰 값으로 덮은 즉석 레시피(이름, 설정).

    덮는 값: 컷 길이(20~80 분위, 0.4~3초 안), 박자 맞춤(박자에 맞은 컷이 반 이상이면), 화면 틀(레터박스), 전환 효과 비율(휩팬이 컷의 몇 분의
    몇인가 — 휩은 컷 전환 효과의 whip 으로). 나머지(효과음 · 글 · 타이틀)는 바탕 포맷 그대로 — 사람이 검수해 포맷으로 올리는 출발점이다."""
    base = suggest(reading.shot_median_ms, reading.speech, is_letterbox, reading.on_beat_ratio)
    spec = {k: (dict(v) if isinstance(v, dict) else v) for k, v in recipe.get(base).spec.items()}
    lo = int(min(3000, max(400, reading.shot_p20_ms)))
    hi = int(min(3000, max(lo + 200, reading.shot_p80_ms)))
    spec["continuity"] = {**spec["continuity"], "shotMs": [lo, hi],
                          "beatSnap": bool(reading.on_beat_ratio is not None and reading.on_beat_ratio >= 0.5)}
    if is_letterbox:
        spec["frame"] = "letterbox"
    cuts = max(1, len(reading.cuts_ms))
    whip_rate = min(0.6, reading.whips / cuts)
    if whip_rate > 0.05:
        spec["transitions"] = {"rate": round(whip_rate, 2), "palette": {"whip": 1}}
    spec["label"] = f"레퍼런스 따라 하기 — {base} 바탕, 컷 {lo}~{hi}ms"
    return base, spec


def read(s: continuity.Series, beats: tuple[int, ...] | None = None, bpm: float | None = None,
         speech: bool | None = None) -> Reading:
    cuts = cuts_of(s)
    shots = np.diff([0, *cuts, s.length_ms]) if s.length_ms else np.array([0])
    on_beat = None
    if beats and cuts:
        on_beat = round(sum(1 for c in cuts if min(abs(b - c) for b in beats) <= ON_BEAT_MS) / len(cuts), 2)
    median = int(np.median(shots))
    return Reading(s.length_ms, cuts, median, int(np.percentile(shots, 20)), int(np.percentile(shots, 80)),
                   len(continuity.covers(s)), len(continuity.whips(s)), bpm, on_beat, speech,
                   suggest(median, speech, letterbox(s), on_beat))


def boundaries(path: str, cuts_ms: list[int], duration_ms: int, size: tuple[int, int] = (90, 160)) -> list[dict]:
    """컷마다 {at_ms, prev_end, next_start, link} — 앞 컷 끝 · 다음 컷 시작의 특징과 둘의 연결 점수(태그는 없어 0)."""
    edges = [0, *cuts_ms, duration_ms]
    shots = [match_cut.ends_of(path, a, b, size) for a, b in zip(edges, edges[1:]) if b - a >= 200]
    out = []
    for at, (prev, nxt) in zip(cuts_ms, zip(shots, shots[1:])):
        part = match_cut.link(prev[1], nxt[0], set(), set())
        out.append({"at_ms": at, "prev_end": prev[1].as_dict(), "next_start": nxt[0].as_dict(),
                    "link": {k: round(v, 2) for k, v in part.items()}})
    return out
