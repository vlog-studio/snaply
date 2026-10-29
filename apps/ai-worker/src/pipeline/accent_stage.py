"""편집 워커의 텍스트 액센트 · 이모지 스티커 단계 — BGM 을 입힌 편집본 위에 굽는다.

입력은 이미 있는 것만 쓴다: 컷의 원본 구간(editSpec v3 timeline), 스냅 분석(내용 개념 — `pipeline/content.py` 로 정규화),
스냅 신호(`video_signals.motion`), 원본 프레임(배경 밝기), 고른 BGM 의 비트 그리드(`pipeline/beat_grid.py`). 층 a(사전)와
영상 맞춤 규칙만 쓴다 — 생성(층 c)은 렌더 때 부르지 않는다(다시 만들 때 결과가 바뀌면 MOV-14 가 깨진다).

- **실패해도 무비를 실패시키지 않는다** — BGM · 자막 · 마지막 손질과 같다(backlog E-51). 이 단계 없이 그대로 간다
- **같은 무비는 같은 결과** — 시드는 무비 id 에서, 입력(분석 · 신호 · 곡 · 사전 버전)이 같으면 같은 글 · 자리 · 시각이다.
  고른 결과를 스펙에 핀으로 남기는 것은 아직이다(backlog A-19)
- 피사체 상자는 아직 분석에 없어 빈 모서리 · 위쪽 띠에만 놓인다(backlog A-19)

결정: docs/decisions/text-accent-stickers.md
"""

import hashlib
import os
import subprocess
from dataclasses import dataclass, field

from loguru import logger

from pipeline import (accent_inputs, accent_render, ass, beat_grid, content, density, ffmpeg_error, recipe, seed, sfx,
                      sticker, sticker_render, title_card)
from pipeline import text_accent as ta

# 곡이 없거나 분석하지 못했을 때의 박자 간격(120 BPM)
FALLBACK_BEAT_MS = 500
FINAL_CRF = "20"


@dataclass(frozen=True)
class CutSource:
    """컷 하나 — 원본 스냅과 그 안의 구간."""

    video_id: str
    path: str
    start_ms: int
    end_ms: int
    source_ms: int


@dataclass
class Outcome:
    applied: bool = False
    accents: list[str] = field(default_factory=list)
    stickers: int = 0
    bpm: float | None = None
    reason: str = ""
    sfx: list[str] = field(default_factory=list)
    title: bool = False


def stage_seed(movie_id: str) -> int:
    """무비 id → style-director 스테이지 시드. editSpec v3 에 seed 가 들어오면 그 root 를 쓴다(A-7)."""
    root = int(hashlib.sha256(movie_id.encode()).hexdigest()[:13], 16) % (seed.ROOT_MAX + 1)
    return seed.derive_stage_seed(root, "style-director", 0)


def build_cuts(cuts: list[CutSource], analyses: dict[str, dict], motions: dict[str, list[float]],
               fit_mode: str = "blur_background") -> list[ta.CutContext]:
    """결과물 시간축의 컷 — 경계는 컷 길이의 누적이다(겹침 전환은 경계 양쪽에 반씩 걸쳐 경계가 그대로다)."""
    contexts, t = [], 0
    for i, cut in enumerate(cuts):
        length = max(0, cut.end_ms - cut.start_ms)
        contexts.append(ta.CutContext(
            f"c{i}", t, t + length,
            content.concepts_of(analyses.get(cut.video_id) or {}),
            None,
            motion=accent_inputs.cut_motion(motions.get(cut.video_id) or (), cut.start_ms, cut.end_ms),
            luma=_luma(cut, fit_mode),
        ))
        t += length
    return contexts


def _luma(cut: CutSource, fit_mode: str):
    try:
        return accent_inputs.luma_grid(cut.path, accent_inputs.representative_ms(cut.start_ms, cut.end_ms, cut.source_ms),
                                       fit_mode)
    except accent_inputs.AccentInputError as exc:
        logger.warning("대표 프레임을 읽지 못해 대비 규칙 없이 간다 ({}): {}", cut.video_id, exc)
        return None


