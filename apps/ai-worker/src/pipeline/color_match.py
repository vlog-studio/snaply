"""컷 사이 색 맞춤 — 스타일 색보정보다 **앞**에 거는 보정(decisions/auto-edit-draft.md §6.3 `grade.match`).

스냅은 찍은 시간 · 장소 · 카메라 자동 노출이 제각각이라 이어 붙이면 컷마다 밝기와 색이 툭툭 바뀐다. 컷마다 프레임
몇 장의 평균 R · G · B 를 재고, 무비 전체의 **중간값 쪽으로 절반만** 당긴다 — 중립색(회색)이 아니라 중간값을
기준으로 해서, 대부분 저녁에 찍은 무비의 따뜻한 톤 같은 그 무비의 분위기는 남기고 튀는 컷만 끌어온다. 일부러
어둡게 찍은 컷이 대낮이 되지 않게 밝기 · 색 모두 상한을 둔다.

순서는 "보정 → 분위기" 다: 이 필터는 컷 정규화에서 스타일 `eq` 앞에 붙어, 분위기는 고른 바탕 위에 모든 컷에
같은 양으로 입혀진다. 분위기를 바꿔도 이 보정은 그대로다. 결과물에만 걸리고 편집 화면 미리보기에는 없다(같은 결정).
"""

import statistics
import subprocess
from dataclasses import dataclass

import pipeline.hdr as hdr

SAMPLE_FRAMES = 5
SAMPLE_WIDTH = 64
# 중간값까지의 거리 중 이만큼만 옮긴다.
STRENGTH = 0.5
BRIGHTNESS_RANGE = (0.8, 1.25)
TINT_RANGE = (0.92, 1.08)
# 이보다 어두운 컷은 건드리지 않는다 — 키우면 잡음만 커지고, 대개 일부러 어두운 장면이다.
DARK_LUMA = 0.05
# 이만큼도 안 바뀌면 필터를 걸지 않는다.
NEGLIGIBLE = 0.005


@dataclass(frozen=True)
class ClipColor:
    r: float
    g: float
    b: float

    @property
    def luma(self) -> float:
        return 0.2126 * self.r + 0.7152 * self.g + 0.0722 * self.b


def measure_color(path: str, start: float, duration: float) -> ClipColor | None:
    """구간에서 고르게 뽑은 프레임 몇 장의 평균 R · G · B(0~1). 잴 수 없으면 None."""
    filters = [
        *hdr.source_filters(path),
        f"fps={SAMPLE_FRAMES}/{max(duration, 0.1):.3f}",
        f"scale={SAMPLE_WIDTH}:-2:flags=area",
        "format=rgb24",
    ]
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", path,
            "-vf", ",".join(filters), "-frames:v", str(SAMPLE_FRAMES),
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        capture_output=True,
    )
    data = proc.stdout
    if proc.returncode != 0 or len(data) < 3:
        return None
    pixels = len(data) // 3
    return ClipColor(
        sum(data[0::3]) / pixels / 255,
        sum(data[1::3]) / pixels / 255,
        sum(data[2::3]) / pixels / 255,
    )


def _clamp(value: float, bounds: tuple[float, float]) -> float:
    return max(bounds[0], min(bounds[1], value))


def _toward(ratio: float) -> float:
    return 1 + STRENGTH * (ratio - 1)


def match_filters(colors: list[ClipColor | None]) -> list[str]:
    """컷마다 걸 보정 필터(`colorchannelmixer`). 맞출 짝이 없거나 바꿀 것이 없으면 빈 문자열."""
    measured = [c for c in colors if c is not None and c.luma > 0]
    if len(measured) < 2:
        return ["" for _ in colors]
    target = ClipColor(
        statistics.median(c.r for c in measured),
        statistics.median(c.g for c in measured),
        statistics.median(c.b for c in measured),
    )

    filters = []
    for color in colors:
        if color is None or color.luma < DARK_LUMA or target.luma < DARK_LUMA:
            filters.append("")
            continue
        brightness = _clamp(_toward(target.luma / color.luma), BRIGHTNESS_RANGE)
        gains = []
        for channel in ("r", "g", "b"):
            own = getattr(color, channel) / color.luma
            wanted = getattr(target, channel) / target.luma
            tint = _clamp(_toward(wanted / own), TINT_RANGE) if own > 0 else 1.0
            gains.append(brightness * tint)
        if all(abs(g - 1) < NEGLIGIBLE for g in gains):
            filters.append("")
            continue
        r, g, b = gains
        filters.append(f"colorchannelmixer=rr={r:.4f}:gg={g:.4f}:bb={b:.4f}")
    return filters


def with_style(match: str, eq: str) -> str:
    """보정 → 분위기 순서로 잇는다."""
    return ",".join(f for f in (match, eq) if f)
