"""BGM 비트 그리드의 계약 — 템포 · 박자 위치(정답을 아는 합성 곡으로), 엇박 하이햇에 붙지 않기, 무비 길이로 되풀이, 캐시.

numpy 만 쓴다(ffmpeg 없이). 실제 파일을 디코딩하는 것은 `test_ffmpeg_contract.py` 가 맡는다. 기준은 계획서 §11 —
사람이 어긋남을 느끼는 경계가 대략 50ms 라 박자 오차를 그 아래로 본다.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import beat_grid  # noqa: E402
from pipeline.beat_grid import BeatGrid  # noqa: E402

SR = beat_grid.SAMPLE_RATE
TOLERANCE_MS = 50


def song(bpm: float, seconds: float = 20, offset: float = 0.13, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """킥(정박) + 하이햇(엇박) + 화음 패드 + 잡음. 정답 박자 시각(ms)도 돌려준다."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    x = rng.normal(0, 0.02, n).astype(np.float32)
    t = np.arange(int(0.12 * SR)) / SR
    kick = (np.sin(2 * np.pi * (55 * t + 120 / 25 * (1 - np.exp(-25 * t)))) * np.exp(-t * 18)).astype(np.float32)
    hat = (rng.normal(0, 1, len(t)) * np.exp(-t * 90) * 0.25).astype(np.float32)
    period, truth, k = 60 / bpm, [], 0
    while offset + k * period < seconds - 0.2:
        at = int((offset + k * period) * SR)
        x[at:at + len(t)] += kick * (1.0 if k % 4 == 0 else 0.7)
        truth.append((offset + k * period) * 1000)
        off = int((offset + (k + 0.5) * period) * SR)
        if off + len(t) < n:
            x[off:off + len(t)] += hat
        k += 1
    tt = np.arange(n) / SR
    x += (0.05 * (np.sin(2 * np.pi * 220 * tt) + np.sin(2 * np.pi * 277 * tt))).astype(np.float32)
    return x, np.array(truth)


def errors_ms(grid: BeatGrid, truth: np.ndarray) -> np.ndarray:
    beats = np.array(grid.beats_ms)
    return np.array([np.min(np.abs(beats - t)) for t in truth[2:-2]])


class AnalyzeTest(unittest.TestCase):
    def test_tempo_and_beat_positions_across_common_shortform_tempos(self):
        for bpm in (90, 100, 120, 128, 140, 174):
            with self.subTest(bpm=bpm):
                samples, truth = song(bpm)
                grid = beat_grid.analyze_samples(samples)
                self.assertAlmostEqual(grid.bpm, bpm, delta=bpm * 0.02)
                self.assertLess(errors_ms(grid, truth).max(), TOLERANCE_MS)
                self.assertGreaterEqual(len(grid.beats_ms), len(truth) - 2)

    def test_offbeat_hats_do_not_capture_the_grid(self):
        # 하이햇은 넓은 주파수를 차지해 칸을 그냥 더하면 킥보다 세다 — 반 박자 밀린 격자가 되면 오차가 반 박자 근처다
        samples, truth = song(120)
        self.assertLess(np.median(errors_ms(beat_grid.analyze_samples(samples), truth)), TOLERANCE_MS)

    def test_silence_has_no_beats(self):
        grid = beat_grid.analyze_samples(np.zeros(SR * 5, dtype=np.float32))
        self.assertEqual((grid.bpm, grid.beats_ms), (0.0, ()))

    def test_same_input_same_grid(self):
        samples, _ = song(128, seconds=10)
        self.assertEqual(beat_grid.analyze_samples(samples), beat_grid.analyze_samples(samples.copy()))


class MovieTimelineTest(unittest.TestCase):
    def test_short_track_repeats_over_the_movie(self):
        grid = BeatGrid(120.0, (100, 600), duration_ms=1000)
        self.assertEqual(grid.in_movie(2500), (100, 600, 1100, 1600, 2100))

    def test_no_beats_no_grid_and_uniform_fallback(self):
        self.assertEqual(BeatGrid(0.0, (), 1000).in_movie(5000), ())
        self.assertEqual(beat_grid.uniform(500, 1600), (0, 500, 1000, 1500))


class CacheTest(unittest.TestCase):
    def test_analysis_is_written_beside_the_track_and_read_back(self):
        samples, _ = song(120, seconds=8)
        with tempfile.TemporaryDirectory() as work:
            track = str(Path(work) / "song.mp3")
            with mock.patch.object(beat_grid, "decode", return_value=samples) as decode:
                first = beat_grid.load_or_analyze(track)
                again = beat_grid.load_or_analyze(track)
            self.assertEqual(decode.call_count, 1)
            self.assertEqual(first, again)
            cached = json.loads(Path(track + beat_grid.SIDECAR_SUFFIX).read_text(encoding="utf-8"))
            self.assertEqual(cached["beatGridVersion"], beat_grid.BEAT_GRID_VERSION)

    def test_cache_from_another_version_is_recomputed(self):
        samples, _ = song(120, seconds=8)
        with tempfile.TemporaryDirectory() as work:
            track = str(Path(work) / "song.mp3")
            Path(track + beat_grid.SIDECAR_SUFFIX).write_text(
                json.dumps({"beatGridVersion": 0, "bpm": 1, "durationMs": 1, "beatsMs": [1]}), encoding="utf-8")
            with mock.patch.object(beat_grid, "decode", return_value=samples):
                self.assertAlmostEqual(beat_grid.load_or_analyze(track).bpm, 120, delta=3)


if __name__ == "__main__":
    unittest.main()
