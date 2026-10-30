"""자연스러운 이음 — 효과로 장면을 바꾸지 않고, 찍힌 동작이 다음 컷으로 이어지는 지점에서 자른다.

트렌드 숏브이로그의 전환은 대부분 촬영된 동작이다(docs/decisions/trend-recipes.md): 렌즈를 가렸다 떼기(cover), 카메라를 휙 돌리기(whip),
같은 구도에서 단계만 넘기기(match). 그래서 스냅마다 10fps 의 작은 회색 프레임으로 세 가지를 재고(`read_series`), 컷을 그 지점에서
자르고 다음 컷을 그 지점에 맞춰 시작한다(`plan_cuts`). 그런 지점이 없으면 경계가 박자에 오도록 길이를 맞춘다. 경계의 전환은 전부
바로 넘김(hardcut)이다 — 이음은 영상 속 동작이 만든다(이음이 없는 경계의 전환 효과는 `cut_fx` 가 정한다).

배속도 여기서 정한다 — 분석이 레시피의 행동(걷기 · 이동)을 본 긴 스냅을 factor 배로.
**같은 스냅은 한 무비에서 한 번만 쓴다** — 무비가 레시피의 minMovieMs 보다 짧으면 컷을 그 스냅 안에서 늘려 채우고(원본이 모자라면 배속을 푼다),
그래도 모자라면 짧은 채로 둔다. 예전엔 같은 스냅을 조금 건너뛰어 한 컷 더 잇는 점프컷으로 채웠는데, 같은 장면이 되풀이돼 보였다
(2026-10-29 사용자 '같은 부분은 반복하지 말라').

레시피가 oneCutPerSnap 이면(시네마틱 — 레퍼런스 ⑤) 이음 지점 대신 그 스냅에서 가장 덜 흔들리는 구간을 골라 쓴다(`plan_single`).

컷 구간을 정하는 일이라 사용자가 직접 자른 컷에는 쓰지 않는다(trimOwner — AI 초안 단계의 일, backlog).
"""

import subprocess
from dataclasses import dataclass

import numpy as np

STEP_MS = 100
THUMB_W, THUMB_H = 36, 64
# 렌즈 가림: 밝기가 이 값 또는 스냅 중간값의 COVER_RATIO 배보다 어두운 프레임
COVER_LUMA, COVER_RATIO, COVER_MIN_MEDIAN = 0.10, 0.35, 0.20
# 휩팬: 이웃 프레임 차이가 이 값과 중간값의 WHIP_RATIO 배를 넘고 가로 이동이 WHIP_SHIFT 픽셀 이상
WHIP_MOTION, WHIP_RATIO, WHIP_SHIFT = 0.06, 2.5, 3.0
# 구도 맞추기: 다음 컷 시작 후보는 앞 MATCH_SPAN 비율 안, 닮음이 이 값 이상일 때만
MATCH_SPAN, MATCH_MIN = 0.4, 0.80
# 스피드램프: 구간의 이 몫(가운데)만 빠르게
RAMP_SPAN = (0.3, 0.7)
# 한 스냅 한 컷: 앞뒤 이만큼은 쓰지 않는다(찍기 시작 · 끝의 흔들림), 끝을 박자에 맞출 때 길이를 이만큼까지 바꾼다
EDGE_MS, BEAT_SLACK_MS = 300, 250


@dataclass(frozen=True)
class Series:
    luma: tuple[float, ...]
    motion: tuple[float, ...]
    shift_x: tuple[float, ...]
    thumbs: np.ndarray

    @property
    def length_ms(self) -> int:
        return len(self.luma) * STEP_MS


@dataclass(frozen=True)
class PlannedCut:
    index: int
    start_ms: int
    end_ms: int
    speed: float
    seam: str | None  # 이 컷 끝의 이음: cover · whip · match · None(박자)
    ramp: float = 0.0  # 스피드램프의 가운데 배속(0 이면 없음) — 구간의 RAMP_SPAN 가운데만 그 배속, 앞뒤는 1배
    hold_ms: int = 0  # 프리즈 — 동작 피크에서 이만큼 멈춘다
    hold_at_ms: int = 0  # 프리즈 자리(구간 시작 기준, 결과물 시각)

    @property
    def out_ms(self) -> int:
        """결과물에서의 길이."""
        src = self.end_ms - self.start_ms
        if self.ramp:
            a, b = RAMP_SPAN
            base = src * (a + (b - a) / self.ramp + (1 - b))
        else:
            base = src / self.speed
        return round(base) + self.hold_ms


