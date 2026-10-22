"""색 필터의 계약 — 이름은 닫힌 목록, auto 는 장면이 무비의 1/3 이상일 때만 그 색, 아니면 vivid.

ffmpeg 없이 도는 순수 검사다. 필터가 실제로 도는지는 `test_ffmpeg_contract.py` 의 `CutFxContract`.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import look  # noqa: E402


class ChooseTest(unittest.TestCase):
    def test_named_none_and_unknown(self):
        self.assertEqual(look.choose("film", []), "film")
        self.assertIsNone(look.choose(None, [{"places": ["수영장"]}]))
        with self.assertRaises(look.LookError):
            look.choose("sepia-x", [])

    def test_auto_follows_the_scene_that_fills_the_movie(self):
        pool = [{"places": ["수영장"]}, {"summary": "아이가 물놀이를 한다"}, {"places": ["거리"]}]
        self.assertEqual(look.choose("auto", pool), "cool")
        self.assertEqual(look.choose("auto", [{"summary": "카페에서 커피"}, {}]), "warm")

    def test_auto_ignores_one_odd_cut(self):
        self.assertEqual(look.choose("auto", [{"places": ["수영장"]}] + [{"places": ["공원"]}] * 5), look.DEFAULT_AUTO)
        self.assertEqual(look.choose("auto", []), look.DEFAULT_AUTO)

    def test_filter_of(self):
        self.assertIsNone(look.filter_of(None))
        self.assertIn("hue=s=0", look.filter_of("mono"))


if __name__ == "__main__":
    unittest.main()
