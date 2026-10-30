"""흔들림 게이트 — 흔들리는 구간은 피하고, 어디를 잘라도 흔들리는 스냅은 뺀다(trend-recipes §20, 편집 품질 로드맵 3).

스냅을 쓸지는 VLM 의 `usableForEdit` 가 정했는데 정지 프레임 4장으로는 흔들림을 볼 수 없어 샘플 39개가 모두 '쓸 수 있음'이었다. 그래서 숫자로 잰다:
- **손떨림**: 10fps · 180×320 회색 프레임의 이웃 이동(위상 상관, 부분 픽셀)을 쌓은 궤적에서 0.5초 평균을 뺀 나머지(px/0.1초). 의도한 팬 · 줌은 부드러워 남지 않는다
- **선명도**: 라플라시안 분산. 장면의 무늬에 따라 값이 크게 달라 절대 문턱 없이 스냅 안 상대값으로만 감점한다(무늬 적은 수영장이 흐림으로 보이지 않게)
"""

import math
import os
import subprocess
from dataclasses import dataclass

import numpy as np

from pipeline import continuity, hdr

READ_W, READ_H, FPS = 180, 320, 10
STEP_MS = 1000 // FPS
SMOOTH_STEPS = 5  # 부드러운 궤적 = 0.5초 이동 평균
SHAKY_PX = 2.5  # 컷의 손떨림 평균이 이보다 크면 안정된 구간을 찾는다(실측: 안정 0.1~1.4, 손에 든 근접 3.0~3.4)
UNUSABLE_PX = 4.0  # 가장 안정된 구간도 이보다 크면 쓸 데가 없는 스냅(운전 4.9 · 손에 든 근접 짧은 스냅 8.0)
BETTER = 0.3  # 이만큼 나아질 때만 옮긴다 — 비슷하면 컷 고르기가 정한 자리(피크 · 구도)가 낫다
BLUR_RATIO, BLUR_WEIGHT = 0.6, 5.0  # 구간 선명도가 스냅 중앙값의 BLUR_RATIO 보다 낮으면 그만큼 감점
BEST_WINDOW_MS = 1500
# 컷이 묶인 정도 — SEAM: 찍힌 동작(가림 · 휩팬 · 구도)으로 끝나거나 시작한다, 옮기지 않는다(휩팬은 일부러 빠르게 움직여 손떨림 값이 높다).
# LINK: 원본 줌 · 매치컷으로 이어진다, UNUSABLE_PX 를 넘게 흔들릴 때만 연결을 풀고 옮긴다 — 손에 든 근접 영상은 손떨림이 원본 줌으로 잡혀
# 모든 경계가 '원본 줌으로 이어짐'이었다(2026-10-30, 진짜 줌은 부드러워 손떨림 값이 낮다)
SEAM, LINK = "seam", "link"


@dataclass(frozen=True)
class Steadiness:
    jitter: np.ndarray  # 0.1초마다 손떨림(px)
    sharp: np.ndarray  # 0.1초마다 선명도


def of_frames(frames: np.ndarray) -> Steadiness:
    import cv2  # noqa: PLC0415 — 워커 이미지에만 있다

    f = np.asarray(frames, dtype=np.float32)
    if len(f) < 2:
        return Steadiness(np.zeros(len(f)), np.ones(len(f)))
    window = (np.hanning(f.shape[1])[:, None] * np.hanning(f.shape[2])[None, :]).astype(np.float32)
    # phaseCorrelate 는 창을 입력에 덮어써 그대로 넘기면 다음 비교의 프레임이 어두워진다 — 복사본을 넘긴다
    shifts = np.array([cv2.phaseCorrelate(a.copy(), b.copy(), window)[0] for a, b in zip(f[:-1], f[1:])])
    path = np.vstack([np.zeros(2), np.cumsum(shifts, axis=0)])
    half = SMOOTH_STEPS // 2
    padded = np.pad(path, ((half, half), (0, 0)), mode="edge")
    kernel = np.ones(SMOOTH_STEPS) / SMOOTH_STEPS
    smooth = np.stack([np.convolve(padded[:, i], kernel, mode="valid") for i in range(2)], axis=1)
    sharp = np.array([cv2.Laplacian(x, cv2.CV_32F).var() for x in f])
    return Steadiness(np.linalg.norm(path - smooth, axis=1), sharp)


def read(path: str) -> Steadiness:
    tonemap = ",".join(hdr.source_filters(path))
    vf = (f"{tonemap}," if tonemap else "") + (
        f"fps={FPS},scale={READ_W}:{READ_H}:force_original_aspect_ratio=decrease,"
        f"pad={READ_W}:{READ_H}:(ow-iw)/2:(oh-ih)/2,format=gray")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", vf, "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    return of_frames(np.frombuffer(raw, np.uint8).reshape(-1, READ_H, READ_W))


def cost(st: Steadiness, start_ms: int, end_ms: int) -> float:
    """구간의 나쁨 — 손떨림 평균 + 스냅 안에서 상대적으로 흐리면 감점."""
    a, b = start_ms // STEP_MS, max(start_ms // STEP_MS + 1, math.ceil(end_ms / STEP_MS))
    jitter = st.jitter[a:b]
    if not len(jitter):
        return 0.0
    whole, part = float(np.median(st.sharp)), float(np.median(st.sharp[a:b]))
    blur = max(0.0, BLUR_RATIO - part / whole) * BLUR_WEIGHT if whole > 0 else 0.0
    return float(np.mean(jitter)) + blur


