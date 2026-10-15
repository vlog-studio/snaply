"""컷 사이 색 맞춤 — 스타일 색보정보다 **앞**에 거는 보정(decisions/auto-edit-draft.md §6.3 `grade.match`).

스냅은 찍은 시간 · 장소 · 카메라 자동 노출이 제각각이라 이어 붙이면 컷마다 밝기와 색이 툭툭 바뀐다. 컷마다 프레임
몇 장의 평균 R · G · B 를 재고, 무비 전체의 **중간값 쪽으로 절반만** 당긴다 — 중립색(회색)이 아니라 중간값을
기준으로 해서, 대부분 저녁에 찍은 무비의 따뜻한 톤 같은 그 무비의 분위기는 남기고 튀는 컷만 끌어온다. 일부러
어둡게 찍은 컷이 대낮이 되지 않게 밝기 · 색 모두 상한을 둔다.

순서는 "보정 → 분위기" 다: 이 필터는 컷 정규화에서 스타일 `eq` 앞에 붙어, 분위기는 고른 바탕 위에 모든 컷에
같은 양으로 입혀진다. 분위기를 바꿔도 이 보정은 그대로다. 결과물에만 걸리고 편집 화면 미리보기에는 없다(같은 결정).

세 가지를 넘지 않는다(backlog E-50, 2026-10-15 결정).
- **밝은 부분을 새로 자르지 않는다.** 잴 때 채널마다 밝은 쪽(상위 1%)도 재, 키운 값이 넘치면 이득 전체를 같은 비율로 줄인다 —
  색 비율은 남고, 가장 큰 이득이 1 아래로 내려가지는 않는다(원래보다 어둡게 하지 않는다). 8비트에서 1.35배면 190 위가 잘렸고,
  채널마다 달리 잘려 창 · 하늘의 색이 틀어졌다.
- **밤 컷은 밝히지 않는다.** 밝기가 `NIGHT_LUMA` 아래인 컷은 색만 맞춘다 — 낮 컷의 중간값 쪽으로 끌면 밤이 낮이 됐다.
- **아주 어두운 컷은 기준에서 뺀다.** 건드리지 않는 컷(`DARK_LUMA` 아래)이 중간값을 끌어내리면 나머지가 어두워졌다.
"""

import statistics
import subprocess
from dataclasses import dataclass

from loguru import logger

import pipeline.hdr as hdr

SAMPLE_FRAMES = 5
SAMPLE_WIDTH = 64
# 중간값까지의 거리 중 이만큼만 옮긴다.
STRENGTH = 0.5
BRIGHTNESS_RANGE = (0.8, 1.25)
TINT_RANGE = (0.92, 1.08)
# 이보다 어두운 컷은 건드리지 않고 기준(중간값)에서도 뺀다 — 키우면 잡음만 커지고, 대개 일부러 어두운 장면이다.
DARK_LUMA = 0.05
# 이보다 어두운 컷(밤 · 어두운 실내)은 밝히지 않고 색만 맞춘다.
NIGHT_LUMA = 0.2
# 밝은 쪽으로 볼 화소의 비율 — 이만큼이 넘치지 않게 이득을 줄인다.
HIGHLIGHT_QUANTILE = 0.99
# 이만큼도 안 바뀌면 필터를 걸지 않는다.
NEGLIGIBLE = 0.005


@dataclass(frozen=True)
class ClipColor:
    r: float
    g: float
    b: float
    # 채널마다 밝은 쪽(상위 1%)의 값(0~1). 모르면 None — 그때는 넘침을 막지 않는다.
    highlight: tuple[float, float, float] | None = None

    @property
    def luma(self) -> float:
        return 0.2126 * self.r + 0.7152 * self.g + 0.0722 * self.b


def measure_color(path: str, start: float, duration: float) -> ClipColor | None:
    """구간에서 고르게 뽑은 프레임 몇 장의 평균 R · G · B 와 밝은 쪽(0~1). 잴 수 없으면 None.

    렌더와 같은 영상 트랙(`0:v:0`)을 잰다(backlog E-48). 프레임을 줄이고 작게 만든 **뒤에** HDR 을 톤매핑한다 — 먼저
    걸면 구간의 모든 프레임을 원본 크기로 톤매핑한 뒤 5장만 썼다(backlog E-49).
    """
    filters = [
        f"fps={SAMPLE_FRAMES}/{max(duration, 0.1):.3f}",
        f"scale={SAMPLE_WIDTH}:-2:flags=area",
        *hdr.source_filters(path),
        "format=rgb24",
    ]
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", path,
            "-map", "0:v:0", "-vf", ",".join(filters), "-frames:v", str(SAMPLE_FRAMES),
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        capture_output=True,
    )
    data = proc.stdout
    if proc.returncode != 0 or len(data) < 3:
        logger.warning(
            "색을 재지 못했다 — 이 컷은 맞추지 않는다: {} ({})",
            path,
            proc.stderr.decode(errors="replace").strip()[-300:] or f"exit {proc.returncode}",
        )
        return None
    pixels = len(data) // 3
    channels = (data[0::3], data[1::3], data[2::3])
    return ClipColor(
        *(sum(channel) / pixels / 255 for channel in channels),
        highlight=tuple(_quantile(channel, HIGHLIGHT_QUANTILE) / 255 for channel in channels),
    )


def _quantile(values: bytes, q: float) -> float:
    ordered = sorted(values)
    return float(ordered[min(len(ordered) - 1, int(q * len(ordered)))])


def _clamp(value: float, bounds: tuple[float, float]) -> float:
    return max(bounds[0], min(bounds[1], value))


def _toward(ratio: float) -> float:
    return 1 + STRENGTH * (ratio - 1)


def match_filters(colors: list[ClipColor | None]) -> list[str]:
    """컷마다 걸 보정 필터(`colorchannelmixer`). 맞출 짝이 없거나 바꿀 것이 없으면 빈 문자열."""
    measured = [c for c in colors if c is not None and c.luma >= DARK_LUMA]
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
        if color.luma < NIGHT_LUMA:
            brightness = min(brightness, 1.0)
        gains = []
        for channel in ("r", "g", "b"):
            own = getattr(color, channel) / color.luma
            wanted = getattr(target, channel) / target.luma
            tint = _clamp(_toward(wanted / own), TINT_RANGE) if own > 0 else 1.0
            gains.append(brightness * tint)
        gains = _spare_highlights(gains, color.highlight)
        if all(abs(g - 1) < NEGLIGIBLE for g in gains):
            filters.append("")
            continue
        r, g, b = gains
        filters.append(f"colorchannelmixer=rr={r:.4f}:gg={g:.4f}:bb={b:.4f}")
    return filters


def _spare_highlights(gains: list[float], highlight: tuple[float, float, float] | None) -> list[float]:
    """키운 밝은 쪽이 넘치면 이득 전체를 같은 비율로 줄인다 — 가장 큰 이득은 1 아래로 내리지 않는다."""
    if highlight is None:
        return gains
    peak = max(level * gain for level, gain in zip(highlight, gains))
    if peak <= 1.0:
        return gains
    scale = max(1.0 / peak, 1.0 / max(gains))
    return [gain * scale for gain in gains]


def with_style(match: str, eq: str) -> str:
    """보정 → 분위기 순서로 잇는다."""
    return ",".join(f for f in (match, eq) if f)
