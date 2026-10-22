"""BGM 의 비트 그리드 — 곡에서 박자 시각을 찾아 무비 시간축의 박자 목록으로 만든다.

- **분석은 곡마다 한 번** — 결과를 곡 옆 `<곡>.beats.json` 에 둔다. 버킷에서 받아 온 곡이면 워커가 처음 쓸 때 분석해 두고
  다음부터 읽는다. 곡을 바꿀 때는 새 이름으로 올리므로(`music.sync_library`) 캐시가 낡지 않는다
- **새 의존성 없음** — librosa(numba · scipy 수백 MB)를 들이지 않고 같은 방식을 numpy 로 한다: 로그 스펙트럼의 증가분
  (spectral flux)으로 onset 곡선 → 자기상관 + 120 BPM 중심의 로그 정규 사전분포로 템포 → Ellis(2007) 동적 계획법으로 박자
- **결정론** — 같은 파일이면 같은 박자다(난수 없음). 계산을 바꾸면 `BEAT_GRID_VERSION` 을 올린다 — 캐시가 다시 계산된다
- 무비에서 BGM 은 처음부터 깔리고 짧으면 반복된다(`music.mix` 의 `-stream_loop`) — `in_movie` 가 그 반복을 펼친다

계획: docs/plans/trend-editing-pipeline.md §4 (비트 그리드), backlog A-7
"""

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

BEAT_GRID_VERSION = 1
SAMPLE_RATE = 22050
N_FFT = 2048
HOP = 512
BPM_RANGE = (60.0, 200.0)
START_BPM = 120.0
# 사전분포의 폭(옥타브) — librosa 의 std_bpm 과 같은 뜻
BPM_STD_OCTAVES = 1.0
# 박자 간격이 템포에서 벗어날 때의 벌점 세기 — librosa 기본값
TIGHTNESS = 100.0
SIDECAR_SUFFIX = ".beats.json"
# 로그 간격 주파수 대역 수 — 대역마다 같은 비중으로 센다(넓은 칸을 차지하는 하이햇이 킥을 누르지 않게)
BANDS = 24
# 박자 위상을 고르는 저음 대역의 위 끝(Hz) — 박자는 보통 킥에 맞는다
LOW_HZ = 200.0
# 한 번에 FFT 할 프레임 수 — 3분 곡 전체를 한 번에 하면 복소 배열이 100MB 를 넘는다
FFT_BLOCK = 1024
# 반 간격(두 배 템포)의 가중 자기상관이 이 비율 이상이면 두 배 템포를 고른다
DOUBLE_RATIO = 0.6
# 이보다 느린 템포로 잡혔을 때만 두 배를 본다 — 숏폼 음악은 대개 80~180 BPM 이고, 그 안의 템포까지 두 배로 올리면
# 엇박 하이햇 때문에 90 BPM 곡이 180 이 된다
DOUBLE_BELOW_BPM = 80.0


class BeatGridError(RuntimeError):
    """곡을 읽거나 분석하지 못함 — 호출하는 쪽은 고정 간격으로 진행한다."""


@dataclass(frozen=True)
class BeatGrid:
    bpm: float
    # 곡 시작부터의 박자 시각(ms), 오름차순
    beats_ms: tuple[int, ...]
    duration_ms: int
    version: int = BEAT_GRID_VERSION

    def in_movie(self, movie_ms: int) -> tuple[int, ...]:
        """무비 길이만큼 — 곡이 무비보다 짧으면 곡 길이 간격으로 되풀이한다."""
        if not self.beats_ms or self.duration_ms <= 0:
            return ()
        beats: list[int] = []
        loop = 0
        while loop * self.duration_ms < movie_ms:
            beats += [b + loop * self.duration_ms for b in self.beats_ms if b + loop * self.duration_ms < movie_ms]
            loop += 1
        return tuple(beats)

    def to_json(self) -> dict:
        return {"beatGridVersion": self.version, "bpm": self.bpm, "durationMs": self.duration_ms,
                "beatsMs": list(self.beats_ms)}


def uniform(interval_ms: int, until_ms: int) -> tuple[int, ...]:
    """곡이 없거나 분석하지 못했을 때의 고정 간격 박자."""
    return tuple(range(0, max(until_ms, 0), interval_ms))


