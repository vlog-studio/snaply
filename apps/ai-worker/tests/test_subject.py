"""분석의 피사체 상자 → 화면 상자(decisions/subject-boxes.md §5) — 가장 가까운 프레임 고르기, 맞춤 방식대로 옮기기, 잘림.

ffmpeg 없이 도는 순수 검사다(원본 크기 읽기는 가짜).
"""

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import accent_inputs, accent_stage, subject  # noqa: E402

ANALYSIS = {
    "frameTimestampsMs": [300, 1100, 1900, 2700],
    "subjects": [
        {"frame": 0, "items": [{"label": "커피", "box": [0.1, 0.2, 0.3, 0.4]}, {"label": "사람", "box": [0.5, 0.1, 0.9, 0.9]}]},
        {"frame": 1, "items": []},
        {"frame": 3, "items": [{"label": "케이크", "box": [0.4, 0.5, 0.6, 0.7]}]},
    ],
}
SCREEN = (1080, 1920)


def close(a, b):
    return all(abs(x - y) < 1e-6 for x, y in zip(a, b))


class PickTest(unittest.TestCase):
    def test_the_nearest_frame_gives_its_first_subject(self):
        self.assertEqual(subject.pick(ANALYSIS, 200), (0.1, 0.2, 0.3, 0.4))   # 300ms 프레임, 눈에 띄는 순서의 첫째
        self.assertEqual(subject.pick(ANALYSIS, 2600), (0.4, 0.5, 0.6, 0.7))

    def test_an_empty_nearest_frame_does_not_borrow_from_another(self):
        self.assertIsNone(subject.pick(ANALYSIS, 1150))   # 1100ms 프레임은 비었다 — 피사체가 화면을 떠났을 수 있다

    def test_no_analysis_or_old_analysis_means_none(self):
        self.assertIsNone(subject.pick(None, 0))
        self.assertIsNone(subject.pick({"frameTimestampsMs": [300], "subjects": []}, 300))   # 프롬프트 v1
        self.assertIsNone(subject.pick({"frameTimestampsMs": [], "subjects": ANALYSIS["subjects"]}, 300))


class ToScreenTest(unittest.TestCase):
    def test_a_landscape_snap_on_a_blurred_background_sits_in_the_middle_band(self):
        # 1920x1080 원본을 폭에 맞춰 1080x607.5 로, 세로 가운데(656.25px 부터)
        box = subject.to_screen((0.0, 0.0, 0.5, 1.0), (1920, 1080), "blur_background", screen=SCREEN)
        self.assertTrue(close(box, (0.0, 656.25 / 1920, 0.5, (656.25 + 607.5) / 1920)), box)
        self.assertEqual(subject.to_screen((0.0, 0.0, 0.5, 1.0), (1920, 1080), "pad_white", screen=SCREEN), box)

    def test_cover_crops_the_sides_and_drops_what_falls_off(self):
        # 1920x1080 을 높이에 맞춰 3413x1920 — 가로 가운데 1080px 만 보인다
        self.assertIsNone(subject.to_screen((0.0, 0.2, 0.1, 0.4), (1920, 1080), "cover", screen=SCREEN))
        middle = subject.to_screen((0.45, 0.2, 0.55, 0.4), (1920, 1080), "cover", screen=SCREEN)
        self.assertGreater(middle[0], 0.0)
        self.assertLess(middle[2], 1.0)

    def test_a_vertical_snap_fills_the_screen_as_is(self):
        self.assertTrue(close(subject.to_screen((0.1, 0.2, 0.3, 0.4), (1080, 1920), "blur_background", screen=SCREEN),
                              (0.1, 0.2, 0.3, 0.4)))

    def test_a_letterbox_band_holds_the_picture(self):
        band = (0.0, (1920 - 608) / 2, 1080.0, 608.0)
        box = subject.to_screen((0.25, 0.0, 0.75, 1.0), (1080, 1920), "cover", band, SCREEN)
        self.assertTrue(close(box, (0.25, band[1] / 1920, 0.75, (band[1] + band[3]) / 1920)), box)

    def test_contain_does_not_enlarge_a_small_snap(self):
        self.assertEqual(subject.placed((540, 960), "contain", (0, 0, 1080, 1920)), (270.0, 480.0, 540.0, 960.0))


class ForCutTest(unittest.TestCase):
    def test_unreadable_source_means_no_subject(self):
        with mock.patch.object(subject, "display_size", side_effect=subject.SubjectError("x")):
            self.assertIsNone(subject.for_cut(ANALYSIS, "/w/a.mp4", 300, "blur_background"))

    def test_the_cut_context_carries_the_screen_subject(self):
        cut = accent_stage.CutSource("v1", "/w/a.mp4", 0, 600, 3000)   # 대표 시각 300ms → 첫 프레임
        with mock.patch.object(subject, "display_size", return_value=(1080, 1920)), \
                mock.patch.object(accent_inputs, "luma_grid", return_value=None):
            context = accent_stage.build_cuts([cut], {"v1": ANALYSIS}, {})[0]
        self.assertTrue(close(context.subject, (0.1, 0.2, 0.3, 0.4)), context.subject)

    def test_a_letterbox_movie_puts_the_subject_in_the_band(self):
        # 컷을 손본 레터박스 무비(MOV-8) — 세로 원본을 띠(1080x608, y 656~1264)에 꽉 채우므로 원본 세로 가운데만 띠에 든다
        cut = accent_stage.CutSource("v1", "/w/a.mp4", 0, 600, 3000)
        with mock.patch.object(subject, "display_size", return_value=(1080, 1920)), \
                mock.patch.object(accent_inputs, "luma_grid", return_value=None):
            context = accent_stage.build_cuts([cut], {"v1": ANALYSIS}, {}, "letterbox")[0]
        # 상자 y 0.2~0.4(384~768px)는 띠 위쪽이 잘려 656~768px 만 남는다
        self.assertTrue(close(context.subject, (0.1, 656 / 1920, 0.3, 768 / 1920)), context.subject)


if __name__ == "__main__":
    unittest.main()
