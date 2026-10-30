"""스냅 분석의 피사체 상자 → 결과물 화면의 상자(docs/decisions/subject-boxes.md §5).

분석은 프레임마다 눈에 띄는 피사체를 0~1 상자로 남긴다(`video_analyses.subjects`, 쓸 수 있는 상자만 — 워커의
`video_analysis/schema.subject_box`). 렌더는 컷 구간 가운데에 가장 가까운 분석 프레임의 첫 상자를 골라, 원본이 화면에 놓인
자리(맞춤 방식)대로 옮긴다. 상자가 없으면 None — 글 · 이모지는 화면 모서리로 간다.

한계: 분석 프레임은 업로드 원본에서 뽑았다. 회전 정보가 잘못 붙어 워커가 바로 세운 원본(`orient.fix`)은 방향이 달라 상자가
어긋날 수 있다(메신저를 거친 영상 — 드물다). 줌 · 분할 같은 컷 효과는 반영하지 않는다.
"""

import json
import subprocess
from functools import lru_cache

from pipeline import layout, orient

Box = layout.Box


class SubjectError(RuntimeError):
    """원본 크기를 읽지 못함."""


def pick(analysis: dict | None, at_ms: int) -> Box | None:
    """at_ms(원본 시각)에 가장 가까운 분석 프레임의 첫 피사체. 그 프레임에 피사체가 없으면 None — 먼 프레임에서 빌려 오지 않는다."""
    if not analysis:
        return None
    stamps = analysis.get("frameTimestampsMs") or []
    frames = [f for f in analysis.get("subjects") or [] if 0 <= f.get("frame", -1) < len(stamps)]
    if not frames:
        return None
    nearest = min(frames, key=lambda f: (abs(stamps[f["frame"]] - at_ms), f["frame"]))
    items = nearest.get("items") or []
    return tuple(items[0]["box"]) if items else None


@lru_cache(maxsize=64)
def display_size(path: str) -> tuple[int, int]:
    """화면에 보이는 원본 크기(가로, 세로) — 회전 정보가 90 · 270 도면 바꾼다."""
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                          "-of", "json", path], capture_output=True, text=True)
    try:
        stream = json.loads(out.stdout or "{}")["streams"][0]
        w, h = int(stream["width"]), int(stream["height"])
    except (KeyError, IndexError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise SubjectError(f"원본 크기를 읽지 못했습니다: {path}") from exc
    return (h, w) if round(orient.rotation(path)) % 180 == 90 else (w, h)


def placed(size: tuple[int, int], fit_mode: str, area: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """원본이 area(x, y, 가로, 세로 px) 안에 놓인 자리 — 맞춤 방식대로(`render_spec.build_video_filter` 와 같다).
    cover 는 꽉 채우고 가운데를 남기며, contain 은 작은 원본을 키우지 않고, 나머지(흐린 배경 · 단색 띠)는 폭이나 높이에 맞춰 키운다."""
    ax, ay, aw, ah = area
    w, h = size
    if fit_mode == "cover":
        scale = max(aw / w, ah / h)
    elif fit_mode == "contain":
        scale = min(1.0, aw / w, ah / h)
    else:
        scale = min(aw / w, ah / h)
    pw, ph = w * scale, h * scale
    return ax + (aw - pw) / 2, ay + (ah - ph) / 2, pw, ph


def to_screen(box: Box, size: tuple[int, int], fit_mode: str, area: tuple[float, float, float, float] | None = None,
              screen: tuple[int, int] = (layout.W, layout.H)) -> Box | None:
    """원본 0~1 상자 → 화면 0~1 상자. area 밖(잘린 부분)은 버리고, 다 잘리면 None."""
    sw, sh = screen
    ax, ay, aw, ah = area or (0.0, 0.0, float(sw), float(sh))
    px, py, pw, ph = placed(size, fit_mode, (ax, ay, aw, ah))
    x0, y0 = max(ax, px + box[0] * pw), max(ay, py + box[1] * ph)
    x1, y1 = min(ax + aw, px + box[2] * pw), min(ay + ah, py + box[3] * ph)
    if x1 <= x0 or y1 <= y0:
        return None
    return (x0 / sw, y0 / sh, x1 / sw, y1 / sh)


def frame_box(path: str, fit_mode: str, area: tuple[float, float, float, float] | None = None,
              screen: tuple[int, int] = (layout.W, layout.H)) -> Box | None:
    """컷 영상이 화면에서 차지하는 자리(0~1) — 가로 영상이 띠 사이에 놓이면 그 띠 사이, 꽉 채우면 화면 전체. 원본 크기를 못 읽으면 None."""
    try:
        size = display_size(path)
    except SubjectError:
        return None
    return to_screen((0.0, 0.0, 1.0, 1.0), size, fit_mode, area, screen)


def for_cut(analysis: dict | None, path: str, at_ms: int, fit_mode: str,
            area: tuple[float, float, float, float] | None = None) -> Box | None:
    """컷 하나의 화면 피사체 상자 — 분석 상자를 고르고 화면으로 옮긴다. 상자나 원본 크기가 없으면 None."""
    box = pick(analysis, at_ms)
    if box is None:
        return None
    try:
        size = display_size(path)
    except SubjectError:
        return None
    return to_screen(box, size, fit_mode, area)
