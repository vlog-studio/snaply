import signal
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.modules.setdefault("loguru", MagicMock())

from pipeline import editor, ffmpeg_error  # noqa: E402


class NoStatsTest(unittest.TestCase):
    def test_turns_off_the_progress_line_of_an_ffmpeg_command(self) -> None:
        self.assertEqual(ffmpeg_error.no_stats(["ffmpeg", "-y", "-i", "a.mp4", "b.mp4"]),
                         ["ffmpeg", "-nostats", "-y", "-i", "a.mp4", "b.mp4"])

    def test_leaves_other_commands_and_quiet_ones_alone(self) -> None:
        probe = ["ffprobe", "-v", "error", "a.mp4"]
        quiet = ["ffmpeg", "-hide_banner", "-nostats", "-i", "a.mp4", "-f", "null", "-"]
        self.assertEqual(ffmpeg_error.no_stats(probe), probe)
        self.assertEqual(ffmpeg_error.no_stats(quiet), quiet)


class DescribeTest(unittest.TestCase):
    def test_puts_the_exit_code_after_the_end_of_stderr(self) -> None:
        self.assertEqual(ffmpeg_error.describe(1, "Output #0, mp4\nError opening output file\n"),
                         "Output #0, mp4\nError opening output file (exit 1)")

    def test_keeps_only_the_tail_of_stderr(self) -> None:
        self.assertEqual(ffmpeg_error.describe(1, "x" * 1000 + "원인", tail=10), "x" * 8 + "원인 (exit 1)")

    def test_a_kill_with_nothing_on_stderr_still_says_what_happened(self) -> None:
        # 메모리 부족이면 커널이 SIGKILL 로 끝내 ffmpeg 는 아무 말도 남기지 못한다(backlog E-64)
        self.assertEqual(ffmpeg_error.describe(-signal.SIGKILL, ""), "SIGKILL — 메모리 부족으로 강제 종료됐을 수 있다")
        self.assertEqual(ffmpeg_error.exit_status(-signal.SIGTERM), "SIGTERM")


class EditorRunTest(unittest.TestCase):
    @patch("pipeline.editor.subprocess.run")
    def test_runs_without_progress_and_reports_the_signal(self, run) -> None:
        run.return_value = subprocess.CompletedProcess(args=[], returncode=-signal.SIGKILL, stdout="",
                                                       stderr="Output #0, mp4, to 'out.mp4':\n")
        with self.assertRaises(RuntimeError) as caught:
            editor._run(["ffmpeg", "-y", "-i", "a.mp4", "out.mp4"])
        self.assertEqual(run.call_args.args[0][:2], ["ffmpeg", "-nostats"])
        self.assertTrue(str(caught.exception).startswith("ffmpeg 실패: Output #0"))
        self.assertTrue(str(caught.exception).endswith("(SIGKILL — 메모리 부족으로 강제 종료됐을 수 있다)"))


if __name__ == "__main__":
    unittest.main()