def steadiest_start(st: Steadiness, length_ms: int) -> int:
    """length_ms 구간 중 가장 나쁨이 작은 곳의 시작(ms)."""
    last = max(0, len(st.jitter) * STEP_MS - length_ms)
    return min(range(0, last + 1, STEP_MS), key=lambda s: cost(st, s, s + length_ms))


def best_cost(st: Steadiness, length_ms: int = BEST_WINDOW_MS) -> float:
    length = min(length_ms, len(st.jitter) * STEP_MS)
    start = steadiest_start(st, length)
    return cost(st, start, start + length)


def usable(best: list[float]) -> list[int]:
    """쓸 스냅의 번호 — 가장 안정된 구간도 UNUSABLE_PX 를 넘는 스냅은, 안정된 스냅이 절반 이상 · 최소 3개 남을 때만 뺀다."""
    steady = [i for i, c in enumerate(best) if c <= UNUSABLE_PX]
    return steady if len(steady) >= max(3, math.ceil(len(best) / 2)) else list(range(len(best)))


def steady_windows(planned: list[continuity.PlannedCut], steadiness: list[Steadiness], source_ms: list[int],
                   tied: list[str | None]) -> list[continuity.PlannedCut]:
    """흔들리는 컷을 같은 스냅 · 같은 길이의 가장 안정된 구간으로. tied[k] 가 SEAM 이면 두고, LINK 면 UNUSABLE_PX 를 넘을 때만 옮긴다(부르는 쪽이
    옮긴 컷의 연결을 푼다). 배속 곡선 · 멈춤 컷도 둔다. BETTER 만큼 나아질 때만 옮긴다."""
    out = []
    for k, cut in enumerate(planned):
        st, length = steadiness[k], cut.end_ms - cut.start_ms
        now = cost(st, cut.start_ms, cut.end_ms)
        limit = UNUSABLE_PX if tied[k] == LINK else SHAKY_PX
        if tied[k] == SEAM or cut.ramp or cut.hold_ms or now <= limit or length >= source_ms[k]:
            out.append(cut)
            continue
        start = min(steadiest_start(st, length), source_ms[k] - length)
        better = cost(st, start, start + length)
        if better <= now * (1 - BETTER):
            cut = continuity.PlannedCut(cut.index, start, start + length, cut.speed, cut.seam, ramp=cut.ramp,
                                        hold_ms=cut.hold_ms, hold_at_ms=cut.hold_at_ms)
        out.append(cut)
    return out


# ── 손떨림 보정(trend-recipes §21) ─────────────────────────────────────
# 상한 — 화면 너비의 4% 이동 · 0.05rad 회전까지만 바로잡는다. 상한 없이 두니 손에 든 근접 영상을 따라가려다 화면을 1.5배로 키워 구도가 망가졌다.
# 자잘한 손떨림만 잡고 큰 움직임은 둔다(확대는 대개 10% 안)
STAB_SHIFT, STAB_ANGLE, STAB_SMOOTHING = 0.04, 0.05, 30
STAB_BETTER = 0.2  # 고친 뒤 이만큼 나아져야 보정본을 쓴다 — 셀피 · 근접 영상은 보정해도 그대로거나 나빠졌다(2026-10-30 실측)


def to_stabilize(planned: list[continuity.PlannedCut], steadiness: list[Steadiness], tied: list[str | None]) -> list[int]:
    """보정할 컷 — 손떨림이 SHAKY_PX 를 넘고, 찍힌 동작(휩팬은 일부러 빠르다) · 배속 곡선 · 멈춤이 아닌 컷."""
    return [k for k, cut in enumerate(planned)
            if tied[k] != SEAM and not cut.ramp and not cut.hold_ms
            and cost(steadiness[k], cut.start_ms, cut.end_ms) > SHAKY_PX]


def stabilize_filters(width: int, trf: str) -> tuple[str, str]:
    """(1단계 움직임 재기, 2단계 바로잡기) — 같은 해상도의 같은 구간에 건다(변환값이 픽셀 단위다)."""
    return (f"vidstabdetect=shakiness=8:accuracy=15:result={trf}",
            f"vidstabtransform=input={trf}:smoothing={STAB_SMOOTHING}:optzoom=1:maxshift={int(width * STAB_SHIFT)}:"
            f"maxangle={STAB_ANGLE}:interpol=bicubic")


def _encode(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], capture_output=True, check=True)


def stabilize(path: str, start_ms: int, end_ms: int, work: str) -> str | None:
    """구간을 잘라 손떨림을 바로잡은 파일(원본 해상도 · SDR · 소리 포함). 다시 재서 STAB_BETTER 만큼 나아지지 않으면 None — 원본을 쓴다."""
    os.makedirs(work, exist_ok=True)
    cut, fixed, trf = (os.path.join(work, n) for n in ("cut.mp4", "stabilized.mp4", "motion.trf"))
    pre = ",".join(hdr.source_filters(path))
    encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "14"]
    _encode(["-ss", f"{start_ms / 1000:.3f}", "-t", f"{(end_ms - start_ms) / 1000:.3f}", "-i", path,
             "-vf", (f"{pre}," if pre else "") + "format=yuv420p", *encode, "-c:a", "aac", "-map_metadata", "-1", cut])
    width = int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width",
                                "-of", "csv=p=0", cut], capture_output=True, text=True, check=True).stdout.strip().strip(","))
    detect, transform = stabilize_filters(width, trf)
    _encode(["-i", cut, "-vf", detect, "-f", "null", "-"])
    _encode(["-i", cut, "-vf", transform, *encode, "-c:a", "copy", fixed])
    length = end_ms - start_ms
    before, after = cost(read(cut), 0, length), cost(read(fixed), 0, length)
    return fixed if after <= before * (1 - STAB_BETTER) else None
