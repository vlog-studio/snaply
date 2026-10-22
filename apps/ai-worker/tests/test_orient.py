"""잘못된 회전 정보 바로잡기의 계약 — 회전 정보가 없거나 얼굴로 판단할 근거가 없으면 원본 그대로, 판단 규칙(무시한 쪽이 뚜렷이 더 잘 선다).

사람 얼굴 영상을 저장소에 두지 않으므로 판정 규칙은 얼굴 점수를 바꿔 끼워 본다. 실제 파일로는 회전 정보 읽기와 '얼굴 없음 → 그대로' 만.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import orient  # noqa: E402

FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


class RuleTest(unittest.TestCase):
    def check(self, honoured: float, ignored: float, rotation: float = 90.0) -> bool:
        with mock.patch.object(orient, "rotation", return_value=rotation), \
                mock.patch.object(orient, "_frames", side_effect=lambda path, honour: honour), \
                mock.patch.object(orient, "_face_score", side_effect=lambda honour: honoured if honour else ignored):
            return orient.needs_fix("x.mp4")

    def test_only_a_clearly_better_upright_without_the_rotation_flips_it(self):
        self.assertTrue(self.check(0, 2))  # 회전대로 세우면 얼굴이 없고, 무시하면 둘
        self.assertFalse(self.check(1, 1))  # 비슷하면 파일 정보대로
        self.assertFalse(self.check(0, 0))  # 얼굴이 없으면 근거가 없다
        self.assertFalse(self.check(2, 0))  # 회전 정보가 맞다(아이폰 세로 영상)
        self.assertFalse(self.check(0, 3, rotation=0.0))  # 회전 정보가 없으면 보지도 않는다


@unittest.skipUnless(FFMPEG, "ffmpeg/ffprobe 없음")
class FileTest(unittest.TestCase):
    def test_rotation_is_read_and_a_faceless_clip_is_left_alone(self):
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "s.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=1",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", src], check=True)
            rotated = os.path.join(work, "r.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation:v:0", "90", "-i", src, "-c", "copy", rotated],
                           check=True)
            self.assertEqual(orient.rotation(src), 0.0)
            self.assertEqual(abs(orient.rotation(rotated)), 90.0)
            self.assertEqual(orient.fix(rotated, work), rotated)  # 얼굴이 없다 — 근거 없이 돌리지 않는다


if __name__ == "__main__":
    unittest.main()
