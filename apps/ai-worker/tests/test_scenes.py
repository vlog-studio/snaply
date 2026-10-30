"""장면 단위 순서 · 훅의 계약(trend-recipes §22) — 장면은 촬영 시각 간격으로 묶고, 연결 점수로 고르는 순서는 장면 안에서만, 첫 컷은 가장 강한 순간."""

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import scenes  # noqa: E402

T0 = datetime(2026, 10, 30, 10, 0)


def at(*minutes):
    return [T0 + timedelta(minutes=m) if m is not None else None for m in minutes]


class GroupTest(unittest.TestCase):
    def test_a_long_gap_starts_a_new_scene(self):
        self.assertEqual(scenes.group(at(0, 2, 5, 40, 41, 90)), [0, 0, 0, 1, 1, 2])

    def test_unknown_times_stay_with_the_previous_snap(self):
        self.assertEqual(scenes.group(at(0, None, 30, None)), [0, 0, 1, 1])
        self.assertEqual(scenes.group([None, None]), [0, 0])


class OrderTest(unittest.TestCase):
    def test_scenes_follow_capture_order_and_scores_order_only_inside(self):
        # 점수만 보면 장면을 오간다(0 → 3 → 1 → 4 …) — 장면 안에서만 고른다
        n = 5
        scores = np.full((n, n), 0.1)
        for a, b in ((0, 3), (3, 1), (1, 4), (4, 2)):
            scores[a][b] = 0.9
        scene_of = [0, 0, 0, 1, 1]
        out = scenes.ordered(scores.tolist(), scene_of, None)
        self.assertEqual(sorted(out[:3]), [0, 1, 2])
        self.assertEqual(sorted(out[3:]), [3, 4])

    def test_the_hook_comes_first_once_and_leaves_its_scene(self):
        out = scenes.ordered(np.full((4, 4), 0.5).tolist(), [0, 0, 1, 1], hook=3)
        self.assertEqual(out[0], 3)
        self.assertEqual(sorted(out), [0, 1, 2, 3])
        self.assertEqual(sorted(out[1:3]), [0, 1])

    def test_beam_moves_within_a_scene_or_to_the_next_one(self):
        ok = scenes.beam_allowed([0, 0, 1, 2], hook=None)
        self.assertTrue(ok(0, 1) and ok(1, 2) and ok(2, 3))
        self.assertFalse(ok(2, 0))  # 앞 장면으로 돌아가지 않는다
        self.assertFalse(ok(0, 3))  # 장면을 건너뛰지 않는다
        hooked = scenes.beam_allowed([0, 0, 1, 2], hook=3)
        self.assertTrue(hooked(3, 0))  # 훅 다음은 첫 장면
        self.assertFalse(hooked(1, 3))  # 훅은 다시 나오지 않는다


class HookTest(unittest.TestCase):
    def test_the_most_moving_steady_snap_is_the_hook(self):
        motion = [np.full(30, 0.01), np.r_[np.full(25, 0.01), np.full(5, 0.2)], np.full(30, 0.3)]
        shake = [0.5, 0.6, 5.0]  # 셋째는 가장 움직이지만 흔들린다
        self.assertEqual(scenes.hook(motion, shake), 1)

    def test_no_hook_when_everything_shakes(self):
        self.assertIsNone(scenes.hook([np.full(30, 0.2)] * 2, [5.0, 6.0]))


if __name__ == "__main__":
    unittest.main()
