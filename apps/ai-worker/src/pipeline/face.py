"""얼굴 스티커 — 얼굴을 따라다니는 왕관 · 선글라스 · 하트 · 반짝이(트렌드 레시피의 `faceStickers`, docs/decisions/trend-recipes.md §7).

1. 결과물(결합된 편집본)을 10fps · 360x640 으로 읽어 프레임마다 얼굴을 찾는다 — OpenCV `FaceDetectorYN` + YuNet 모델
   (`assets/models/face_detection_yunet_2023mar.onnx`, MIT). 워커 안에서만 돌고 프레임을 밖으로 보내지 않는다
2. 이웃 프레임의 상자를 겹침(IoU)으로 이어 트랙을 만들고 흔들림을 줄인다(이동 평균)
3. minTrackMs 이상 이어진 트랙 중 share 비율을, 서로 gapMs 떨어지게 고르고 종류를 정한다 — 너무 작은 얼굴은 빼고
4. 스티커는 얼굴 상자에 붙는 자리 · 크기를 프레임마다 갖는다 — `sticker_render` 가 오버레이 트랙에 같이 굽는다

Haar 검출기는 샘플 6장에서 맞힌 얼굴 1 · 오검출 3(땅 · 다리 · 기계)이라 쓰지 않았다(2026-10-22). YuNet 은 같은 프레임에서
얼굴 13개 · 오검출 0 이었다(뒤돌거나 가린 얼굴만 놓침).
"""

import hashlib
import subprocess
from dataclasses import dataclass

import numpy as np

import config

MODEL = config.WORKER_ROOT / "assets" / "models" / "face_detection_yunet_2023mar.onnx"
STEP_MS = 100
READ_W, READ_H = 360, 640
SCORE_MIN, NMS, TOP_K = 0.75, 0.3, 20
IOU_LINK, MAX_GAP = 0.3, 1  # 한 프레임 놓쳐도 같은 트랙
MIN_FACE_W = 0.08  # 화면 너비 대비 — 이보다 작은 얼굴엔 붙이지 않는다
MAX_HOLD_MS = 2600  # 스티커 하나가 붙어 있는 최대 길이
SMOOTH = 3

# 종류 → (이모지, 얼굴 상자 기준 중심 x · y(상자 너비 · 높이 몫), 크기(상자 너비 몫))
KINDS: dict[str, tuple[str, float, float, float]] = {
    "crown": ("1f451", 0.5, -0.38, 0.95),
    "shades": ("1f576", 0.5, 0.42, 1.05),
    "hearts": ("1f495", 1.05, 0.05, 0.6),
    "sparkles": ("2728", -0.1, -0.05, 0.55),
}


class FaceError(RuntimeError):
    """얼굴 검출을 돌리지 못함(모델 · 프레임)."""


@dataclass(frozen=True)
class Box:
    x: float  # 화면 몫(0~1)
    y: float
    w: float
    h: float

    def iou(self, other: "Box") -> float:
        ix = max(0.0, min(self.x + self.w, other.x + other.w) - max(self.x, other.x))
        iy = max(0.0, min(self.y + self.h, other.y + other.h) - max(self.y, other.y))
        inter = ix * iy
        union = self.w * self.h + other.w * other.h - inter
        return inter / union if union > 0 else 0.0


@dataclass
class Track:
    start: int  # 첫 프레임 번호
    boxes: list[Box | None]  # 놓친 프레임은 None

    @property
    def end(self) -> int:
        return self.start + len(self.boxes)

    def last(self) -> Box | None:
        return next((b for b in reversed(self.boxes) if b is not None), None)


@dataclass(frozen=True)
class FaceSticker:
    kind: str
    emoji: str
    # (ms, 중심 x, 중심 y — 화면 몫, 크기 — 화면 너비 몫)
    keys: tuple[tuple[int, float, float, float], ...]

    @property
    def start_ms(self) -> int:
        return self.keys[0][0]

    @property
    def end_ms(self) -> int:
        return self.keys[-1][0] + STEP_MS


def _detector():
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover — requirements 에 있다
        raise FaceError("opencv 가 없습니다") from exc
    if not MODEL.exists():
        raise FaceError(f"얼굴 모델이 없습니다: {MODEL}")
    return cv2.FaceDetectorYN.create(str(MODEL), "", (READ_W, READ_H), SCORE_MIN, NMS, TOP_K)


def detect_frames(frames: np.ndarray) -> list[list[Box]]:
    """BGR 프레임들(N, READ_H, READ_W, 3) → 프레임마다 얼굴 상자."""
    det = _detector()
    out = []
    for f in frames:
        _, faces = det.detect(np.ascontiguousarray(f))
        boxes = []
        for row in ([] if faces is None else faces):
            x, y, w, h = (float(v) for v in row[:4])
            boxes.append(Box(x / READ_W, y / READ_H, w / READ_W, h / READ_H))
        out.append(boxes)
    return out


