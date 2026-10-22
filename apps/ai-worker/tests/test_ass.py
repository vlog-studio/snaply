"""ASS 공용 부품의 계약 — 시각 · 이스케이프 · 색 · 스타일 줄 · 필터 인자, 그리고 스타일 글꼴과 번들 글꼴의 묶음.

글꼴 묶음이 이 파일의 핵심이다. 말소리 자막이 `Pretendard` 를 요청했는데 번들 파일의 패밀리 이름이
`Pretendard GOV` 라 libass 가 DejaVu 로 대체했고, 한글이 전부 빈 네모로 구워졌다(2026-10-20 데모에서 발견).
영문으로만 검사하는 렌더 테스트는 이걸 놓친다. ffmpeg·SDK 없이 도는 순수 검사다.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import ass, ass_caption, title_card  # noqa: E402


def font_families(path: Path) -> set[str]:
    """TrueType `name` 표의 패밀리 이름(ID 1 · 16, Windows 유니코드)."""
    data = path.read_bytes()
    num_tables = struct.unpack(">H", data[4:6])[0]
    for i in range(num_tables):
        tag, _, offset, _ = struct.unpack(">4sIII", data[12 + 16 * i: 28 + 16 * i])
        if tag == b"name":
            return _names(data, offset)
    return set()


def _names(data: bytes, base: int) -> set[str]:
    _, count, strings = struct.unpack(">HHH", data[base: base + 6])
    found = set()
    for i in range(count):
        platform, _, _, name_id, length, offset = struct.unpack(">6H", data[base + 6 + 12 * i: base + 18 + 12 * i])
        if platform == 3 and name_id in (1, 16):
            start = base + strings + offset
            found.add(data[start: start + length].decode("utf-16-be"))
    return found


def bundled_families() -> set[str]:
    return set().union(*(font_families(p) for p in ass.FONTS_DIR.glob("*.ttf")))


class BundledFontTest(unittest.TestCase):
    def test_every_style_font_is_a_bundled_family(self):
        families = bundled_families()
        for style in (ass_caption.STYLE, *title_card.styles()):
            with self.subTest(style=style.name):
                self.assertIn(style.font, families)

    def test_every_bundled_font_has_its_license_beside_it(self):
        licenses = {p.name for p in ass.FONTS_DIR.glob("OFL-*.txt")}
        self.assertEqual(len(licenses), len(list(ass.FONTS_DIR.glob("*.ttf"))), licenses)


class FormatTest(unittest.TestCase):
    def test_timestamp_rounds_to_centiseconds(self):
        self.assertEqual(ass.format_timestamp(0), "0:00:00.00")
        self.assertEqual(ass.format_timestamp(1_234), "0:00:01.23")
        self.assertEqual(ass.format_timestamp(1_235), "0:00:01.24")
        self.assertEqual(ass.format_timestamp(3_723_456), "1:02:03.46")

    def test_escape_keeps_text_from_becoming_tags(self):
        self.assertEqual(ass.escape_text("{\\b1}굵게\n줄"), "｛＼b1｝굵게 줄")

    def test_colours_are_bgr_with_alpha_first(self):
        self.assertEqual(ass.colour("FFE500"), "&H0000E5FF")
        self.assertEqual(ass.colour("000000", 0x80), "&H80000000")
        self.assertEqual(ass.override_colour("ff5fa2"), "&HA25FFF&")
        with self.assertRaises(ValueError):
            ass.colour("FFF")

    def test_style_line_has_every_field(self):
        line = ass.Style("S", "Jua", 100).line()
        self.assertEqual(len(line.removeprefix("Style: ").split(",")), len(ass.STYLE_FIELDS))

    def test_filter_arg_always_points_at_the_bundled_fonts(self):
        self.assertEqual(
            ass.filter_arg("/tmp/w/accent.ass"),
            f"ass=filename='/tmp/w/accent.ass':fontsdir='{ass.FONTS_DIR}'",
        )
        with self.assertRaises(ValueError):
            ass.filter_arg("/tmp/it's.ass")


if __name__ == "__main__":
    unittest.main()
