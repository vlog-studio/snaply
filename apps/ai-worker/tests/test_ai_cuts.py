"""컷을 사용자가 정한 무비(기본 무비 · 손본 레시피 무비)의 편집 개선 계약(MOV-29, trend-recipes §25) — AI 가 자른 컷만 흔들림 · 박자에 맞춰 옮기고,
장면 순서를 켜면 가장 강한 컷을 맨 앞으로, 새로 이웃이 된 경계는 바로 넘김."""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import ai_cuts, steadiness  # noqa: E402
from pipeline.editor import ClipSource  # noqa: E402
from pipeline.transition import Transition  # noqa: E402


def calm(n: int = 50) -> steadiness.Steadiness:
    return steadiness.Steadiness(np.full(n, 0.3), np.ones(n))


def shaky_tail(n: int = 50) -> steadiness.Steadiness:
    return steadiness.Steadiness(np.r_[np.full(n // 2, 0.3), np.full(n - n // 2, 6.0)], np.ones(n))


class RefineTest(unittest.TestCase):
    BEATS = tuple(range(230, 60000, 484))

    def test_only_ai_cuts_move(self):
        clips = [ClipSource("a.mp4", 2500, 4500), ClipSource("b.mp4", 2500, 4500)]
        out = ai_cuts.refine(clips, [True, False], [5000, 5000], [shaky_tail(), shaky_tail()], self.BEATS, 30)
        self.assertLess(out[0].end_ms, 2600)  # 흔들리는 뒤쪽에서 안정된 앞쪽으로
        self.assertEqual((out[1].start_ms, out[1].end_ms), (2500, 4500))  # 사용자 구간은 그대로

    def test_ai_cut_boundaries_land_on_beats(self):
        clips = [ClipSource("a.mp4", 0, 1500), ClipSource("b.mp4", 0, 1500), ClipSource("c.mp4", 0, 1500)]
        out = ai_cuts.refine(clips, [True, True, True], [3000] * 3, [calm()] * 3, self.BEATS, 30)
        t = 0
        for c in out[:-1]:
            t += round((c.end_ms - c.start_ms) * 30 / 1000) * 1000 / 30
            self.assertLessEqual(min(abs(b - t) for b in self.BEATS), 17)

    def test_without_ai_cuts_nothing_changes(self):
        clips = [ClipSource("a.mp4", 0, 1500), ClipSource("b.mp4", 100, 1600)]
        self.assertEqual(ai_cuts.refine(clips, [False, False], [3000] * 2, [shaky_tail()] * 2, self.BEATS, 30), clips)


class HookFirstTest(unittest.TestCase):
    def test_the_strongest_cut_moves_first_and_new_neighbours_hard_cut(self):
        transitions = [Transition("crossfade", 400), Transition("dip", 300), Transition("crossfade", 400)]
        motion = [np.full(10, 0.01), np.full(10, 0.02), np.full(10, 0.3), np.full(10, 0.01)]
        order, moved = ai_cuts.hook_first(transitions, motion, [0.5, 0.5, 0.5, 0.5])
        self.assertEqual(order, [2, 0, 1, 3])
        # 2→0 새 경계 · 0→1 원래 경계(crossfade) · 1→3 새 경계
        self.assertEqual(moved, [Transition("hardcut"), Transition("crossfade", 400), Transition("hardcut")])

    def test_no_move_when_the_first_cut_is_already_strongest_or_all_shake(self):
        transitions = [Transition("dip", 300)]
        self.assertEqual(ai_cuts.hook_first(transitions, [np.full(10, 0.3), np.full(10, 0.1)], [0.5, 0.5]), ([0, 1], transitions))
        self.assertEqual(ai_cuts.hook_first(transitions, [np.full(10, 0.1), np.full(10, 0.3)], [5.0, 5.0]), ([0, 1], transitions))


class SpeechTest(unittest.TestCase):
    def test_speech_inside_clips_moves_to_movie_time(self):
        clips = [ClipSource("a.mp4", 1000, 3000), ClipSource("b.mp4", 0, 1500)]
        self.assertEqual(ai_cuts.speech_windows(clips, [((500, 1800),), ((200, 900),)], [3000, 3000]), [(0, 800), (2200, 2900)])


if __name__ == "__main__":
    unittest.main()
