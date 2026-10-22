"""단어 단위 애니메이션 자막(ASS) 문서 생성의 계약.

렌더 경로에 연결하기 전이라 문서 문자열만 본다 — libass 가 이 문서를 실제로 읽는지는
`test_ffmpeg_contract.py` 가 맡는다. ffmpeg·SDK 없이 도는 순수 검사다.
"""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import ass_caption  # noqa: E402
from pipeline import ass  # noqa: E402
from pipeline.ass_caption import (  # noqa: E402
    CaptionError,
    Word,
    build_document,
    group_lines,
    words_from_segments,
)


def _seg(*words: tuple[float, float, str]) -> SimpleNamespace:
    return SimpleNamespace(words=[SimpleNamespace(start=s, end=e, word=w) for s, e, w in words])


def _events(document: str) -> list[str]:
    return [line for line in document.splitlines() if line.startswith("Dialogue:")]


class WordsFromSegmentsTest(unittest.TestCase):
    def test_converts_to_ms_and_keeps_spacing(self):
        words = words_from_segments([_seg((0.0, 0.4, " 오늘"), (0.4, 0.7, "은"), (0.8, 1.2, " 맑음"))])
        self.assertEqual(
            words,
            [Word(0, 400, "오늘", True), Word(400, 700, "은", False), Word(800, 1200, "맑음", True)],
        )

    def test_skips_blank_words_and_segments_without_words(self):
        segments = [_seg((0.0, 0.3, "  ")), SimpleNamespace(words=None), _seg((0.5, 0.9, " 안녕"))]
        self.assertEqual(words_from_segments(segments), [Word(500, 900, "안녕", True)])

    def test_overlap_is_pushed_back_and_zero_length_is_stretched(self):
        words = words_from_segments([_seg((0.0, 0.5, " 하나")), _seg((0.4, 0.4, " 둘"))])
        self.assertEqual(words[1], Word(500, 500 + ass_caption.MIN_WORD_MS, "둘", True))


class GroupLinesTest(unittest.TestCase):
    def test_long_pause_starts_a_new_line(self):
        words = [Word(0, 300, "가"), Word(300 + ass_caption.MAX_GAP_MS + 1, 1200, "나")]
        self.assertEqual([len(line.words) for line in group_lines(words)], [1, 1])

    def test_pause_at_the_limit_stays_on_the_line(self):
        words = [Word(0, 300, "가"), Word(300 + ass_caption.MAX_GAP_MS, 1200, "나")]
        self.assertEqual(len(group_lines(words)), 1)

    def test_char_limit_breaks_the_line(self):
        # "가나다라마" 다섯 글자 × 2 + 공백 = 11, 세 번째를 붙이면 17 > 14
        words = [Word(i * 300, i * 300 + 200, "가나다라마") for i in range(3)]
        self.assertEqual([len(line.words) for line in group_lines(words)], [2, 1])

    def test_joined_pieces_count_without_spaces(self):
        words = [Word(0, 100, "가나다라마바사"), Word(100, 200, "아자차카타파하", space_before=False)]
        self.assertEqual(len(group_lines(words)), 1)

    def test_line_duration_limit_breaks_the_line(self):
        words = [Word(0, 1000, "가"), Word(1000, 2000, "나"), Word(2000, 2600, "다")]
        self.assertEqual([len(line.words) for line in group_lines(words)], [2, 1])

    def test_word_longer_than_a_line_stands_alone(self):
        words = [Word(0, 100, "가"), Word(100, 500, "가" * 20), Word(500, 600, "나")]
        self.assertEqual([len(line.words) for line in group_lines(words)], [1, 1, 1])

    def test_line_lingers_but_is_cut_by_the_next_line(self):
        lone = group_lines([Word(0, 500, "가")])
        self.assertEqual(lone[0].end_ms, 500 + ass_caption.LINGER_MS)
        close = group_lines([Word(0, 500, "가"), Word(1200, 1500, "나")])
        self.assertEqual(close[0].end_ms, 500 + ass_caption.LINGER_MS)
        tight = group_lines([Word(0, 2000, "가"), Word(2100, 3000, "나")])
        self.assertEqual(tight[0].end_ms, 2100)

    def test_out_of_order_or_empty_words_are_rejected(self):
        for words in (
            [Word(500, 900, "가"), Word(400, 1000, "나")],
            [Word(500, 500, "가")],
            [Word(0, 100, "")],
        ):
            with self.subTest(words=words), self.assertRaises(CaptionError):
                group_lines(words)

    def test_no_words_no_lines(self):
        self.assertEqual(group_lines([]), [])


class DocumentTest(unittest.TestCase):
    def test_header_declares_portrait_canvas_and_a_complete_style(self):
        document = build_document([])
        self.assertIn(f"PlayResX: {ass.PLAY_RES_X}", document)
        self.assertIn(f"PlayResY: {ass.PLAY_RES_Y}", document)
        self.assertIn(ass_caption.STYLE.line(), document)
        self.assertEqual(_events(document), [])

    def test_karaoke_line(self):
        lines = group_lines([Word(1000, 1400, "오늘"), Word(1400, 1700, "은", False), Word(1900, 2300, "맑음")])
        self.assertEqual(
            _events(build_document(lines)),
            [
                "Dialogue: 0,0:00:01.00,0:00:02.60,Caption,,0,0,0,,"
                "{\\kf40}오늘{\\kf30}은{\\k20}{\\kf40} 맑음"
            ],
        )

    def test_karaoke_durations_do_not_drift(self):
        # 단어마다 5ms 씩 어긋난 시각 — 단어별로 반올림하면 합이 줄 길이와 어긋난다
        words = [Word(5 + i * 115, 5 + i * 115 + 115, "가", False) for i in range(10)]
        event = _events(build_document(group_lines(words)))[0]
        total = sum(int(part.split("}")[0]) for part in event.split("\\kf")[1:])
        self.assertEqual(total, (words[-1].end_ms + 5) // 10 - (words[0].start_ms + 5) // 10)

    def test_pop_reveals_each_word_at_its_offset(self):
        lines = group_lines([Word(1000, 1400, "오늘"), Word(1600, 2000, "맑음")])
        event = _events(build_document(lines, ass_caption.POP))[0]
        scale = ass_caption.POP_SCALE
        self.assertIn(
            f"{{\\alpha&HFF&\\fscx{scale}\\fscy{scale}\\t(0,1,\\alpha&H00&)"
            f"\\t(0,{ass_caption.POP_MS},\\fscx100\\fscy100)}}오늘",
            event,
        )
        self.assertIn(f"\\t(600,601,\\alpha&H00&)\\t(600,{600 + ass_caption.POP_MS},", event)
        self.assertTrue(event.endswith("} 맑음"))

    def test_recognized_braces_never_reach_the_tag_stream(self):
        event = _events(build_document(group_lines([Word(0, 500, "{\\pos(0,0)}")])))[0]
        self.assertTrue(event.endswith("{\\kf50}｛＼pos(0,0)｝"))

    def test_unknown_style_is_rejected(self):
        with self.assertRaises(CaptionError):
            build_document([], "bounce")


if __name__ == "__main__":
    unittest.main()
