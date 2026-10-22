"""액센트를 영상에 맞추는 규칙 — 움직임(에너지 · 정점)과 배경 밝기(대비).

입력은 영상에서 이미 잰 값이다: 컷 구간의 움직임 곡선(`video_signals.motion`, STEP_MS 간격)과 대표 프레임을 작은
격자로 줄인 휘도(`pipeline/accent_inputs.py`). 모델을 부르지 않는다. 값은 사전의 `energy` · `contrast`.

- 에너지는 절대 문턱이 아니라 **무비 안의 다른 컷과 견준** 상대값이다 — 휴대폰 · 장면마다 움직임 크기가 달라
  절대값은 의미가 없다(edit-director 의 움직임 점수도 넘긴 스냅 안에서 맞춘다, docs/decisions/edit-director.md §4).
"""

from statistics import mean

from pipeline import vocabulary as _vocabulary
from pipeline.layout import Box

_VOCABULARY: dict = _vocabulary.load("accent-vocabulary.json")
ENERGY: dict = _VOCABULARY["energy"]
CONTRAST: dict = _VOCABULARY["contrast"]
STEP_MS = 100

HIGH, MID, LOW = "high", "mid", "low"


def energies(motions: list[tuple[float, ...]]) -> list[str]:
    """컷마다 high · mid · low. 움직임이 있는 컷이 셋 미만이거나 전부 floor 이하면 모두 mid."""
    means = [mean(m) if m else 0.0 for m in motions]
    moving = sorted(v for v in means if v > 0)
    if len(moving) < 3 or moving[-1] <= ENERGY["floor"]:
        return [MID] * len(motions)
    low_cut = moving[len(moving) // 3]
    high_cut = moving[(2 * len(moving)) // 3]
    # 신호가 없는 컷(빈 곡선)은 잔잔한 것이 아니라 모르는 것이다 — mid
    return [MID if not m else HIGH if v >= high_cut and v > ENERGY["floor"] else LOW if v < low_cut else MID
            for m, v in zip(motions, means)]


def motion_for(default: str, category: str, energy: str) -> str:
    """에너지와 어긋나는 사전 모션만 바꾼다 — 빠른 컷의 잔잔한 모션, 잔잔한 컷의 세찬 모션."""
    if energy == HIGH and default in ENERGY["gentle"]:
        return ENERGY["energyMotions"][HIGH][category]
    if energy == LOW and default in ENERGY["impact"]:
        return ENERGY["energyMotions"][LOW][category]
    return default


def peak_ms(motion: tuple[float, ...], cut_start_ms: int) -> int | None:
    """컷 안에서 움직임이 뚜렷이 치솟는 순간(무비 시각). 최댓값이 평균의 peakRatio 배 미만이면 None."""
    if not motion or mean(motion) <= 0:
        return None
    top = max(motion)
    # 가만히 있는 화면의 인코딩 잡음도 평균의 몇 배는 된다 — 정점은 floor 를 넘어야 한다
    if top <= ENERGY["floor"] or top < mean(motion) * ENERGY["peakRatio"]:
        return None
    return cut_start_ms + motion.index(top) * STEP_MS


def luma_under(rect: Box, grid: tuple[tuple[float, ...], ...]) -> float | None:
    """격자(위 → 아래 행)에서 상자가 덮는 칸들의 휘도 평균. 상자가 화면 밖이면 걸친 칸만."""
    if not grid or not grid[0]:
        return None
    rows, cols = len(grid), len(grid[0])
    x0, y0, x1, y1 = (max(0.0, min(1.0, v)) for v in rect)
    r0, r1 = int(y0 * rows), min(rows - 1, int(y1 * rows))
    c0, c1 = int(x0 * cols), min(cols - 1, int(x1 * cols))
    cells = [grid[r][c] for r in range(min(r0, rows - 1), r1 + 1) for c in range(min(c0, cols - 1), c1 + 1)]
    return mean(cells) if cells else None


def luma(rgb: str) -> float:
    r, g, b = (int(rgb[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_colours(fill: str, line: str, background: float | None, box: bool) -> tuple[str, str, bool]:
    """(채움, 외곽선, 맞바꿨는가). 상자 종류와 배경을 모르는 경우는 그대로."""
    if box or background is None:
        return fill, line, False
    if abs(luma(fill) - background) >= CONTRAST["minLumaGap"]:
        return fill, line, False
    if abs(luma(line) - background) <= abs(luma(fill) - background):
        return fill, line, False
    return line, fill, True


Beats = int | tuple[int, ...]


def as_grid(beats: Beats, until_ms: int) -> tuple[int, ...]:
    """박자 간격(정수, 곡이 없을 때) 또는 무비 시간축의 박자 목록(`beat_grid.BeatGrid.in_movie`) → 박자 목록."""
    if isinstance(beats, int):
        return tuple(range(0, until_ms + beats, beats))
    return tuple(beats)


def interval_at(grid: tuple[int, ...], t: int, default: int = 500) -> int:
    """t 근처의 박자 간격 — 곡의 템포가 흔들려도 그 자리의 간격을 쓴다."""
    after = [i for i, b in enumerate(grid) if b > t]
    i = after[0] if after else len(grid) - 1
    if 0 < i < len(grid):
        return grid[i] - grid[i - 1]
    return default


def timing(start_ms: int, end_ms: int, hold_beats: int, beats: Beats,
           peak: int | None = None) -> tuple[int, int, tuple[int, ...]]:
    """컷 안의 첫 박자(정점이 있으면 정점에 가장 가까운 박자)에 등장해 hold_beats 박자 머문다 — 컷 끝 + 반 박자를 넘지 않고,
    정점 박자 뒤로 한 박자도 남지 않으면 그 앞 박자. 컷 안에 박자가 없으면 컷 시작. beats 는 등장 기준 박자 시각."""
    grid = as_grid(beats, end_ms + 8 * (beats if isinstance(beats, int) else 500))
    half = interval_at(grid, start_ms) // 2
    in_cut = [b for b in grid if start_ms <= b < end_ms]
    first = in_cut[0] if in_cut else start_ms
    if peak is not None and in_cut:
        usable = [b for b in in_cut if b + interval_at(grid, b) <= end_ms + half] or in_cut[:1]
        first = min(usable, key=lambda b: (abs(b - peak), b))
    later = [b for b in grid if b > first]
    target = later[hold_beats - 1] if len(later) >= hold_beats else first + hold_beats * interval_at(grid, first)
    end = min(target, end_ms + half)
    return first, end, relative_beats(grid, first, end)


def relative_beats(grid: tuple[int, ...], start: int, end: int) -> tuple[int, ...]:
    """start ~ end 안의 박자를 start 기준으로 — 첫 값은 늘 0(등장 순간)이다. 모션이 두 번째부터 '박자마다 튐'에 쓴다."""
    return (0, *(b - start for b in grid if start < b < end))