def detect(video: str) -> list[list[Box]]:
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={1000 // STEP_MS},scale={READ_W}:{READ_H}",
         "-pix_fmt", "bgr24", "-f", "rawvideo", "-"], capture_output=True)
    if proc.returncode != 0:
        raise FaceError(f"프레임을 읽지 못함: {proc.stderr.decode('utf-8', 'replace')[-300:]}")
    frames = np.frombuffer(proc.stdout, np.uint8).reshape(-1, READ_H, READ_W, 3)
    return detect_frames(frames)


def tracks(per_frame: list[list[Box]]) -> list[Track]:
    """이웃 프레임의 상자를 겹침으로 이어 트랙으로 — 한 상자는 가장 많이 겹치는 트랙 하나에만. 놓친 프레임은 None 으로 남는다."""
    live: list[Track] = []
    done: list[Track] = []
    for i, boxes in enumerate(per_frame):
        taken: set[int] = set()
        for track in live:
            last = track.last()
            best = max(((last.iou(b), j) for j, b in enumerate(boxes) if j not in taken), default=(0.0, -1))
            if best[0] >= IOU_LINK:
                track.boxes += [None] * (i - track.end)
                track.boxes.append(boxes[best[1]])
                taken.add(best[1])
        live += [Track(i, [b]) for j, b in enumerate(boxes) if j not in taken]
        # 마지막으로 이어진 프레임(end - 1)이 MAX_GAP 보다 오래 전이면 끝난 트랙
        done += [t for t in live if i - (t.end - 1) > MAX_GAP]
        live = [t for t in live if i - (t.end - 1) <= MAX_GAP]
    return done + live


def _smooth(track: Track) -> list[Box]:
    """놓친 프레임은 앞 상자로 메우고 SMOOTH 프레임 이동 평균."""
    filled, last = [], None
    for b in track.boxes:
        last = b if b is not None else last
        filled.append(last)
    out = []
    for i in range(len(filled)):
        win = filled[max(0, i - SMOOTH + 1): i + 1]
        out.append(Box(*(float(np.mean([getattr(b, k) for b in win])) for k in ("x", "y", "w", "h"))))
    return out


def _pick(seed: int, start: int, share: float) -> bool:
    h = int.from_bytes(hashlib.sha256(f"{seed}:{start}".encode()).digest()[:4], "big")
    return h / 2**32 < share


def plan(found: list[Track], cfg: dict, seed: int) -> list[FaceSticker]:
    if not cfg.get("enabled") or not cfg.get("kinds"):
        return []
    min_frames = max(1, cfg["minTrackMs"] // STEP_MS)
    candidates = []
    for track in sorted(found, key=lambda t: t.start):
        if len(track.boxes) < min_frames:
            continue
        boxes = _smooth(track)[: MAX_HOLD_MS // STEP_MS]
        if float(np.median([b.w for b in boxes])) >= MIN_FACE_W:
            candidates.append((track, boxes))
    out: list[FaceSticker] = []
    last_start = -10**9
    for track, boxes in candidates:
        start_ms = track.start * STEP_MS
        if start_ms - last_start < cfg["gapMs"] or not _pick(seed, track.start, cfg["share"]):
            continue
        out.append(_sticker(track, boxes, cfg, seed))
        last_start = start_ms
    if not out and candidates and cfg["share"] > 0:
        # 비율로 고르다 하나도 안 남으면 가장 오래 보이는 얼굴 하나에는 붙인다(후보가 둘뿐인 무비에서 둘 다 빠졌다 — 2026-10-22)
        track, boxes = max(candidates, key=lambda c: (len(c[0].boxes), -c[0].start))
        out.append(_sticker(track, boxes, cfg, seed))
    return out


def _sticker(track: Track, boxes: list[Box], cfg: dict, seed: int) -> FaceSticker:
    kinds = cfg["kinds"]
    kind = kinds[int.from_bytes(hashlib.sha256(f"{seed}:kind:{track.start}".encode()).digest()[:2], "big") % len(kinds)]
    emoji, ax, ay, size = KINDS[kind]
    keys = tuple(((track.start + i) * STEP_MS, b.x + b.w * ax, b.y + b.h * ay, b.w * size) for i, b in enumerate(boxes))
    return FaceSticker(kind, emoji, keys)


def at(sticker: FaceSticker, now_ms: float) -> tuple[float, float, float] | None:
    """now_ms 의 (중심 x, 중심 y, 크기) — 키 사이는 선형 보간, 구간 밖이면 None."""
    keys = sticker.keys
    if not keys or now_ms < keys[0][0] or now_ms >= sticker.end_ms:
        return None
    for (t0, x0, y0, s0), (t1, x1, y1, s1) in zip(keys, keys[1:]):
        if t0 <= now_ms < t1:
            r = (now_ms - t0) / (t1 - t0)
            return x0 + (x1 - x0) * r, y0 + (y1 - y0) * r, s0 + (s1 - s0) * r
    return keys[-1][1:]
