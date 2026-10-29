"""편집 워커의 텍스트 액센트 단계 — 결과물 시간축의 컷 · 입력 만들기, 곡의 박자, 실패해도 무비는 간다.

ffmpeg 없이 도는 순수 검사다(프레임 읽기 · 굽기는 가짜). 실제로 굽는 것은 `test_ffmpeg_contract.py` 의 `AccentStageContract`.
"""

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import accent_inputs, accent_stage, beat_grid, face, recipe  # noqa: E402
from pipeline.accent_stage import CutSource  # noqa: E402

CUTS = [
    CutSource("v1", "/w/a.mp4", 500, 1500, 4000),
    CutSource("v2", "/w/b.mp4", 0, 2000, 2000),
]
ANALYSES = {"v1": {"objects": ["라떼"], "places": ["카페"], "moods": ["잔잔한"]}, "v2": {"places": ["바다"]}}
MOTIONS = {"v1": [i / 100 for i in range(40)], "v2": [0.02] * 20}


class SeedTest(unittest.TestCase):
    def test_one_movie_one_seed(self):
        self.assertEqual(accent_stage.stage_seed("m1"), accent_stage.stage_seed("m1"))
        self.assertNotEqual(accent_stage.stage_seed("m1"), accent_stage.stage_seed("m2"))


class BuildCutsTest(unittest.TestCase):
    def test_movie_timeline_concepts_and_motion(self):
        with mock.patch.object(accent_inputs, "luma_grid", return_value=((0.5,) * 6,) * 10):
            cuts = accent_stage.build_cuts(CUTS, ANALYSES, MOTIONS)
        self.assertEqual([(c.start_ms, c.end_ms) for c in cuts], [(0, 1000), (1000, 3000)])
        self.assertEqual(cuts[0].concepts, {"objects": ("coffee",), "places": ("cafe",), "moods": ("calm",)})
        self.assertEqual(cuts[0].motion, tuple(MOTIONS["v1"][5:15]))
        self.assertIsNotNone(cuts[0].luma)

    def test_unreadable_frame_or_missing_analysis_is_tolerated(self):
        with mock.patch.object(accent_inputs, "luma_grid", side_effect=accent_inputs.AccentInputError("x")):
            cuts = accent_stage.build_cuts(CUTS, {}, {})
        self.assertEqual((cuts[0].concepts, cuts[0].motion, cuts[0].luma), ({}, (), None))


class BeatsTest(unittest.TestCase):
    def test_no_track_or_unreadable_track_falls_back_to_a_fixed_beat(self):
        self.assertEqual(accent_stage.beats_for(None, 5000), (accent_stage.FALLBACK_BEAT_MS, None))
        with mock.patch.object(beat_grid, "load_or_analyze", side_effect=beat_grid.BeatGridError("x")):
            self.assertEqual(accent_stage.beats_for("/bgm/a.mp3", 5000), (accent_stage.FALLBACK_BEAT_MS, None))

    def test_track_beats_are_laid_over_the_movie(self):
        grid = beat_grid.BeatGrid(128.0, (100, 569, 1038), 1500)
        with mock.patch.object(beat_grid, "load_or_analyze", return_value=grid):
            beats, bpm = accent_stage.beats_for("/bgm/a.mp3", 2000)
        self.assertEqual((beats, bpm), ((100, 569, 1038, 1600), 128.0))

    def test_a_track_without_a_beat_falls_back(self):
        with mock.patch.object(beat_grid, "load_or_analyze", return_value=beat_grid.BeatGrid(0.0, (), 1500)):
            self.assertEqual(accent_stage.beats_for("/bgm/a.mp3", 2000)[0], accent_stage.FALLBACK_BEAT_MS)


class ApplyTest(unittest.TestCase):
    def test_a_failure_leaves_the_movie_as_it_was(self):
        with mock.patch.object(accent_stage, "build_cuts", side_effect=RuntimeError("boom")), \
                mock.patch.object(accent_stage, "_capture") as capture:
            path, outcome = accent_stage.apply("in.mp4", CUTS, ANALYSES, MOTIONS, None, 3000, "m1", "/w", "out.mp4")
        self.assertEqual((path, outcome.applied), ("in.mp4", False))
        self.assertIn("RuntimeError", outcome.reason)
        capture.assert_called_once()

    def test_nothing_to_say_means_no_reencode(self):
        with mock.patch.object(accent_inputs, "luma_grid", return_value=None), \
                mock.patch.object(accent_stage, "composite") as composite:
            path, outcome = accent_stage.apply("in.mp4", CUTS, {}, {}, None, 3000, "m1", "/w", "out.mp4")
        self.assertEqual((path, outcome.applied), ("in.mp4", False))
        composite.assert_not_called()



class FaceStickerTest(unittest.TestCase):
    """사용자가 컷을 고른 무비도 꾸밈의 얼굴을 켜면 편집본에서 얼굴을 찾는다(text-accent-stickers.md §9)."""

    def test_face_on_looks_for_faces_in_the_edited_movie(self):
        spec = recipe.decorated_spec(recipe.get("cinematic").spec, {"text": False, "emoji": False, "face": True})
        with mock.patch.object(face, "detect", return_value=[]) as detect, \
                mock.patch.object(face, "tracks", return_value=[]), \
                mock.patch.object(face, "plan", return_value=["crown"]) as plan:
            self.assertEqual(accent_stage._faces("with_bgm.mp4", spec, 7), ["crown"])
        detect.assert_called_once_with("with_bgm.mp4")
        self.assertEqual(plan.call_args.args[1:], (spec["faceStickers"], 7))

    def test_face_off_or_undetectable_means_none(self):
        off = recipe.decorated_spec(recipe.get("cinematic").spec, {"text": True, "emoji": True, "face": False})
        with mock.patch.object(face, "detect") as detect:
            self.assertEqual(accent_stage._faces("with_bgm.mp4", off, 7), [])
        detect.assert_not_called()
        on = recipe.get("cinematic").spec
        with mock.patch.object(face, "detect", side_effect=face.FaceError("x")):
            self.assertEqual(accent_stage._faces("with_bgm.mp4", on, 7), [])


if __name__ == "__main__":
    unittest.main()
