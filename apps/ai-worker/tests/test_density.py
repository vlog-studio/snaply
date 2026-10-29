"""글 · 스티커 밀도의 계약 — 점수 문턱 · 키워드 · 상한 · 간격(gapMs) · 스티커는 글이 남은 컷에만(글자를 끄면 스스로), 무비의 꾸밈.

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


def stk(cut_id, start, reason):
    return sticker.Sticker(cut_id, "1f600", reason, "corner", (0.5, 0.5), 200, 0.0, "pop", start, start + 1000, ())


class StickerAloneTest(unittest.TestCase):
    """글자를 끄고 이모지만 켰을 때 — 글 대신 스티커 근거의 무게 · 간격으로 컷을 고른다(text-accent-stickers.md §9)."""

    STICKERS = [stk("a", 0, "moods:calm"), stk("a", 250, "objects:coffee"),  # 컷에서 가장 센 근거 3점
                stk("b", 1000, "places:sea"),                                 # 2점 — 문턱 아래
                stk("d", 6000, "actions:take_photo"), stk("e", 7000, "objects:bread")]

    def test_strong_cuts_spaced_apart_without_any_text(self):
        gate = {"minScore": 3, "gapMs": 3000}
        kept = density.limit_stickers(self.STICKERS, [], {"perCut": 1, "maxPerMovie": None}, gate)
        # a(0초) · d(6초)가 남고 e(7초)는 d 와 3초 안이라 빠진다. 컷마다 하나
        self.assertEqual([(s.cut_id, s.reason) for s in kept], [("a", "moods:calm"), ("d", "actions:take_photo")])

    def test_a_low_gate_keeps_every_cut(self):
        kept = density.limit_stickers(self.STICKERS, [], {"perCut": None, "maxPerMovie": None}, {"minScore": 1, "gapMs": None})
        self.assertEqual(kept, self.STICKERS)

    def test_no_emoji_means_none(self):
        self.assertEqual(density.limit_stickers(self.STICKERS, [], {"perCut": 0, "maxPerMovie": 0}, {"minScore": 1}), [])


class DecorationTest(unittest.TestCase):
    """무비의 꾸밈 — 붙일지는 무비 설정, 양은 레시피(text-accent-stickers.md §9)."""

    def test_defaults_come_from_the_recipe_and_the_spec_overrides_them(self):
        self.assertEqual(recipe.decorations_of(None, None), {"text": False, "emoji": False, "face": False})
        self.assertEqual(recipe.decorations_of("cinematic", None), {"text": True, "emoji": True, "face": True})
        self.assertEqual(recipe.decorations_of("cinematic", {"text": False, "face": "yes"}),
                         {"text": False, "emoji": True, "face": True})  # 불린이 아니면 기본값

    def test_without_decorations_the_recipe_is_untouched(self):
        spec = recipe.get("cinematic").spec
        self.assertIs(recipe.decorated_spec(spec, None), spec)

    def test_switching_off_zeroes_the_amount_and_hands_the_text_gate_to_the_emoji(self):
        spec = recipe.get("cinematic").spec
        out = recipe.decorated_spec(spec, {"text": False, "emoji": True, "face": False})
        self.assertEqual(out["accents"]["max"], 0)
        self.assertEqual(out["stickerGate"], spec["accents"])
        self.assertEqual(out["stickers"], spec["stickers"])
        self.assertFalse(out["faceStickers"]["enabled"])
        self.assertEqual(out["match"], spec["match"])  # 꾸밈 밖의 값은 그대로
        both = recipe.decorated_spec(spec, {"text": True, "emoji": True, "face": True})
        self.assertIsNone(both["stickerGate"])  # 둘 다 켜면 지금처럼 글이 붙은 컷에

    def test_turning_on_what_the_recipe_leaves_out_uses_the_fallback_amount(self):
        on = {"text": True, "emoji": True, "face": True}
        self.assertEqual(recipe.decorated_spec(recipe.get("asmr").spec, on)["accents"], recipe.DECORATION_FALLBACK["accents"])
        self.assertEqual(recipe.decorated_spec(recipe.get("before-after").spec, on)["stickers"],
                         recipe.DECORATION_FALLBACK["stickers"])
        self.assertEqual(recipe.decorated_spec(recipe.get("classic").spec, on)["faceStickers"],
                         recipe.DECORATION_FALLBACK["faceStickers"])
        # classic 의 글 · 이모지 양은 레시피 그대로(제한 없음)
        self.assertEqual(recipe.decorated_spec(recipe.get("classic").spec, on)["accents"], recipe.get("classic").spec["accents"])

    def test_every_recipe_names_its_defaults(self):
        for name, spec in recipe.RECIPES.items():
            self.assertEqual(set(spec["decorations"]), set(recipe.DECORATION_KEYS), name)


if __name__ == "__main__":
    unittest.main()
