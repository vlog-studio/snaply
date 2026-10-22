"""텍스트 액센트 · 이모지 스티커 사전의 정합성.

원본은 `packages/shared-types/src/accent-vocabulary.json` 하나다. 이 사전은 다른 사전 셋과 파일 둘에 기대므로
어긋나면 조용히 빈 결과가 된다 — 개념 id 가 content-vocabulary 에 없으면 그 액센트는 영영 안 고른다, 자리 이름이
anchor-vocabulary 에 없으면 그 무리는 영영 비어 있다, 글꼴이 번들에 없으면 한글이 빈 네모로 구워진다, 이모지 파일이
없으면 렌더가 터진다. 그래서 그 묶음을 전부 여기서 막는다. ffmpeg·SDK 없이 도는 순수 검사다.
"""

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline import text_accent, vocabulary  # noqa: E402
from test_ass import bundled_families  # noqa: E402

VOCAB = text_accent.VOCABULARY
CONTENT = text_accent.CONTENT["concepts"]
ANCHOR = vocabulary.load("anchor-vocabulary.json")["kinds"]
EMOJI_DIR = Path(__file__).resolve().parents[1] / "assets" / "stickers" / "emoji"
HEX = re.compile(r"^[0-9A-F]{6}$")


def concept_refs():
    """(어디서, 필드, 개념) — 사전이 가리키는 모든 내용 개념."""
    for accent_id, entry in VOCAB["accents"].items():
        for fld, concepts in entry["evokedBy"].items():
            for concept in concepts:
                yield f"accents.{accent_id}", fld, concept
    for fld, table in VOCAB["stickers"]["byConcept"].items():
        for concept in table:
            yield "stickers.byConcept", fld, concept
    for fld, concepts in VOCAB["foodConcepts"].items():
        for concept in concepts:
            yield "foodConcepts", fld, concept


class AccentVocabularyTest(unittest.TestCase):
    def test_worker_requires_the_file(self):
        self.assertIn("accent-vocabulary.json", vocabulary.REQUIRED)
        self.assertIsInstance(VOCAB["accentVocabularyVersion"], int)

    def test_every_concept_is_in_the_content_vocabulary(self):
        for where, fld, concept in concept_refs():
            with self.subTest(where=where, concept=f"{fld}:{concept}"):
                self.assertIn(fld, VOCAB["fieldWeights"])
                self.assertIn(concept, CONTENT[fld])

    def test_every_placement_is_an_anchor_kind_and_ref(self):
        for name, spec in VOCAB["categories"].items():
            for group in spec["placement"]:
                for place in group:
                    kind, ref = place.split(".")
                    with self.subTest(category=name, place=place):
                        self.assertIn(ref, ANCHOR[kind]["refs"])

    def test_every_category_font_is_bundled(self):
        families = bundled_families()
        for name, spec in VOCAB["categories"].items():
            with self.subTest(category=name):
                self.assertIn(spec["font"], families)

    def test_accents_use_known_categories_and_motions(self):
        for accent_id, entry in VOCAB["accents"].items():
            with self.subTest(accent=accent_id):
                self.assertIn(entry["category"], VOCAB["categories"])
                self.assertNotEqual(entry["category"], "keyword")
                self.assertIn(entry["motion"], VOCAB["motions"])
                self.assertTrue(entry["evokedBy"])

    def test_dictionary_texts_pass_the_generated_threshold(self):
        # 사전의 글도 생성 글과 같은 문턱을 지난다 — 글꼴에 없는 기호가 끼면 빈 네모가 된다
        for accent_id, entry in VOCAB["accents"].items():
            with self.subTest(accent=accent_id):
                self.assertEqual(text_accent.validate_generated(entry["text"]), entry["text"])

    def test_palettes_cover_every_mood_and_are_rgb(self):
        palettes = VOCAB["palettes"]
        self.assertTrue(set(CONTENT["moods"]) | {"food", "default"} <= set(palettes))
        for key, colours in palettes.items():
            with self.subTest(palette=key):
                self.assertRegex(colours["fill"], HEX)
                self.assertRegex(colours["line"], HEX)

    def test_every_sticker_has_its_image(self):
        stickers = VOCAB["stickers"]
        codepoints = set(stickers["sparkle"]) | set(stickers["generatedPool"])
        for table in stickers["byConcept"].values():
            for listed in table.values():
                codepoints |= set(listed)
        for cp in sorted(codepoints):
            with self.subTest(emoji=cp):
                self.assertTrue((EMOJI_DIR / f"{cp}.png").exists())
        self.assertTrue(set(stickers["sparkleMoods"]) <= set(CONTENT["moods"]))
        self.assertEqual(len(stickers["generatedPool"]), len(set(stickers["generatedPool"])))

    def test_energy_motions_are_known_motions(self):
        energy = VOCAB["energy"]
        self.assertEqual(set(energy["impact"]) | set(energy["gentle"]), set(VOCAB["motions"]))
        for level, table in energy["energyMotions"].items():
            with self.subTest(level=level):
                self.assertEqual(set(table), set(VOCAB["categories"]))
                self.assertTrue(set(table.values()) <= set(VOCAB["motions"]))
        for pool in VOCAB["stickers"]["energyMotions"].values():
            self.assertTrue(set(pool) <= set(VOCAB["stickers"]["motions"]))

    def test_generated_categories_exclude_the_keyword(self):
        self.assertEqual(set(VOCAB["generated"]["categories"]), set(VOCAB["categories"]) - {"keyword"})


if __name__ == "__main__":
    unittest.main()