# ── 분석 ──────────────────────────────────────────────────────────────
def band_spectrum(samples: np.ndarray) -> np.ndarray:
    """프레임(HOP) x 대역(BANDS)의 로그 크기 — 대역 안의 칸은 평균한다."""
    window = np.hanning(N_FFT).astype(np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(samples, N_FFT)[::HOP]
    edges = np.unique(np.geomspace(1, N_FFT // 2 + 1, BANDS + 1).astype(int))
    blocks = []
    for start in range(0, len(frames), FFT_BLOCK):
        mag = np.abs(np.fft.rfft(frames[start:start + FFT_BLOCK] * window, axis=1))
        log_mag = np.log1p(100.0 * mag)
        blocks.append(np.stack([log_mag[:, a:b].mean(axis=1) for a, b in zip(edges[:-1], edges[1:])], axis=1))
    return np.concatenate(blocks)


def flux(bands: np.ndarray) -> np.ndarray:
    """대역마다 늘어난 양의 합에서 느린 변화(지역 평균)를 빼고 크기를 맞춘 onset 곡선."""
    rise = np.concatenate([[0.0], np.maximum(0.0, np.diff(bands, axis=0)).sum(axis=1)])
    envelope = np.maximum(0.0, rise - np.convolve(rise, np.ones(16) / 16, mode="same"))
    std = envelope.std()
    return envelope / std if std > 0 else envelope


def onset_envelope(samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(전체 onset 곡선, 저음 대역만의 onset 곡선) — 프레임마다."""
    if len(samples) < N_FFT:
        return np.zeros(0), np.zeros(0)
    bands = band_spectrum(samples)
    edges = np.unique(np.geomspace(1, N_FFT // 2 + 1, BANDS + 1).astype(int))
    low = max(1, int(np.searchsorted(edges, LOW_HZ * N_FFT / SAMPLE_RATE)))
    return flux(bands), flux(bands[:, :low])


def estimate_period(envelope: np.ndarray) -> float:
    """박자 간격(프레임). 자기상관에 120 BPM 중심의 로그 정규 가중치를 곱한 최댓값, 포물선으로 다듬는다."""
    fps = SAMPLE_RATE / HOP
    lags = np.arange(int(fps * 60 / BPM_RANGE[1]), int(fps * 60 / BPM_RANGE[0]) + 1)
    centered = envelope - envelope.mean()
    corr = np.array([np.dot(centered[:-lag], centered[lag:]) for lag in lags])
    bpm = 60.0 * fps / lags
    weighted = corr * np.exp(-0.5 * (np.log2(bpm / START_BPM) / BPM_STD_OCTAVES) ** 2)
    i = _prefer_double(weighted, lags, int(np.argmax(weighted)))
    if 0 < i < len(weighted) - 1:
        a, b, c = weighted[i - 1], weighted[i], weighted[i + 1]
        denom = a - 2 * b + c
        if denom != 0:
            return float(lags[i] + 0.5 * (a - c) / denom)
    return float(lags[i])


def _prefer_double(weighted: np.ndarray, lags: np.ndarray, i: int) -> int:
    """절반 템포로 잡히는 옥타브 오류를 줄인다 — 느리게(DOUBLE_BELOW_BPM 미만) 잡혔는데 반 간격도 충분히 세면 빠른 쪽.
    두 배로 잘못 잡아도 박자는 음악의 격자(8분음표) 위에 떨어지지만, 절반으로 잡으면 박자의 반을 놓친다."""
    fps = SAMPLE_RATE / HOP
    if 60.0 * fps / lags[i] >= DOUBLE_BELOW_BPM:
        return i
    half = int(np.argmin(np.abs(lags - lags[i] / 2)))
    if abs(lags[half] * 2 - lags[i]) <= 1 and weighted[half] >= DOUBLE_RATIO * weighted[i]:
        return half
    return i


def track_beats(envelope: np.ndarray, period: float) -> list[int]:
    """Ellis(2007) — 박자마다 onset 세기를 더하고, 간격이 period 에서 벗어난 만큼 깎아 가장 좋은 박자열을 고른다."""
    sigma = period / 8
    taps = np.arange(-int(period), int(period) + 1)
    local = np.convolve(envelope, np.exp(-0.5 * (taps / sigma) ** 2), mode="same")
    n = len(local)
    score, back = local.copy(), np.full(n, -1)
    gaps = np.arange(int(period / 2), int(period * 2) + 1)
    penalty = -TIGHTNESS * np.log(gaps / period) ** 2
    for t in range(int(period / 2), n):
        prev = t - gaps
        valid = prev >= 0
        if not valid.any():
            continue
        candidates = score[prev[valid]] + penalty[valid]
        best = int(np.argmax(candidates))
        score[t] = local[t] + candidates[best]
        back[t] = prev[valid][best]
    return _backtrack(score, back, local, period)


def _backtrack(score: np.ndarray, back: np.ndarray, local: np.ndarray, period: float) -> list[int]:
    tail = score[-int(period):] if len(score) > period else score
    t = len(score) - len(tail) + int(np.argmax(tail))
    beats = []
    while t >= 0:
        beats.append(t)
        t = int(back[t])
    beats.reverse()
    # 앞뒤의 소리 없는 구간에 찍힌 박자는 뺀다 — onset 세기가 박자 평균의 절반도 안 되는 가장자리
    strength = local[beats]
    keep = strength >= 0.5 * strength.mean()
    first, last = int(np.argmax(keep)), len(keep) - int(np.argmax(keep[::-1]))
    return beats[first:last]


def on_the_kick(frames: list[int], low: np.ndarray, period: float) -> list[int]:
    """박자열이 엇박(하이햇 · 스네어)에 붙었으면 반 박자 옮긴다 — 저음 onset 이 반 박자 옆에서 더 세면."""
    if len(frames) < 4 or not low.any():
        return frames
    half = int(round(period / 2))
    shifted = [f + half for f in frames if f + half < len(low)]
    if low[shifted].mean() > 1.2 * low[frames[:len(shifted)]].mean():
        return shifted
    return frames


def frame_ms(frame: int) -> int:
    """프레임의 시각 — 창의 가운데."""
    return int(round((frame * HOP + N_FFT / 2) * 1000 / SAMPLE_RATE))


def analyze_samples(samples: np.ndarray) -> BeatGrid:
    duration_ms = int(len(samples) * 1000 / SAMPLE_RATE)
    envelope, low = onset_envelope(samples)
    if len(envelope) < 8 or not envelope.any():
        return BeatGrid(0.0, (), duration_ms)
    period = estimate_period(envelope)
    frames = on_the_kick(track_beats(envelope, period), low, period)
    # 캐시(JSON)와 같은 자릿수로 — 처음 분석한 값과 캐시에서 읽은 값이 달라지지 않게
    return BeatGrid(round(60.0 * SAMPLE_RATE / HOP / period, 2), tuple(frame_ms(f) for f in frames), duration_ms)


def decode(path: str) -> np.ndarray:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"],
        capture_output=True,
    )
    if result.returncode != 0:
        raise BeatGridError(f"곡을 읽지 못했습니다: {result.stderr.decode('utf-8', 'replace')[-300:]}")
    return np.frombuffer(result.stdout, dtype=np.float32)


def load_or_analyze(track_path: str) -> BeatGrid:
    """곡 옆의 캐시를 읽고, 없거나 버전이 다르면 분석해 써 둔다(쓰기 실패는 무시 — 다음에 다시 분석)."""
    sidecar = Path(track_path + SIDECAR_SUFFIX)
    if sidecar.is_file():
        try:
            data = json.loads(sidecar.read_text(encoding="utf-8"))
            if data.get("beatGridVersion") == BEAT_GRID_VERSION:
                return BeatGrid(float(data["bpm"]), tuple(int(b) for b in data["beatsMs"]), int(data["durationMs"]))
        except (ValueError, KeyError, TypeError):
            pass
    grid = analyze_samples(decode(track_path))
    try:
        sidecar.write_text(json.dumps(grid.to_json()), encoding="utf-8")
    except OSError:
        pass
    return grid
