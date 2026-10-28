"""빠른 컷 — 0.5~1초 후보 구간을 모션 피크에서 뽑고, 빔 서치로 순서와 구간을 함께 고른다(docs/decisions/trend-recipes.md §10).

1. 후보(`candidates`) — 스냅의 움직임 곡선(continuity 의 10fps)에서 피크를 찾아, 피크가 구간의 35% 지점에 오도록 길이 0.5 · 0.7 · 1.0초
   후보를 만든다. 원본에 찍힌 '줌 아웃 → 줌 인' 쌍(match_cut.motion_windows)도 후보에 넣는다. 계속 흔들리는(프레임 70% 이상이
   그 스냅 움직임 중간값의 4배를 넘는) 구간과 초점이 나간(선명도가 그 스냅 중간값의 40% 미만) 구간은 버린다
2. 경계 특징 — 스냅마다 프레임을 **한 번만** 읽어(5fps, 결과물 구간 비율) 후보의 시작 · 끝 특징(match_cut.ShotEnd)을 그 안에서 잰다
3. 빔 서치(`beam`) — 다음에 어떤 후보를 붙일지를 반복해 고른다. 점수 = 연결 점수(match_cut.link — 피사체 · 구도 · 색 · 움직임 규칙 ·
   온톨로지 태그) + 후보의 질(피크 세기 · 선명도) − 같은 스냅을 또 쓰는 벌점. 같은 스냅을 연달아 붙이지 않고, 한 스냅에서 perSnap 개까지,
   같은 스냅의 구간끼리는 겹치지 않게. 빔의 순위에 온도만큼 잡음(Gumbel)을 섞고, 끝난 경로들 중 하나를 점수의 softmax 로 뽑는다 —
   같은 스냅이어도 무비(시드)마다 다른 편집이 나온다
"""

import math
import random
from dataclasses import dataclass, field

import numpy as np

from pipeline import continuity, match_cut

PEAK_POS = 0.35
LENGTHS_MS = (500, 700, 1000)
PEAK_MIN_GAP_MS = 400
SHAKE_RATIO, SHAKE_SHARE, SHARP_MIN = 4.0, 0.7, 0.4  # 흔들림 판정(중간값 배수 · 프레임 몫), 선명도 하한(그 스냅 중간값 대비)
REPEAT_PENALTY, QUALITY_WEIGHT = 0.15, 0.25
SKIP_PENALTY = 0.5  # 점프컷 경로가 스냅을 하나 건너뛸 때마다 — 앞 재료부터 차례로(beam)


@dataclass(frozen=True)
class Candidate:
    snap: int
    start_ms: int
    end_ms: int
    starts_out: bool = False
    ends_in: bool = False
    quality: float = 0.5
    peak_ms: int | None = None  # 구간 안의 동작 피크(구간 시작 기준) — 효과음 · 프리즈 자리

    @property
    def length_ms(self) -> int:
        return self.end_ms - self.start_ms


@dataclass
class SnapFrames:
    """스냅 하나의 읽은 프레임(5fps)과 선명도 곡선."""
    frames: np.ndarray
    sharp: np.ndarray = field(default_factory=lambda: np.zeros(0))

    @classmethod
    def read(cls, path: str, size: tuple[int, int]) -> "SnapFrames":
        frames = match_cut.read_frames(path, 0, None, size)
        return cls(frames, sharpness(frames))

    def slice(self, start_ms: int, end_ms: int) -> np.ndarray:
        a = int(start_ms * match_cut.READ_FPS / 1000)
        b = max(a + 1, int(math.ceil(end_ms * match_cut.READ_FPS / 1000)))
        return self.frames[a:min(b, len(self.frames))]


def sharpness(frames: np.ndarray) -> np.ndarray:
    """프레임마다 선명도 — 회색 영상의 라플라시안 분산(초점이 나가면 작다)."""
    if len(frames) == 0:
        return np.zeros(0)
    g = frames.astype(np.float32).mean(axis=-1)
    lap = (-4 * g[:, 1:-1, 1:-1] + g[:, :-2, 1:-1] + g[:, 2:, 1:-1] + g[:, 1:-1, :-2] + g[:, 1:-1, 2:])
    return lap.reshape(len(frames), -1).var(axis=1)


def peaks(motion: tuple[float, ...]) -> list[tuple[int, float]]:
    """[(ms, 세기 0~1)] — 3프레임 평균한 움직임의 국소 최댓값 중 중간값의 1.3배를 넘는 것, 서로 PEAK_MIN_GAP_MS 떨어지게."""
    if len(motion) < 3:
        return []
    m = np.convolve(np.asarray(motion, dtype=float), np.ones(3) / 3, mode="same")
    floor = max(float(np.median(m)) * 1.3, 1e-4)
    top = float(m.max()) or 1.0
    found = [(i, float(m[i])) for i in range(1, len(m) - 1) if m[i] >= m[i - 1] and m[i] >= m[i + 1] and m[i] > floor]
    found.sort(key=lambda p: -p[1])
    chosen: list[tuple[int, float]] = []
    gap = PEAK_MIN_GAP_MS // continuity.STEP_MS
    for i, v in found:
        if all(abs(i - j) >= gap for j, _ in chosen):
            chosen.append((i, v))
    return sorted(((i * continuity.STEP_MS, v / top) for i, v in chosen))


