"""스타일 레시피의 계약 — 모든 레시피가 같은 칸을 갖고, classic 은 지금까지의 무비와 같으며, 값이 다른 사전 · 모듈과 맞는다.

ffmpeg·SDK 없이 도는 순수 검사다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import cut_fx, editor, face, look, music, recipe, title_card, vocabulary  # noqa: E402

CONTENT = vocabulary.load("content-vocabulary.json")["concepts"]
SECTIONS = {"label", "audio", "title", "accents", "stickers", "sfx", "continuity", "speed", "transitions", "split", "zoom", "look",
            "frame", "match", "faceStickers", "format"}


class RecipeTest(unittest.TestCase):
    def test_required_and_every_recipe_has_every_section(self):
        self.assertIn("recipe-vocabulary.json", vocabulary.REQUIRED)
        for name, spec in recipe.RECIPES.items():
            with self.subTest(recipe=name):
                self.assertEqual(set(spec), SECTIONS)

    def test_classic_is_the_movie_as_before(self):
        c = recipe.get("classic")
        # 2026-10-26 사용자: 모든 무비는 원본 소리를 빼고 음원만(ASMR 만 예외). 되돌리면 (1.0, music.BGM_GAIN) · music_only False
        self.assertEqual((c.spec["audio"]["sourceGain"], c.spec["audio"]["bgmGain"]), (0.0, music.MUSIC_ONLY_BGM_GAIN))
        self.assertTrue(c.music_only)
        self.assertIsNone(c.spec["title"])
        self.assertEqual(c.spec["accents"], {"max": None, "minScore": 1, "keyword": True, "gapMs": None})
        self.assertEqual(c.spec["sfx"]["max"], 0)
        self.assertFalse(c.spec["continuity"]["enabled"] or c.spec["speed"]["enabled"])

    def test_only_asmr_and_the_talk_vlog_keep_the_source_sound(self):
        # 2026-10-26 모든 무비는 음원만 — 원본 소리가 주인공인 레시피만 예외(ASMR, 2026-10-28 말소리 브이로그 — trend-recipes §15)
        keeps = {name for name, spec in recipe.RECIPES.items() if spec["audio"]["sourceGain"] > 0}
        self.assertEqual(keeps, {"asmr", "talk-vlog"})

    def test_the_reference_recipes_cover_the_axes_the_corpus_missed(self):
        # 레퍼런스 10편에서 못 맞춘 축(휩팬 · 레터박스 + 박자 안 맞춤 · 원본 말소리)을 하나씩 겨냥한다(trend-recipes §15)
        whip, wide, talk = (recipe.RECIPES[n] for n in ("whip-montage", "letterbox-montage", "talk-vlog"))
        self.assertGreaterEqual(whip["transitions"]["rate"], 0.2)  # 레퍼런스의 휩은 컷의 10~20% — 더 많으면 요란하다(§16)
        self.assertIn("whip", whip["transitions"]["palette"])
        self.assertEqual(wide["frame"], "letterbox")
        self.assertFalse(wide["continuity"]["beatSnap"])
        self.assertGreater(talk["audio"]["sourceGain"], talk["audio"]["bgmGain"])
        self.assertEqual(talk["format"]["link"], "chronological")
        # 컷 길이 · 박자 설정이 실제로 먹는 컷 고르기여야 한다 — zoom-pairs 는 shotMs · beatSnap 을 보지 않고(§14), steady 는 길이를 고정한다
        self.assertEqual((whip["format"]["cuts"], wide["format"]["cuts"]), ("continuity", "continuity"))
        lo, hi = talk["continuity"]["shotMs"]
        self.assertTrue(all(lo <= length <= hi for length in talk["format"]["lengthsMs"]))

    def test_letterbox_splits_fill_above_and_below_the_band(self):
        """레터박스 분할은 띠 · 아래 · 위 순으로 연다(cut_fx.split_graph) — 2칸이면 위가 비었다(2026-10-26)."""
        for name, spec in recipe.RECIPES.items():
            if spec["frame"] == "letterbox" and spec["split"]["sizes"]:
                self.assertEqual(spec["split"]["sizes"], [3], name)

    def test_values_agree_with_the_modules(self):
        for name, spec in recipe.RECIPES.items():
            with self.subTest(recipe=name):
                if spec["title"]:
                    self.assertIn(spec["title"]["style"], title_card.STYLES)
                lo, hi = spec["continuity"]["shotMs"]
                self.assertLess(lo, hi)
                factor = spec["speed"]["factor"]
                self.assertTrue(factor == 1.0 or editor.SPEED_RANGE[0] <= factor <= editor.SPEED_RANGE[1])
                for action in spec["speed"]["actions"]:
                    self.assertIn(action, CONTENT["actions"])
                cut_fx.validate(spec)
                self.assertTrue(spec["look"] in (None, look.AUTO) or spec["look"] in look.LOOKS)
                for kind in spec["faceStickers"]["kinds"]:
                    self.assertIn(kind, face.KINDS)

    def test_classic_has_no_editing_effects(self):
        c = recipe.get("classic").spec
        self.assertEqual(c["transitions"]["rate"], 0.0)
        self.assertIsNone(c["split"]["everyCuts"])
        self.assertEqual(c["zoom"]["rate"], 0.0)
        self.assertIsNone(c["look"])
        self.assertIsNone(c["frame"])
        self.assertFalse(c["match"]["enabled"])
        self.assertFalse(c["faceStickers"]["enabled"])
        self.assertIsNone(c["continuity"]["minMovieMs"])

    def test_trend_recipes_last_at_least_fifteen_seconds_and_have_no_sound_cap(self):
        for name in ("trend-routine", "trend-montage", "daylog", "cinematic"):
            spec = recipe.get(name).spec
            self.assertGreaterEqual(spec["continuity"]["minMovieMs"], 15000, name)
            self.assertIsNone(spec["sfx"]["max"], name)

    def test_cinematic_is_letterbox_match_cuts_with_sparing_effects(self):
        c = recipe.get("cinematic").spec
        self.assertEqual((c["frame"], c["title"]["style"], c["look"]), ("letterbox", "cinematic", "soft"))
        self.assertEqual(c["transitions"]["rate"], 0.0)  # 전환 효과 없이 — 매치컷 · 바로 넘김
        self.assertTrue(c["continuity"]["oneCutPerSnap"])
        self.assertTrue(c["match"]["enabled"] and c["match"]["order"] and c["match"]["motion"])  # 원본 줌으로 잇고 점수 위주로 순서를 섞는다
        # 효과는 몰리지 않게 — 글은 간격으로, 분할은 3칸(띠 · 아래 · 위)으로 드물게, 얼굴 스티커는 오래 보이는 얼굴의 절반만
        self.assertGreaterEqual(c["accents"]["gapMs"], 3000)
        self.assertEqual((c["split"]["sizes"], c["split"]["everyCuts"]), ([3], 6))
        self.assertTrue(c["faceStickers"]["enabled"])
        self.assertNotIn("shades", c["faceStickers"]["kinds"])

    def test_unknown_recipe_is_refused_and_none_is_classic(self):
        with self.assertRaises(recipe.RecipeError):
            recipe.get("tiktok-max")
        self.assertEqual(recipe.get(None).name, "classic")


class SpeedTest(unittest.TestCase):
    def test_atempo_is_split_into_stages_it_accepts(self):
        self.assertEqual(editor.atempo_chain(1.6), "atempo=1.6000")
        self.assertEqual(editor.atempo_chain(3.0), "atempo=2.0000,atempo=1.5000")
        self.assertEqual(editor.atempo_chain(0.25), "atempo=0.5000,atempo=0.5000")

    def test_one_times_is_untouched_and_out_of_range_is_refused(self):
        clip = editor.ClipSource("a.mp4", 0, 1000)
        self.assertIs(editor.retime_clip(clip, 1.0, "b.mp4"), clip)
        with self.assertRaises(ValueError):
            editor.retime_clip(clip, 6.0, "b.mp4")


if __name__ == "__main__":
    unittest.main()


class JoinGroupsTest(unittest.TestCase):
    """많은 컷의 결합은 바로 넘김 경계에서 나눈다(backlog E-64) — 겹침 전환 · zoompunch 경계는 나누지 않는다."""

    H = editor.tr.Transition("hardcut")
    X = editor.tr.Transition("crossfade", 300)

    def test_eight_or_fewer_is_one_join(self):
        self.assertEqual(editor.join_groups([self.H] * 7, 8), [(0, 8)])

    def test_splits_every_eight_at_hard_cuts(self):
        self.assertEqual(editor.join_groups([self.H] * 19, 20), [(0, 8), (8, 16), (16, 20)])

    def test_never_splits_inside_an_overlap(self):
        resolved = [self.H] * 10
        resolved[7] = self.X  # 7 번과 8 번 구간 사이는 겹침
        groups = editor.join_groups(resolved, 11)
        self.assertEqual(groups[0], (0, 7))
        self.assertNotIn(8, [end for _, end in groups[:-1]])

    def test_no_hard_cut_in_reach_grows_to_the_next_one(self):
        resolved = [self.X] * 9 + [self.H] + [self.X] * 2
        self.assertEqual(editor.join_groups(resolved, 13), [(0, 10), (10, 13)])
