"""말하는 컷의 말소리 살리기 계약(trend-recipes §24) — 컷의 발화를 결과물 시간으로 옮기고, 그 구간만 원본을 올리고 음원을 낮춘다."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, speech  # noqa: E402


class WindowsTest(unittest.TestCase):
    def test_speech_inside_each_cut_moves_to_movie_time(self):
        planned = [ct.PlannedCut(0, 1000, 3000, 1.0, None), ct.PlannedCut(1, 0, 1500, 1.0, None)]
        spans = [((500, 1800),), ((200, 900), (1400, 2500))]  # 원본 시각
        # 첫 컷: 원본 1000~1800 → 결과물 0~800 / 둘째(2000 부터): 200~900 → 2200~2900, 1400~1500 → 3400~3500(너무 짧아 뺀다)
        self.assertEqual(speech.windows(planned, spans), [(0, 800), (2200, 2900)])

    def test_sped_up_and_frozen_cuts_are_left_out(self):
        planned = [ct.PlannedCut(0, 0, 2000, 2.0, None), ct.PlannedCut(1, 0, 1000, 1.0, None, hold_ms=500, hold_at_ms=300),
                   ct.PlannedCut(2, 0, 1000, 1.0, None)]
        spans = [((0, 2000),), ((0, 1000),), ((0, 1000),)]
        self.assertEqual(speech.windows(planned, spans), [(2500, 3500)])

    def test_touching_windows_merge(self):
        planned = [ct.PlannedCut(0, 0, 1000, 1.0, None), ct.PlannedCut(1, 0, 1000, 1.0, None)]
        self.assertEqual(speech.windows(planned, [((0, 1000),), ((0, 1000),)]), [(0, 2000)])


class GainTest(unittest.TestCase):
    def test_the_gain_ramps_between_outside_and_inside(self):
        expr = speech.gain_expr([(1.0, 2.0)], inside=1.0, outside=0.0)
        self.assertIn("clip((t-1.000)/0.150,0,1)", expr)
        self.assertIn("clip((2.000-t)/0.150,0,1)", expr)
        self.assertEqual(speech.gain_expr([], inside=1.0, outside=0.3), "0.3")


if __name__ == "__main__":
    unittest.main()
