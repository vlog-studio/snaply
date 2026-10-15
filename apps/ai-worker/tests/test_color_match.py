import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.modules.setdefault("loguru", MagicMock())

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

    # 8비트에서 1.35배면 약 190 위가 잘리고, 채널마다 달리 잘려 창 · 하늘의 색이 틀어졌다(2026-10-14 리뷰, backlog E-50).
    def test_brightening_stops_where_the_highlights_would_clip(self) -> None:
        bright = ClipColor(0.6, 0.6, 0.6)
        dark_with_a_window = ClipColor(0.4, 0.4, 0.4, highlight=(0.95, 0.9, 0.85))

        r, g, b = gains(match_filters([bright, bright, dark_with_a_window])[2])

        self.assertLessEqual(max(0.95 * r, 0.9 * g, 0.85 * b), 1.0 + 1e-3)
        self.assertGreater(r, 1.0)  # 그래도 밝아진다 — 넘치기 직전까지
        self.assertAlmostEqual(r / g, 1.0, places=3)  # 같은 비율로 줄여 색은 그대로

    def test_a_clipped_sky_is_not_brightened_and_not_darkened(self) -> None:
        bright = ClipColor(0.6, 0.6, 0.6)
        clipped = ClipColor(0.4, 0.4, 0.4, highlight=(1.0, 1.0, 1.0))

        self.assertEqual(match_filters([bright, bright, clipped])[2], "")

    # 밤 컷(밝기 0.1~0.2)도 낮 컷 쪽으로 1.25배까지 밝혀져 밤이 낮이 됐다(E-50).
    def test_a_night_cut_keeps_its_darkness_and_only_its_colour_moves(self) -> None:
        day = ClipColor(0.55, 0.5, 0.45)
        night_blue = ClipColor(0.12, 0.15, 0.2)

        r, g, b = gains(match_filters([day, day, night_blue])[2])

        self.assertAlmostEqual(0.2126 * r + 0.7152 * g + 0.0722 * b, 1.0, delta=0.02)  # 밝기는 그대로
        self.assertLessEqual(max(r, g, b), 1.08 + 1e-3)  # 색만(±8%)
        self.assertGreater(r, b)  # 파란 밤이 무비의 따뜻한 톤 쪽으로

    # 건드리지 않는 아주 어두운 컷이 중간값을 끌어내려 나머지가 어두워졌다(E-50).
    def test_very_dark_cuts_do_not_pull_the_target_down(self) -> None:
        filters = match_filters([ClipColor(0.6, 0.6, 0.6), ClipColor(0.4, 0.4, 0.4), ClipColor(0.02, 0.02, 0.02)])

        # 기준은 0.6 과 0.4 의 중간(0.5) — 0.02 가 끼면 0.4 가 기준이 되어 밝은 컷만 어두워졌다.
        r, _g, _b = gains(filters[1])
        self.assertAlmostEqual(r, 1.125, places=3)
        self.assertEqual(filters[2], "")

    def test_the_match_comes_before_the_style(self) -> None:
        # 보정 → 분위기: 분위기는 고른 바탕 위에 모든 컷에 같은 양으로 입혀진다.
        self.assertEqual(with_style("colorchannelmixer=rr=1.1", "eq=saturation=0.8"), "colorchannelmixer=rr=1.1,eq=saturation=0.8")
        self.assertEqual(with_style("", "eq=saturation=0.8"), "eq=saturation=0.8")
        self.assertEqual(with_style("", ""), "")


if __name__ == "__main__":
    unittest.main()
