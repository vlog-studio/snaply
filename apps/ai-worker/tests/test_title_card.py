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

    def test_a_generic_place_is_no_place_in_any_style(self):
        self.assertEqual(title_card.words([{"places": ["야외 공간"]}, {"places": ["야외 공간"]}])[1], "")
        self.assertEqual(len(title_card.events("script", [{"places": ["야외 공간"]}], 9000, 3000)), 1)  # "in 야외 공간!!" 없이 "Mini VLog" 만

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


class CutCommentTest(unittest.TestCase):
    """시네마틱 오른쪽 글을 컷마다(trend-recipes.md §16)."""

    CUTS = [(0, 1000), (1000, 2000), (2000, 3000), (3000, 4000), (4000, 5000), (5000, 6000)]

    def test_starts_with_the_tag_then_each_cut_says_something_new(self):
        analyses = [{"places": ["한강"]}, {"actions": ["산책"]}, {"objects": ["라떼"]},
                    {"objects": ["노트북"]}, {"places": ["실내"], "topics": ["작업"]}, {}]
        spans = title_card.cut_comments("@한강 !", analyses, self.CUTS, 8000)
        # 1초 컷마다 바뀐다 — 4초 컷은 흔한 장소 '실내' 대신 '작업', 분석이 빈 5초 컷에서는 앞 멘트가 이어진다
        self.assertEqual(spans, [(0, 1000, "@한강 !"), (1000, 2000, "산책"), (2000, 3000, "라떼"),
                                 (3000, 4000, "노트북"), (4000, 8000, "작업")])

    def test_a_cut_shorter_than_the_minimum_keeps_the_previous_comment(self):
        cuts = [(0, 1000), (1000, 1500), (1500, 2500), (2500, 3500)]
        analyses = [{}, {"objects": ["라떼"]}, {"objects": ["케이크"]}, {"objects": ["노트북"]}]
        # 0.5초 컷은 0.9초(CUT_COMMENT_MIN_MS)보다 짧아 앞 멘트가 이어진다 — 그 컷의 '라떼' 가 다음 컷 위에 남지 않게
        self.assertEqual(title_card.cut_comments("@카페 !", analyses, cuts, 5000),
                         [(0, 1500, "@카페 !"), (1500, 2500, "케이크"), (2500, 5000, "노트북")])

    def test_order_is_action_object_place_topic_and_a_said_word_is_not_repeated(self):
        cut = {"topics": ["주제"], "places": ["카페"], "objects": ["라떼"], "actions": ["마시기"]}
        self.assertEqual(title_card._candidates(cut), ["마시기", "라떼", "@카페 !", "주제"])
        spans = title_card.cut_comments("@카페 !", [{}, cut, cut, cut], [(0, 2000), (2000, 4000), (4000, 6000), (6000, 8000)], 10000)
        self.assertEqual([t for _, _, t in spans], ["@카페 !", "마시기", "라떼", "주제"])

    def test_nothing_new_keeps_the_previous_comment(self):
        spans = title_card.cut_comments("@카페 !", [{"places": ["카페"]}] * 3, [(0, 2000), (2000, 4000), (4000, 6000)], 6000)
        self.assertEqual(spans, [(0, 6000, "@카페 !")])

    def test_no_short_flash_right_before_the_outro(self):
        # 엔딩까지 0.6초 — 0.9초가 안 되니 바꾸지 않는다
        spans = title_card.cut_comments("@카페 !", [{}, {"objects": ["케이크"]}], [(0, 2000), (2000, 2600)], 2600)
        self.assertEqual(spans, [(0, 2600, "@카페 !")])

    def test_events_with_cuts_change_the_right_text_and_keep_the_outro(self):
        analyses = [{"places": ["대전"]}, {"objects": ["빵"]}]
        lines = title_card.events("cinematic", analyses, 6000, None, [(0, 2000), (2000, 6000)])
        self.assertEqual(len(lines), 4)
        self.assertIn("Vlog", lines[0])
        self.assertIn("@대전 !", lines[1])
        self.assertIn("0:00:02.00", lines[1])
        self.assertIn("빵", lines[2])
        self.assertIn("\\fad(150,0)", lines[2])
        self.assertIn("See ya !<3", lines[3])
        self.assertIn("0:00:04.50", lines[3])

    def test_other_styles_ignore_cuts(self):
        self.assertEqual(title_card.events("typewriter", ANALYSES, 20000, None, [(0, 9000), (9000, 20000)]),
                         title_card.events("typewriter", ANALYSES, 20000, None))


if __name__ == "__main__":
    unittest.main()
