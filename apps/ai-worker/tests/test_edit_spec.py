import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline.edit_spec import editing_of, parse_job_clips, parse_timeline  # noqa: E402
from pipeline.transition import Transition  # noqa: E402


class EditSpecTest(unittest.TestCase):
    def test_v2_clips_preserve_order_repetitions_and_ranges(self) -> None:
        clips = parse_job_clips(
            {
                "clips": [
                    {"videoId": "video-a", "startMs": 3500, "endMs": 8000},
                    {"videoId": "video-b", "startMs": 0},
                    {"videoId": "video-a", "startMs": 12000, "endMs": 15500},
                ]
            }
        )

        self.assertEqual([clip.video_id for clip in clips], ["video-a", "video-b", "video-a"])
        self.assertEqual((clips[0].start_ms, clips[0].end_ms), (3500, 8000))
        self.assertIsNone(clips[1].end_ms)

    def test_legacy_video_ids_use_the_full_source(self) -> None:
        clips = parse_job_clips({"videoIds": ["video-a", "video-b"]})

        self.assertTrue(all(clip.start_ms == 0 and clip.end_ms is None for clip in clips))

    def test_invalid_range_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "종료 시간"):
            parse_job_clips(
                {"clips": [{"videoId": "video-a", "startMs": 1000, "endMs": 1000}]}
            )


def _v3(transitions: list[dict], cuts: list[dict] | None = None) -> dict:
    return {
        "version": 3,
        "stylePreset": "일상",
        "timeline": {
            "cuts": cuts
            or [
                {"cutId": "c0", "videoId": "video-a", "sourceInMs": 500, "sourceOutMs": 2500},
                {"cutId": "c1", "videoId": "video-b", "sourceInMs": 0},
                {"cutId": "c2", "videoId": "video-a", "sourceInMs": 3000, "sourceOutMs": 4000},
            ],
            "transitions": transitions,
        },
    }


class TimelineSpecTest(unittest.TestCase):
    def test_cuts_and_transitions_are_read_in_order(self) -> None:
        timeline = parse_timeline(
            _v3(
                [
                    {"fromCutId": "c0", "toCutId": "c1", "kind": "crossfade", "durationMs": 400},
                    {"fromCutId": "c1", "toCutId": "c2", "kind": "hardcut"},
                ]
            )
        )

        self.assertEqual([cut.video_id for cut in timeline.cuts], ["video-a", "video-b", "video-a"])
        self.assertEqual((timeline.cuts[0].start_ms, timeline.cuts[0].end_ms), (500, 2500))
        self.assertIsNone(timeline.cuts[1].end_ms)
        self.assertEqual(
            timeline.transitions, [Transition("crossfade", 400), Transition("hardcut")]
        )

    def test_ai_trimmed_cuts_are_marked(self) -> None:
        # AI 가 자른 컷만 워커가 박자 · 흔들림에 맞춰 옮긴다(MOV-29) — 생략은 사용자 구간
        cuts = [{"cutId": "c0", "videoId": "video-a", "sourceInMs": 0, "trimOwner": "ai"},
                {"cutId": "c1", "videoId": "video-b", "sourceInMs": 0}]
        timeline = parse_timeline(_v3([{"fromCutId": "c0", "toCutId": "c1", "kind": "hardcut"}], cuts))
        self.assertEqual(timeline.ai_cuts, [True, False])
        self.assertEqual(parse_timeline(_v3([{"fromCutId": "c0", "toCutId": "c1", "kind": "hardcut"},
                                             {"fromCutId": "c1", "toCutId": "c2", "kind": "hardcut"}])).ai_cuts,
                         [False, False, False])

    def test_editing_defaults_to_off(self) -> None:
        self.assertEqual(editing_of({}), {"speech": False, "sceneOrder": False})
        self.assertEqual(editing_of({"editing": {"speech": True}}), {"speech": True, "sceneOrder": False})
        self.assertEqual(editing_of({"editing": {"speech": "yes", "sceneOrder": True}}), {"speech": False, "sceneOrder": True})

    def test_a_missing_boundary_is_not_filled_with_hardcut(self) -> None:
        # 빠진 전환을 조용히 채우면 사용자가 고른 전환이 빠진 결과물이 유료로 완료된다.
        with self.assertRaisesRegex(ValueError, "하나씩"):
            parse_timeline(_v3([{"fromCutId": "c0", "toCutId": "c1", "kind": "hardcut"}]))

    def test_a_transition_must_join_adjacent_cuts(self) -> None:
        with self.assertRaisesRegex(ValueError, "이어진 두 컷"):
            parse_timeline(
                _v3(
                    [
                        {"fromCutId": "c1", "toCutId": "c2", "kind": "hardcut"},
                        {"fromCutId": "c0", "toCutId": "c1", "kind": "hardcut"},
                    ]
                )
            )

    def test_out_of_range_duration_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "crossfade"):
            parse_timeline(
                _v3(
                    [
                        {"fromCutId": "c0", "toCutId": "c1", "kind": "crossfade", "durationMs": 5},
                        {"fromCutId": "c1", "toCutId": "c2", "kind": "hardcut"},
                    ]
                )
            )

    def test_duplicate_cut_ids_are_rejected(self) -> None:
        cuts = [
            {"cutId": "c0", "videoId": "video-a", "sourceInMs": 0},
            {"cutId": "c0", "videoId": "video-b", "sourceInMs": 0},
        ]
        with self.assertRaisesRegex(ValueError, "겹칩니다"):
            parse_timeline(_v3([{"fromCutId": "c0", "toCutId": "c0", "kind": "hardcut"}], cuts))

    def test_only_v3_is_accepted(self) -> None:
        with self.assertRaises(ValueError):
            parse_timeline({"version": 2, "stylePreset": "일상", "clips": []})


if __name__ == "__main__":
    unittest.main()
