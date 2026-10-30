"""흔들림 게이트의 계약 — 손떨림은 부드러운 팬과 구분되고, 흔들리는 컷은 같은 스냅의 안정된 구간으로 옮기며, 어디든 흔들리는 스냅은 충분히 남을 때만 뺀다
(trend-recipes §20). 프레임은 numpy 로 만든다(ffmpeg 없이)."""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, steadiness as sd  # noqa: E402

H, W = sd.READ_H, sd.READ_W


def scene(seed: int) -> np.ndarray:
    """옮겨 잘라 쓸 넓은 무늬(부드러워 위상 상관이 잡는다)."""
    noise = np.random.default_rng(seed).random((H + 80, W + 80)).astype(np.float32)
    k = np.ones(5) / 5
    noise = np.apply_along_axis(lambda r: np.convolve(r, k, mode="same"), 1, noise)
    noise = np.apply_along_axis(lambda c: np.convolve(c, k, mode="same"), 0, noise)
    return (noise - noise.min()) / (noise.max() - noise.min()) * 200 + 20


def shot(offsets: list[tuple[int, int]], seed: int = 1) -> np.ndarray:
    big = scene(seed)
    return np.stack([big[40 + dy: 40 + dy + H, 40 + dx: 40 + dx + W] for dx, dy in offsets])


class MeasureTest(unittest.TestCase):
    def test_hand_shake_is_high_and_a_smooth_pan_is_not(self):
        rng = np.random.default_rng(3)
        shaky = shot([(int(rng.integers(-6, 7)), int(rng.integers(-6, 7))) for _ in range(30)])
        pan = shot([(i - 15, 0) for i in range(30)])  # 0.1초에 1px 씩 고르게
        self.assertGreater(float(np.median(sd.of_frames(shaky).jitter)), sd.SHAKY_PX)
        self.assertLess(float(np.median(sd.of_frames(pan).jitter)), 0.5)

    def test_the_steadiest_window_avoids_the_shaky_half(self):
        rng = np.random.default_rng(4)
        offsets = [(0, 0)] * 20 + [(int(rng.integers(-6, 7)), int(rng.integers(-6, 7))) for _ in range(20)]
        st = sd.of_frames(shot(offsets))
        self.assertLess(sd.steadiest_start(st, 1500), 600)
        self.assertGreater(sd.cost(st, 2500, 4000), sd.SHAKY_PX)


def fake(jitter: list[float]) -> sd.Steadiness:
    return sd.Steadiness(np.asarray(jitter, dtype=float), np.ones(len(jitter)))


class SteadyWindowsTest(unittest.TestCase):
    def test_a_shaky_cut_moves_to_the_steady_part_of_its_snap(self):
        st = fake([0.3] * 15 + [6.0] * 15)  # 앞 1.5초 안정, 뒤 1.5초 흔들림
        planned = [ct.PlannedCut(0, 1500, 3000, 1.0, None)]
        out = sd.steady_windows(planned, [st], [3000], tied=[None])
        self.assertEqual((out[0].start_ms, out[0].end_ms), (0, 1500))

    def test_seams_ramped_and_already_steady_cuts_stay(self):
        # 휩팬은 일부러 빠르게 움직이는 동작이라 손떨림 값이 높다 — 찍힌 동작의 컷은 아무리 흔들려도 둔다
        st = fake([0.3] * 15 + [6.0] * 15)
        seam = ct.PlannedCut(0, 1500, 3000, 1.0, "whip")
        ramp = ct.PlannedCut(1, 1500, 3000, 1.0, None, ramp=2.5)
        steady = ct.PlannedCut(2, 0, 1500, 1.0, None)
        out = sd.steady_windows([seam, ramp, steady], [st, st, st], [3000] * 3, tied=[sd.SEAM, None, None])
        self.assertEqual(out, [seam, ramp, steady])

    def test_a_linked_cut_moves_only_when_it_is_very_shaky(self):
        # 손에 든 근접 영상은 손떨림이 원본 줌으로 잡혀 모든 경계가 '원본 줌으로 이어짐'이었다(2026-10-30) — 아주 흔들리면 연결을 풀고 옮긴다
        st = fake([0.3] * 15 + [6.0] * 15)
        linked = ct.PlannedCut(0, 1500, 3000, 1.0, None)
        self.assertEqual(sd.steady_windows([linked], [st], [3000], tied=[sd.LINK])[0].start_ms, 0)
        mild = fake([0.3] * 15 + [3.0] * 15)  # SHAKY_PX 는 넘지만 UNUSABLE_PX 아래 — 연결을 지킨다
        self.assertEqual(sd.steady_windows([linked], [mild], [3000], tied=[sd.LINK])[0].start_ms, 1500)

    def test_no_move_unless_clearly_better(self):
        st = fake([3.0] * 30)  # 어디나 비슷하게 흔들린다 — 옮겨도 나아지지 않는다
        planned = [ct.PlannedCut(0, 1500, 3000, 1.0, None)]
        self.assertEqual(sd.steady_windows(planned, [st], [3000], tied=[None]), planned)


class StabilizeChoiceTest(unittest.TestCase):
    """손떨림 보정은 흔들리는 컷만, 찍힌 동작 · 배속 · 멈춤 컷은 빼고(trend-recipes §21)."""

    def test_only_shaky_free_or_linked_cuts_are_stabilized(self):
        shaky, calm = fake([5.0] * 30), fake([0.4] * 30)
        planned = [ct.PlannedCut(i, 0, 1500, 1.0, None) for i in range(4)] + [ct.PlannedCut(4, 0, 1500, 1.0, None, ramp=2.5)]
        chosen = sd.to_stabilize(planned, [shaky, calm, shaky, shaky, shaky], [None, None, sd.SEAM, sd.LINK, None])
        self.assertEqual(chosen, [0, 3])

    def test_correction_is_bounded_so_the_picture_is_barely_enlarged(self):
        detect, transform = sd.stabilize_filters(1080, "/w/t.trf")
        self.assertIn("vidstabdetect=", detect)
        self.assertIn("maxshift=43", transform)  # 너비의 4% — 크게 흔들리는 근접 영상을 따라가려다 1.5배로 확대됐다(2026-10-30)
        self.assertIn("maxangle=0.05", transform)
        self.assertIn("optzoom=1", transform)


class UsableTest(unittest.TestCase):
    def test_shaky_snaps_go_only_when_enough_steady_ones_remain(self):
        self.assertEqual(sd.usable([0.5, 5.0, 0.8, 0.6, 7.0]), [0, 2, 3])
        self.assertEqual(sd.usable([5.0, 6.0, 0.5, 7.0]), [0, 1, 2, 3])  # 안정 1개 — 다 남긴다
        self.assertEqual(sd.usable([3.5, 3.3, 3.4]), [0, 1, 2])  # 모두 흔들림(손에 든 음식) — 빼지 않는다


if __name__ == "__main__":
    unittest.main()
