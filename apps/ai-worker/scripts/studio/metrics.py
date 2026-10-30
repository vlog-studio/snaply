"""결과물 자동 지표 — 로드맵 단계마다 같은 숫자로 전후를 비교한다(진단 보고서 Phase 5).

- 컷: EDL 의 계획 시각 근처(±200ms)에서 이웃 프레임 차이가 가장 큰 프레임 — 계획이 아니라 **실제 영상의 컷**으로 잰다(결합 중 쌓이는 오차까지).
  시각은 프레임 번호가 아니라 그 프레임의 pts 다 — 영상이 소리보다 늦게 시작하거나 중간에 프레임이 빠지면 그대로 드러난다
- 프레임 구멍: 이웃 프레임 pts 간격이 1.5프레임을 넘는 곳(화면이 멈춘 것처럼 보인다) · 영상 시작 시각(소리는 0 에서 시작한다)
- 박자: 실제 컷과 가장 가까운 박자의 거리. 80ms 안 비율이 핵심 지표다(같은 곡에서 아무 데나 자르면 오차의 기대값은 박자 간격의 1/4)
- 리듬: 컷 길이의 평균 · 변동계수 / 훅: 첫 2초 움직임 ÷ 전체 평균 / 소리: 통합 음량 · 트루 피크
- 빈 화면: 거의 한 색(흰 · 검정)인 프레임의 몫 — 끝맺음 페이드 0.5초는 뺀다
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from pipeline import beat_grid, steadiness  # noqa: E402

FPS = 30
W, H = 90, 160
SEARCH_FRAMES = 6
ON_BEAT_MS = 80
END_FADE_S = 0.5


def _frames(path: str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W}:{H},format=gray", "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


def _pts(path: str) -> np.ndarray:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time",
                          "-of", "csv=p=0", path], capture_output=True, text=True, check=True).stdout
    return np.array([float(x.strip().rstrip(",")) for x in out.split() if x.strip().rstrip(",")])


def actual_cuts(diff: np.ndarray, pts: np.ndarray, planned_s: list[float]) -> list[float]:
    """계획 시각마다 근처에서 화면이 가장 크게 바뀐 프레임의 pts(초). diff[i-1] 는 프레임 i-1 → i 의 차이."""
    out = []
    for at in planned_s:
        center = int(np.searchsorted(pts, at))
        window = range(max(1, center - SEARCH_FRAMES), min(len(diff) + 1, center + SEARCH_FRAMES + 1))
        if not window:
            continue
        out.append(float(pts[max(window, key=lambda i: diff[i - 1])]))
    return out


def beat_alignment(cuts_s: list[float], beats_ms: tuple[int, ...], bpm: float) -> dict:
    if not cuts_s or not beats_ms:
        return {}
    beats = np.asarray(beats_ms, dtype=float) / 1000
    errs = [float(np.min(np.abs(beats - c))) * 1000 for c in cuts_s]
    return {"bpm": round(bpm, 1), "medianMs": round(float(np.median(errs))), "p90Ms": round(float(np.percentile(errs, 90))),
            "onBeat": round(float(np.mean([e <= ON_BEAT_MS for e in errs])), 2), "randomMs": round(60000 / bpm / 4)}


def loudness(path: str) -> dict:
    err = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    i, tp = re.findall(r"I:\s+(-?[\d.]+) LUFS", err), re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    return {"lufs": float(i[-1]) if i else None, "truePeak": float(tp[-1]) if tp else None}


def scene_switches(edl: dict) -> dict | None:
    """이웃 컷의 장면(촬영 시각 10분 간격 — pipeline/scenes)이 바뀐 횟수와 최소 횟수(장면 수 − 1, 훅이 있으면 + 1). 핑퐁이면 최소보다 크다."""
    scenes = {int(k): v for k, v in (edl.get("scenes") or {}).items()}
    clips = edl.get("clips") or []
    if not scenes or not clips:
        return None
    seq = [scenes.get(c["snap"]) for c in clips]
    switches = sum(1 for a, b in zip(seq, seq[1:]) if a != b)
    hook = edl.get("hook")
    if hook is not None and clips[0]["snap"] == hook and len(seq) > 1:  # 훅 → 첫 장면(다르면 한 번) + 나머지 장면 사이
        minimum = len(set(seq[1:])) - 1 + (1 if seq[0] != seq[1] else 0)
    else:
        minimum = len(set(seq)) - 1
    return {"switches": switches, "minimum": max(0, minimum), "count": len(set(seq))}


def shake(path: str, cuts_s: list[float]) -> dict:
    """결과물의 손떨림(px/0.1초, 180×320 기준 — steadiness 와 같은 잣대). 컷 경계 앞뒤 0.1초는 화면이 바뀌는 자리라 뺀다."""
    st = steadiness.read(path)
    steps = np.arange(len(st.jitter)) * steadiness.STEP_MS / 1000
    keep = np.array([all(abs(t - c) > 0.15 for c in cuts_s) for t in steps], dtype=bool)
    j = st.jitter[keep] if keep.any() else st.jitter
    return {"median": round(float(np.median(j)), 2), "p90": round(float(np.percentile(j, 90)), 2),
            "over": round(float(np.mean(j > steadiness.SHAKY_PX)), 2)}


def measure(path: str, edl: dict, track: str | None) -> dict:
    f, pts = _frames(path), _pts(path)
    n = min(len(f), len(pts))
    f, pts = f[:n], pts[:n]
    diff = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    duration = float(pts[-1] + 1 / FPS) if n else 0.0
    planned = [c["at"] for c in (edl.get("clips") or [])[1:]]
    cuts = actual_cuts(diff, pts, planned)
    gaps = [round(float(a), 3) for a, step in zip(pts[:-1], np.diff(pts)) if step > 1.5 / FPS]
    shots = np.diff([0.0, *cuts, duration])
    # 화면 분할 안의 경계(칸이 차례로 들어오는 자리)는 화면 전체가 바뀌는 컷이 아니라 밀림에서 뺀다
    inside = [c.get("transition") == "inside" for c in (edl.get("clips") or [])[:-1]]
    drift = [round((a - p) * 1000) for a, p, skip in zip(cuts, planned, inside or [False] * len(cuts)) if not skip]
    # 빈 칸: 프레임에서 고르게 흰 행이 차지하는 몫이 1/4 을 넘으면(분할 화면의 빈 칸 · 빈 화면) 빈 프레임으로 센다
    white_rows = ((f.std(axis=2) < 3) & (f.mean(axis=2) > 235)).mean(axis=1)
    flat = (f.std(axis=(1, 2)) < 4) | (white_rows > 0.25)
    body = flat[: max(0, len(f) - int(END_FADE_S * FPS))]
    out = {
        "duration": round(duration, 2), "cuts": len(cuts), "cutTimes": [round(c, 3) for c in cuts],
        "meanShot": round(float(shots.mean()), 2), "shotCv": round(float(shots.std() / shots.mean()), 2) if len(shots) else None,
        "driftMs": {"max": max(map(abs, drift), default=0), "values": drift},
        "hook": round(float(diff[: 2 * FPS].mean() / (diff.mean() + 1e-6)), 2),
        "blankShare": round(float(body.mean()) if len(body) else 0.0, 3),
        "frameGaps": gaps, "videoStartMs": round(float(pts[0]) * 1000) if n else None,
        **loudness(path),
    }
    out["shake"] = shake(path, cuts)
    out["scenes"] = scene_switches(edl)
    if track:
        try:
            grid = beat_grid.load_or_analyze(track)
            out["beat"] = beat_alignment(cuts, grid.in_movie(int(duration * 1000) + 1000), grid.bpm)
        except beat_grid.BeatGridError:
            pass
    return out


if __name__ == "__main__":
    result = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")) if len(sys.argv) > 2 else {}
    sys.stdout.write(json.dumps(measure(sys.argv[1], result.get("edl") or {}, result.get("track")), ensure_ascii=False) + "\n")
