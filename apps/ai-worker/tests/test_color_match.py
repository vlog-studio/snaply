import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline.color_match import ClipColor, match_filters, with_style  # noqa: E402


def gains(filter_text: str) -> tuple[float, float, float]:
    parts = dict(p.split("=") for p in filter_text.removeprefix("colorchannelmixer=").split(":"))
    return float(parts["rr"]), float(parts["gg"]), float(parts["bb"])


class MatchFiltersTest(unittest.TestCase):
    """컷 사이 색 맞춤(decisions/auto-edit-draft.md §6.3 `grade.match`)의 규칙."""

    def test_a_single_cut_is_left_alone(self) -> None:
        self.assertEqual(match_filters([ClipColor(0.5, 0.5, 0.5)]), [""])

    def test_a_dark_cut_is_lifted_halfway_toward_the_others(self) -> None:
        bright = ClipColor(0.6, 0.6, 0.6)
        filters = match_filters([bright, bright, ClipColor(0.4, 0.4, 0.4)])

        self.assertEqual(filters[:2], ["", ""])
        r, g, b = gains(filters[2])
        # 0.6 / 0.4 = 1.5 → 절반만 옮겨 1.25(상한).
        self.assertAlmostEqual(r, 1.25, places=3)
        self.assertAlmostEqual(g, b, places=3)

    def test_a_blue_cast_is_pulled_toward_the_movies_own_tone(self) -> None:
        warm = ClipColor(0.55, 0.5, 0.45)
        filters = match_filters([warm, warm, ClipColor(0.45, 0.5, 0.6)])

        r, _g, b = gains(filters[2])
        # 파란 컷의 파랑은 줄고 빨강은 는다 — 다만 상한(±8%) 안에서.
        self.assertGreater(r, 1.0)
        self.assertLess(b, 1.0)
        self.assertLessEqual(r, 1.08 * 1.25)
        self.assertGreaterEqual(b, 0.92 * 0.8)

    def test_very_dark_or_unmeasured_cuts_are_left_alone(self) -> None:
        # 밤 장면을 키우면 잡음만 커진다.
        filters = match_filters([ClipColor(0.5, 0.5, 0.5), ClipColor(0.6, 0.6, 0.6), ClipColor(0.02, 0.02, 0.02), None])
        self.assertEqual(filters[2:], ["", ""])

    def test_the_match_comes_before_the_style(self) -> None:
        # 보정 → 분위기: 분위기는 고른 바탕 위에 모든 컷에 같은 양으로 입혀진다.
        self.assertEqual(with_style("colorchannelmixer=rr=1.1", "eq=saturation=0.8"), "colorchannelmixer=rr=1.1,eq=saturation=0.8")
        self.assertEqual(with_style("", "eq=saturation=0.8"), "eq=saturation=0.8")
        self.assertEqual(with_style("", ""), "")


if __name__ == "__main__":
    unittest.main()
