"""분석 문자열 → 내용 개념 정규화의 계약 — TS 구현과 같은 공유 사례로 검사한다.

사례 파일은 `packages/shared-types/fixtures/content-normalization.json` 이고 `apps/api/test/content-vocabulary.test.ts` 도 같은 파일을 돈다.
두 구현이 갈리면 추천(API)과 텍스트 액센트(워커)가 같은 스냅을 다른 개념으로 읽는다. ffmpeg·SDK 없이 도는 순수 검사다.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import content  # noqa: E402

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages" / "shared-types" / "fixtures" / "content-normalization.json")
    .read_text(encoding="utf-8")
)


class NormalizeTest(unittest.TestCase):
    def test_agrees_with_the_shared_fixture(self):
        for field, value, expected in FIXTURE["cases"]:
            with self.subTest(field=field, value=value):
                self.assertEqual(content.normalize_value(field, value), expected)

    def test_lists_keep_first_seen_order_once(self):
        for case in FIXTURE["lists"]:
            self.assertEqual(content.normalize_values(case["field"], case["values"]), case["expected"])

    def test_concepts_of_an_analysis_row(self):
        row = {"objects": ["라떼", "나무 테이블"], "places": ["카페"], "moods": ["잔잔한"], "actions": [], "topics": None}
        self.assertEqual(content.concepts_of(row),
                         {"objects": ("coffee", "table"), "places": ("cafe",), "moods": ("calm",)})


if __name__ == "__main__":
    unittest.main()