# ── 재기 ──────────────────────────────────────────────────────────────
def read_series(path: str) -> Series:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={1000 // STEP_MS},scale={THUMB_W}:{THUMB_H},format=gray",
         "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, THUMB_H, THUMB_W).astype(np.float32) / 255
    return series_of(frames)


def series_of(frames: np.ndarray) -> Series:
    luma = tuple(float(f.mean()) for f in frames)
    motion = (0.0, *(float(np.abs(frames[i] - frames[i - 1]).mean()) for i in range(1, len(frames))))
    shift = (0.0, *(phase_shift(frames[i - 1], frames[i])[0] for i in range(1, len(frames))))
    return Series(luma, motion, shift, frames)


def phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """b 가 a 에서 얼마나 옮겨 갔나(픽셀, 가로 · 세로) — 위상 상관."""
    fa, fb = np.fft.fft2(a - a.mean()), np.fft.fft2(b - b.mean())
    cross = fa * np.conj(fb)
    corr = np.abs(np.fft.ifft2(cross / (np.abs(cross) + 1e-9)))
    y, x = np.unravel_index(int(np.argmax(corr)), corr.shape)
    h, w = corr.shape
    return float(-(x - w if x > w // 2 else x)), float(-(y - h if y > h // 2 else y))


def covers(s: Series) -> list[int]:
    """렌즈가 가려진 프레임 — 평소 밝은 스냅에서만(밤 장면은 내내 어두워 전부 '가림'이 되므로 COVER_MIN_MEDIAN 미만은 없음)."""
    median = float(np.median(s.luma)) if s.luma else 0.0
    if median < COVER_MIN_MEDIAN:
        return []
    limit = max(COVER_LUMA, median * COVER_RATIO)
    return [i for i, v in enumerate(s.luma) if v < limit]


def whips(s: Series) -> list[int]:
    limit = max(WHIP_MOTION, float(np.median(s.motion)) * WHIP_RATIO)
    return [i for i, (m, dx) in enumerate(zip(s.motion, s.shift_x)) if m > limit and abs(dx) >= WHIP_SHIFT]


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    za, zb = (a - a.mean()) / (a.std() + 1e-6), (b - b.mean()) / (b.std() + 1e-6)
    return float(max(0.0, 1 - np.abs(za - zb).mean() / 2))


# ── 고르기 ────────────────────────────────────────────────────────────
def speed_for(s: Series, concepts: dict, cfg: dict) -> float:
    if not cfg.get("enabled") or s.length_ms < cfg.get("minShotMs", 0):
        return 1.0
    # 분석이 걷기 · 이동을 본 스냅만 — '화면이 고르게 움직인다'는 손으로 든 영상이면 거의 늘 참이라(2026-10-22 샘플 32컷 중 21컷이 배속) 쓰지 않는다
    moving = set(concepts.get("actions", ())) & set(cfg.get("actions", ()))
    return float(cfg["factor"]) if moving else 1.0


def next_beat(beats: tuple[int, ...], lo: int, hi: int) -> int | None:
    return next((b for b in beats if lo <= b <= hi), None)


def _end(s: Series, start: int, speed: float, t: int, beats, shot: tuple[int, int], beat_snap: bool):
    """(끝 ms, 이음) — 가림 > 휩팬 > 박자 > 최대 길이 순으로, 결과물 길이가 shot 범위 안인 곳."""
    lo_i, hi_i = start // STEP_MS + int(shot[0] * speed / STEP_MS), start // STEP_MS + int(shot[1] * speed / STEP_MS)
    hi_i = min(hi_i, len(s.luma) - 1)
    for kind, frames in (("cover", covers(s)), ("whip", whips(s))):
        hit = next((i for i in frames if lo_i <= i <= hi_i), None)
        if hit is not None:
            return hit * STEP_MS, kind
    if beat_snap:
        beat = next_beat(beats, t + shot[0], t + shot[1])
        if beat is not None:
            end = start + round((beat - t) * speed)
            if end <= s.length_ms:
                return end, None
    return min(s.length_ms, start + round(shot[1] * speed)), None


def _start(s: Series, previous: Series | None, prev_end: int | None, prev_seam: str | None) -> tuple[int, str | None]:
    """다음 컷의 시작 — 앞이 가림이면 이 스냅의 가림이 풀리는 첫 프레임, 아니면 앞 끝 프레임과 가장 닮은 프레임(닮음이 MATCH_MIN 이상)."""
    span = max(1, int(len(s.luma) * MATCH_SPAN))
    if prev_seam == "cover":
        dark = covers(s)
        if dark and dark[0] < span:
            after = next((i for i in range(dark[0], span) if i not in dark), dark[0])
            return after * STEP_MS, "cover"
        return 0, "cover"
    if previous is None or prev_end is None or prev_seam == "whip":
        return 0, prev_seam
    tail = previous.thumbs[min(len(previous.thumbs) - 1, prev_end // STEP_MS)]
    scores = [similarity(tail, s.thumbs[i]) for i in range(span)]
    best = int(np.argmax(scores))
    return (best * STEP_MS, "match") if scores[best] >= MATCH_MIN else (0, None)


MAX_TARGET_MS = 60_000  # 레시피 무비가 스스로 정하는 길이의 상한 — 숏폼에서 흔한 길이(잠정, trend-recipes §23)
PHRASE_BEATS = 16  # 악구 — 4/4 의 4마디(다운비트를 모르므로 곡 처음부터 센 근사)
# 목표에서 이만큼 안의 악구에만 맞춘다 — 하한(15초)인 무비를 다음 악구(20.1초)로 끌어올렸더니 같은 스냅을 늘려 채워 비트싱크 컷이 2초가 됐다(2026-10-30)
PHRASE_TOLERANCE = 0.2  # 15% 로 두면 재료 20.8초 → 악구 24초(15.4%)도 빠진다


def movie_target(source_ms: list[int], shot: tuple[int, int], low: int, beats: tuple[int, ...]) -> int:
    """무비 목표 길이(ms) — 재료가 정한다(trend-recipes §23). 스냅마다 보통 컷 길이(shot 가운데, 원본이 짧으면 원본)를 더해 low ~ MAX_TARGET_MS 로
    자르고, 박자를 알면 PHRASE_TOLERANCE 안의 가장 가까운 악구 끝(PHRASE_BEATS 박마다)에 맞춘다. 전에는 low(15초)가 곧 목표라 재료와 상관없이 15초 안팎이었다."""
    typical = (shot[0] + shot[1]) // 2
    target = max(low, min(MAX_TARGET_MS, sum(min(s, typical) for s in source_ms)))
    phrases = [beats[i] for i in range(PHRASE_BEATS, len(beats), PHRASE_BEATS)
               if low <= beats[i] <= MAX_TARGET_MS and abs(beats[i] - target) <= target * PHRASE_TOLERANCE]
    return min(phrases, key=lambda p: abs(p - target)) if phrases else target


def budgets(caps: list[int], min_ms: int | None) -> list[int]:
    """스냅마다 결과물에서 쓸 길이 목표 — 합이 min_ms 가 되도록 고르게(스냅이 내줄 수 있는 caps 를 넘지 않게). 모자라면 caps 전부."""
    if not min_ms or sum(caps) <= min_ms:
        return list(caps) if min_ms else [0] * len(caps)
    lo, hi = 0, max(caps)
    while lo < hi:
        mid = (lo + hi) // 2
        lo, hi = (mid + 1, hi) if sum(min(c, mid) for c in caps) < min_ms else (lo, mid)
    return [min(c, lo) for c in caps]


def steady_start(s: Series, length_ms: int) -> int:
    """length_ms 구간 중 움직임 합이 가장 작은 곳의 시작(ms) — 앞뒤 EDGE_MS 는 피하고, 같으면 가운데에 가까운 곳."""
    n, win = len(s.motion), max(1, length_ms // STEP_MS)
    if win >= n:
        return 0
    edge = EDGE_MS // STEP_MS
    lo = min(edge, n - win)
    hi = max(lo, n - win - edge)
    best = min(range(lo, hi + 1), key=lambda i: (round(sum(s.motion[i:i + win]), 4), abs(i - (n - win) / 2)))
    return best * STEP_MS


def plan_single(series: list[Series], concepts: list[dict], beats: tuple[int, ...], recipe_spec: dict) -> list[PlannedCut]:
    """스냅마다 한 컷 — 길이는 최소 길이 몫(shotMs 안), 끝은 가까운 박자에, 자리는 가장 덜 흔들리는 구간."""
    cont, speed_cfg = recipe_spec["continuity"], recipe_spec["speed"]
    lo, hi = cont["shotMs"]
    speeds = [speed_for(s, concepts[i], speed_cfg) for i, s in enumerate(series)]
    caps = [round(s.length_ms / v) for s, v in zip(series, speeds)]
    if cont.get("minMovieMs") and sum(min(c, hi) for c in caps) < cont["minMovieMs"]:
        speeds = [1.0] * len(series)  # 배속하면 15초를 못 채운다 — 길이가 먼저
        caps = [s.length_ms for s in series]
    min_ms = cont.get("minMovieMs") or 0
    planned, t = [], 0
    for i, s in enumerate(series):
        # 남은 목표를 남은 스냅에 고르게 — 앞 컷이 박자 때문에 짧아졌으면 뒤 컷이 메운다(남은 스냅이 내줄 수 있는 만큼)
        rest = [min(c, hi) for c in caps[i:]]
        target = budgets(rest, max(0, min_ms - t))[0] if min_ms > t else lo
        length = min(caps[i], max(lo, min(hi, target)))
        if cont.get("beatSnap"):
            near = [b for b in beats if abs(b - (t + length)) <= BEAT_SLACK_MS and lo <= b - t <= min(caps[i], hi)]
            if near:
                later = [b for b in near if b >= t + length]  # 목표보다 길어지는 쪽을 먼저 — 최소 길이를 지키게
                length = (min(later) if later else max(near)) - t
        src = min(s.length_ms, round(length * speeds[i]))
        start = steady_start(s, src)
        planned.append(PlannedCut(i, start, start + src, speeds[i], None))
        t += planned[-1].out_ms
    return planned


def plan_cuts(series: list[Series], concepts: list[dict], beats: tuple[int, ...], recipe_spec: dict) -> list[PlannedCut]:
    cont, speed_cfg = recipe_spec["continuity"], recipe_spec["speed"]
    if cont.get("oneCutPerSnap"):
        return plan_single(series, concepts, beats, recipe_spec)
    shot, snap = tuple(cont["shotMs"]), cont.get("beatSnap", False)
    min_ms = cont.get("minMovieMs")
    speeds = [speed_for(s, concepts[i], speed_cfg) for i, s in enumerate(series)]
    if min_ms and sum(round(s.length_ms / v) for s, v in zip(series, speeds)) < min_ms:
        speeds = [1.0] * len(series)  # 배속하면 원본이 모자란다 — 길이가 먼저
    targets = budgets([round(s.length_ms / v) for s, v in zip(series, speeds)], min_ms)
    planned: list[PlannedCut] = []
    t, prev_seam = 0, None
    for i, s in enumerate(series):
        prev = planned[-1] if planned else None
        start, how = _start(s, series[prev.index] if prev else None, prev.end_ms if prev else None, prev_seam)
        speed = speeds[i]
        if s.length_ms - start < shot[0] * speed:
            start, speed = 0, 1.0
        end, seam = _end(s, start, speed, t, beats, shot, snap)
        if prev is not None and how == "match" and prev.seam is None:
            planned[-1] = PlannedCut(prev.index, prev.start_ms, prev.end_ms, prev.speed, "match")
        planned.append(PlannedCut(i, start, max(end, start + 100), speed, seam))
        cut = planned[-1]
        if cut.out_ms < targets[i]:
            # 목표에 모자라면 같은 스냅에서 한 컷 더 뽑지 않고 이 컷을 늘린다 — 끝의 이음은 늘린 자리에선 맞지 않으므로 박자 경계(None)로
            cut = PlannedCut(i, cut.start_ms, min(s.length_ms, cut.start_ms + round(targets[i] * cut.speed)), cut.speed, None)
            planned[-1] = cut
        t += cut.out_ms
        prev_seam = cut.seam
    return planned


def _resized(cut: PlannedCut, out_ms: float, source_ms: int, keep_end: bool, keep_start: bool) -> PlannedCut | None:
    """결과물 길이가 out_ms 가 되게 원본 구간을 늘리거나 줄인 컷 — 끝을 지켜야 하면 시작을, 아니면 끝을(원본 끝에 닿으면 남은 만큼 시작을)
    옮긴다. 원본 안에서 맞출 수 없으면 None."""
    delta = round(out_ms * cut.speed) - (cut.end_ms - cut.start_ms)
    start, end = cut.start_ms, cut.end_ms
    if keep_end:
        start -= delta
    else:
        end = min(source_ms, end + delta)
        if not keep_start:
            start -= delta - (end - cut.end_ms)
    if start < 0 or end > source_ms or end - start != cut.end_ms - cut.start_ms + delta:
        return None
    return PlannedCut(cut.index, start, end, cut.speed, cut.seam, ramp=cut.ramp, hold_ms=cut.hold_ms, hold_at_ms=cut.hold_at_ms)


def snap_to_beats(planned: list[PlannedCut], source_ms: list[int], beats: tuple[int, ...], shot: tuple[int, int], fps: int,
                  keep_end: list[bool] | None = None, keep_start: list[bool] | None = None,
                  movable: list[bool] | None = None) -> list[PlannedCut]:
    """컷 경계를 곡의 박자 프레임에 둔다 — 컷 고르기(이음 계획 · 원본 줌 쌍 · 빔 서치)가 정한 길이를 shot 범위 안의 가장 가까운 박자로
    옮긴다(MOV-28). 무비 시간축은 프레임으로 센다: 컷 길이는 프레임 정수(`editor.frame_cut_seconds` 가 그만큼만 남긴다)라 이어 붙여도
    경계가 밀리지 않는다. 경계가 박자를 벗어나도 뒤 컷은 다시 박자에 맞춘다(시각은 절대값).
    keep_end[k] — 원본 줌 인이 끝나는 순간으로 이어지는 컷은 끝 대신 시작을, keep_start[k] — 줌 아웃이 시작하는 컷은 끝만 옮긴다.
    movable[k] 가 거짓인 컷(사용자가 자른 구간 — MOV-22)은 옮기지 않는다. 배속 곡선 · 멈춤이 있는 컷은 그 길이가 계획의 일부라 옮기지 않는다. 원본이 모자라 맞출 수 없는 컷, 반 박자보다 멀리 옮겨야 하는 컷
    (박자 맞춤이 장면을 깎아 먹지 않게 — 원본을 다 쓴 짧은 무비), 마지막 컷(무비의 끝 — 끝맺음 페이드가 닫는다)도 그대로 둔다."""
    if len(beats) < 2:
        return planned
    frame_ms = 1000 / fps
    reach = float(np.median(np.diff(beats))) / 2
    out, t_frames = [], 0
    for k, cut in enumerate(planned):
        snapped = None
        if not cut.ramp and not cut.hold_ms and k < len(planned) - 1 and (movable is None or movable[k]):
            t = t_frames * frame_ms
            want = t + cut.out_ms
            fits = []
            # 최소 길이를 채우느라 이미 shot 범위를 넘은 컷은 지금 길이 근처(반 박자 안)까지 허용한다 — 범위 안 박자가 없어 건너뛰었다(2026-10-30)
            longest = shot[1] if cut.out_ms <= shot[1] else cut.out_ms + reach
            for b in beats:
                frames = round(b / frame_ms) - t_frames
                if frames > 0 and abs(b - want) <= reach and shot[0] <= frames * frame_ms <= longest:
                    resized = _resized(cut, frames * frame_ms, source_ms[k], bool(keep_end and keep_end[k]),
                                       bool(keep_start and keep_start[k]))
                    if resized is not None:
                        fits.append((abs(b - want), resized))
            snapped = min(fits, key=lambda f: f[0])[1] if fits else None
        cut = snapped or cut
        out.append(cut)
        t_frames += round(cut.out_ms / frame_ms)
    return out


def seams(planned: list[PlannedCut]) -> list[tuple[int, str]]:
    """(결과물에서의 경계 ms, 이음) — 효과음(sfx.plan)이 쓴다. 박자 경계는 빼고 cover · whip 만."""
    out, t = [], 0
    for cut in planned[:-1]:
        t += cut.out_ms
        if cut.seam in ("cover", "whip"):
            out.append((t, cut.seam))
    return out
