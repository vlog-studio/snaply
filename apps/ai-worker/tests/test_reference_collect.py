"""레퍼런스 수집의 계약 — 플랫폼 판정, 시트 id, 고르는 규칙, 시트 한 줄. yt-dlp 없이 메타데이터 dict 로."""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import reference_collect as rc, reference_rows  # noqa: E402

TODAY = date(2026, 10, 25)


def info(**over) -> dict:
    base = {"id": "7309414622363208967", "duration": 42, "view_count": 84100, "like_count": 784, "upload_date": "20261001",
            "webpage_url": "https://www.tiktok.com/@a/video/7309414622363208967", "track": "Go off the sea", "uploader": "a"}
    return {**base, **over}


class PlatformTest(unittest.TestCase):
    def test_host_decides_platform(self):
        self.assertEqual(rc.platform_of("https://www.instagram.com/reel/abc/"), "instagram")
        self.assertEqual(rc.platform_of("https://vm.tiktok.com/xyz"), "tiktok")
        self.assertEqual(rc.platform_of("https://www.youtube.com/hashtag/카페브이로그/shorts"), "youtube_shorts")
        self.assertEqual(rc.platform_of("https://youtu.be/abc"), "youtube_shorts")
        self.assertIsNone(rc.platform_of("https://example.com/notyoutube.com"))

    def test_row_id_is_safe_for_the_sheet(self):
        self.assertEqual(rc.row_id("instagram", "C8x.y/z"), "ig-C8x_y_z")
        self.assertTrue(reference_rows.SAFE_ID.fullmatch(rc.row_id("youtube_shorts", "a" * 80)))


class SkipTest(unittest.TestCase):
    def test_keeps_a_recent_popular_short(self):
        self.assertIsNone(rc.skip_reason(info(), rc.Rules(), TODAY))

    def test_skips_long_unpopular_or_old(self):
        self.assertIn("길이", rc.skip_reason(info(duration=300), rc.Rules(), TODAY))
        self.assertIn("조회수", rc.skip_reason(info(view_count=500), rc.Rules(), TODAY))
        self.assertIn("업로드", rc.skip_reason(info(upload_date="20230101"), rc.Rules(), TODAY))

    def test_unknown_values_do_not_skip(self):
        self.assertIsNone(rc.skip_reason(info(duration=None, view_count=None, upload_date=None), rc.Rules(), TODAY))

    def test_since_days_none_ignores_age(self):
        self.assertIsNone(rc.skip_reason(info(upload_date="20200101"), rc.Rules(since_days=None), TODAY))


class SheetRowTest(unittest.TestCase):
    def test_row_parses_as_a_valid_sheet_line(self):
        row = rc.sheet_row(info(channel_follower_count=1200), "tiktok")
        self.assertEqual(row["capture"], "download")
        self.assertEqual(row["uploaded_at"], "2026-10-01")
        parsed = reference_rows.parse_row(row)
        self.assertNotIsInstance(parsed, str)
        self.assertEqual((parsed.views, parsed.followers, parsed.format_label), (84100, 1200, None))

    def test_missing_counts_are_blank(self):
        row = rc.sheet_row(info(view_count=None, like_count=None, upload_date=None), "instagram")
        self.assertEqual((row["views"], row["likes"], row["uploaded_at"]), ("", "", ""))


if __name__ == "__main__":
    unittest.main()
