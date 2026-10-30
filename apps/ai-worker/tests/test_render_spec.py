import sys
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline.render_spec import (  # noqa: E402
    DEFAULT_RENDER_SPEC,
    LEGACY_RENDER_SPEC,
    LETTERBOX,
    build_video_filter,
    parse_render_spec,
)


class RenderSpecTest(unittest.TestCase):
    def test_missing_snapshot_uses_legacy_profile_for_queued_jobs(self) -> None:
        self.assertEqual(parse_render_spec(None), LEGACY_RENDER_SPEC)

    def test_valid_snapshot_is_parsed(self) -> None:
        spec = parse_render_spec(
            {
                "profileVersion": 1,
                "outputProfile": "short_vertical",
                "width": 1080,
                "height": 1920,
                "fps": 30,
                "fitMode": "blur_background",
            }
        )
        self.assertEqual(spec, DEFAULT_RENDER_SPEC)

    def test_profile_dimension_mismatch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            parse_render_spec(
                {
                    "profileVersion": 1,
                    "outputProfile": "short_vertical",
                    "width": 7680,
                    "height": 4320,
                    "fps": 120,
                    "fitMode": "cover",
                }
            )

    def test_unhashable_profile_value_is_rejected_as_invalid_input(self) -> None:
        with self.assertRaises(ValueError):
            parse_render_spec(
                {
                    "profileVersion": 1,
                    "outputProfile": ["short_vertical"],
                    "width": 1080,
                    "height": 1920,
                    "fps": 30,
                    "fitMode": "cover",
                }
            )

    def test_contain_does_not_force_small_foreground_upscale(self) -> None:
        graph = build_video_filter(LEGACY_RENDER_SPEC, "")
        self.assertIn("min(1920,iw)", graph)
        self.assertIn("pad=1920:1080", graph)

    def test_blur_background_upscales_foreground_to_fit_canvas(self) -> None:
        graph = build_video_filter(DEFAULT_RENDER_SPEC, "")

        self.assertIn(
            "[foreground]scale=1080:1920:"
            "force_original_aspect_ratio=decrease:force_divisible_by=2"
            "[foreground_scaled]",
            graph,
        )
        self.assertNotIn("[foreground]scale=w='min(", graph)

    def test_cover_and_blur_have_independent_filter_strategies(self) -> None:
        cover = parse_render_spec(
            {
                "profileVersion": 1,
                "outputProfile": "square",
                "width": 1080,
                "height": 1080,
                "fps": 30,
                "fitMode": "cover",
            }
        )
        self.assertIn("force_original_aspect_ratio=increase", build_video_filter(cover, ""))
        self.assertIn("crop=1080:1080", build_video_filter(cover, ""))
        self.assertIn("gblur=sigma=30", build_video_filter(DEFAULT_RENDER_SPEC, ""))
        self.assertIn("overlay=", build_video_filter(DEFAULT_RENDER_SPEC, ""))

    # 색 맞춤 · 분위기는 축소한 화면에 건다 — 원본(휴대폰 4K)에 걸면 화소가 네 배였다(2026-10-14 리뷰, backlog E-49).
    # 막대가 검게 남도록 pad 보다는 앞이다.
    def test_the_grade_runs_on_the_scaled_picture_and_before_the_bars(self) -> None:
        grade = "colorchannelmixer=rr=1.1,eq=saturation=0.8"
        contain = build_video_filter(LEGACY_RENDER_SPEC, grade)
        self.assertLess(contain.index("scale="), contain.index(grade))
        self.assertLess(contain.index(grade), contain.index("pad="))

        blur = build_video_filter(DEFAULT_RENDER_SPEC, grade)
        self.assertLess(blur.index("overlay="), blur.index(grade))
        self.assertEqual(blur.count(grade), 1)


if __name__ == "__main__":
    unittest.main()

    # 단색 띠 맞춤(MOV-8) — 앞 화면은 blur_background 처럼 화면까지 키우고, 남는 자리는 고른 색이다. 색보정은 띠보다 앞이라 띠 색이 그대로다.
    def test_pad_modes_upscale_to_fit_and_fill_with_their_colour(self) -> None:
        grade = "eq=saturation=0.8"
        for fit_mode, colour in (("pad_black", "black"), ("pad_white", "white")):
            spec = parse_render_spec(
                {
                    "profileVersion": 1,
                    "outputProfile": "short_vertical",
                    "width": 1080,
                    "height": 1920,
                    "fps": 30,
                    "fitMode": fit_mode,
                }
            )
            graph = build_video_filter(spec, grade)
            self.assertIn("scale=1080:1920:force_original_aspect_ratio=decrease", graph)
            self.assertNotIn("min(1080,iw)", graph)
            self.assertIn(f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color={colour}", graph)
            self.assertLess(graph.index(grade), graph.index("pad="))
            self.assertNotIn("gblur", graph)

    # 레터박스 레시피의 맞춤(MOV-8) — 원본을 가운데 16:9 띠(1080x608)에 꽉 채우고 위아래를 검게. 세로 원본도 띠가 생긴다
    def test_letterbox_fills_the_band_and_pads_black(self) -> None:
        grade = "eq=saturation=0.8"
        graph = build_video_filter(replace(DEFAULT_RENDER_SPEC, fit_mode=LETTERBOX), grade)
        self.assertIn("scale=1080:608:force_original_aspect_ratio=increase", graph)
        self.assertIn("crop=1080:608", graph)
        self.assertIn("pad=1080:1920:0:(oh-ih)/2:color=black", graph)
        self.assertLess(graph.index(grade), graph.index("pad="))

    def test_letterbox_is_not_a_fit_mode_the_api_can_send(self) -> None:
        # 워커가 레시피로 정한다 — 무비의 fitMode 로는 받지 않는다
        with self.assertRaises(ValueError):
            parse_render_spec({"profileVersion": 1, "outputProfile": "short_vertical", "width": 1080, "height": 1920,
                               "fps": 30, "fitMode": LETTERBOX})
