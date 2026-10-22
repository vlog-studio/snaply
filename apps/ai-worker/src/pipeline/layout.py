"""화면 배치의 공용 기하 — 정규화 좌표(0~1)의 상자와 세이프 에어리어.

텍스트 액센트(`pipeline/text_accent.py`)와 이모지 스티커(`pipeline/sticker.py`)가 같은 규칙으로 자리를 잰다 —
둘이 서로를 피해야 하므로 겹침 판정이 하나여야 한다.
"""

from contextlib import contextmanager

from pipeline import ass

W, H = ass.PLAY_RES_X, ass.PLAY_RES_Y
# 세이프 에어리어(추정, x0 y0 x1 y1) — 상단 10% · 하단 22% · 우측 버튼 레일 14% · 좌측 6%. 실측은 backlog A-7
SAFE = (0.06, 0.10, 0.86, 0.78)
# 피사체와 글 사이 띄움
GAP = 0.015


@contextmanager
def safe_area(box: tuple[float, float, float, float]):
    """이 안에서는 세이프 에어리어를 box 로 — 레터박스 무비는 글 · 스티커를 띠 안에만 둔다(트렌드 시네마틱)."""
    global SAFE
    before, SAFE = SAFE, box
    try:
        yield
    finally:
        SAFE = before

Box = tuple[float, float, float, float]


def rect_around(xy: tuple[float, float], bw: float, bh: float) -> Box:
    return (xy[0] - bw / 2, xy[1] - bh / 2, xy[0] + bw / 2, xy[1] + bh / 2)


def fits_at(r: Box, blocked: list[Box]) -> bool:
    """세이프 에어리어 안이고 막힌 영역 어디와도 겹치지 않는다."""
    return inside_safe(r) and not any(overlaps(r, b) for b in blocked)


def inside_safe(r: Box) -> bool:
    return r[0] >= SAFE[0] and r[1] >= SAFE[1] and r[2] <= SAFE[2] and r[3] <= SAFE[3]


def overlaps(a: Box, b: Box) -> bool:
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])
