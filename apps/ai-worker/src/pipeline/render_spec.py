"""Versioned output profiles and FFmpeg fit strategies."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RenderSpec:
    profile_version: int
    output_profile: str
    width: int
    height: int
    fps: int
    fit_mode: str


PROFILE_V1: dict[str, tuple[int, int, int]] = {
    "short_vertical": (1080, 1920, 30),
    "youtube_landscape": (1920, 1080, 30),
    "instagram_portrait": (1080, 1350, 30),
    "square": (1080, 1080, 30),
}
FIT_MODES = {"contain", "cover", "blur_background", "pad_black", "pad_white"}
# 남는 자리를 단색 띠로 채우는 맞춤(MOV-8). contain 과 달리 작은 원본도 화면 폭이나 높이까지 키운다 — blur_background 의 앞 화면과 같은 크기다.
PAD_COLORS: dict[str, str] = {"pad_black": "black", "pad_white": "white"}
# 레터박스 레시피(시네마틱 등)의 맞춤 — 원본을 가운데 16:9 띠에 꽉 채우고(넘치면 자른다) 위아래를 검게. 사용자가 고르는 값이 아니라
# 워커가 레시피로 정한다(specs/movie.md MOV-8, `worker._framed`) — 그래서 FIT_MODES 에 없다. AI 컷 경로의 띠(`cut_fx.band_spec`)와 같은 모양이다.
LETTERBOX = "letterbox"
LETTERBOX_RATIO = 9 / 16

DEFAULT_RENDER_SPEC = RenderSpec(1, "short_vertical", 1080, 1920, 30, "blur_background")
LEGACY_RENDER_SPEC = RenderSpec(1, "youtube_landscape", 1920, 1080, 30, "contain")


def parse_render_spec(raw: object, *, fallback: RenderSpec = LEGACY_RENDER_SPEC) -> RenderSpec:
    """Parse a trusted job snapshot while rejecting unknown or oversized dimensions."""
    if not isinstance(raw, dict):
        return fallback

    profile_version = raw.get("profileVersion")
    output_profile = raw.get("outputProfile")
    fit_mode = raw.get("fitMode")
    if (
        profile_version != 1
        or not isinstance(output_profile, str)
        or output_profile not in PROFILE_V1
        or not isinstance(fit_mode, str)
        or fit_mode not in FIT_MODES
    ):
        raise ValueError("지원하지 않는 렌더 설정입니다.")

    width, height, fps = PROFILE_V1[output_profile]
    if (raw.get("width"), raw.get("height"), raw.get("fps")) != (width, height, fps):
        raise ValueError("출력 프로필과 해상도 설정이 일치하지 않습니다.")

    return RenderSpec(1, output_profile, width, height, fps, fit_mode)


def band_height(width: int) -> int:
    """레터박스 띠의 높이(px) — 너비의 9/16, 짝수."""
    return round(width * LETTERBOX_RATIO / 2) * 2


def band_area(spec: RenderSpec) -> tuple[float, float, float, float]:
    """레터박스 띠가 화면에 놓인 자리(x, y, 가로, 세로 px)."""
    band = band_height(spec.width)
    return (0.0, (spec.height - band) / 2, float(spec.width), float(band))


def _contain_scale(spec: RenderSpec) -> str:
    # Preserve small foregrounds instead of blindly stretching them to the canvas.
    return (
        f"scale=w='min({spec.width},iw)':h='min({spec.height},ih)':"
        "force_original_aspect_ratio=decrease:force_divisible_by=2"
    )


def _fit_scale(spec: RenderSpec) -> str:
    return (
        f"scale={spec.width}:{spec.height}:"
        "force_original_aspect_ratio=decrease:force_divisible_by=2"
    )


def build_video_filter(spec: RenderSpec, eq: str, *, input_label: str = "[0:v:0]") -> str:
    """Build a labelled filter graph whose video output is always named ``[v]``.

    ``eq`` (the colour match and the style, both per-pixel) runs on the scaled picture, not the source: a phone's
    4K frame is four times the output's pixels, and ``colorchannelmixer`` adds an RGB round trip on every one of them
    (backlog E-49). It still comes before ``pad`` so the bars keep their colour.
    """
    prefix = f"{input_label}setpts=PTS-STARTPTS"
    grade = f",{eq}" if eq else ""

    finish = f"setsar=1,fps={spec.fps},format=yuv420p[v]"
    if spec.fit_mode == "contain":
        return (
            f"{prefix},{_contain_scale(spec)}{grade},"
            f"pad={spec.width}:{spec.height}:(ow-iw)/2:(oh-ih)/2:color=black,{finish}"
        )
    if spec.fit_mode == LETTERBOX:
        band = band_height(spec.width)
        return (
            f"{prefix},scale={spec.width}:{band}:force_original_aspect_ratio=increase:force_divisible_by=2,"
            f"crop={spec.width}:{band}{grade},"
            f"pad={spec.width}:{spec.height}:0:(oh-ih)/2:color=black,{finish}"
        )
    if spec.fit_mode in PAD_COLORS:
        return (
            f"{prefix},{_fit_scale(spec)}{grade},"
            f"pad={spec.width}:{spec.height}:(ow-iw)/2:(oh-ih)/2:color={PAD_COLORS[spec.fit_mode]},{finish}"
        )

    cover = (
        f"scale={spec.width}:{spec.height}:"
        "force_original_aspect_ratio=increase:force_divisible_by=2,"
        f"crop={spec.width}:{spec.height}"
    )
    if spec.fit_mode == "cover":
        return f"{prefix},{cover}{grade},{finish}"

    return (
        f"{prefix},split=2[background][foreground];"
        f"[background]{cover},gblur=sigma=30[background_blurred];"
        f"[foreground]{_fit_scale(spec)}[foreground_scaled];"
        "[background_blurred][foreground_scaled]"
        f"overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2{grade},"
        f"{finish}"
    )
