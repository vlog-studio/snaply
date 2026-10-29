"""액센트 엔진에 넣을 영상 쪽 입력 — 컷 구간의 움직임 곡선과 대표 프레임의 휘도 격자.

- 움직임: 스냅마다 업로드 뒤 계산해 둔 `video_signals.motion`(`pipeline/snap_signals.py`, STEP_MS 간격, 스냅 시작부터)에서
  컷이 쓰는 구간(`sourceInMs` ~ `sourceOutMs`)만 잘라 낸다. 새로 재지 않는다
- 휘도 격자: 컷 가운데 프레임 한 장을 결과물과 같은 세로 화면(1080x1920)으로 채워 자른 뒤 COLS x ROWS 로 줄인다.
  결과물은 비율이 다른 원본을 블러 배경에 맞춰 넣으므로(MOV-8) 가로 원본에서는 근사다. 단색 띠 맞춤(`pad_black` · `pad_white`)이면
  결과물과 같은 맞춤으로 잰다 — 글이 띠 위에 놓일 수 있고, 흰 띠 위의 흰 글이 대비 규칙(`accent_fit.contrast_colours`)에 걸려야 한다
"""

import subprocess

from dataclasses import replace

from pipeline import layout, render_spec
from pipeline.snap_signals import STEP_MS

COLS, ROWS = 6, 10


class AccentInputError(RuntimeError):
    """대표 프레임을 읽지 못함 — 호출하는 쪽은 휘도 없이(대비 규칙 없이) 진행한다."""


def cut_motion(series: list[float] | tuple[float, ...], source_in_ms: int,
               source_out_ms: int | None) -> tuple[float, ...]:
    """스냅 움직임 곡선에서 컷 구간. 곡선이 없거나 구간이 곡선 밖이면 빈 튜플(= 에너지 모름)."""
    start = max(0, source_in_ms // STEP_MS)
    end = len(series) if source_out_ms is None else max(start, -(-source_out_ms // STEP_MS))
    return tuple(series[start:end])


def representative_ms(source_in_ms: int, source_out_ms: int | None, duration_ms: int) -> int:
    end = duration_ms if source_out_ms is None else source_out_ms
    return source_in_ms + max(0, end - source_in_ms) // 2


def luma_grid(path: str, at_ms: int, fit_mode: str = "blur_background") -> tuple[tuple[float, ...], ...]:
    """대표 프레임의 휘도(0~1) 격자, 위 행부터."""
    grid = f"scale={COLS}:{ROWS}:flags=area,format=gray"
    if fit_mode in render_spec.PAD_COLORS:
        canvas = replace(render_spec.DEFAULT_RENDER_SPEC, width=layout.W, height=layout.H, fit_mode=fit_mode)
        frame = ["-filter_complex", f"{render_spec.build_video_filter(canvas, '')};[v]{grid}[g]", "-map", "[g]"]
    else:
        frame = ["-vf", f"scale={layout.W}:{layout.H}:force_original_aspect_ratio=increase,crop={layout.W}:{layout.H},{grid}"]
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{at_ms / 1000:.3f}", "-i", path, "-frames:v", "1",
         *frame, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True,
    )
    if result.returncode != 0 or len(result.stdout) != COLS * ROWS:
        raise AccentInputError(f"대표 프레임을 읽지 못했습니다: {result.stderr.decode('utf-8', 'replace')[-300:]}")
    pixels = result.stdout
    return tuple(tuple(pixels[r * COLS + c] / 255 for c in range(COLS)) for r in range(ROWS))
