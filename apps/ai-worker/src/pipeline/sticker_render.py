"""이모지 스티커 오버레이 트랙 — 배치(`pipeline/sticker.py`)를 투명 영상 하나로 굽는다.

libass 는 컬러 이모지 글리프를 그리지 못하므로(FreeType 가 COLR/CBDT 를 렌더하지 않는다) 스티커는 이미지로
그린다. 스티커가 여럿이어도 overlay 체인이 길어지지 않게 **길이 전체의 RGBA 트랙 한 장**으로 구워 overlay 한 번으로
합성한다(docs/plans/trend-editing-pipeline.md §5.2 · §10 의 13). 모양은 흰 칼선 테두리 + 그림자(다이컷 스티커).
얼굴 스티커(`pipeline/face.py` — 얼굴을 따라다니는 왕관 · 선글라스 등)도 같은 트랙에 굽는다. 얼굴에 얹히는 것이라 칼선 없이 원본 이모지로.
"""

import math
import subprocess
from functools import lru_cache

from PIL import Image, ImageFilter

import config
from pipeline import face as fc, layout
from pipeline.sticker import Sticker

EMOJI_DIR = config.WORKER_ROOT / "assets" / "stickers" / "emoji"
FPS = 30
POP_MS, OUT_MS, BUMP_MS = 220, 140, 150
BORDER_PX = 14


class StickerRenderError(RuntimeError):
    """오버레이 트랙을 굽지 못함."""


