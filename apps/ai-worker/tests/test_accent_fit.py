"""액센트를 영상에 맞추는 규칙의 계약 — 에너지(상대값) · 모션 바꾸기 · 움직임 정점 · 배경 대비, 그리고 엔진에서 그것이 쓰이는지.

ffmpeg·SDK 없이 도는 순수 검사다. 대표 프레임을 실제로 읽는 것은 `test_ffmpeg_contract.py` 가 맡는다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import accent_fit, accent_inputs, sticker, text_accent  # noqa: E402
from pipeline.accent_fit import HIGH, LOW, MID  # noqa: E402
from pipeline.text_accent import CutContext  # noqa: E402

SEED = 1837462
BEAT = 500
CENTER = (0.30, 0.40, 0.70, 0.70)
CALM, BUSY = (0.01,) * 10, (0.08,) * 10


def flat(value: float, rows: int = 10, cols: int = 6) -> tuple[tuple[float, ...], ...]:
    return tuple((value,) * cols for _ in range(rows))


class EnergyTest(unittest.TestCase):
    def test_energy_is_relative_to_the_other_cuts(self):
        self.assertEqual(accent_fit.energies([(0.01,), (0.02,), (0.03,)]), [LOW, MID, HIGH])
        # 전부 열 배여도 순서가 같으면 같은 답 — 절대값이 아니다
        self.assertEqual(accent_fit.energies([(0.1,), (0.2,), (0.3,)]), [LOW, MID, HIGH])

    def test_too_few_moving_cuts_or_all_still_means_mid(self):
        self.assertEqual(accent_fit.energies([(0.01,), (0.05,)]), [MID, MID])
        self.assertEqual(accent_fit.energies([(0.001,)] * 4), [MID] * 4)

    def test_cut_without_signals_is_unknown_not_calm(self):
        self.assertEqual(accent_fit.energies([(), (0.01,), (0.02,), (0.03,)])[0], MID)

    def test_only_mismatched_motions_are_swapped(self):
        self.assertEqual(accent_fit.motion_for("wave", "sound", HIGH), "shake")
        self.assertEqual(accent_fit.motion_for("stamp", "exclaim", LOW), "slide")
        self.assertEqual(accent_fit.motion_for("stamp", "sound", HIGH), "stamp")
        self.assertEqual(accent_fit.motion_for("wave", "feeling", MID), "wave")


class PeakTest(unittest.TestCase):
    def test_a_distinct_spike_is_a_peak(self):
        motion = (0.01, 0.01, 0.01, 0.09, 0.01, 0.01)
        self.assertEqual(accent_fit.peak_ms(motion, 2000), 2000 + 3 * accent_fit.STEP_MS)

    def test_even_motion_has_no_peak(self):
        self.assertIsNone(accent_fit.peak_ms((0.05, 0.06, 0.05, 0.06), 0))
        self.assertIsNone(accent_fit.peak_ms((), 0))

    def test_noise_on_a_still_frame_is_not_a_peak(self):
        # 가만히 있는 클립의 인코딩 잡음 — 상대적으로는 치솟아도 절대 크기가 floor 이하(데모에서 실제로 잡혔다)
        self.assertIsNone(accent_fit.peak_ms((0.0001, 0.0001, 0.0009, 0.0001), 0))

    def test_entry_moves_to_the_beat_nearest_the_peak_but_keeps_a_beat_to_live(self):
        self.assertEqual(accent_fit.timing(0, 2000, 2, BEAT, peak=1100)[0], 1000)
        # 정점이 컷 끝 바로 앞이면 한 박자가 남는 마지막 박자(컷 끝 + 반 박자까지 허용)
        self.assertEqual(accent_fit.timing(0, 1000, 2, BEAT, peak=950)[0], 500)

    def test_step_matches_the_snap_signals(self):
        self.assertEqual(accent_fit.STEP_MS, accent_inputs.STEP_MS)


class ContrastTest(unittest.TestCase):
    def test_light_text_on_light_background_swaps(self):
        fill, line, swapped = accent_fit.contrast_colours("FFFFFF", "111111", 0.9, box=False)
        self.assertEqual((fill, line, swapped), ("111111", "FFFFFF", True))

    def test_enough_contrast_or_boxes_or_unknown_background_stay(self):
        self.assertFalse(accent_fit.contrast_colours("FFFFFF", "111111", 0.2, box=False)[2])
        self.assertFalse(accent_fit.contrast_colours("FFFFFF", "111111", 0.9, box=True)[2])
        self.assertFalse(accent_fit.contrast_colours("FFFFFF", "111111", None, box=False)[2])

    def test_luma_under_averages_the_covered_cells(self):
        grid = tuple(((1.0,) * 6 if r < 5 else (0.0,) * 6) for r in range(10))
        self.assertAlmostEqual(accent_fit.luma_under((0.1, 0.05, 0.9, 0.25), grid), 1.0)
        self.assertAlmostEqual(accent_fit.luma_under((0.1, 0.6, 0.9, 0.8), grid), 0.0)
        self.assertIsNone(accent_fit.luma_under((0, 0, 1, 1), ()))


class EngineUsesTheFootageTest(unittest.TestCase):
    def cuts(self, **override):
        base = dict(concepts={"places": ("sea",)}, subject=CENTER)
        base.update(override)
        return [
            CutContext("a", 0, 1000, motion=CALM, **base),
            CutContext("b", 1000, 2000, motion=(0.04,) * 10, **base),
            # 여유~ 의 사전 모션은 wave(잔잔) — 바쁜 컷이면 바뀌어야 한다
            CutContext("c", 2000, 3000, motion=BUSY, concepts={"moods": ("calm",)}, subject=CENTER),
        ]

    def test_busy_cut_gets_an_impact_motion_with_a_reason(self):
        accents = text_accent.plan(self.cuts(), BEAT, SEED).accents
        busy = accents[-1]
        self.assertEqual((busy.choice.text, busy.choice.motion, busy.energy), ("여유~", "wave", HIGH))
        self.assertIn(busy.motion, accent_fit.ENERGY["impact"])
        self.assertTrue(any("에너지 high" in note for note in busy.notes), busy.notes)

    def test_bright_background_flips_light_text(self):
        cut = CutContext("a", 0, 1000, {"moods": ("calm",)}, CENTER, luma=flat(0.95))
        accent = text_accent.plan([cut], BEAT, SEED).accents[0]
        palette = text_accent.VOCABULARY["palettes"]["calm"]
        self.assertEqual((accent.fill, accent.line), (palette["line"], palette["fill"]))
        self.assertTrue(any("맞바꿈" in note for note in accent.notes))

    def test_without_footage_inputs_the_dictionary_values_stand(self):
        cut = CutContext("a", 0, 1000, {"moods": ("calm",)}, CENTER)
        accent = text_accent.plan([cut], BEAT, SEED).accents[0]
        self.assertEqual((accent.motion, accent.notes), (accent.choice.motion, ()))

    def test_stickers_follow_the_energy(self):
        cuts = self.cuts()
        stickers = sticker.plan(cuts, [], BEAT, SEED)
        busy = [s.motion for s in stickers if s.cut_id == "c"]
        calm = [s.motion for s in stickers if s.cut_id == "a"]
        self.assertTrue(busy and set(busy) <= set(text_accent.VOCABULARY["stickers"]["energyMotions"][HIGH]))
        self.assertTrue(calm and set(calm) <= set(text_accent.VOCABULARY["stickers"]["energyMotions"][LOW]))


class CutMotionTest(unittest.TestCase):
    def test_slices_the_cut_out_of_the_snap_curve(self):
        series = tuple(i / 100 for i in range(30))
        self.assertEqual(accent_inputs.cut_motion(series, 500, 1200), series[5:12])
        self.assertEqual(accent_inputs.cut_motion(series, 2500, None), series[25:])
        self.assertEqual(accent_inputs.cut_motion((), 0, 1000), ())

    def test_representative_frame_is_the_middle_of_the_cut(self):
        self.assertEqual(accent_inputs.representative_ms(1000, 3000, 9000), 2000)
        self.assertEqual(accent_inputs.representative_ms(1000, None, 3000), 2000)


if __name__ == "__main__":
    unittest.main()
