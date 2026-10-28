"""빠른 컷의 계약 — 모션 피크, 피크가 35% 지점에 오는 0.5~1초 후보, 흔들림 · 초점 거르기, 빔 서치의 제약(같은 스냅 연달아 금지 ·
한 스냅 perSnap 개 · 겹침 금지 · 목표 길이)과 시드.

프레임은 numpy 로 만든다(ffmpeg 없이).
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, fast_cut as fc, recipe  # noqa: E402


def series_with_motion(motion: list[float]) -> ct.Series:
    n = len(motion)
    thumbs = np.zeros((n, ct.THUMB_H, ct.THUMB_W), np.float32) + 0.5
    return ct.Series(tuple([0.5] * n), tuple(motion), tuple([0.0] * n), thumbs)


def frames_of(n: int, sharp: float = 1.0) -> fc.SnapFrames:
    rng = np.random.default_rng(0)
    frames = (rng.random((n, 16, 9, 3)) * 255 * sharp).astype(np.uint8)
    return fc.SnapFrames(frames, fc.sharpness(frames))


class PeakTest(unittest.TestCase):
    def test_peaks_are_spaced_and_scaled(self):
        motion = [0.01] * 40
        motion[9:12] = [0.15, 0.2, 0.15]  # 1.0초 정점
        motion[12:15] = [0.1, 0.12, 0.1]  # 1.3초 — 1.0초와 0.4초 안이라 하나로
        motion[29:32] = [0.08, 0.1, 0.08]  # 3.0초
        found = fc.peaks(tuple(motion))
        self.assertEqual([at for at, _ in found], [1000, 3000])
        self.assertEqual(found[0][1], 1.0)

    def test_candidates_put_the_peak_at_35_percent(self):
        motion = [0.01] * 40
        motion[19:22] = [0.2, 0.3, 0.2]
        cands = fc.candidates(0, series_with_motion(motion), frames_of(20), 500, 1000)
        peak_cands = [c for c in cands if not (c.starts_out or c.ends_in)]
        self.assertEqual({c.length_ms for c in peak_cands}, {500, 700, 1000})
        for c in peak_cands:
            self.assertAlmostEqual((2000 - c.start_ms) / c.length_ms, fc.PEAK_POS, delta=0.02)

    def test_blurry_windows_are_dropped(self):
        motion = [0.01] * 40
        motion[7:10] = [0.2, 0.3, 0.2]
        motion[29:32] = [0.2, 0.3, 0.2]
        frames = frames_of(20)
        frames.sharp[12:] = frames.sharp[12:] * 0.05  # 2.4초부터 초점이 나간다
        starts = {c.start_ms for c in fc.candidates(0, series_with_motion(motion), frames, 500, 1000)}
        self.assertTrue(all(s < 2400 for s in starts), starts)

    def test_a_snap_that_shakes_all_the_way_drops_its_shakiest_windows(self):
        rng = np.random.default_rng(2)
        motion = list(0.02 + rng.random(40) * 0.01)
        motion[20:30] = [0.5] * 10  # 2~3초 내내 크게 흔들린다
        motion[5:8] = [0.08, 0.1, 0.08]
        starts = {c.start_ms for c in fc.candidates(0, series_with_motion(motion), frames_of(20), 500, 1000)}
        self.assertFalse(any(2000 <= s and s + 500 <= 3000 for s in starts), starts)

    def test_tiling_gives_a_steady_snap_several_non_overlapping_windows(self):
        series = series_with_motion([0.02] * 60)  # 6초 내내 고요
        plain = fc.candidates(0, series, frames_of(30), 1000, 2500, (1000, 1500, 2200), steady=True, zoom_pairs=False)
        tiled = fc.candidates(0, series, frames_of(30), 1000, 2500, (1000, 1500, 2200), steady=True, zoom_pairs=False, tile=True)
        disjoint = lambda cs: max(  # noqa: E731
            sum(1 for c in cs if c.start_ms >= start and (c.start_ms - start) % 1500 == 0 and c.length_ms == 1500) for start in (0,))
        self.assertLess(disjoint(plain), 2)
        self.assertGreaterEqual(disjoint(tiled), 3)  # 0 · 1.5 · 3 · 4.5초 — 점프컷으로 이어 쓸 수 있다

    def test_a_still_snap_still_gives_one_candidate(self):
        cands = fc.candidates(0, series_with_motion([0.01] * 30), frames_of(15), 500, 1000)
        self.assertEqual(len(cands), 1)


class BeamTest(unittest.TestCase):
    def cands(self):
        return [fc.Candidate(snap, start, start + 700, quality=0.5)
                for snap in range(4) for start in (0, 1000, 2000, 3000)]

    def test_constraints_hold_and_the_target_is_reached(self):
        cands = self.cands()
        seq = fc.beam(cands, lambda i, j: 0.5, 6000, per_snap=3)
        picked = [cands[k] for k in seq]
        self.assertGreaterEqual(sum(c.length_ms for c in picked), 6000)
        self.assertTrue(all(a.snap != b.snap for a, b in zip(picked, picked[1:])))  # 같은 스냅을 연달아 붙이지 않는다
        for snap in range(4):
            mine = [c for c in picked if c.snap == snap]
            self.assertLessEqual(len(mine), 3)
            self.assertFalse(any(fc._overlaps(a, b) for i, a in enumerate(mine) for b in mine[i + 1:]))

    def test_jump_cuts_let_a_chronological_path_fill_the_target_from_few_snaps(self):
        # 촬영 순서로만 잇는 포맷은 같은 스냅의 구간이 늘 붙어 있다 — 점프컷 없이는 스냅마다 하나씩(2 x 700ms)이라 목표에 못 미친다
        cands = [fc.Candidate(snap, start, start + 700, quality=0.5) for snap in range(2) for start in (0, 1000, 2000)]
        forward = lambda i, j: (cands[j].snap, cands[j].start_ms) > (cands[i].snap, cands[i].start_ms)  # noqa: E731
        plain = fc.beam(cands, lambda i, j: 0.5, 4000, per_snap=3, allowed=forward, first=[0, 1, 2])
        jumps = fc.beam(cands, lambda i, j: 0.5, 4000, per_snap=3, allowed=forward, first=[0, 1, 2], jump_cuts=True)
        self.assertLess(sum(cands[k].length_ms for k in plain), 4000)
        self.assertGreaterEqual(sum(cands[k].length_ms for k in jumps), 4000)
        picked = [cands[k] for k in jumps]
        self.assertEqual(picked, sorted(picked, key=lambda c: (c.snap, c.start_ms)))  # 그래도 촬영 순서

    def test_it_follows_the_link_scores(self):
        cands = [fc.Candidate(i, 0, 1000) for i in range(4)]
        good = {(0, 2): 1.0, (2, 1): 1.0, (1, 3): 1.0}
        seq = fc.beam(cands, lambda i, j: good.get((i, j), 0.0), 4000)
        self.assertEqual(seq, [0, 2, 1, 3])

    def test_temperature_varies_by_seed_but_a_seed_repeats(self):
        cands = self.cands()
        runs = {tuple(fc.beam(cands, lambda i, j: 0.5, 5000, temperature=0.5, seed=s)) for s in range(10)}
        self.assertGreater(len(runs), 1)
        self.assertEqual(fc.beam(cands, lambda i, j: 0.5, 5000, temperature=0.5, seed=3),
                         fc.beam(cands, lambda i, j: 0.5, 5000, temperature=0.5, seed=3))


class RecipeTest(unittest.TestCase):
    def test_fast_cut_recipe_uses_the_beam_with_short_cuts_and_ducked_sfx(self):
        spec = recipe.get("fast-cut").spec
        self.assertEqual(spec["match"]["search"], "beam")
        self.assertEqual(spec["continuity"]["shotMs"], [500, 1000])
        self.assertTrue(spec["sfx"]["duck"])
        self.assertGreater(spec["sfx"]["lowLink"], 0)


if __name__ == "__main__":
    unittest.main()
