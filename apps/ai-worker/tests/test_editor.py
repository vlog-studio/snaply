import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.modules.setdefault("loguru", MagicMock())

from pipeline import editor  # noqa: E402
from pipeline.render_spec import DEFAULT_RENDER_SPEC  # noqa: E402
from pipeline.transition import Transition  # noqa: E402


@patch("pipeline.editor.measure_loudness", new=lambda *_args, **_kw: None)
class NormalizeClipTest(unittest.TestCase):
    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=7.25)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_audio_is_padded_to_video_duration_instead_of_truncating_video(
        self, _has_audio, _probe_duration, run
    ) -> None:
        editor.normalize_clip("input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC)

        command = run.call_args.args[0]
        self.assertNotIn("-shortest", command)
        graph = command[command.index("-filter_complex") + 1]
        self.assertIn("apad", graph)
        self.assertIn("trim=start=0.000:end=7.250", graph)
        self.assertIn("atrim=start=0.000:end=7.250", graph)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=3.0)
    @patch("pipeline.editor._has_audio", return_value=False)
    def test_missing_audio_gets_a_bounded_silent_track(
        self, _has_audio, _probe_duration, run
    ) -> None:
        editor.normalize_clip("input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC)

        command = run.call_args.args[0]
        self.assertIn("anullsrc=channel_layout=stereo:sample_rate=48000", command)
        graph = command[command.index("-filter_complex") + 1]
        self.assertIn("[1:a:0]", graph)
        self.assertIn("atrim=duration=3.000", graph)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=10.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_selected_window_trims_video_and_audio_to_the_same_timeline(
        self, _has_audio, _probe_duration, run
    ) -> None:
        editor.normalize_clip(
            "input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC, start_ms=3500, end_ms=8000
        )

        command = run.call_args.args[0]
        graph = command[command.index("-filter_complex") + 1]
        self.assertIn("trim=start=3.500:end=8.000", graph)
        self.assertIn("atrim=start=3.500:end=8.000", graph)
        self.assertIn("asetpts=PTS-STARTPTS", graph)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=5.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_a_joined_cut_keeps_exactly_its_frame_count(self, _has_audio, _probe_duration, run) -> None:
        # 1490ms(44.7프레임)를 그대로 -t 1.490 으로 넘기면 끝나는 시각이 1.49 를 넘는 45번째 프레임이 빠져 44프레임(1.4667초)이었다 — 컷마다
        # 버림만큼 짧아져 이어 붙인 경계가 계획보다 앞당겨졌다(10컷에서 최대 184ms). 이제 가장 가까운 프레임 수(45)다
        editor.normalize_clip("input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC, start_ms=0, end_ms=1490, speed=1.0,
                              preset=editor.FAST_PRESET)
        command = run.call_args.args[0]
        t = float(command[command.index("-t") + 1])
        self.assertEqual(int(t * DEFAULT_RENDER_SPEC.fps), 45)  # 끝나는 시각이 t 이하인 프레임 = floor(t × fps)
        self.assertGreater(t * DEFAULT_RENDER_SPEC.fps % 1, 0.1)  # 프레임 경계에 딱 붙지 않는다(소수 오차로 한 프레임이 빠지지 않게)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=5.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_every_cut_ends_in_the_same_colour_format_after_its_effects(self, _has_audio, _probe_duration, run) -> None:
        # 원본마다 색 태그(bt470bg · bt709)와 범위(yuvj 풀 레인지)가 달라, 이어 붙인 파일 중간에서 속성이 바뀌면 다음 단계(글 · 스티커
        # 합성)의 필터가 다시 초기화되며 프레임을 버렸다(2026-10-29 — 8.07초에서 267ms 멈춤). 효과 뒤 · 끝 프레임 덧대기 앞에서 하나로 맞춘다
        editor.normalize_clip("input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC, start_ms=0, end_ms=1500,
                              extra_video="hue=s=0", preset=editor.FAST_PRESET)
        graph = run.call_args.args[0][run.call_args.args[0].index("-filter_complex") + 1]
        self.assertIn(f"hue=s=0,{editor.UNIFORM_FRAMES},tpad=", graph)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=5.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    @patch("pipeline.editor._color_matches", side_effect=AssertionError("다시 재면 안 된다"))
    def test_given_colour_filters_are_used_as_is(self, _matches, _has_audio, _probe_duration, run) -> None:
        # 손떨림 보정본을 원본으로 되돌린 컷을 혼자 구우면 색 맞춤이 빠졌다(구간 하나면 맞출 상대가 없다 — 2026-10-30). 무비 전체로 잰 필터를 넘긴다
        editor.prepare_segments([editor.ClipSource("a.mp4", 0, 1000)], editor.get_preset("일상"), DEFAULT_RENDER_SPEC, "w",
                                colors=["eq=brightness=0.05"], fast=True)
        graph = run.call_args.args[0][run.call_args.args[0].index("-filter_complex") + 1]
        self.assertIn("eq=brightness=0.05", graph)

    def test_frame_cut_seconds_keeps_the_rounded_frame_count(self) -> None:
        for seconds in (0.5, 1.4667, 1.467, 1.512, 2.0, 0.3333):
            t = editor.frame_cut_seconds(seconds, 30)
            self.assertEqual(int(t * 30), round(seconds * 30), seconds)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.probe_duration", return_value=5.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_window_outside_source_duration_is_rejected(
        self, _has_audio, _probe_duration, _run
    ) -> None:
        with self.assertRaisesRegex(ValueError, "종료 시간"):
            editor.normalize_clip(
                "input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC, end_ms=6000
            )


