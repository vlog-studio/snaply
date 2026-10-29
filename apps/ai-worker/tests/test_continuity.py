"""자연스러운 이음의 계약 — 가림 · 휩팬 · 구도 맞추기 찾기, 그 지점에서 자르기, 없으면 박자에 맞추기, 배속.

프레임은 numpy 로 만든다(ffmpeg 없이). 실제 영상에서 재는 것은 `test_ffmpeg_contract.py` 의 `ContinuityContract`.
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, recipe  # noqa: E402

H, W = ct.THUMB_H, ct.THUMB_W
_ROUTINE = recipe.get("trend-routine").spec
# 여러 컷 · 점프컷 계획(plan_cuts 의 기본 경로)을 본다 — 트렌드 레시피는 이제 한 스냅 한 컷(oneCutPerSnap)이라 그것만 끈다
TREND = {**_ROUTINE, "continuity": {**_ROUTINE["continuity"], "oneCutPerSnap": False, "shotMs": [500, 1800]}}
# 이음 · 박자 · 배속만 볼 때는 최소 길이(점프컷 채우기)도 끈다 — 최소 길이는 TREND 그대로로 따로 본다
ROUTINE = {**TREND, "continuity": {**TREND["continuity"], "minMovieMs": None}}


def textured(n: int, seed: int, level: float = 0.55) -> np.ndarray:
    """n 프레임의 가만히 있는 장면(무늬가 있어 구도를 잴 수 있다)."""
    base = np.random.default_rng(seed).random((H, W)).astype(np.float32) * 0.4 + level - 0.2
    return np.repeat(base[None], n, axis=0)


def panning(n: int, seed: int, step: int = 1, whip_at: int | None = None) -> np.ndarray:
    """옆으로 천천히 움직이다 whip_at 에서 휙 — 실제 장면처럼 부드러운 무늬라 이동이 클수록 프레임 차이도 크다."""
    noise = np.random.default_rng(seed).random((H, W * 6)).astype(np.float32)
    kernel = np.ones(9) / 9
    smooth = np.apply_along_axis(lambda row: np.convolve(row, kernel, mode="same"), 1, noise)
    wide = (smooth - smooth.min()) / (smooth.max() - smooth.min()) * 0.5 + 0.25
    xs, x = [], 0
    for i in range(n):
        x += 8 if i == whip_at else step
        xs.append(wide[:, x % (W * 5): x % (W * 5) + W])
    return np.stack(xs)


class DetectTest(unittest.TestCase):
    def test_cover_is_a_dark_dip_in_a_bright_snap(self):
        frames = textured(20, 1)
        frames[12:15] = 0.02
        self.assertEqual(ct.covers(ct.series_of(frames)), [12, 13, 14])

    def test_a_night_scene_is_not_a_cover(self):
        self.assertEqual(ct.covers(ct.series_of(textured(20, 2, level=0.12))), [])

    def test_whip_is_a_big_sideways_jump(self):
        s = ct.series_of(panning(20, 3, step=1, whip_at=10))
        self.assertEqual(ct.whips(s), [10])
        self.assertGreaterEqual(abs(s.shift_x[10]), ct.WHIP_SHIFT)

    def test_phase_shift_reads_the_offset(self):
        a = panning(2, 4, step=3)
        self.assertEqual(abs(ct.phase_shift(a[0], a[1])[0]), 3.0)


class PlanTest(unittest.TestCase):
    def test_cut_at_the_cover_and_start_the_next_when_it_uncovers(self):
        first = textured(30, 5)
        first[12:15] = 0.02
        second = textured(30, 6)
        second[0:3] = 0.02
        planned = ct.plan_cuts([ct.series_of(first), ct.series_of(second)], [{}, {}], (), ROUTINE)
        self.assertEqual((planned[0].end_ms, planned[0].seam), (1200, "cover"))
        self.assertEqual(planned[1].start_ms, 300)
        self.assertEqual(ct.seams(planned), [(1200, "cover")])

    def test_cut_at_the_whip(self):
        planned = ct.plan_cuts([ct.series_of(panning(30, 7, whip_at=11)), ct.series_of(textured(30, 8))], [{}, {}], (), ROUTINE)
        self.assertEqual((planned[0].end_ms, planned[0].seam), (1100, "whip"))

    def test_without_seams_the_boundary_lands_on_a_beat(self):
        beats = tuple(range(0, 20000, 470))
        planned = ct.plan_cuts([ct.series_of(textured(30, s)) for s in (9, 10, 11)], [{}, {}, {}], beats, ROUTINE)
        t = 0
        for cut in planned[:-1]:
            t += cut.out_ms
            self.assertIn(t, beats)

    def test_next_cut_starts_where_it_looks_like_the_last_frame(self):
        first, second = textured(30, 12), textured(30, 13)
        second[5:] = first[0]  # 다음 스냅의 0.5초부터 앞 컷과 같은 구도
        planned = ct.plan_cuts([ct.series_of(first), ct.series_of(second)], [{}, {}], (), ROUTINE)
        self.assertEqual((planned[1].start_ms, planned[0].seam), (500, "match"))

    def test_walking_snaps_are_sped_up_and_short_ones_are_not(self):
        walk = {"actions": ("walk",)}
        long_cut = ct.plan_cuts([ct.series_of(textured(40, 14))], [walk], (), ROUTINE)[0]
        self.assertEqual(long_cut.speed, ROUTINE["speed"]["factor"])
        self.assertEqual(long_cut.out_ms, round((long_cut.end_ms - long_cut.start_ms) / long_cut.speed))
        short = ct.plan_cuts([ct.series_of(textured(10, 15))], [walk], (), ROUTINE)[0]
        self.assertEqual(short.speed, 1.0)

    def test_a_moving_camera_without_walking_is_not_sped_up(self):
        self.assertEqual(ct.speed_for(ct.series_of(panning(40, 3, step=2)), {"actions": ("eat",)}, ROUTINE["speed"]), 1.0)

    def test_a_short_movie_uses_each_snap_once_with_longer_cuts_instead_of_jump_cuts(self):
        # 2026-10-29 사용자 '같은 부분은 반복하지 말라' — 예전엔 같은 스냅을 건너뛰어 한 컷 더(점프컷) 이어 채웠다
        snaps = [ct.series_of(textured(30, 20 + i)) for i in range(4)]  # 3초 × 4 = 12초 — 15초를 못 채운다
        planned = ct.plan_cuts(snaps, [{}] * 4, (), TREND)
        self.assertEqual([c.index for c in planned], list(range(4)))
        self.assertNotIn("jump", [c.seam for c in planned])
        self.assertGreaterEqual(sum(c.out_ms for c in planned), 11000)  # 12초 원본을 거의 다 쓴다 — 모자라면 짧은 채로

    def test_snaps_with_room_still_appear_once(self):
        snaps = [ct.series_of(textured(80, 50 + i)) for i in range(3)]  # 8초 × 3 — 15초를 채우고도 남는다
        planned = ct.plan_cuts(snaps, [{}] * 3, (), TREND)
        self.assertEqual([c.index for c in planned], [0, 1, 2])
        self.assertGreaterEqual(sum(c.out_ms for c in planned), 15000)

    def test_long_enough_snaps_reach_the_minimum(self):
        snaps = [ct.series_of(textured(60, 30 + i)) for i in range(4)]  # 6초 × 4
        self.assertGreaterEqual(sum(c.out_ms for c in ct.plan_cuts(snaps, [{}] * 4, (), TREND)), 15000)

    def test_speed_is_dropped_when_the_source_cannot_fill_the_minimum(self):
        walk = {"actions": ("walk",)}
        planned = ct.plan_cuts([ct.series_of(textured(40, 40 + i)) for i in range(3)], [walk] * 3, (), TREND)
        self.assertEqual({c.speed for c in planned}, {1.0})

    def test_budgets_are_even_and_capped(self):
        self.assertEqual(ct.budgets([3000, 3000, 1000], 6000), [2500, 2500, 1000])
        self.assertEqual(ct.budgets([1000, 1000], 6000), [1000, 1000])
        self.assertEqual(ct.budgets([1000, 1000], None), [0, 0])

    def test_one_cut_per_snap_uses_each_snap_once_and_fills_the_minimum_with_longer_cuts(self):
        cine = recipe.get("cinematic").spec
        snaps = [ct.series_of(textured(50, 60 + i)) for i in range(7)]  # 5초 × 7
        planned = ct.plan_cuts(snaps, [{}] * 7, (), cine)
        self.assertEqual([c.index for c in planned], list(range(7)))  # 같은 장면을 되풀이하지 않는다
        self.assertGreaterEqual(sum(c.out_ms for c in planned), 15000)
        self.assertTrue(all(cine["continuity"]["shotMs"][0] <= c.out_ms <= cine["continuity"]["shotMs"][1] for c in planned))

    def test_beat_snapping_does_not_eat_the_minimum(self):
        cine = recipe.get("cinematic").spec
        beats = tuple(range(0, 60000, 484))  # 124 BPM
        planned = ct.plan_cuts([ct.series_of(textured(50, 70 + i)) for i in range(7)], [{}] * 7, beats, cine)
        self.assertGreaterEqual(sum(c.out_ms for c in planned), 15000)  # 박자에 맞추며 짧아지던 것(13.8초)
        t = 0
        for c in planned[:-1]:
            t += c.out_ms
            self.assertLessEqual(min(abs(b - t) for b in beats), 1)  # 경계는 박자 위

    def test_the_steadiest_window_is_picked_away_from_the_edges(self):
        frames = panning(60, 7, step=3)  # 내내 움직이다가
        frames[30:45] = frames[30]  # 3~4.5초만 가만히
        s = ct.series_of(frames)
        self.assertEqual(ct.steady_start(s, 1200), 3100)
        still = ct.series_of(textured(60, 8))
        self.assertGreaterEqual(ct.steady_start(still, 1000), ct.EDGE_MS)

    def test_classic_recipe_never_speeds_up(self):
        self.assertEqual(ct.speed_for(ct.series_of(textured(40, 16)), {"actions": ("walk",)}, recipe.get("classic").spec["speed"]), 1.0)


if __name__ == "__main__":
    unittest.main()
