"""스냅 내용 개념 사전의 정합성.

원본은 `packages/shared-types/src/content-vocabulary.json` 하나이고 API 테스트
(`apps/api/test/content-vocabulary.test.ts`)도 같은 파일을 같은 규칙으로 검사한다. 워커는 지금 이 사전으로
아무것도 바꾸지 않는다 — 분석 결과의 필드가 사전과 어긋나지 않는지만 여기서 막는다.

계획: docs/plans/content-vocabulary.md §5.2. ffmpeg·SDK 없이 도는 순수 검사다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import cut_role, transition, vocabulary  # noqa: E402
from pipeline.video_analysis.schema import LIST_FIELDS  # noqa: E402

VOCABULARY_FILE = "content-vocabulary.json"
VOCABULARY = vocabulary.load(VOCABULARY_FILE)
CONCEPTS: dict[str, dict[str, dict]] = VOCABULARY["concepts"]


class ContentVocabularyTest(unittest.TestCase):
    def test_worker_reads_the_shared_vocabulary_file(self) -> None:
        self.assertIn(VOCABULARY_FILE, vocabulary.REQUIRED)
        self.assertTrue(vocabulary.candidates_for(VOCABULARY_FILE)[1].exists())

    def test_fields_are_the_analysis_list_fields(self) -> None:
        # 분석이 목록 필드를 더하거나 빼면 사전도 같이 바뀌어야 한다 — 어긋나면 그 필드는 조용히 사전 밖이 된다.
        self.assertEqual(sorted(VOCABULARY["fields"]), sorted(LIST_FIELDS))
        self.assertEqual(list(CONCEPTS), VOCABULARY["fields"])

    def test_match_fields_are_every_field_but_moods(self) -> None:
        self.assertEqual(
            VOCABULARY["matchFields"],
            [field for field in VOCABULARY["fields"] if field != "moods"],
        )

    def test_alias_belongs_to_one_concept_within_a_field(self) -> None:
        for field, concepts in CONCEPTS.items():
            owner: dict[str, str] = {}
            for concept_id, concept in concepts.items():
                for alias in (concept["label"], *concept["aliases"]):
                    self.assertNotIn(alias, owner, f"{field} {alias!r}: {concept_id} · {owner.get(alias)}")
                    owner[alias] = concept_id

    def test_parent_is_in_the_same_field_without_cycles(self) -> None:
        for field, concepts in CONCEPTS.items():
            for concept_id in concepts:
                seen: list[str] = []
                current: str | None = concept_id
                while current is not None:
                    self.assertIn(current, concepts, f"{field}.{concept_id} → {current}")
                    self.assertNotIn(current, seen, f"{field}.{concept_id} cycles")
                    seen.append(current)
                    current = concepts[current].get("parent")

    def test_role_affinity_is_a_cut_role(self) -> None:
        for field, concepts in CONCEPTS.items():
            for concept_id, concept in concepts.items():
                if "roleAffinity" in concept:
                    self.assertIn(concept["roleAffinity"], cut_role.ROLE_NAMES, f"{field}.{concept_id}")



class ContentRelationsTest(unittest.TestCase):
    """개념 사이의 관계(사전 `_relationsNote`). 스타일 프리셋 이름은 API 계약에만 있어 API 테스트가 본다."""

    KEYS = {"label", "parent", "roleAffinity", "aliases", "typicallyAt", "evokes", "suits"}

    def _lists(self, key: str):
        for field, concepts in CONCEPTS.items():
            for concept_id, concept in concepts.items():
                if key in concept:
                    yield field, concept_id, concept[key]

    def assert_distinct_list(self, value, where: str) -> None:
        self.assertIsInstance(value, list, where)
        self.assertTrue(value, where)
        self.assertEqual(len(set(value)), len(value), where)

    def test_concepts_declare_only_known_keys(self) -> None:
        for field, concepts in CONCEPTS.items():
            for concept_id, concept in concepts.items():
                self.assertLessEqual(set(concept), self.KEYS, f"{field}.{concept_id}")

    def test_typically_at_points_from_objects_and_actions_to_places(self) -> None:
        for field, concept_id, places in self._lists("typicallyAt"):
            where = f"{field}.{concept_id}"
            self.assertIn(field, ("objects", "actions"), where)
            self.assert_distinct_list(places, where)
            for place in places:
                self.assertIn(place, CONCEPTS["places"], where)

    def test_evokes_points_at_moods(self) -> None:
        for field, concept_id, moods in self._lists("evokes"):
            where = f"{field}.{concept_id}"
            self.assertIn(field, ("places", "objects", "actions"), where)
            self.assert_distinct_list(moods, where)
            for mood in moods:
                self.assertIn(mood, CONCEPTS["moods"], where)

    def test_every_mood_suits_known_transitions(self) -> None:
        for field, concepts in CONCEPTS.items():
            for concept_id, concept in concepts.items():
                where = f"{field}.{concept_id}"
                if field != "moods":
                    self.assertNotIn("suits", concept, where)
                    continue
                suits = concept.get("suits")
                self.assertIsInstance(suits, dict, where)
                self.assert_distinct_list(suits["transitions"], where)
                self.assert_distinct_list(suits["styles"], where)
                for kind in suits["transitions"]:
                    self.assertIn(kind, transition.KIND_NAMES, where)


if __name__ == "__main__":
    unittest.main()