class ClipLevelTest(unittest.TestCase):
    """컷마다 녹음 크기가 달라 컷이 바뀔 때 소리가 튀던 것(decisions/auto-edit-draft.md §6.3 "오디오 기본 처리")."""

    def test_gain_brings_a_cut_to_the_target_within_the_cap(self) -> None:
        self.assertAlmostEqual(editor.clip_gain_db(-22.0), 6.0)
        self.assertAlmostEqual(editor.clip_gain_db(-10.0), -6.0)
        self.assertEqual(editor.clip_gain_db(-40.0), editor.CLIP_MAX_GAIN_DB)

    def test_near_silence_and_unmeasured_cuts_are_left_alone(self) -> None:
        # 잡음만 있는 컷을 기준 크기로 끌어올리면 쉬익 소리만 커진다.
        self.assertEqual(editor.clip_gain_db(-60.0), 0.0)
        self.assertEqual(editor.clip_gain_db(None), 0.0)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.measure_loudness", return_value=-26.0)
    @patch("pipeline.editor.probe_duration", return_value=3.0)
    @patch("pipeline.editor._has_audio", return_value=True)
    def test_normalized_cut_is_levelled_and_faded_at_both_ends(
        self, _has_audio, _probe_duration, _measure, run
    ) -> None:
        editor.normalize_clip("input.mp4", "output.mp4", "", DEFAULT_RENDER_SPEC)

        graph = run.call_args.args[0][run.call_args.args[0].index("-filter_complex") + 1]
        self.assertIn("volume=10.00dB", graph)
        # 리미터가 소리를 늦추면 페이드가 앞의 무음에 걸린다 — 지연을 되돌려야 한다.
        self.assertIn("alimiter=limit=0.891:level=0:latency=1", graph)
        self.assertIn("afade=t=in:d=0.005", graph)
        self.assertIn("afade=t=out:st=2.995:d=0.005", graph)


class MovieLevelTest(unittest.TestCase):
    """무비 전체는 선형 이득 + 오버샘플링 리미터로 맞추고, 리미터가 줄인 만큼 다시 재 보정한다."""

    def test_first_gain_brings_the_movie_to_platform_loudness_within_the_cap(self) -> None:
        self.assertAlmostEqual(editor.movie_gain_db(-16.0), 2.0)
        self.assertAlmostEqual(editor.movie_gain_db(-11.0), -3.0)
        self.assertEqual(editor.movie_gain_db(-45.0), editor.MOVIE_MAX_GAIN_DB)
        self.assertEqual(editor.movie_gain_db(-60.0), 0.0)
        self.assertEqual(editor.movie_gain_db(None), 0.0)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.measure_loudness", side_effect=[-17.5, -14.9, -14.1])
    def test_finalize_adds_back_what_the_limiter_took(self, measure, run) -> None:
        editor.finalize("in.mp4", "out.mp4")

        # 원본 −17.5 → +3.5dB. 리미터를 거치니 −14.9 → 0.9dB 더 → −14.1 이면 충분히 가깝다.
        self.assertEqual(measure.call_count, 3)
        self.assertEqual(measure.call_args_list[1].kwargs["pre_filter"], editor.movie_level_filter(3.5))
        command = run.call_args.args[0]
        self.assertEqual(
            command[command.index("-af") + 1],
            "volume=4.40dB,aresample=192000,alimiter=limit=0.75:level=0:latency=1,aresample=48000",
        )
        self.assertIn("+faststart", command)

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.measure_loudness", return_value=-14.1)
    def test_a_movie_already_at_platform_loudness_is_measured_once_more(self, measure, run) -> None:
        editor.finalize("in.mp4", "out.mp4")

        self.assertEqual(measure.call_count, 2)
        command = run.call_args.args[0]
        self.assertTrue(command[command.index("-af") + 1].startswith("volume=0.10dB,"))

    @patch("pipeline.editor._run")
    @patch("pipeline.editor.measure_loudness", return_value=None)
    def test_finalize_keeps_the_level_when_it_cannot_measure(self, measure, run) -> None:
        editor.finalize("in.mp4", "out.mp4")

        self.assertEqual(measure.call_count, 1)
        command = run.call_args.args[0]
        self.assertTrue(command[command.index("-af") + 1].startswith("volume=0.00dB,"))


class TimelineJoinTest(unittest.TestCase):
    @patch("pipeline.editor._run")
    def test_every_input_decodes_on_one_thread(self, run) -> None:
        """입력마다 자동 스레드로 디코딩하면 조인의 메모리가 컷 수에 비례한다(1080x1920 20컷 4.5GB, 2026-10-20)."""
        segments = [editor._Segment(f"seg_{i}.mp4", 3.0) for i in range(20)]

        editor._join_segments(segments, [Transition("hardcut")] * 19, DEFAULT_RENDER_SPEC, "out.mp4")

        command = run.call_args.args[0]
        inputs = [i for i, arg in enumerate(command) if arg == "-i"]
        self.assertEqual([command[i + 1] for i in inputs], [segment.path for segment in segments])
        for i in inputs:
            self.assertEqual(command[i - 2 : i], ["-threads", "1"])


if __name__ == "__main__":
    unittest.main()