def beats_for(track_path: str | None, movie_ms: int) -> tuple[tuple[int, ...] | int, float | None]:
    """(무비 시간축의 박자 목록 또는 고정 간격, BPM). 곡이 없거나 박자를 못 찾으면 고정 간격."""
    if track_path is None:
        return FALLBACK_BEAT_MS, None
    try:
        grid = beat_grid.load_or_analyze(track_path)
    except beat_grid.BeatGridError as exc:
        logger.warning("비트 그리드를 만들지 못해 고정 간격으로 간다: {}", exc)
        return FALLBACK_BEAT_MS, None
    beats = grid.in_movie(movie_ms)
    return (beats, grid.bpm) if len(beats) >= 2 else (FALLBACK_BEAT_MS, None)


def render(video_in: str, contexts: list[ta.CutContext], beats, movie_id: str, work_dir: str, out: str,
           spec: dict | None = None, analyses: list[dict] | None = None) -> Outcome:
    """글 · 스티커 · (레시피면) 고정 타이틀 · 효과음. spec 은 레시피(없으면 classic — 지금까지와 같다)."""
    spec = spec or recipe.get(recipe.CLASSIC).spec
    analyses = analyses or [{} for _ in contexts]
    seed_value = stage_seed(movie_id)
    accents = density.limit_accents(ta.plan(contexts, beats, seed_value).accents, contexts, spec["accents"])
    stickers = density.limit_stickers(sticker.plan(contexts, accents, beats, seed_value), accents, spec["stickers"])
    total_ms = max(c.end_ms for c in contexts)
    title = spec.get("title")
    cuts = [(c.start_ms, c.end_ms) for c in contexts]
    events = title_card.events(title["style"], analyses, total_ms, title.get("holdMs"), cuts) if title else []
    sounds = sfx.plan(contexts, analyses, [], spec["sfx"])
    if not accents and not stickers and not events and not sounds:
        return Outcome(reason="붙일 것이 없다(분석 · 장소 개념 없음)")
    current = video_in
    if accents or stickers or events:
        track = sticker_render.bake_overlay(stickers, total_ms + 1000, os.path.join(work_dir, "accent_stickers.mov"))
        document = os.path.join(work_dir, "accents.ass")
        with open(document, "w", encoding="utf-8") as f:
            f.write(accent_render.build_document(accents, title_card.styles() if events else [], events))
        current = os.path.join(work_dir, "with_overlay.mp4")
        composite(video_in, track, document, current)
    if sounds:
        sfx.mix_into(current, sounds, out)
    else:
        os.replace(current, out)
    return Outcome(True, [a.choice.text for a in accents], len(stickers), sfx=[s.reason for s in sounds], title=bool(events))


def composite(video_in: str, track: str, document: str, out: str) -> None:
    """영상 → 스티커 트랙 → 글 순서로 겹친다. 소리는 그대로 둔다."""
    graph = f"[0:v][1:v]overlay=0:0:format=auto:eof_action=pass[st];[st]{ass.filter_arg(document)}[v]"
    result = subprocess.run(
        ["ffmpeg", "-nostats", "-y", "-i", video_in, "-i", track, "-filter_complex", graph,
         "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", FINAL_CRF,
         "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "copy", out],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"액센트 합성 실패: {ffmpeg_error.describe(result.returncode, result.stderr, 500)}")


def apply(video_in: str, cuts: list[CutSource], analyses: dict[str, dict], motions: dict[str, list[float]],
          track_path: str | None, movie_ms: int, movie_id: str, work_dir: str, out: str,
          recipe_name: str | None = None, fit_mode: str = "blur_background") -> tuple[str, Outcome]:
    """굽기를 시도한다. 반환: (결과 경로, 무엇을 붙였나). 실패하면 입력 그대로."""
    try:
        beats, bpm = beats_for(track_path, movie_ms)
        per_cut = [analyses.get(c.video_id) or {} for c in cuts]
        outcome = render(video_in, build_cuts(cuts, analyses, motions, fit_mode), beats, movie_id, work_dir, out,
                         recipe.get(recipe_name).spec, per_cut)
        outcome.bpm = bpm
    except Exception as exc:  # noqa: BLE001 — 꾸밈이 없다고 무비를 실패시키지 않는다
        logger.warning("텍스트 액센트 단계 실패 — 없이 진행: {}", exc)
        _capture(exc)
        return video_in, Outcome(reason=f"실패: {type(exc).__name__}")
    return (out if outcome.applied else video_in), outcome


def _capture(exc: BaseException) -> None:
    if not os.environ.get("SENTRY_DSN"):
        return
    import sentry_sdk

    sentry_sdk.capture_exception(exc)
