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


class MovieTargetTest(unittest.TestCase):
    """무비 길이는 재료가 정한다(trend-recipes §23) — 진단 렌더 10편이 재료와 상관없이 모두 15.0초였다."""

    BEATS = tuple(range(0, 200000, 500))  # 120 BPM — 16박 = 8초

    def test_more_snaps_make_a_longer_movie_within_the_limits(self):
        shot, low = (700, 2500), 15000  # 보통 컷 1.6초
        ten = ct.movie_target([3000] * 10, shot, low, ())
        thirty_two = ct.movie_target([3000] * 32, shot, low, ())
        self.assertEqual(ten, 16000)
        self.assertEqual(thirty_two, 51200)
        self.assertEqual(ct.movie_target([3000] * 5, shot, low, ()), 15000)  # 하한
        self.assertEqual(ct.movie_target([3000] * 60, shot, low, ()), ct.MAX_TARGET_MS)  # 상한

    def test_short_sources_count_only_what_they_have(self):
        self.assertEqual(ct.movie_target([1000] * 20, (700, 2500), 15000, ()), 20000)

    def test_the_length_ends_on_a_phrase_of_the_song(self):
        target = ct.movie_target([3000] * 13, (700, 2500), 15000, self.BEATS)  # 재료 20.8초 → 가까운 악구 끝 24초
        self.assertEqual(target, 24000)
        self.assertGreaterEqual(ct.movie_target([3000] * 10, (700, 2500), 15000, self.BEATS), 15000)  # 16초 → 16초(하한 아래로 내리지 않는다)

    def test_a_far_phrase_does_not_stretch_the_movie(self):
        # 재료로는 하한(15초)인데 다음 악구가 20.1초라 끌어올렸더니 같은 스냅을 늘려 채워 비트싱크 컷이 2초가 됐다(2026-10-30) — 20% 안의 악구만
        beats = tuple(range(0, 200000, 419))  # 16박 = 6.7초 → 악구 13.4 · 20.1초
        self.assertEqual(ct.movie_target([3000] * 11, (300, 1200), 15000, beats), 15000)


