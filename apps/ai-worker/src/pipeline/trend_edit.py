"""트렌드 숏브이로그 한 편 — 레시피대로 스냅을 이어 붙인다(docs/decisions/trend-recipes.md).

1. 스냅마다 이음 신호를 재고(`continuity.read_series`) 컷 구간 · 배속 · 이음을 정한다(`continuity.plan_cuts`) — 박자는 곡의 비트,
   무비가 minMovieMs 보다 짧으면 같은 스냅의 점프컷을 더한다
2. 효과를 정한다(`cut_fx.plan` — 이음이 없는 경계의 전환 효과 · 줌 · 화면 분할, `look.choose` — 색 필터)
3. 컷마다 정규화 · 배속 · 효과 · 색을 인코딩 한 번에 굽고(`editor.prepare_segments` + `cut_fx.video_filter`), 분할은 칸을 쌓아 한 번 더
   (`cut_fx.split`), 다시 인코딩하지 않고 잇는다(`editor.join_prepared` — 전환 효과는 모두 구간 안에 있다). 중간 파일은 가장 빠른 설정이고
   결과물 설정의 인코딩은 글 · 스티커 합성(없으면 `_final_encode`) 한 번이다
4. 소리: 레시피의 원본 · BGM 크기(`music.mix` — 음원만이면 원본을 뺀다)
5. 글 · 스티커: 고정 타이틀(`title_card`) + 장면이 맞는 순간의 글 · 이모지(`density`) + 얼굴 스티커(`face`)
6. 효과음: 컷에서 보이는 것 · 이음 · 전환 효과 · 분할 칸 · 얼굴 스티커(`sfx`)
7. 마지막 손질(`editor.finalize` — -14 LUFS)

컷 구간을 정하므로 AI 가 정한 컷에만 쓴다 — 사용자가 자른 컷은 그대로 둬야 한다(trimOwner). 지금은 데모 · AI 초안 단계가 부르는 자리다(backlog).
"""

import os
import subprocess
from contextlib import nullcontext
from dataclasses import dataclass, field, replace
from datetime import datetime

import numpy as np
from loguru import logger

from pipeline import (accent_inputs, accent_render, beat_grid, continuity, content, cut_fx, density, editor, face, fast_cut,
                      layout, look as lk, match_cut, music, recipe, scenes, sfx, snap_signals, speech, steadiness, sticker, sticker_render, subject, text_accent as ta,
                      title_card)
from pipeline import transition as tr
from pipeline.accent_stage import FALLBACK_BEAT_MS, composite, letterbox_safe_box, stage_seed
from pipeline.render_spec import DEFAULT_RENDER_SPEC, band_area

# 끝맺음 — 마지막 단위의 화면을 검게, 소리를 길게 닫는다(마지막 컷에서 뚝 끊겨 영상이 중간에 잘린 듯 보였다 — 2026-10-22)
END_FADE_S, END_AUDIO_FADE_S = 0.5, 1.0


@dataclass(frozen=True)
class Snap:
    path: str
    analysis: dict
    captured_at: datetime | None = None  # 촬영 시각 — 하루 타임스탬프 포맷의 글 · 촬영 순서
    lined_up_with: str | None = None  # 겹쳐 보며 이어 찍은 앞 컷(짝)의 파일 경로 — 순서를 고를 때 붙일 후보로 우대(SNAP-24)


@dataclass
class Result:
    path: str
    duration_s: float
    bpm: float | None
    cuts: list[dict] = field(default_factory=list)
    accents: list[str] = field(default_factory=list)
    stickers: int = 0
    sfx: list[str] = field(default_factory=list)
    title: tuple[str, str] | None = None
    transitions: list[str] = field(default_factory=list)
    splits: list[tuple[int, int]] = field(default_factory=list)
    look: str | None = None
    faces: list[str] = field(default_factory=list)
    order: list[int] = field(default_factory=list)  # 결과물 순서 → 입력 스냅 번호
    links: list[dict] = field(default_factory=list)  # 경계마다 연결 점수(매치컷 레시피)
    dropped: list[int] = field(default_factory=list)
    stabilized: list[int] = field(default_factory=list)  # 손떨림을 보정한 컷(결과물 순서, §21)  # 어디를 잘라도 흔들려 쓰지 않은 입력 스냅 번호(§20)
    edl: dict = field(default_factory=dict)  # 편집 결정 목록(EDL) — 무엇을 어디서 어떻게 잘라 무엇을 얹었나(§10)


def _beats(track: str | None, until_ms: int):
    if track is None:  # 곡이 없다(버킷에 곡이 없거나 받지 못함) — 고정 간격
        return beat_grid.uniform(FALLBACK_BEAT_MS, until_ms), None
    try:
        grid = beat_grid.load_or_analyze(track)
    except beat_grid.BeatGridError:
        return beat_grid.uniform(FALLBACK_BEAT_MS, until_ms), None
    beats = grid.in_movie(until_ms)
    return (beats, grid.bpm) if len(beats) >= 2 else (beat_grid.uniform(FALLBACK_BEAT_MS, until_ms), None)


def _plan(snaps: list[Snap], series: list[continuity.Series], concepts: list[dict], beats, spec: dict):
    if spec["continuity"]["enabled"]:
        return continuity.plan_cuts(series, concepts, beats, spec)
    return [continuity.PlannedCut(i, 0, s.length_ms, 1.0, None) for i, s in enumerate(series)]


