"""텍스트 액센트 엔진과 ASS 렌더의 계약 — 고르기(a·b·c 층) · 색 · 자리 · 박자 · 결정론 · 문서.

ffmpeg·SDK 없이 도는 순수 검사다. libass 가 실제로 그리는지는 `test_ffmpeg_contract.py` 가 맡는다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import accent_render, layout, text_accent  # noqa: E402
from pipeline.accent_fit import timing  # noqa: E402
from pipeline.text_accent import AccentError, CutContext, Override, choose, place, plan  # noqa: E402

SEED = 1837462
BEAT = 500
CENTER = (0.30, 0.40, 0.70, 0.70)


def cut(cut_id="t1", start=0, end=1000, subject=CENTER, **concepts) -> CutContext:
    return CutContext(cut_id, start, end, {k: tuple(v) for k, v in concepts.items()}, subject)


class ChooseTest(unittest.TestCase):
    def test_child_concept_inherits_the_parent_accent(self):
        # coffee 는 drink 의 하위 개념 — 꿀꺽(evokedBy objects:drink)을 물려받는다
        choice = choose(cut(objects=["coffee"]), SEED, [])
        self.assertEqual((choice.accent_id, choice.source), ("gulp", "dictionary"))
        self.assertIn("objects:coffee", choice.reason)

    def test_more_matching_fields_win(self):
        # 바다(places 2)보다 마시기(actions 3)가 무겁다
        self.assertEqual(choose(cut(places=["sea"], actions=["drink"]), SEED, []).accent_id, "gulp")

    def test_ties_are_broken_by_the_seed_alone(self):
        # 바다(places 2) 와 청량함(moods 2) 은 동점 — 시드마다 갈리되 같은 시드는 같은 답
        sea = cut(places=["sea"], moods=["refreshing"])
        picks = {choose(sea, seed, []).accent_id for seed in range(12)}
        self.assertEqual(picks, {"splash", "fresh"})
        self.assertEqual(choose(sea, SEED, []), choose(sea, SEED, []))

    def test_recently_used_accents_rest(self):
        recent = ["gulp"]
        self.assertEqual(choose(cut(objects=["coffee"], places=["cafe"]), SEED, recent).text, "#카페")
        recent = ["gulp", "a", "b", "c"]
        self.assertEqual(choose(cut(objects=["coffee"]), SEED, recent).accent_id, "gulp")

    def test_no_match_falls_back_to_a_place_keyword(self):
        choice = choose(cut(places=["office"]), SEED, [])
        self.assertEqual((choice.text, choice.category, choice.source), ("#사무실", "keyword", "keyword"))
        self.assertIsNone(choose(cut(objects=["wall"]), SEED, []))

    def test_agent_override_picks_from_the_dictionary_only(self):
        choice = choose(cut(objects=["coffee"]), SEED, [], Override(accent_id="hype"))
        self.assertEqual((choice.accent_id, choice.source), ("hype", "agent"))
        with self.assertRaises(AccentError):
            choose(cut(), SEED, [], Override(accent_id="not-in-dictionary"))

    def test_generated_text_must_pass_the_threshold_or_falls_back(self):
        ok = choose(cut(objects=["coffee"]), SEED, [], Override(text="  라떼  천국 ", category="feeling"))
        self.assertEqual((ok.text, ok.category, ok.source), ("라떼 천국", "feeling", "generated"))
        for bad in ("너무너무너무맛있다", "latte!", "😍좋아", "존나 맛있어"):
            with self.subTest(text=bad):
                fallback = choose(cut(objects=["coffee"]), SEED, [], Override(text=bad))
                self.assertEqual(fallback.source, "dictionary")

    def test_generated_text_cannot_claim_the_keyword_category(self):
        with self.assertRaises(AccentError):
            choose(cut(), SEED, [], Override(text="좋아", category="keyword"))


class PaletteTest(unittest.TestCase):
    def test_first_mood_then_food_then_default(self):
        self.assertEqual(text_accent.palette_for(cut(moods=["lively", "calm"], objects=["cake"])), "lively")
        self.assertEqual(text_accent.palette_for(cut(objects=["cake"])), "food")
        self.assertEqual(text_accent.palette_for(cut(places=["street"])), "default")


class PlaceTest(unittest.TestCase):
    def setUp(self):
        self.sound = choose(cut(objects=["coffee"]), SEED, [])

    def test_sound_sits_above_the_subject_without_touching_it(self):
        name, xy, scale = place(self.sound, CENTER, [], SEED, "t1")
        self.assertEqual((name, scale), ("object.above", 1.0))
        bw, bh = text_accent.text_box(self.sound.text, self.sound.category)
        self.assertLessEqual(xy[1] + bh / 2, CENTER[1])

    def test_without_a_subject_only_free_areas_are_used(self):
        name, _, _ = place(self.sound, None, [], SEED, "t1")
        self.assertTrue(name.startswith("freezone."), name)

    def test_taken_areas_are_avoided_and_nothing_left_means_drop(self):
        everything = (0.0, 0.0, 1.0, 1.0)
        self.assertIsNone(place(self.sound, CENTER, [everything], SEED, "t1"))

    def test_exclaim_prefers_corners(self):
        exclaim = choose(cut(moods=["lively"]), SEED, [])
        self.assertEqual(exclaim.category, "exclaim")
        self.assertTrue(place(exclaim, CENTER, [], SEED, "t1")[0].startswith("freezone."))


class TimingTest(unittest.TestCase):
    def test_enters_on_the_first_beat_inside_the_cut_and_holds(self):
        self.assertEqual(timing(1200, 3000, 2, BEAT), (1500, 2500, (0, 500)))

    def test_hold_never_outlives_the_cut_by_more_than_half_a_beat(self):
        self.assertEqual(timing(1000, 1500, 4, BEAT), (1000, 1750, (0, 500)))

    def test_cut_without_a_beat_starts_at_the_cut(self):
        self.assertEqual(timing(1100, 1400, 2, BEAT)[0], 1100)


class PlanTest(unittest.TestCase):
    CUTS = [
        cut("t1", 0, 1000, objects=["coffee"], actions=["drink"], moods=["calm"]),
        cut("t2", 1000, 2000, places=["sea"], moods=["refreshing"]),
        cut("t3", 2000, 2500, topics=["pet"]),
        cut("t4", 3000, 4000, places=["office"]),
        cut("t5", 4000, 4500, objects=["wall"]),
    ]

    def test_same_seed_same_plan_and_reasons_for_every_skip(self):
        first, again = plan(self.CUTS, BEAT, SEED), plan(self.CUTS, BEAT, SEED)
        self.assertEqual(first, again)
        self.assertEqual([a.choice.text for a in first.accents][::2], ["꿀꺽", "귀여워!!"])
        self.assertIn(first.accents[1].choice.text, ("철썩~", "시원~"))
        self.assertEqual(first.accents[3].choice.text, "#사무실")
        self.assertEqual(first.skipped, [("t5", "맞는 개념 · 장소 없음")])

    def test_another_attempt_moves_things_around(self):
        layouts = {tuple((a.anchor, a.rotation) for a in plan(self.CUTS, BEAT, seed).accents) for seed in range(6)}
        self.assertGreater(len(layouts), 1)

    def test_overrides_apply_per_cut(self):
        result = plan(self.CUTS, BEAT, SEED, {"t2": Override(accent_id="legend")})
        self.assertEqual(result.accents[1].choice.source, "agent")
        self.assertEqual(result.accents[1].choice.text, "레전드")


class RenderTest(unittest.TestCase):
    def setUp(self):
        self.result = plan(PlanTest.CUTS, BEAT, SEED)
        self.document = accent_render.build_document(self.result.accents)

    def test_one_style_per_category_and_one_event_per_accent(self):
        styles = [line for line in self.document.splitlines() if line.startswith("Style: ")]
        self.assertEqual([s.split(",")[0].removeprefix("Style: ") for s in styles], list(text_accent.CATEGORIES))
        events = [line for line in self.document.splitlines() if line.startswith("Dialogue:")]
        self.assertEqual(len(events), len(self.result.accents))

    def test_box_categories_swap_fill_and_line(self):
        keyword = next(a for a in self.result.accents if a.choice.category == "keyword")
        event = accent_render.event(keyword)
        self.assertIn(f"\\1c&H{keyword.line[4:6]}{keyword.line[2:4]}{keyword.line[0:2]}&", event)
        self.assertIn("\\move(", event)

    def test_every_motion_has_a_builder_and_ends_by_fading_out(self):
        self.assertEqual(set(accent_render.MOTION_BUILDERS), set(text_accent.MOTIONS))
        for accent in self.result.accents:
            duration = accent.end_ms - accent.start_ms
            self.assertIn(f"\\t({duration - accent_render.OUT_MS},{duration},\\alpha&HFF&", accent_render.event(accent))


class SafeAreaTest(unittest.TestCase):
    def test_a_narrow_safe_area_keeps_anchor_points_inside_and_is_restored(self):
        before = layout.SAFE
        with layout.safe_area((0.05, 0.36, 0.95, 0.64)):
            points = [p for ref in ("topLeft", "bottomRight", "upper")
                      for p in text_accent.anchor_points(f"screen.{ref}", None, 0.2, 0.05)]
            self.assertEqual(len(points), 3)
            self.assertTrue(all(0.36 <= y <= 0.64 for _, y in points), points)  # 레터박스 띠 안
        self.assertEqual(layout.SAFE, before)


if __name__ == "__main__":
    unittest.main()


class OnScreenOverlapTest(unittest.TestCase):
    def test_an_accent_still_on_screen_is_avoided(self):
        # 귀여워!!(2박) 가 아직 떠 있는 동안 들어오는 키워드는 그 자리를 피한다
        cuts = [cut("a", 0, 500, topics=["pet"]), cut("b", 500, 1500, places=["office"])]
        result = plan(cuts, BEAT, SEED)
        first, second = result.accents
        self.assertGreater(first.end_ms, second.start_ms)
        self.assertFalse(layout.overlaps(first.rect, second.rect))


class ShrinkTest(unittest.TestCase):
    def test_long_generated_text_shrinks_to_fit_instead_of_dropping(self):
        long = choose(cut(), SEED, [], Override(text="라떼아트 미쳤다", category="exclaim"))
        name, _, scale = place(long, CENTER, [], SEED, "t1")
        self.assertLess(scale, 1.0)
        accent = plan([cut(objects=["coffee"])], BEAT, SEED, {"t1": Override(text="라떼아트 미쳤다", category="exclaim")}).accents[0]
        self.assertIn(f"\\fs{round(text_accent.CATEGORIES['exclaim']['size'] * accent.scale)}", accent_render.event(accent))
        self.assertTrue(layout.inside_safe(accent.rect))
