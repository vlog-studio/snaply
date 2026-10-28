"""고정 타이틀의 계약 — 분석에서 부제 · 장소 만들기, 두 모양의 이벤트, 머무는 시간.

ffmpeg 없이 도는 순수 검사다. 글꼴이 번들에 있는지는 `test_ass.py`, 실제로 그려지는지는 `test_ffmpeg_contract.py`.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import title_card  # noqa: E402

ANALYSES = [
    {"topics": ["수족관 관람", "아이"], "places": ["실내 수족관"]},
    {"topics": ["수족관 관람"], "places": ["수족관 통로"]},
    {"topics": ["가족 나들이"], "places": ["실내 수족관"]},
]


class WordsTest(unittest.TestCase):
    def test_most_frequent_topic_and_place(self):
        self.assertEqual(title_card.words(ANALYSES), ("수족관 관람", "실내 수족관"))

    def test_ties_keep_the_first_seen_and_long_words_are_cut(self):
        self.assertEqual(title_card.words([{"topics": ["가", "나"]}])[0], "가")
        self.assertEqual(len(title_card.words([{"topics": ["아주 아주 아주 긴 주제 문장입니다"]}])[0]), title_card.MAX_CHARS)

    def test_cut_by_cut_words_are_gathered_by_concept_instead_of_taking_the_first_cut(self):
        # 몽골 여행 — 컷마다 장소 · 주제 문자열이 달라 예전에는 첫 컷의 "암석 지형"이 부제가 됐다(2026-10-28 운영)
        trip = [
            {"topics": ["몽골 여행"], "places": ["암석 지형"]},
            {"topics": ["자연 풍경"], "places": ["바다 해변"]},
            {"topics": ["여행 기록"], "places": ["해변 산책로"]},
        ]
        subtitle, place = title_card.words(trip)
        self.assertEqual(subtitle, "여행")
        self.assertNotEqual(place, "암석 지형")

    def test_nothing_shared_falls_back_instead_of_naming_the_first_cut(self):
        self.assertEqual(title_card.words([{"topics": ["가"], "places": ["ㄱ"]}, {"topics": ["나"], "places": ["ㄴ"]}]), ("daily", ""))

    def test_without_analysis(self):
        self.assertEqual(title_card.words([{}, {}]), ("daily", ""))


class EventsTest(unittest.TestCase):
    def test_typewriter_stays_the_whole_movie(self):
        lines = title_card.events("typewriter", ANALYSES, 20000, None)
        self.assertEqual(len(lines), 2)
        self.assertTrue(all(",0:00:20.00," in line for line in lines))
        self.assertTrue(lines[0].endswith("}vlog"))
        self.assertIn("수족관 관람", lines[1])

    def test_script_only_for_its_hold_and_names_the_place(self):
        lines = title_card.events("script", ANALYSES, 20000, 3000)
        self.assertTrue(all(",0:00:03.00," in line for line in lines))
        self.assertIn("in 실내 수족관!!", lines[1])
        self.assertEqual(len(title_card.events("script", [{}], 20000, 3000)), 1)

    def test_unknown_style_is_rejected(self):
        with self.assertRaises(ValueError):
            title_card.events("neon", ANALYSES, 1000, None)


class CinematicTest(unittest.TestCase):
    def test_vlog_left_tag_right_and_see_ya_at_the_end(self):
        lines = title_card.events("cinematic", [{"places": ["대전"]}], 20000, None)
        self.assertEqual(len(lines), 3)
        self.assertIn("Vlog", lines[0])
        self.assertIn("@대전 !", lines[1])
        self.assertIn("See ya !<3", lines[2])
        self.assertIn("0:00:18.50", lines[2])  # 마지막 1.5초

    def test_a_generic_place_falls_back_to_the_topic(self):
        self.assertIn("@음식 !", title_card.events("cinematic", [{"places": ["실내"], "topics": ["음식"]}], 9000, None)[1])


if __name__ == "__main__":
    unittest.main()
