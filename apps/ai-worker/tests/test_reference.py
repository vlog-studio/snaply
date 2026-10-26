"""레퍼런스 분석의 계약 — 컷 세기(휩팬은 컷이 아니다), 컷 길이 · 박자 맞춤, 가까운 레시피 제안.

프레임은 numpy 로 만든다(ffmpeg 없이).
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline import continuity as ct, reference  # noqa: E402
from test_continuity import panning, textured  # noqa: E402


def montage(lengths: list[int]) -> np.ndarray:
    """길이(프레임)마다 밝기가 다른 장면을 이어 붙인다."""
    levels = [0.25, 0.7, 0.4, 0.85, 0.3, 0.6]
    return np.concatenate([textured(n, i, levels[i % len(levels)]) for i, n in enumerate(lengths)])


class ReadTest(unittest.TestCase):
    def test_counts_scene_changes_and_shot_lengths(self):
        r = reference.read(ct.series_of(montage([8, 8, 8, 8])))
        self.assertEqual(r.cuts_ms, [800, 1600, 2400])
        self.assertEqual(r.shot_median_ms, 800)

    def test_cuts_inside_black_bars_are_found(self):
        """가로 영상을 세로 화면에 넣은 레퍼런스 — 띠가 화면의 3/4 이어도 가운데의 장면 전환을 센다."""
        inner = montage([8, 8, 8, 8])
        boxed = np.zeros_like(inner)
        rows = inner.shape[1] // 8
        boxed[:, 3 * rows:5 * rows] = inner[:, 3 * rows:5 * rows]
        self.assertEqual(reference.cuts_of(ct.series_of(boxed)), [800, 1600, 2400])

    def test_whips_next_to_a_cut_are_not_counted(self):
        s = ct.series_of(panning(20, 1, whip_at=10))
        self.assertEqual(len(reference.whip_events(s, [])), 1)
        self.assertEqual(reference.whip_events(s, [1000]), [])

    def test_a_whip_is_not_a_cut(self):
        self.assertEqual(reference.cuts_of(ct.series_of(panning(20, 1, whip_at=10))), [])

    def test_on_beat_ratio(self):
        s = ct.series_of(montage([8, 8, 8, 8]))
        self.assertEqual(reference.read(s, beats=(0, 800, 1600, 2400)).on_beat_ratio, 1.0)
        self.assertEqual(reference.read(s, beats=(0, 400, 1200, 2000, 2800)).on_beat_ratio, 0.0)


class EventsTest(unittest.TestCase):
    def test_adjacent_frames_are_one_event(self):
        self.assertEqual(reference.events([10, 11, 12, 30, 32, 50]), [10, 30, 50])
        self.assertEqual(reference.events([]), [])


class SuggestTest(unittest.TestCase):
    def test_the_nearest_format(self):
        self.assertEqual(reference.suggest(700, True), "daylog")  # 원본 음성이 남았다
        self.assertEqual(reference.suggest(900, False, letterbox=True), "cinematic")
        self.assertEqual(reference.suggest(500, False, on_beat=0.8), "beat-sync")
        self.assertEqual(reference.suggest(500, False, on_beat=0.2), "fast-cut")
        self.assertEqual(reference.suggest(1100, False), "trend-routine")
        self.assertEqual(reference.suggest(2000, False), "day-stamp")

    def test_letterbox_is_read_from_black_top_and_bottom(self):
        frames = montage([8, 8, 8, 8])
        boxed = frames.copy()
        edge = int(boxed.shape[1] * 0.25)
        boxed[:, :edge] = 0.0
        boxed[:, -edge:] = 0.0
        self.assertTrue(reference.letterbox(ct.series_of(boxed)))
        self.assertFalse(reference.letterbox(ct.series_of(frames)))


class FollowTest(unittest.TestCase):
    def test_a_reference_becomes_a_recipe_on_the_nearest_format(self):
        reading = reference.Reading(30000, list(range(500, 30000, 500)), 500, 450, 700, 0, 12, 100.0, 0.8, False, "beat-sync")
        base, spec = reference.to_recipe(reading, is_letterbox=True)
        self.assertEqual(base, "cinematic")  # 레터박스가 먼저
        self.assertEqual(spec["frame"], "letterbox")
        self.assertEqual(spec["continuity"]["shotMs"], [450, 700])
        self.assertTrue(spec["continuity"]["beatSnap"])
        self.assertEqual(spec["transitions"]["palette"], {"whip": 1})
        self.assertEqual(set(spec), set(reference.recipe.get(base).spec))  # 렌더가 받는 같은 칸


if __name__ == "__main__":
    unittest.main()