class SnapToBeatsTest(unittest.TestCase):
    """컷을 어떻게 골랐든 경계를 박자 프레임에 둔다(MOV-28, 진단 보고서 로드맵 1) — 원본 줌 쌍 · 빔 포맷은 박자를 보지 않았다."""

    BEATS = tuple(range(230, 60000, 484))  # 124 BPM, 첫 박이 0 이 아닌 곡
    FPS = 30

    def boundaries(self, planned):
        t, out = 0, []
        for c in planned[:-1]:
            t += round(c.out_ms * self.FPS / 1000)
            out.append(t * 1000 / self.FPS)
        return out

    def test_every_boundary_lands_on_a_beat_frame_within_the_shot_range(self):
        planned = [ct.PlannedCut(i, 300, 1800, 1.0, None) for i in range(8)]  # 1.5초씩 — 박자와 무관한 길이
        snapped = ct.snap_to_beats(planned, [3000] * 8, self.BEATS, (700, 2500), self.FPS)
        for at in self.boundaries(snapped):
            self.assertLessEqual(min(abs(b - at) for b in self.BEATS), 1000 / self.FPS / 2 + 1)
        self.assertTrue(all(700 <= c.out_ms <= 2500 for c in snapped))
        self.assertEqual([c.index for c in snapped], list(range(8)))

    def test_cut_lengths_are_whole_frames(self):
        snapped = ct.snap_to_beats([ct.PlannedCut(i, 0, 1467, 1.0, None) for i in range(5)], [3000] * 5, self.BEATS, (500, 2500), self.FPS)
        for c in snapped:
            frames = c.out_ms * self.FPS / 1000
            self.assertAlmostEqual(frames, round(frames), delta=0.05)

    def test_a_cut_that_must_keep_its_end_moves_its_start(self):
        # 원본 줌 인이 끝나는 순간으로 다음 컷과 이어지는 컷 — 끝은 그대로 두고 시작을 옮긴다
        planned = [ct.PlannedCut(0, 1000, 2500, 1.0, None), ct.PlannedCut(1, 0, 1500, 1.0, None)]
        snapped = ct.snap_to_beats(planned, [3000, 3000], self.BEATS, (700, 2500), self.FPS, keep_end=[True, False])
        self.assertEqual(snapped[0].end_ms, 2500)
        self.assertNotEqual(snapped[0].start_ms, 1000)

    def test_speed_curves_freezes_and_short_sources_are_left_alone(self):
        ramp = ct.PlannedCut(0, 0, 2000, 1.0, None, ramp=2.5)
        hold = ct.PlannedCut(1, 0, 1000, 1.0, None, hold_ms=500, hold_at_ms=300)
        tight = ct.PlannedCut(2, 0, 1000, 1.0, None)  # 원본이 딱 1초 — 늘릴 수도, 박자까지 줄이면 범위 밖
        snapped = ct.snap_to_beats([ramp, hold, tight], [2000, 1000, 1000], self.BEATS, (950, 2500), self.FPS)
        self.assertEqual(snapped[:2], [ramp, hold])
        self.assertEqual((snapped[2].start_ms, snapped[2].end_ms), (0, 1000))

    def test_speed_is_kept_while_the_source_window_follows_the_beat(self):
        planned = [ct.PlannedCut(0, 0, 3000, 2.0, None), ct.PlannedCut(1, 0, 1500, 1.0, None)]  # 3초 원본을 2배 → 1.5초
        snapped = ct.snap_to_beats(planned, [6000, 3000], self.BEATS, (700, 2500), self.FPS)
        self.assertEqual(snapped[0].speed, 2.0)
        at = self.boundaries(snapped)[0]
        self.assertLessEqual(min(abs(b - at) for b in self.BEATS), 1000 / self.FPS / 2 + 1)

    def test_a_cut_is_not_cut_by_more_than_half_a_beat_and_the_movie_end_stays(self):
        # 원본을 다 쓴 2.5초 컷 — 다음 박자는 원본 밖이고 앞 박자는 반 박자보다 멀다 → 장면을 깎지 않는다(박자 맞춤이 원본을 먹지 않게)
        beats = (975, 1811, 2670, 3553, 4412, 5248, 6107, 6943)  # 70 BPM 남짓
        planned = [ct.PlannedCut(i, 0, 2500, 1.0, None) for i in range(3)]
        snapped = ct.snap_to_beats(planned, [2500] * 3, beats, (700, 2500), self.FPS)
        self.assertEqual(snapped[0], planned[0])
        self.assertEqual(snapped[-1], planned[-1])  # 마지막 컷의 끝은 무비의 끝 — 박자로 옮기지 않는다
        self.assertGreater(sum(c.out_ms for c in snapped), 7000)

    def test_a_cut_stretched_past_the_shot_range_still_lands_on_a_beat(self):
        # 최소 15초를 채우느라 컷이 레시피 범위(0.3~1.2초)보다 길어지면 범위 안 박자가 없어 건너뛰었다 — 수영장 묶음 비트싱크 0.3(2026-10-30)
        beats = tuple(range(0, 60000, 418))  # 138 BPM
        planned = [ct.PlannedCut(i, 300, 2000, 1.0, None) for i in range(6)]  # 1.7초 — 범위 밖
        snapped = ct.snap_to_beats(planned, [3000] * 6, beats, (300, 1200), self.FPS)
        for at in self.boundaries(snapped):
            self.assertLessEqual(min(abs(b - at) for b in beats), 1000 / self.FPS / 2 + 1)
        self.assertTrue(all(c.out_ms <= 1700 + 418 // 2 for c in snapped))  # 더 늘려도 반 박자까지

    def test_without_beats_nothing_moves(self):
        planned = [ct.PlannedCut(i, 0, 1500, 1.0, None) for i in range(3)]
        self.assertEqual(ct.snap_to_beats(planned, [3000] * 3, (), (700, 2500), self.FPS), planned)


if __name__ == "__main__":
    unittest.main()
