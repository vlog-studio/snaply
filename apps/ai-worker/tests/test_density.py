"""글 · 스티커 밀도의 계약 — 점수 문턱 · 키워드 · 상한 · 간격(gapMs) · 스티커는 글이 남은 컷에만.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import density, recipe, sticker, text_accent as ta  # noqa: E402

BEAT = 500
SEED = 1837462
CENTER = (0.30, 0.40, 0.70, 0.70)


def cut(cut_id, start, end, **concepts):
    return ta.CutContext(cut_id, start, end, {k: tuple(v) for k, v in concepts.items()}, CENTER)


CUTS = [
    cut("a", 0, 1000, objects=["coffee"], actions=["drink"]),   # 꿀꺽 6점
    cut("b", 1000, 2000, places=["sea"]),                        # 철썩~ 2점
    cut("c", 2000, 3000, places=["office"]),                     # 키워드
    cut("d", 6000, 7000, actions=["take_photo"]),                # 찰칵! 3점
    cut("e", 7000, 8000, objects=["bread"], places=["bakery"]),  # 바삭! 5점
]


class AccentLimitTest(unittest.TestCase):
    def setUp(self):
        self.accents = ta.plan(CUTS, BEAT, SEED).accents

    def test_classic_keeps_everything(self):
        kept = density.limit_accents(self.accents, CUTS, recipe.get("classic").section("accents"))
        self.assertEqual(kept, self.accents)

    def test_routine_keeps_two_strong_moments_apart_and_no_keywords(self):
        kept = density.limit_accents(self.accents, CUTS, recipe.get("trend-routine").section("accents"))
        self.assertEqual([a.choice.text for a in kept], ["꿀꺽", "바삭!"])

    def test_montage_keeps_strong_moments_spaced_without_a_cap(self):
        kept = density.limit_accents(self.accents, CUTS, recipe.get("trend-montage").section("accents"))
        self.assertEqual([a.choice.text for a in kept], ["꿀꺽", "바삭!"])  # 찰칵!(3점)은 바삭!(5점)과 2.5초 안

    def test_gap_alone_spaces_them(self):
        kept = density.limit_accents(self.accents, CUTS, {"max": None, "minScore": 3, "keyword": False, "gapMs": 500})
        self.assertEqual([a.choice.text for a in kept], ["꿀꺽", "찰칵!", "바삭!"])

    def test_generated_text_passes_the_threshold_but_counts(self):
        plan = ta.plan(CUTS, BEAT, SEED, {"b": ta.Override(text="파도 소리", category="feeling")}).accents
        kept = density.limit_accents(plan, CUTS, {"max": 5, "minScore": 3, "keyword": False})
        self.assertIn("파도 소리", [a.choice.text for a in kept])


class StickerLimitTest(unittest.TestCase):
    def test_only_on_kept_accent_cuts_one_each_and_capped(self):
        accents = ta.plan(CUTS, BEAT, SEED).accents
        stickers = sticker.plan(CUTS, accents, BEAT, SEED)
        kept_accents = density.limit_accents(accents, CUTS, recipe.get("trend-routine").section("accents"))
        kept = density.limit_stickers(stickers, kept_accents, recipe.get("trend-routine").section("stickers"))
        self.assertTrue(set(s.cut_id for s in kept) <= {a.cut_id for a in kept_accents})
        self.assertLessEqual(len(kept), 2)
        self.assertEqual(len({s.cut_id for s in kept}), len(kept))

    def test_no_limits_means_unchanged(self):
        stickers = sticker.plan(CUTS, [], BEAT, SEED)
        self.assertEqual(density.limit_stickers(stickers, [], {"perCut": None, "maxPerMovie": None}), stickers)


if __name__ == "__main__":
    unittest.main()