@lru_cache(maxsize=64)
def die_cut(emoji: str) -> Image.Image:
    """원본 이모지에 흰 칼선 테두리와 아래 그림자를 입힌 RGBA."""
    src = Image.open(EMOJI_DIR / f"{emoji}.png").convert("RGBA")
    pad = BORDER_PX * 2
    canvas = Image.new("RGBA", (src.width + pad * 2, src.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(src, (pad, pad))
    solid = canvas.getchannel("A").point(lambda a: 255 if a > 40 else 0)
    outline = solid.filter(ImageFilter.MaxFilter(BORDER_PX * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    out = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow.putalpha(outline.point(lambda a: int(a * 0.35)).filter(ImageFilter.GaussianBlur(8)))
    white = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
    white.putalpha(outline)
    out.alpha_composite(shadow, (0, 10))
    out.alpha_composite(white)
    out.alpha_composite(canvas)
    return out


@lru_cache(maxsize=16)
def raw(emoji: str) -> Image.Image:
    return Image.open(EMOJI_DIR / f"{emoji}.png").convert("RGBA")


def _ease_out_back(x: float) -> float:
    c = 1.70158
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def pose(sticker: Sticker, t: float) -> tuple[float, float, float, float]:
    """등장 기준 t ms 의 (배율, 회전, 세로 이동 px, 알파)."""
    duration = sticker.end_ms - sticker.start_ms
    scale = _ease_out_back(t / POP_MS) if t < POP_MS else 1.0
    rotation, dy = sticker.rotation, 0.0
    if sticker.motion == "popBob":
        dy = math.sin(2 * math.pi * t / 700) * 14
    elif sticker.motion == "wobble":
        rotation += math.sin(2 * math.pi * t / 450) * 12
    elif sticker.motion == "floatUp":
        dy = -t / duration * 90
    elif sticker.motion == "spin":
        rotation += t / duration * 50
    for beat in sticker.beats[1:]:
        if beat <= t < beat + BUMP_MS:
            scale *= 1 + 0.14 * (1 - (t - beat) / BUMP_MS)
    alpha = 1.0
    if t > duration - OUT_MS:
        alpha = max(0.0, (duration - t) / OUT_MS)
        scale *= 0.6 + 0.4 * alpha
    return scale, rotation, dy, alpha


def frame(stickers: list[Sticker], now_ms: float, faces: tuple[fc.FaceSticker, ...] = ()) -> Image.Image:
    canvas = Image.new("RGBA", (layout.W, layout.H), (0, 0, 0, 0))
    for sticker in stickers:
        t = now_ms - sticker.start_ms
        if 0 <= t < sticker.end_ms - sticker.start_ms:
            _draw(canvas, sticker, *pose(sticker, t))
    for sticker in faces:
        _draw_face(canvas, sticker, now_ms)
    return canvas


def _draw_face(canvas: Image.Image, sticker: fc.FaceSticker, now_ms: float) -> None:
    spot = fc.at(sticker, now_ms)
    if spot is None:
        return
    x, y, size = spot
    t, left = now_ms - sticker.start_ms, sticker.end_ms - now_ms
    scale = _ease_out_back(t / POP_MS) if t < POP_MS else 1.0
    alpha = min(1.0, left / OUT_MS)
    px = max(2, int(size * layout.W * scale))
    img = raw(sticker.emoji).resize((px, px), Image.BILINEAR)
    if alpha < 1:
        img.putalpha(img.getchannel("A").point(lambda a: int(a * alpha)))
    _blend(canvas, img, int(x * layout.W - px / 2), int(y * layout.H - px / 2))


def _draw(canvas: Image.Image, sticker: Sticker, scale: float, rotation: float, dy: float, alpha: float) -> None:
    px = max(2, int(sticker.size_px * scale))
    img = die_cut(sticker.emoji).resize((px, px), Image.BILINEAR).rotate(-rotation, expand=True, resample=Image.BILINEAR)
    if alpha < 1:
        img.putalpha(img.getchannel("A").point(lambda a: int(a * alpha)))
    cx, cy = sticker.xy[0] * layout.W, sticker.xy[1] * layout.H + dy
    _blend(canvas, img, int(cx - img.width / 2), int(cy - img.height / 2))


def _blend(canvas: Image.Image, img: Image.Image, x: int, y: int) -> None:
    """img 를 (x, y) 에 알파 합성 — 화면 밖으로 삐져나간 부분은 잘라 낸다(alpha_composite 는 음수 좌표를 받지 않는다).
    전에는 화면 크기의 빈 층에 붙여 합성했다 — 스티커마다 1080x1920 한 장씩이라 트랙 굽기가 느렸다."""
    left, top = max(0, -x), max(0, -y)
    right, bottom = min(img.width, canvas.width - x), min(img.height, canvas.height - y)
    if right <= left or bottom <= top:
        return
    canvas.alpha_composite(img, (x + left, y + top), (left, top, right, bottom))


def bake_overlay(stickers: list[Sticker], total_ms: int, out_path: str, faces: tuple[fc.FaceSticker, ...] = ()) -> str:
    """길이 total_ms 의 투명 트랙(qtrle .mov, 알파 보존)을 굽는다."""
    proc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
            "-s", f"{layout.W}x{layout.H}", "-r", str(FPS), "-i", "pipe:0",
            "-c:v", "qtrle", "-pix_fmt", "argb", out_path,
        ],
        stdin=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert proc.stdin is not None
    spans = [(s.start_ms, s.end_ms) for s in stickers] + [(f.start_ms, f.end_ms) for f in faces]
    empty = bytes(layout.W * layout.H * 4)  # 아무것도 없는 프레임은 그리지 않고 같은 빈 프레임을 보낸다
    try:
        for index in range(math.ceil(total_ms * FPS / 1000)):
            now = index * 1000 / FPS
            busy = any(a <= now < b for a, b in spans)
            proc.stdin.write(frame(stickers, now, faces).tobytes() if busy else empty)
    except BrokenPipeError:
        pass  # ffmpeg 가 먼저 죽었다 — 아래 종료 코드와 stderr 로 원인을 올린다
    # communicate 가 stdin 을 닫고 stderr 를 끝까지 읽는다(파이프를 남기지 않는다)
    _, err = proc.communicate()
    if proc.returncode != 0:
        stderr = err.decode("utf-8", "replace") if err else ""
        raise StickerRenderError(f"스티커 트랙 인코딩 실패: {stderr.strip()[-500:]}")
    return out_path
