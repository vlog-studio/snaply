"""얼굴 스티커의 계약 — 상자 잇기(겹침 · 한 프레임 놓침), 고르기(길이 · 크기 · 간격 · 비율), 자리 보간, 모델 파일.

검출 자체는 opencv 가 있을 때만 — 빈 프레임에서 얼굴을 지어내지 않는지만 본다(사람 얼굴 사진을 저장소에 두지 않는다).
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import face  # noqa: E402

try:
    import cv2  # noqa: F401
    HAS_CV2 = True
except ImportError:  # 로컬에서 opencv 없이 돌릴 때
    HAS_CV2 = False

CFG = {"enabled": True, "share": 1.0, "minTrackMs": 500, "gapMs": 1000, "kinds": ["starpin"]}


def moving(n: int, x0: float = 0.4, w: float = 0.2) -> list[list[face.Box]]:
    return [[face.Box(x0 + i * 0.005, 0.3, w, w * 0.6)] for i in range(n)]


class TrackTest(unittest.TestCase):
    def test_overlapping_boxes_become_one_track_and_a_missed_frame_is_bridged(self):
        frames = moving(10)
        frames[4] = []
        found = face.tracks(frames)
        self.assertEqual(len(found), 1)
        self.assertEqual((found[0].start, len(found[0].boxes)), (0, 10))
        self.assertIsNone(found[0].boxes[4])

    def test_two_faces_two_tracks_and_a_long_gap_splits(self):
        two = [[face.Box(0.1, 0.3, 0.15, 0.1), face.Box(0.7, 0.3, 0.15, 0.1)] for _ in range(6)]
        self.assertEqual(len(face.tracks(two)), 2)
        gap = moving(5) + [[], [], []] + moving(5)
        self.assertEqual(len(face.tracks(gap)), 2)


class PlanTest(unittest.TestCase):
    def test_long_big_faces_get_a_sticker_that_follows_them(self):
        stickers = face.plan(face.tracks(moving(12)), CFG, 1)
        self.assertEqual(len(stickers), 1)
        s = stickers[0]
        self.assertEqual((s.kind, s.emoji), ("starpin", "sk-4020"))
        self.assertLess(s.keys[0][2], 0.3)  # 왕관은 얼굴 위
        self.assertGreater(s.keys[-1][1], s.keys[0][1])  # 얼굴을 따라 오른쪽으로

    def test_short_small_and_crowded_faces_are_skipped(self):
        self.assertEqual(face.plan(face.tracks(moving(3)), CFG, 1), [])
        self.assertEqual(face.plan(face.tracks(moving(12, w=0.04)), CFG, 1), [])
        crowded = moving(8) + [[]] * 2 + moving(8, x0=0.1)
        self.assertEqual(len(face.plan(face.tracks(crowded), {**CFG, "gapMs": 1500}, 1)), 1)  # 둘째는 1초 뒤 — gapMs 안
        self.assertEqual(face.plan(face.tracks(moving(12)), {**CFG, "enabled": False}, 1), [])

    def test_share_zero_picks_none_and_the_hold_is_capped(self):
        self.assertEqual(face.plan(face.tracks(moving(12)), {**CFG, "share": 0.0}, 1), [])

    def test_at_least_one_when_there_are_candidates(self):
        unlucky = next(seed for seed in range(200) if not face._pick(seed, 0, 0.3))
        self.assertEqual(len(face.plan(face.tracks(moving(12)), {**CFG, "share": 0.3}, unlucky)), 1)
        long = face.plan(face.tracks(moving(60)), CFG, 1)[0]
        self.assertLessEqual(long.end_ms - long.start_ms, face.MAX_HOLD_MS)

    def test_position_is_interpolated_between_keys(self):
        s = face.FaceSticker("starpin", "sk-4020", ((0, 0.2, 0.2, 0.1), (100, 0.4, 0.2, 0.1)))
        self.assertEqual(face.at(s, 50), (0.30000000000000004, 0.2, 0.1))
        self.assertIsNone(face.at(s, 250))


class ModelTest(unittest.TestCase):
    def test_model_and_license_are_bundled(self):
        self.assertTrue(face.MODEL.exists())
        self.assertTrue((face.MODEL.parent / "LICENSE-yunet.txt").exists())

    @unittest.skipUnless(HAS_CV2, "opencv 없음")
    def test_blank_frames_have_no_faces(self):
        frames = np.full((3, face.READ_H, face.READ_W, 3), 128, np.uint8)
        self.assertEqual(face.detect_frames(frames), [[], [], []])


if __name__ == "__main__":
    unittest.main()