def candidates(snap: int, s: continuity.Series, frames: SnapFrames, lo: int, hi: int,
               lengths: tuple[int, ...] = LENGTHS_MS, peak_pos: float = PEAK_POS, zoom_pairs: bool = True,
               steady: bool = False, tile: bool = False) -> list[Candidate]:
    """후보 구간들. lengths · peak_pos 는 포맷의 컷 선택 전략이 정한다(모션 피크 0.5~1초 · 비트 배수 · 동작 전체). steady 면 피크 대신
    길이마다 가장 덜 흔들리는 구간(ASMR · 하루 타임스탬프 · before/after). tile 이면 가운데 길이로 스냅을 겹치지 않게 나눈 구간도 더한다 —
    점프컷 포맷(말소리 브이로그)이 한 스냅에서 여러 구간을 이어 쓰게(가장 안정된 구간들은 거의 같은 자리라 서로 겹친다)."""
    length = s.length_ms
    motion = np.asarray(s.motion, dtype=float)
    # 흔들림: 구간 프레임의 SHAKE_SHARE 이상이 그 스냅 움직임 중간값의 SHAKE_RATIO 배를 넘을 때 — 계속 흔들리는 구간만 뺀다.
    # 동작 피크는 몇 프레임뿐이라 남는다. (평균 · 상위 분위로 재면 피크 구간이 빠지거나 흔들림이 길면 안 걸렸다 — 2026-10-22 테스트)
    shake = SHAKE_RATIO * max(float(np.median(motion)) if len(motion) else 0.0, 1e-4)
    sharp_med = float(np.median(frames.sharp)) if len(frames.sharp) else 0.0
    out: list[Candidate] = []

    def ok(start: int, end: int) -> bool:
        if start < 0 or end > length or end - start < lo:
            return False
        win = motion[start // continuity.STEP_MS:end // continuity.STEP_MS]
        if len(win) and float(np.mean(win > shake)) >= SHAKE_SHARE:
            return False  # 내내 흔들린다
        sl = frames.sharp[int(start * match_cut.READ_FPS / 1000):int(math.ceil(end * match_cut.READ_FPS / 1000))]
        return not (len(sl) and sharp_med > 0 and float(np.median(sl)) < SHARP_MIN * sharp_med)  # 초점이 나갔다

    def sharp_of(start: int, end: int) -> float:
        sl = frames.sharp[int(start * match_cut.READ_FPS / 1000):int(math.ceil(end * match_cut.READ_FPS / 1000))]
        return min(1.0, float(np.median(sl)) / sharp_med) if len(sl) and sharp_med > 0 else 0.5

    if steady:
        for L in lengths:
            if lo <= L <= min(hi, length):
                start = continuity.steady_start(s, L)
                if ok(start, start + L):
                    out.append(Candidate(snap, start, start + L, quality=0.4 + 0.6 * sharp_of(start, start + L)))
        fitting = [L for L in lengths if lo <= L <= min(hi, length)]
        if tile and fitting:
            L = fitting[len(fitting) // 2]
            for start in range(0, length - L + 1, L):
                if ok(start, start + L) and not any(c.start_ms == start and c.end_ms == start + L for c in out):
                    out.append(Candidate(snap, start, start + L, quality=0.4 + 0.6 * sharp_of(start, start + L)))
    else:
        for at, strength in peaks(s.motion):
            for L in lengths:
                if not lo <= L <= hi:
                    continue
                start = max(0, int(at - peak_pos * L))
                end = start + L
                if ok(start, end):
                    out.append(Candidate(snap, start, end, quality=0.6 * strength + 0.4 * sharp_of(start, end),
                                         peak_ms=at - start))
    if zoom_pairs and not steady:
        for w in match_cut.motion_windows(s, match_cut.zoom_runs(match_cut.zoom_track(s)), lo, max(hi, 1600), limit=3):
            if (w.starts_out or w.ends_in) and ok(w.start_ms, w.end_ms):
                out.append(Candidate(snap, w.start_ms, w.end_ms, w.starts_out, w.ends_in,
                                     0.7 + 0.3 * sharp_of(w.start_ms, w.end_ms)))
    if not out:  # 피크도 줌도 없는 스냅 — 가장 덜 흔들리는 구간 하나
        size = min(length, max(lo, min(hi, 800)))
        start = continuity.steady_start(s, size)
        out.append(Candidate(snap, start, start + size, quality=0.3))
    return out


def ends(c: Candidate, frames: SnapFrames) -> tuple[match_cut.ShotEnd, match_cut.ShotEnd]:
    clip = frames.slice(c.start_ms, c.end_ms)
    if len(clip) == 0:
        blank = match_cut.ShotEnd(0.5, 0.5, 0.5, "static", (50.0, 0.0, 0.0), 0.5)
        return blank, blank
    edge = max(2, min(len(clip), int(match_cut.EDGE_S * match_cut.READ_FPS)))
    start, end = match_cut.shot_end(clip[:edge]), match_cut.shot_end(clip[-edge:])
    if c.starts_out:
        start = match_cut.with_motion(start, "zoom_out")
    if c.ends_in:
        end = match_cut.with_motion(end, "zoom_in")
    return start, end


def _overlaps(a: Candidate, b: Candidate) -> bool:
    return a.snap == b.snap and not (a.end_ms <= b.start_ms or b.end_ms <= a.start_ms)


def beam(cands: list[Candidate], link_score, target_ms: int, *, width: int = 8, per_snap: int = 3,
         temperature: float = 0.0, seed: int = 0, allowed=None, length_of=None, first=None,
         jump_cuts: bool = False) -> list[int]:
    """후보 번호의 순서. link_score(i, j) = i 다음 j 의 연결 점수. 목표 길이를 채우면 끝난 경로가 된다.
    allowed(i, j) 가 거짓이면 i 다음에 j 를 두지 않는다(예: 촬영 순서만 앞으로). length_of(i) 는 결과물에서의 길이(스피드램프 · 프리즈).
    first 를 주면 그 후보들로만 시작한다(촬영 순서 포맷은 가장 이른 스냅에서 — 아니면 앞 스냅을 건너뛴 채 짧게 끝났다).
    jump_cuts 면 같은 스냅의 다른(겹치지 않는) 구간을 바로 이어도 된다 — 한 영상 안의 점프컷(말소리 브이로그). 촬영 순서로만 잇는 포맷에서는
    같은 스냅의 구간이 늘 붙어 있어, 이것 없이는 스냅마다 하나씩밖에 못 써 최소 길이를 못 채웠다. 이때는 반복 벌점을 빼고 경로를 평균이 아닌 합으로
    견준다 — 평균으로 견주면 구간을 건너뛴 짧은 경로가 이겨 목표를 채울 경로가 잘려 나갔다. 스냅을 건너뛰면 SKIP_PENALTY 를 빼서 가까운 구간부터
    차례로 쓴다(앞으로만 가는 경로가 품질 좋은 뒤 스냅으로 먼저 건너뛰면 앞 재료를 못 쓰고 짧게 끝났다)."""
    rank = (lambda st: st[1]) if jump_cuts else (lambda st: st[1] / len(st[0]))  # noqa: E731
    penalty = 0.0 if jump_cuts else REPEAT_PENALTY
    length_of = length_of or (lambda k: cands[k].length_ms)
    if not cands:
        return []
    rng = random.Random(seed)

    def noisy(score: float) -> float:
        if temperature <= 0:
            return score
        u = min(1 - 1e-9, max(1e-9, rng.random()))
        return score + temperature * -math.log(-math.log(u))  # Gumbel — 온도만큼 순위를 흔든다

    starts = set(first) if first else set(range(len(cands)))
    states = [((i,), QUALITY_WEIGHT * c.quality, length_of(i)) for i, c in enumerate(cands) if i in starts]
    states = sorted(states, key=lambda st: -noisy(st[1]))[:width]
    finished = [st for st in states if st[2] >= target_ms]
    for _ in range(len(cands)):
        grown = []
        for seq, score, total in states:
            if total >= target_ms:
                continue
            last = cands[seq[-1]]
            used = [cands[k] for k in seq]
            for j, c in enumerate(cands):
                if j in seq or (c.snap == last.snap and not jump_cuts) or (allowed is not None and not allowed(seq[-1], j)):
                    continue
                same = [u for u in used if u.snap == c.snap]
                if len(same) >= per_snap or any(_overlaps(u, c) for u in same):
                    continue
                step = link_score(seq[-1], j) + QUALITY_WEIGHT * c.quality - penalty * len(same)
                if jump_cuts:
                    step -= SKIP_PENALTY * max(0, abs(c.snap - last.snap) - 1)
                grown.append((seq + (j,), score + step, total + length_of(j)))
        if not grown:
            break
        states = sorted(grown, key=lambda st: -noisy(rank(st)))[:width]
        finished += [st for st in states if st[2] >= target_ms]
        if len(finished) >= width:
            break
    pool = finished or states
    if temperature <= 0:
        return list(max(pool, key=rank)[0])
    scores = np.array([rank(st) for st in pool])
    weights = np.exp((scores - scores.max()) / max(temperature, 1e-3))
    return list(rng.choices(pool, weights=weights.tolist())[0][0])
