"""컷을 사용자가 정한 무비(기본 무비 · 손본 레시피 무비)에서 AI 몫만 다듬는다(specs MOV-29, trend-recipes §25).

레시피가 컷을 다시 고르는 무비(autoCuts)는 `trend_edit` 이 흔들림 · 박자 · 장면 순서 · 말소리를 한다. 그 밖의 무비는 컷 목록이 곧 결과라
- `refine`: **AI 가 자른 컷**(MOV-22 의 trimOwner ai)만 흔들리는 구간을 같은 스냅의 안정된 구간으로 옮기고 경계를 박자에 맞춘다 — 사용자 구간은 그대로
- `hook_first`: 장면 순서를 켠 AI 순서 무비에서 가장 강한 컷을 맨 앞으로 한 번 — 새로 이웃이 된 경계는 바로 넘김(고른 전환은 원래 두 컷 사이의 것이다)
- `speech_windows`: 결과물 시간의 발화 구간 — 말소리를 켠 무비가 그 구간만 원본을 살린다
"""

from dataclasses import dataclass, field

import numpy as np

from pipeline import beat_grid, continuity, editor, scenes, snap_signals, speech, steadiness
from pipeline import transition as tr
from pipeline.editor import ClipSource

# 기본 무비의 컷 길이는 사용자가 정한 범위라 레시피의 shotMs 가 없다 — 박자로 옮길 때 지나치게 짧거나 긴 컷만 막는다
SHOT_MS = (300, 10_000)


def _planned(clips: list[ClipSource], source_ms: list[int]) -> list[continuity.PlannedCut]:
    return [continuity.PlannedCut(k, c.start_ms, c.end_ms if c.end_ms is not None else source_ms[k], 1.0, None)
            for k, c in enumerate(clips)]


def refine(clips: list[ClipSource], ai: list[bool], source_ms: list[int], steady: list[steadiness.Steadiness],
           beats: tuple[int, ...], fps: int) -> list[ClipSource]:
    """AI 가 자른 컷만 — 흔들리면 같은 스냅 · 같은 길이의 안정된 구간으로, 그다음 경계를 박자로(beats 가 비면 박자는 건너뛴다)."""
    if not any(ai):
        return clips
    planned = steadiness.steady_windows(_planned(clips, source_ms), steady, source_ms,
                                        [None if a else steadiness.SEAM for a in ai])
    if beats:
        planned = continuity.snap_to_beats(planned, source_ms, beats, SHOT_MS, fps, movable=ai)
    return [ClipSource(c.path, p.start_ms, p.end_ms) if a else c for c, p, a in zip(clips, planned, ai)]


def hook_first(transitions: list[tr.Transition], motion: list[np.ndarray], shake: list[float]
               ) -> tuple[list[int], list[tr.Transition]]:
    """(새 순서, 새 경계 전환) — 흔들리지 않는 컷 중 움직임이 가장 큰 컷을 맨 앞으로(`scenes.hook`). 이미 맨 앞이거나 없으면 그대로."""
    hook = scenes.hook(motion, shake)
    n = len(motion)
    if hook is None or hook == 0:
        return list(range(n)), transitions
    order = [hook] + [i for i in range(n) if i != hook]
    moved = [transitions[a] if b == a + 1 else tr.Transition(tr.HARDCUT) for a, b in zip(order, order[1:])]
    return order, moved


def speech_windows(clips: list[ClipSource], spans: list[tuple[tuple[int, int], ...]], source_ms: list[int]) -> list[tuple[int, int]]:
    """결과물 시간(ms)의 발화 구간 — 컷 길이의 합이 무비 길이다(겹침 전환도 여분 프레임을 쓴다, MOV-22). 끝이 없는 컷은 원본 끝까지."""
    return speech.windows(_planned(clips, source_ms), spans)


@dataclass
class Applied:
    clips: list[ClipSource]
    transitions: list[tr.Transition]
    order: list[int] = field(default_factory=list)  # 새 순서 → 원래 컷 번호
    talking: list[tuple[int, int]] = field(default_factory=list)  # 결과물 시간의 발화 구간(ms)


def apply(clips: list[ClipSource], ai: list[bool], transitions: list[tr.Transition], editing: dict[str, bool],
          track: str | None, fps: int) -> Applied:
    """기본 무비 · 손본 레시피 무비의 AI 몫 다듬기 — 장면 순서(켰을 때) → AI 컷의 흔들림 · 박자 → 말소리 구간(켰을 때)."""
    order, done = list(range(len(clips))), Applied(clips, transitions)
    source_ms = [int(editor.probe_duration(c.path) * 1000) for c in clips]
    need_steady = any(ai) or editing.get("sceneOrder")
    steady = [steadiness.read(c.path) for c in clips] if need_steady else []
    if editing.get("sceneOrder") and len(clips) > 1:
        windows = _planned(clips, source_ms)
        motion = [np.asarray(continuity.read_series(c.path).motion[p.start_ms // continuity.STEP_MS:p.end_ms // continuity.STEP_MS])
                  for c, p in zip(clips, windows)]
        shake = [steadiness.cost(st, p.start_ms, p.end_ms) for st, p in zip(steady, windows)]
        order, done.transitions = hook_first(transitions, motion, shake)
        clips, ai = [clips[i] for i in order], [ai[i] for i in order]
        source_ms, steady = [source_ms[i] for i in order], [steady[i] for i in order]
    done.order = order
    done.clips = refine(clips, ai, source_ms, steady, _beats(track), fps) if any(ai) else clips
    if editing.get("speech"):
        done.talking = speech_windows(done.clips, [snap_signals.speech_spans(c.path) for c in done.clips], source_ms)
    return done


def _beats(track: str | None) -> tuple[int, ...]:
    if track is None:
        return ()
    try:
        return beat_grid.load_or_analyze(track).in_movie(600_000)
    except beat_grid.BeatGridError:
        return ()  # 박자를 못 읽으면 흔들림만 — 고정 간격은 박자가 아니다