def _contexts(snaps, series, concepts, planned, subjects=None, spec: dict | None = None) -> list[ta.CutContext]:
    """결과물 시간축의 컷 — 배속 컷의 움직임 곡선은 그 배수만큼 솎는다. 피사체는 매치컷이 찾은 것이 먼저(결과물 프레임에서 잰 값),
    없으면 스냅 분석의 프레임별 상자를 컷의 화면 틀(꽉 채움 · 레터박스 띠)로 옮긴 것."""
    contexts, t = [], 0
    area = _frame_area(spec)
    w, h = DEFAULT_RENDER_SPEC.width, DEFAULT_RENDER_SPEC.height
    frame = (area[0] / w, area[1] / h, (area[0] + area[2]) / w, (area[1] + area[3]) / h) if area else None  # 레터박스 띠 사이
    for k, cut in enumerate(planned):
        motion = series[cut.index].motion[cut.start_ms // continuity.STEP_MS: cut.end_ms // continuity.STEP_MS]
        motion = tuple(motion[round(j * cut.speed)] for j in range(int(len(motion) / cut.speed)))
        try:
            luma = accent_inputs.luma_grid(snaps[cut.index].path, (cut.start_ms + cut.end_ms) // 2)
        except accent_inputs.AccentInputError:
            luma = None
        found = (subjects[k] if subjects else None) or subject.for_cut(
            snaps[cut.index].analysis, snaps[cut.index].path, (cut.start_ms + cut.end_ms) // 2, "cover", _frame_area(spec))
        contexts.append(ta.CutContext(f"c{k}", t, t + cut.out_ms, concepts[cut.index], found, motion=motion, luma=luma, frame=frame))
        t += cut.out_ms
    return contexts


def drop_ms(track: str, until_ms: int) -> int | None:
    """음원의 '드롭' — 2초 뒤부터 무비 끝까지, 앞 1초보다 뒤 1초의 소리 에너지가 가장 크게 오르는 순간(ms)."""
    try:
        y = beat_grid.decode(track)
    except Exception:  # noqa: BLE001 — 못 읽으면 드롭 없이
        return None
    sr = beat_grid.SAMPLE_RATE
    hop = sr // 10
    energy = np.array([float(np.mean(y[i:i + hop] ** 2)) for i in range(0, min(len(y), sr * until_ms // 1000) - hop, hop)])
    if len(energy) < 40:
        return None
    rise = [(energy[i:i + 10].mean() - energy[i - 10:i].mean(), i) for i in range(20, len(energy) - 10)]
    return max(rise)[1] * 100 if rise else None


def _flash_at_drop(fx: cut_fx.Plan, planned, track: str) -> None:
    """음원 드롭에 가장 가까운 바로 넘김 경계에 플래시(비트싱크 포맷)."""
    total = sum(c.out_ms for c in planned)
    at = drop_ms(track, total)
    if at is None:
        return
    starts, t = [], 0
    for c in planned[:-1]:
        t += c.out_ms
        starts.append(t)
    cands = [(abs(b_at - at), b) for b, b_at in enumerate(starts) if fx.boundaries[b] == "hardcut"]
    if not cands:
        return
    b = min(cands)[1]
    fx.boundaries[b] = "flash"
    fx.cuts[b] = replace(fx.cuts[b], outro="flash")
    fx.cuts[b + 1] = replace(fx.cuts[b + 1], intro="flash")


def _frame_area(spec: dict | None) -> tuple[float, float, float, float] | None:
    """컷이 화면에 놓이는 자리(px) — 레터박스면 가운데 띠, 아니면 화면 전체(None)."""
    if not spec or spec.get("frame") != "letterbox":
        return None
    return band_area(DEFAULT_RENDER_SPEC)


def _seg_spec(spec: dict):
    """컷 정규화 크기 — 레터박스면 띠, 아니면 세로 화면을 꽉 채운다(cover). 무비 기본값(blur_background)은 가로 영상을 흐린 배경 띠
    안에 작게 두는데, 트렌드 편집에서는 화면 가운데에 흐린 띠가 생겨 어색했다(2026-10-22)."""
    if spec["frame"] == "letterbox":
        return cut_fx.band_spec(DEFAULT_RENDER_SPEC)
    return replace(DEFAULT_RENDER_SPEC, fit_mode="cover")


def _pairs(snaps: list[Snap]) -> list[int | None]:
    """스냅마다 짝(앞 컷)의 지금 번호 — 짝은 경로로 남아 있어, 흔들리는 스냅을 빼 번호가 바뀌어도 맞는다. 빠진 짝은 None."""
    at = {s.path: i for i, s in enumerate(snaps)}
    return [at.get(s.lined_up_with) if s.lined_up_with else None for s in snaps]


def _match(snaps: list[Snap], series, concepts, beats, spec: dict, seed: int = 0, plan: tuple[list[int], int | None] | None = None):
    """매치컷 레시피 — 스냅마다 쓸 구간의 끝 · 시작 특징으로 연결 점수를 매겨 순서를 정하고(장면 안에서 점수 위주로), 다시 컷을 정한 뒤
    문턱을 넘는 경계에 매치 줌을 건다. plan 은 (스냅마다 장면 번호, 훅 스냅) — `scenes`(§22), 없으면 점수만으로.
    반환: (순서, 컷 계획, 경계별 매치 또는 None, 경계별 점수)."""
    cfg = spec["match"]
    seg = _seg_spec(spec)
    size = match_cut.read_size(seg.width, seg.height)
    tags = [match_cut.tags_of(s.analysis) for s in snaps]
    n = len(snaps)
    cuts = fmt(spec)["cuts"]
    if cuts in BEAM_CUTS:
        return _match_beam(snaps, series, spec, size, tags, seed, beats, plan)
    if cuts == "zoom-pairs":
        return _match_motion(snaps, series, spec, size, tags, seed, plan)
    first = continuity.plan_cuts(series, concepts, beats, spec)  # 순서를 정하기 전 — 스냅마다 쓸 구간의 대략
    ends = [match_cut.ends_of(snaps[c.index].path, c.start_ms, c.end_ms, size) for c in first]
    pairs = _pairs(snaps)
    scores = [[0.0 if i == j else match_cut.link(ends[i][1], ends[j][0], tags[i], tags[j])["score"] + match_cut.pair_bonus(i, j, pairs)
               for j in range(n)] for i in range(n)]
    order = _order(scores, cfg, seed, plan) if cfg.get("order") else list(range(n))
    planned = continuity.plan_cuts([series[i] for i in order], [concepts[i] for i in order], beats, spec)
    ends = [match_cut.ends_of(snaps[order[c.index]].path, c.start_ms, c.end_ms, size) for c in planned]
    links, parts = [], []
    for k in range(len(planned) - 1):
        a, b = planned[k].index, planned[k + 1].index
        part = match_cut.link(ends[k][1], ends[k + 1][0], tags[order[a]], tags[order[b]])
        parts.append({key: round(v, 2) for key, v in part.items()})
        if part["score"] >= cfg["minScore"]:
            out_end, in_start = ends[k][1], ends[k + 1][0]
            links.append({"out": (out_end.cx, out_end.cy, match_cut.focus_zoom(out_end.size, cfg["subjectFill"])),
                          "in": (in_start.cx, in_start.cy, match_cut.focus_zoom(in_start.size, cfg["subjectFill"]))})
        else:
            links.append(None)
    return order, planned, links, parts, None


def _order(scores, cfg: dict, seed: int, plan) -> list[int]:
    temperature, explore = cfg.get("temperature", 0.0), cfg.get("explore", 0.0)
    if plan is None:
        return match_cut.order(scores, temperature, explore, seed)
    return scenes.ordered(scores, plan[0], plan[1], temperature, explore, seed)


def _match_motion(snaps: list[Snap], series, spec: dict, size, tags, seed: int = 0, plan=None):
    """원본에 찍힌 줌으로 잇는다 — 스냅마다 '줌 아웃 한 번 → 줌 인 한 번' 구간 하나를 고르고(같은 스냅은 한 번만 — 최소 길이가 모자라면
    구간을 늘린다), 움직임이 이어지는지를 가장 무겁게 쳐서 순서를 정한다.
    A 가 줌 인으로 끝나고 B 가 줌 아웃으로 시작하는 경계는 원본 움직임으로 이어지므로 디지털 줌을 얹지 않는다({"real": True}).
    그렇지 않은 경계는 점수가 문턱 이상이면 디지털 매치 줌으로 대신한다. 반환의 순서는 컷마다의 스냅 번호."""
    cfg, cont = spec["match"], spec["continuity"]
    lo, hi = cont["shotMs"]
    share = round((cont.get("minMovieMs") or 0) / max(1, len(series)))  # 스냅마다 최소 길이의 몫 — 줌 쌍이 없는 스냅의 길이
    per_snap = [match_cut.motion_windows(s, match_cut.zoom_runs(match_cut.zoom_track(s)), lo, hi, target=share or None)
                for s in series]
    # 스냅마다 첫 구간 하나 — 한 스냅의 두 번째 구간(같은 장면의 다른 줌)을 붙였더니 같은 장면이 되풀이돼 보였다(2026-10-29 사용자)
    items = [(i, ws[0]) for i, ws in enumerate(per_snap)]
    ends = []
    for i, w in items:
        start, end = match_cut.ends_of(snaps[i].path, w.start_ms, w.end_ms, size)
        ends.append((match_cut.with_motion(start, "zoom_out") if w.starts_out else start,
                     match_cut.with_motion(end, "zoom_in") if w.ends_in else end))
    weights = match_cut.MOTION_WEIGHTS
    m = len(items)
    pairs = _pairs(snaps)
    scores = [[-1.0 if items[x][0] == items[y][0] else
               match_cut.link(ends[x][1], ends[y][0], tags[items[x][0]], tags[items[y][0]], weights)["score"]
               + match_cut.pair_bonus(items[x][0], items[y][0], pairs)
               for y in range(m)] for x in range(m)]
    item_plan = None if plan is None else ([plan[0][i] for i, _ in items],
                                           next((x for x, (i, _) in enumerate(items) if i == plan[1]), None))
    seq = _order(scores, cfg, seed, item_plan) if cfg.get("order") else list(range(m))
    order = [items[x][0] for x in seq]
    subjects = [_subject_box(ends[x][1], spec) for x in seq]  # 줌 인이 끝난 순간의 피사체 — 글 · 이모지는 이것을 피해 옆에
    planned = fill_without_repeats([continuity.PlannedCut(k, items[x][1].start_ms, items[x][1].end_ms, 1.0, None) for k, x in enumerate(seq)],
                                   [series[items[x][0]].length_ms for x in seq], cont.get("minMovieMs") or 0,
                                   keep_end=[items[x][1].ends_in for x in seq])
    links, parts = [], []
    for k in range(m - 1):
        x, y = seq[k], seq[k + 1]
        part = match_cut.link(ends[x][1], ends[y][0], tags[items[x][0]], tags[items[y][0]], weights)
        real = items[x][1].ends_in and items[y][1].starts_out
        parts.append({**{key: round(v, 2) for key, v in part.items()}, "real": real})
        if real:
            links.append({"real": True})
        elif part["score"] >= cfg["minScore"]:
            out_end, in_start = ends[x][1], ends[y][0]
            links.append({"out": (out_end.cx, out_end.cy, match_cut.focus_zoom(out_end.size, cfg["subjectFill"])),
                          "in": (in_start.cx, in_start.cy, match_cut.focus_zoom(in_start.size, cfg["subjectFill"]))})
        else:
            links.append(None)
    return order, planned, links, parts, subjects


def fill_without_repeats(planned: list[continuity.PlannedCut], source_ms: list[int], min_ms: int,
                         keep_end: list[bool] | None = None) -> list[continuity.PlannedCut]:
    """최소 길이를 같은 장면을 되풀이하지 않고 채운다 — 컷마다 자기 스냅 안에서 늘린다(모자란 만큼을 늘릴 여지가 남은 컷에 고르게). 원본이
    다 떨어지면 짧은 채로 둔다 — 같은 스냅을 두 번 쓰지 않는 것이 최소 길이보다 먼저다(2026-10-29 사용자 '같은 부분은 반복하지 말라').
    keep_end[k] 면 끝(줌 인이 끝난 순간)은 두고 앞으로 늘린다. 멈춤(프리즈)이 있는 컷은 늘리지 않는다."""
    need = min_ms - sum(c.out_ms for c in planned)
    if need <= 0:
        return planned
    room = [0 if c.hold_ms else max(0, source_ms[k] - (c.end_ms - c.start_ms)) for k, c in enumerate(planned)]
    grow = [0] * len(planned)
    while need > 0 and any(r > g for r, g in zip(room, grow)):
        open_ = [k for k in range(len(planned)) if room[k] > grow[k]]
        share = max(1, -(-need // len(open_)))
        for k in open_:
            add = min(share, room[k] - grow[k], need)
            grow[k] += add
            need -= add
            if need <= 0:
                break
    out = []
    for k, c in enumerate(planned):
        start, end = c.start_ms, c.end_ms
        if grow[k]:
            if keep_end and keep_end[k]:
                start -= min(grow[k], start)
                end = min(source_ms[k], end + (grow[k] - (c.start_ms - start)))
            else:
                end = min(source_ms[k], end + grow[k])
                start -= min(start, grow[k] - (end - c.end_ms))
        out.append(continuity.PlannedCut(c.index, start, end, c.speed, c.seam, ramp=c.ramp, hold_ms=c.hold_ms, hold_at_ms=c.hold_at_ms))
    return out


def _link_of(a_end, b_start, a_real_in: bool, b_real_out: bool, part: dict, cfg: dict):
    """경계 하나의 이음 — 원본 줌으로 이어지면 real, 점수가 문턱 이상이면 디지털 매치 줌, 앞이 팬으로 끝나고 뒤가 정지면 팬 이어주기."""
    if a_real_in and b_real_out:
        return {"real": True}
    if part["score"] >= cfg["minScore"]:
        return {"out": (a_end.cx, a_end.cy, match_cut.focus_zoom(a_end.size, cfg["subjectFill"])),
                "in": (b_start.cx, b_start.cy, match_cut.focus_zoom(b_start.size, cfg["subjectFill"]))}
    if a_end.motion in ("pan_left", "pan_right") and b_start.motion == "static":
        # 앞 컷의 카메라가 왼쪽으로 돌고 있었으면 뒤 컷도 왼쪽으로 조금 더 돌다 멈추는 것처럼(화면은 오른쪽에서 왼쪽으로 흐른다)
        return {"pan": 1.0 if a_end.motion == "pan_left" else -1.0}
    return None


# 포맷(§11) — 컷 선택 · 연결 기준 · 효과 프리미티브 · 오버레이를 설정으로. 엔진(빔 서치 · 효과음 · 렌더)은 같다.
BEAM_CUTS = ("motion-peaks", "beats", "action-span", "steady")
DEFAULT_FORMAT = {"cuts": "continuity", "link": "similar", "primitives": {}, "overlay": {}}


def fmt(spec: dict) -> dict:
    return {**DEFAULT_FORMAT, **(spec.get("format") or {})}


def _strategy(cuts: str, beats, lo: int, hi: int, f: dict) -> dict:
    """컷 선택 전략 → 후보를 만드는 법(길이 · 피크 자리 · 원본 줌 쌍 · 안정 구간)."""
    if f.get("lengthsMs"):
        lengths = tuple(f["lengthsMs"])
    elif cuts == "beats":
        gaps = [b - a for a, b in zip(beats, beats[1:])] if beats and len(beats) > 1 else [500]
        beat = int(sorted(gaps)[len(gaps) // 2])
        lengths = tuple(L for L in (beat, 2 * beat) if lo <= L <= hi) or (max(lo, beat),)
    elif cuts == "action-span":
        lengths = (1500, 2200, 3000)
    elif cuts == "steady":
        lengths = (1500, 2000, 2500)
    else:
        lengths = fast_cut.LENGTHS_MS
    return {"lengths": lengths, "peak_pos": 0.5 if cuts == "action-span" else fast_cut.PEAK_POS,
            "zoom_pairs": cuts == "motion-peaks", "steady": cuts == "steady"}


def _match_beam(snaps: list[Snap], series, spec: dict, size, tags, seed: int, beats=(), plan=None):
    """빔 서치 포맷 — 스냅마다 후보(전략대로)를 만들고 연결 기준대로 순서 · 구간을 함께 고른다(§10 · §11)."""
    cfg, cont, f = spec["match"], spec["continuity"], fmt(spec)
    lo, hi = cont["shotMs"]
    prims = f.get("primitives") or {}
    st = _strategy(f["cuts"], beats, lo, hi, f)
    frames = [fast_cut.SnapFrames.read(s.path, size) for s in snaps]
    cands = [c for i, s in enumerate(series) for c in fast_cut.candidates(
        i, s, frames[i], lo, hi, st["lengths"], st["peak_pos"], st["zoom_pairs"], st["steady"])]
    ends = [fast_cut.ends(c, frames[c.snap]) for c in cands]
    weights = match_cut.MOTION_WEIGHTS
    cache: dict[tuple[int, int], dict] = {}
    link_kind = f["link"]

    def part(i: int, j: int) -> dict:
        if (i, j) not in cache:
            fn = match_cut.link_contrast if link_kind == "contrast" else None
            a, b2 = ends[i][1], ends[j][0]
            ta_, tb = tags[cands[i].snap], tags[cands[j].snap]
            pt = fn(a, b2, ta_, tb) if fn else match_cut.link(a, b2, ta_, tb, weights)
            if link_kind == "rhythm":  # 에너지가 오르는 쪽으로 — 뒤 컷의 피크가 더 세면 가점
                pt = {**pt, "score": pt["score"] + 0.2 * max(0.0, cands[j].quality - cands[i].quality)}
            cache[(i, j)] = pt
        return cache[(i, j)]

    allowed, first = None, None
    if link_kind == "chronological":  # 촬영 순서(입력 순서 — 워커는 촬영 시각 순으로 넘긴다)로만 앞으로, 가장 이른 스냅에서 시작
        allowed = lambda i, j: (cands[j].snap, cands[j].start_ms) > (cands[i].snap, cands[i].start_ms)  # noqa: E731
        earliest = min(c.snap for c in cands)
        first = [k for k, c in enumerate(cands) if c.snap == earliest]
    elif plan is not None:  # 같은 장면이나 바로 다음 장면으로만, 훅(없으면 첫 장면)에서 시작(§22)
        scene_ok = scenes.beam_allowed(plan[0], plan[1])
        allowed = lambda i, j: scene_ok(cands[i].snap, cands[j].snap)  # noqa: E731
        first = [k for k, c in enumerate(cands) if (c.snap == plan[1] if plan[1] is not None else plan[0][c.snap] == min(plan[0]))]
    ramp = float(prims.get("speedRamp") or 0.0)
    a, b = continuity.RAMP_SPAN
    scale = (a + (b - a) / ramp + (1 - b)) if ramp else 1.0
    pairs = _pairs(snaps)
    seq = fast_cut.beam(cands, lambda i, j: part(i, j)["score"] + match_cut.pair_bonus(cands[i].snap, cands[j].snap, pairs),
                        cont.get("minMovieMs") or 15000,
                        width=cfg.get("beamWidth", 8), per_snap=1,  # 같은 스냅은 한 번만(ONE_CUT_PER_SNAP)
                        temperature=cfg.get("temperature", 0.0), seed=seed, allowed=allowed,
                        length_of=lambda k: cands[k].length_ms * scale, first=first)
    freeze = prims.get("freeze") or None
    frozen = set()
    if freeze:
        # 피크가 또렷한 컷 중 every 컷마다 하나 — 질이 높은 순
        ranked = sorted((k for k, x in enumerate(seq) if cands[x].peak_ms is not None), key=lambda k: -cands[seq[k]].quality)
        frozen = set(sorted(ranked[:max(1, len(seq) // max(1, freeze.get("every", 3)))]))
    order = [cands[x].snap for x in seq]
    planned = []
    for k, x in enumerate(seq):
        c = cands[x]
        hold = freeze.get("holdMs", 500) if k in frozen else 0
        planned.append(continuity.PlannedCut(k, c.start_ms, c.end_ms, 1.0, None, ramp=ramp, hold_ms=hold,
                                             hold_at_ms=(c.peak_ms or 0) if hold else 0))
    planned = fill_without_repeats(planned, [series[s].length_ms for s in order], cont.get("minMovieMs") or 0)
    links, parts = [], []
    for k in range(len(seq) - 1):
        x, y = seq[k], seq[k + 1]
        pt = part(x, y)
        real = cands[x].ends_in and cands[y].starts_out
        parts.append({**{key: round(v, 2) for key, v in pt.items()}, "real": real})
        links.append(None if link_kind == "contrast" else _link_of(ends[x][1], ends[y][0], cands[x].ends_in, cands[y].starts_out, pt, cfg))
    subjects = [_subject_box(ends[x][1], spec) for x in seq]
    return order, planned, links, parts, subjects


def _subject_box(end: match_cut.ShotEnd, spec: dict) -> tuple[float, float, float, float]:
    """구간 좌표의 피사체(중심 · 너비 몫) → 무비 전체 화면의 정규화 상자. 레터박스면 띠 안으로 옮긴다."""
    w, h = DEFAULT_RENDER_SPEC.width, DEFAULT_RENDER_SPEC.height
    band = cut_fx.band_height(w) if spec["frame"] == "letterbox" else h
    top = (h - band) / 2
    cy = (top + end.cy * band) / h
    # 가운데 60% 만 — 줌 인이 끝난 순간의 음식은 띠를 거의 채워 전체를 피하면 글 · 이모지가 놓일 데가 없었다(2026-10-22)
    half_w, half_h = end.size * 0.3, end.size * w / h * 0.3
    return (max(0.0, end.cx - half_w), max(0.0, cy - half_h), min(1.0, end.cx + half_w), min(1.0, cy + half_h))


def _panel_ends(snaps: list[Snap], planned, splits, fixed: frozenset[int] = frozenset()) -> tuple[dict[int, int], dict[int, float]]:
    """분할 칸의 원본 끝(ms)과 화면 길이(초) — 칸은 들어온 뒤 분할이 끝날 때까지 보이므로 원본을 그만큼 더 쓴다(원본이 모자라면 거기까지).
    배속 곡선 · 멈춤이 있는 컷, 손떨림을 보정한 컷(fixed — 보정본은 컷 구간만 있다)은 늘리지 않는다."""
    ends, lengths = {}, {}
    for a, z in splits:
        durations = [c.out_ms / 1000 for c in planned[a:z]]
        total = sum(durations)
        for k, (offset, d) in zip(range(a, z), zip(cut_fx.split_offsets(durations), durations)):
            c = planned[k]
            if c.ramp or c.hold_ms or k in fixed:
                continue
            source_ms = int(editor.probe_duration(snaps[c.index].path) * 1000)
            end = max(c.end_ms, min(source_ms, c.end_ms + round((total - offset - d) * 1000 * c.speed)))
            ends[k], lengths[k] = end, d + (end - c.end_ms) / c.speed / 1000
    return ends, lengths


def _tied(planned, links) -> list[str | None]:
    """컷마다 묶인 정도(steadiness.SEAM · LINK · None) — 찍힌 동작(가림 · 휩팬 · 구도)으로 끝나거나 시작하면 SEAM, 앞뒤 경계가 원본 줌 · 매치컷 ·
    팬으로 이어지면 LINK."""
    n = len(planned)
    edge = [bool(links and k < len(links) and links[k]) for k in range(n - 1)]
    out = []
    for k in range(n):
        if planned[k].seam in cut_fx.NATURAL_SEAMS or (k > 0 and planned[k - 1].seam in cut_fx.NATURAL_SEAMS):
            out.append(steadiness.SEAM)
        elif (k < n - 1 and edge[k]) or (k > 0 and edge[k - 1]):
            out.append(steadiness.LINK)
        else:
            out.append(None)
    return out


def _unlink_moved(before, after, links, parts) -> None:
    """흔들림 게이트가 옮긴 컷의 앞뒤 연결을 푼다 — 연결(원본 줌 · 매치 줌)은 옮기기 전 구간의 끝 · 시작을 보고 정한 것이다."""
    if not links:
        return
    for k, (a, b) in enumerate(zip(before, after)):
        if (a.start_ms, a.end_ms) != (b.start_ms, b.end_ms):
            for edge in (k - 1, k):
                if 0 <= edge < len(links):
                    links[edge] = None
                    if edge < len(parts):
                        parts[edge] = {**parts[edge], "real": False, "unlinked": "shake"}


def on_beat(planned, source_ms: list[int], links, beats, spec: dict):
    """컷 경계를 곡의 박자에(`continuity.snap_to_beats`) — 컷 고르기가 무엇이든. 찍힌 동작(가림 · 휩팬 · 구도)이나 원본 줌으로 이어지는
    경계는 그 순간의 화면을 지키고 컷의 반대쪽을 옮겨 시각만 박자에 맞춘다. 곡이 없거나 박자를 못 읽었으면 부르지 않는다(고정 간격은 박자가 아니다)."""
    tied = [cut.seam in cut_fx.NATURAL_SEAMS or bool(links and links[k] and links[k].get("real"))
            for k, cut in enumerate(planned[:-1])]
    keep_end = tied + [False]
    keep_start = [False] + tied
    return continuity.snap_to_beats(planned, source_ms, beats, tuple(spec["continuity"]["shotMs"]), DEFAULT_RENDER_SPEC.fps,
                                    keep_end, keep_start)


def _stabilize(snaps: list[Snap], planned, steady, tied, work: str) -> dict[int, str]:
    """흔들리는 컷의 손떨림 보정본(steadiness.stabilize — 다시 재서 확실히 나아진 것만). 실패하면 원본으로 간다."""
    out = {}
    for k in steadiness.to_stabilize(planned, [steady[c.index] for c in planned], tied):
        c = planned[k]
        try:
            fixed = steadiness.stabilize(snaps[c.index].path, c.start_ms, c.end_ms, os.path.join(work, f"stab_{k}"))
        except subprocess.CalledProcessError as exc:
            logger.warning("손떨림 보정 실패 — 원본으로 컷 {}: {}", k, exc)  # 보정 없이 간다 — 무비를 실패시키지 않는다
            fixed = None
        if fixed:
            out[k] = fixed
    return out


def _levels(spec: dict) -> bool:
    """컷마다 녹음 크기를 맞출지 — 원본 소리를 쓰는 레시피이거나, 음원만 레시피라도 말하는 컷이 있을 때(§24)."""
    return spec["audio"]["sourceGain"] > 0 or bool(spec["audio"].get("speechWindows"))


def _talking(snaps: list[Snap], planned, spec: dict) -> list[tuple[int, int]]:
    """결과물 시간의 발화 구간(ms) — 원본 소리를 이미 SPEECH_GAIN 으로 쓰는 레시피(ASMR · 말소리 브이로그)는 따로 살릴 것이 없다."""
    if spec["audio"]["sourceGain"] >= speech.SPEECH_GAIN:
        return []
    spans: dict[str, tuple[tuple[int, int], ...]] = {}
    for c in planned:
        path = snaps[c.index].path
        if path not in spans:
            try:
                spans[path] = snap_signals.speech_spans(path)
            except Exception as exc:  # noqa: BLE001 — 말소리를 못 재도 무비는 음원만으로 간다
                logger.warning("말소리 감지 실패 — 음원만으로 {}: {}", path, exc)
                spans[path] = ()
    return speech.windows(planned, [spans[snaps[c.index].path] for c in planned])


def _keep_steadier(prepared: list[str], stabilized: dict[int, str], originals: list[editor.ClipSource], planned, extras,
                   colors: list[str], seg_spec, spec: dict, work: str) -> None:
    """보정본이 **결과물 화면에서** 확실히 나은 컷만 남긴다 — 원본 구간도 같은 처리(크롭 · 줌 · 색)로 구워 둘을 같은 잣대로 잰다. 보정 직후의 화면으로
    재면 나아졌다던 셀피 컷이 결과물에서는 손떨림 1.49 → 2.23 으로 나빠졌다(2026-10-30). 지는 쪽은 원본으로 되돌리고 stabilized 에서 뺀다."""
    for k in sorted(stabilized):
        c = planned[k]
        folder = os.path.join(work, f"orig_{k}")
        os.makedirs(folder, exist_ok=True)
        original, = editor.prepare_segments(
            [originals[k]], editor.get_preset("일상"), seg_spec, folder, speeds=[c.speed], extras=[extras[k]],
            level_audio=_levels(spec), fast=True, ramps=[c.ramp], holds=[None], colors=[colors[k]])
        fixed_cost = steadiness.cost(steadiness.read(prepared[k]), 0, c.out_ms)
        if fixed_cost > steadiness.cost(steadiness.read(original), 0, c.out_ms) * (1 - steadiness.STAB_BETTER):
            prepared[k] = original
            del stabilized[k]


def _bake(snaps: list[Snap], planned, fx: cut_fx.Plan, look: str | None, spec: dict, work: str,
          stabilized: dict[int, str] | None = None) -> list[str]:
    """결합 단위들 — 컷은 정규화 · 배속 · 효과 · 색을 인코딩 한 번에, 분할은 칸을 정규화한 뒤 한 번 더(칸 쌓기 · 앞뒤 효과 · 색).
    효과가 전부 구간 안에 있으므로 단위 사이는 바로 넘김이다. 마지막 단위는 END_FADE_S 초 동안 검게 닫는다.
    stabilized[k] 는 컷 k 의 손떨림 보정본(컷 구간만 잘라 바로잡은 파일 — 0 부터 쓴다)."""
    stabilized = stabilized or {}
    panel_end, panel_len = _panel_ends(snaps, planned, fx.splits, frozenset(stabilized))
    originals = [editor.ClipSource(snaps[c.index].path, c.start_ms, panel_end.get(k, c.end_ms)) for k, c in enumerate(planned)]
    # 색 맞춤은 늘 원본 구간으로 잰다 — 보정본이 섞이면 다른 컷의 색까지 바뀌고, 되돌린 컷은 혼자 구워 색 맞춤이 빠졌다(2026-10-30)
    colors = editor.color_filters(originals)
    clips = [editor.ClipSource(stabilized[k], 0, c.end_ms - c.start_ms) if k in stabilized else originals[k]
             for k, c in enumerate(planned)]
    in_split = {k for a, z in fx.splits for k in range(a, z)}
    # 레터박스면 원본을 띠 크기로 바로 정규화하고(가로 영상이 덜 잘린다) 효과 뒤에 검은 띠를 붙인다
    letterbox = spec["frame"] == "letterbox"
    seg_spec = _seg_spec(spec)
    extras = [None if k in in_split else cut_fx.video_filter(fx.cuts[k], c.out_ms / 1000, seg_spec, look, spec["frame"],
                                                               DEFAULT_RENDER_SPEC if letterbox else None)
              for k, c in enumerate(planned)]
    last = len(planned) - 1
    if last not in in_split:
        end = f"fade=t=out:st={max(0.0, planned[last].out_ms / 1000 - END_FADE_S):.3f}:d={END_FADE_S}"
        extras[last] = f"{extras[last]},{end}" if extras[last] else end
    prepared = editor.prepare_segments(
        clips, editor.get_preset("일상"), seg_spec, work, speeds=[c.speed for c in planned], extras=extras,
        level_audio=_levels(spec), fast=True, ramps=[c.ramp for c in planned],
        holds=[(c.hold_at_ms, c.hold_ms) if c.hold_ms else None for c in planned], colors=colors)
    _keep_steadier(prepared, stabilized, originals, planned, extras, colors, seg_spec, spec, work)
    units = []
    for a, z in fx.units():
        if z - a == 1:
            units.append(prepared[a])
            continue
        edges = cut_fx.CutFx(intro=fx.cuts[a].intro, outro=fx.cuts[z - 1].outro)
        durations = [c.out_ms / 1000 for c in planned[a:z]]
        units.append(cut_fx.split(prepared[a:z], durations, os.path.join(work, f"split_{a}.mp4"), DEFAULT_RENDER_SPEC, look, edges,
                                  seg_spec.height if letterbox else None,
                                  [panel_len.get(k, d) for k, d in zip(range(a, z), durations)],
                                  END_FADE_S if z == len(planned) else 0.0))
    return units


def _final_encode(src: str, dst: str) -> str:
    """글 · 스티커를 얹지 않은 무비 — 중간 설정(가장 빠른 인코딩)으로 남지 않게 결과물 설정으로 한 번."""
    editor._run(["ffmpeg", "-y", "-i", src, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
                 "-crf", editor.FINAL_CRF, "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "copy", dst])
    return dst


def _faces(base: str, spec: dict, seed: int) -> list[face.FaceSticker]:
    if not spec["faceStickers"]["enabled"]:
        return []
    try:
        return face.plan(face.tracks(face.detect(base)), spec["faceStickers"], seed)
    except face.FaceError:
        return []  # 얼굴 스티커 없이 간다


LOW_LINK_GAP_MS = 1500


def _moments(planned, fx: cut_fx.Plan, faces: list[face.FaceSticker], parts: list[dict] | None = None,
             low_link: float = 0.0) -> list[tuple[int, str]]:
    """효과음을 얹을 경계 · 등장 순간 (결과물 ms, sfx 사전 seams 의 종류)."""
    out, starts, t = list(continuity.seams(planned)), [], 0
    for cut in planned:
        starts.append(t)
        t += cut.out_ms
    for b, kind in enumerate(fx.boundaries):
        if kind not in ("hardcut", "inside"):
            out.append((starts[b + 1], f"fx-{kind}"))
    # 이음 점수가 낮은 경계는 전환음으로 이음새를 덮는다(§10) — 원본 줌으로 이어진 경계 · 효과가 있는 경계는 빼고
    low = [(part.get("score", 1.0), b) for b, part in enumerate(parts or [])
           if part.get("score", 1.0) < low_link and not part.get("real") and fx.boundaries[b] == "hardcut"]
    # 가장 어색한 경계부터, 서로 LOW_LINK_GAP_MS 떨어지게, 경계의 1/3 까지 — 전환음이 15개 중 10개였다(2026-10-22)
    placed: list[int] = []
    for _, b in sorted(low):
        at = starts[b + 1]
        if len(placed) < max(1, len(fx.boundaries) // 3) and all(abs(at - p) >= LOW_LINK_GAP_MS for p in placed):
            placed.append(at)
    out += [(at, "low-link") for at in sorted(placed)]
    for a, z in fx.splits:
        out += [(starts[k], "panel") for k in range(a, z)]
    out += [(f.start_ms, "face") for f in faces]
    a, _b = continuity.RAMP_SPAN
    for k, cut in enumerate(planned):
        if cut.ramp:
            out.append((starts[k] + round((cut.end_ms - cut.start_ms) * a), "ramp"))  # 빨라지는 순간에 휙
        if cut.hold_ms:
            out.append((starts[k] + cut.hold_at_ms, "freeze"))  # 멈추는 순간에 찰칵
    return out


def _overlay(base: str, contexts, analyses, beats, spec: dict, movie_id: str, work: str, total_ms: int, result: Result,
             faces: list[face.FaceSticker], stamps: list[datetime | None] | None = None,
             holds: list[tuple[str, int, int]] | None = None) -> str:
    seed = stage_seed(movie_id)
    with layout.safe_area(letterbox_safe_box()) if spec["frame"] == "letterbox" else nullcontext():
        plan = ta.plan(contexts, beats, seed)
        accents = density.limit_accents(plan.accents, contexts, spec["accents"])
        stickers = density.limit_stickers(sticker.plan(contexts, accents, beats, seed), accents, spec["stickers"],
                                          spec.get("stickerGate"))
    title = spec.get("title")
    overlay = fmt(spec).get("overlay") or {}
    styles = title_card.styles() if (title or overlay) else []
    cuts = [(c.start_ms, c.end_ms) for c in contexts]
    events = title_card.events(title["style"], analyses, total_ms, title.get("holdMs"), cuts) if title else []
    if overlay.get("timestamp") and stamps:
        events += title_card.timestamps(cuts, stamps)
    if overlay.get("freezeLabel") and holds:
        labels = {a.cut_id: a.choice.text for a in accents}
        events += title_card.freeze_labels([(at, ms, labels.get(cut_id, "!")) for cut_id, at, ms in holds])
        accents = [a for a in accents if a.cut_id not in {cut_id for cut_id, _, _ in holds}]  # 그 글은 프리즈 라벨로
    result.accents, result.stickers = [a.choice.text for a in accents], len(stickers)
    result.title = title_card.words(analyses) if title else None
    result.faces = [f.kind for f in faces]
    if not accents and not stickers and not events and not faces:
        return base
    doc = os.path.join(work, "overlay.ass")
    with open(doc, "w", encoding="utf-8") as f:
        f.write(accent_render.build_document(accents, styles, events))
    track = sticker_render.bake_overlay(stickers, total_ms + 1000, os.path.join(work, "stickers.mov"), tuple(faces))
    out = os.path.join(work, "with_overlay.mp4")
    composite(base, track, doc, out)
    return out


def render(snaps: list[Snap], recipe_name: str, track: str | None, movie_id: str, work: str, out: str,
           spec: dict | None = None, decorations: dict[str, bool] | None = None, stabilize: bool = False,
           editing: dict[str, bool] | None = None) -> Result:
    """spec 을 주면 사전의 레시피 대신 그 설정으로 — 레퍼런스 따라 하기(reference.to_recipe)의 즉석 레시피.
    decorations 는 무비의 꾸밈(글자 · 이모지 · 얼굴, `recipe.decorations_of`) — 없으면 레시피 그대로.
    stabilize 는 흔들리는 컷의 손떨림 보정(실험, trend-recipes §21) — 운영 워커는 켜지 않는다. 로컬 레시피 스튜디오에서만 켠다.
    editing 은 무비의 편집 선택(MOV-29, `edit_spec.editing_of`) — speech 면 말하는 구간의 말소리를 살리고, sceneOrder 면 장면 단위 순서 · 훅. 없으면 둘 다 꺼짐."""
    editing = editing or {}
    spec = recipe.decorated_spec(spec or recipe.get(recipe_name).spec, decorations)
    seed = stage_seed(movie_id)
    # 어디를 잘라도 흔들리는 스냅은 안정된 스냅이 충분할 때만 뺀다(trend-recipes §20) — kept 는 입력 번호
    given = len(snaps)
    steady = [steadiness.read(s.path) for s in snaps]
    kept = steadiness.usable([steadiness.best_cost(st) for st in steady])
    snaps, steady = [snaps[i] for i in kept], [steady[i] for i in kept]
    series = [continuity.read_series(s.path) for s in snaps]
    concepts = [content.concepts_of(s.analysis) for s in snaps]
    beats, bpm = _beats(track, 600_000)
    links, parts, order, subjects = None, [], list(range(len(snaps))), None
    cont = spec["continuity"]
    target = None
    if cont.get("minMovieMs"):  # 무비 길이는 재료가 정한다(§23) — 세 컷 고르기가 모두 이 값을 하한으로 채운다
        target = continuity.movie_target([x.length_ms for x in series], tuple(cont["shotMs"]), cont["minMovieMs"],
                                         beats if bpm is not None else ())
        spec = {**spec, "continuity": {**cont, "minMovieMs": target}}
    scene_of = scenes.group([s.captured_at for s in snaps])
    hook = None if fmt(spec)["link"] == "chronological" or not editing.get("sceneOrder") else scenes.hook(
        [np.asarray(x.motion) for x in series], [steadiness.best_cost(st) for st in steady])
    if spec["match"]["enabled"]:
        plan = (scene_of, hook) if editing.get("sceneOrder") else None  # 장면 순서는 켰을 때만(MOV-29 — 기본 꺼짐)
        order, planned, links, parts, subjects = _match(snaps, series, concepts, beats, spec, seed, plan)
        snaps, series, concepts = [snaps[i] for i in order], [series[i] for i in order], [concepts[i] for i in order]
        steady = [steady[i] for i in order]
    else:
        planned = _plan(snaps, series, concepts, beats, spec)
    before = planned
    planned = steadiness.steady_windows(planned, [steady[c.index] for c in planned], [series[c.index].length_ms for c in planned],
                                        _tied(planned, links))
    _unlink_moved(before, planned, links, parts)
    order = [kept[i] for i in order]  # 결과물 순서 → 입력 스냅 번호(뺀 스냅을 건너뛴 번호를 되돌린다)
    if spec["continuity"].get("beatSnap") and bpm is not None:
        planned = on_beat(planned, [series[c.index].length_ms for c in planned], links, beats, spec)
    analyses = [snaps[c.index].analysis for c in planned]
    look = lk.choose(spec["look"], analyses)
    fx_spec = spec
    if spec["match"]["enabled"] and spec["match"].get("motion"):
        fx_spec = {**spec, "zoom": {**spec["zoom"], "rate": 0.0}}  # 원본이 이미 줌한다 — 디지털 줌을 겹치지 않는다
    fx = cut_fx.plan(planned, beats, fx_spec, seed, links)
    if (fmt(spec).get("primitives") or {}).get("dropFlash") and track is not None:
        _flash_at_drop(fx, planned, track)
    talking = _talking(snaps, planned, spec) if editing.get("speech") else []  # 말소리는 켰을 때만(MOV-29)
    if talking:  # 말하는 컷의 녹음 크기를 맞춘다 — 음원만 레시피는 원래 재지 않는다
        spec = {**spec, "audio": {**spec["audio"], "speechWindows": talking}}
    stabilized = _stabilize(snaps, planned, steady, _tied(planned, links), work) if stabilize else {}
    units = _bake(snaps, planned, fx, look, spec, work, stabilized)
    base = editor.join_prepared(units, [tr.Transition(tr.HARDCUT)] * (len(units) - 1), DEFAULT_RENDER_SPEC, work)
    duration = editor.probe_duration(base)
    with_bgm = os.path.join(work, "with_bgm.mp4")
    if track is None:
        with_bgm = base  # 곡이 없으면 원본 소리를 그대로 둔다 — 음원만 레시피여도 무음 무비를 만들지 않는다
    else:
        music.mix(base, track, with_bgm, duration, spec["audio"]["sourceGain"], spec["audio"]["bgmGain"], END_AUDIO_FADE_S,
                  speech=[(a / 1000, b / 1000) for a, b in talking] or None)
    contexts = _contexts(snaps, series, concepts, planned, subjects, spec)
    result = Result(out, round(duration, 1), bpm, transitions=fx.boundaries, splits=fx.splits, look=look, order=order, links=parts,
                    dropped=[i for i in range(given) if i not in kept])
    faces = _faces(base, spec, seed)
    stamps = [snaps[c.index].captured_at for c in planned]
    holds, t = [], 0
    for k, c in enumerate(planned):
        if c.hold_ms:
            holds.append((f"c{k}", t + c.hold_at_ms, c.hold_ms))
        t += c.out_ms
    current = _overlay(with_bgm, contexts, analyses, beats, spec, movie_id, work, int(duration * 1000), result, faces,
                       stamps, holds)
    if current == with_bgm:
        current = _final_encode(with_bgm, os.path.join(work, "encoded.mp4"))
    events = sfx.plan(contexts, analyses, _moments(planned, fx, faces, parts, spec["sfx"].get("lowLink", 0.0)), spec["sfx"])
    current = sfx.mix_into(current, events, os.path.join(work, "with_sfx.mp4"), duck=spec["sfx"].get("duck", False))
    editor.finalize(current, out)
    result.sfx = [e.reason for e in events]
    result.cuts = [{"snap": order[c.index], "start": c.start_ms, "end": c.end_ms, "speed": c.speed, "seam": c.seam,
                    "out": c.out_ms, "zoom": fx.cuts[k].zoom} for k, c in enumerate(planned)]
    result.edl = edl(recipe_name, seed, planned, order, fx, parts, events, look, spec)
    result.edl["dropped"] = result.dropped
    result.edl["scenes"] = {kept[i]: s for i, s in enumerate(scene_of)}  # 입력 스냅 번호 → 장면(§22)
    result.edl["hook"] = kept[hook] if hook is not None else None
    result.edl["targetMs"] = target
    result.edl["speech"] = talking
    result.stabilized = sorted(stabilized)
    for k in result.stabilized:
        result.edl["clips"][k]["stabilized"] = True
    return result


def edl(recipe_name: str, seed: int, planned, order: list[int], fx: cut_fx.Plan, parts: list[dict], events, look, spec: dict) -> dict:
    """편집 결정 목록 — 결과물을 다시 만들 수 있을 만큼(스냅 · 구간 · 리프레이밍 · 움직임 · 경계 점수 · 효과음). 시드가 같으면 같은 EDL 이다.
    지금은 결과에 실어 로그 · 데모가 쓴다. 저장해 두고 '다시 만들기'를 2단계부터 돌리는 것은 backlog A-20."""
    w, h, fps = DEFAULT_RENDER_SPEC.width, DEFAULT_RENDER_SPEC.height, DEFAULT_RENDER_SPEC.fps
    clips, t = [], 0
    for k, cut in enumerate(planned):
        c = fx.cuts[k]
        motion = ("match-out" if c.outro_focus else None, "match-in" if c.intro_focus else None)
        clips.append({
            "snap": order[cut.index], "in": round(cut.start_ms / 1000, 3), "out": round(cut.end_ms / 1000, 3),
            "speed": cut.speed, "at": round(t / 1000, 3),
            "reframe": {"outFocus": c.outro_focus, "inFocus": c.intro_focus, "pan": c.intro_pan or None},
            "motion": {"zoom": c.zoom, "edges": [m for m in motion if m], "intro": c.intro, "outro": c.outro},
            "boundary": parts[k] if k < len(parts) else None,
            "transition": fx.boundaries[k] if k < len(fx.boundaries) else None,
        })
        t += cut.out_ms
    return {
        "format": recipe_name, "seed": seed, "canvas": {"w": w, "h": h, "fps": fps},
        "frame": spec["frame"], "look": look, "splits": fx.splits, "clips": clips,
        "sfx": [{"file": e.file, "at": round(e.at_ms / 1000, 3), "gainDb": e.gain_db, "maxMs": e.max_ms, "reason": e.reason}
                for e in events],
    }
