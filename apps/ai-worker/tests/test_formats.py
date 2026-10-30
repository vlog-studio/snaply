"""포맷(전략 묶음)의 계약 — 레시피마다 컷 선택 · 연결 기준이 엔진이 아는 이름이고, 전략이 후보 길이를 정하며(박자 배수 · 동작 전체 ·
안정 구간), 촬영 순서 제약 · before/after 점수 · 스피드램프 · 프리즈 길이 계산 · 타임스탬프 · 프리즈 라벨이 맞다.

ffmpeg 없이 도는 순수 검사다. 실제 렌더(램프 · 프리즈 길이)는 `test_ffmpeg_contract.py` 의 `FormatContract`.
"""

import sys
import unittest

import numpy as np
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, fast_cut as fc, match_cut as mc, recipe, steadiness, title_card, trend_edit as te  # noqa: E402

CUTS = {"continuity", "zoom-pairs", *te.BEAM_CUTS}
LINKS = {"similar", "contrast", "chronological", "rhythm"}


class FormatVocabularyTest(unittest.TestCase):
    def test_every_recipe_names_a_known_strategy(self):
        for name, spec in recipe.RECIPES.items():
            with self.subTest(recipe=name):
                f = te.fmt(spec)
                self.assertIn(f["cuts"], CUTS)
                self.assertIn(f["link"], LINKS)
                if f["cuts"] in te.BEAM_CUTS or f["cuts"] == "zoom-pairs":
                    self.assertTrue(spec["match"]["enabled"])  # 빔 · 원본 줌 포맷은 매치(순서 고르기)를 쓴다
                if (f.get("overlay") or {}).get("freezeLabel"):
                    self.assertTrue((f.get("primitives") or {}).get("freeze"))

    def test_formats_differ(self):
        seen = {(te.fmt(s)["cuts"], te.fmt(s)["link"], tuple(sorted((te.fmt(s).get("primitives") or {}).keys())),
                 s["frame"], s["audio"]["sourceGain"]) for s in recipe.RECIPES.values()}
        self.assertGreaterEqual(len(seen), 10)


class StrategyTest(unittest.TestCase):
    def test_beats_make_beat_multiples_and_spans_are_long(self):
        beats = tuple(range(0, 20000, 480))
        st = te._strategy("beats", beats, 300, 1200, {})
        self.assertEqual(st["lengths"], (480, 960))
        self.assertEqual(te._strategy("action-span", (), 1500, 3000, {})["lengths"], (1500, 2200, 3000))
        self.assertEqual(te._strategy("action-span", (), 1500, 3000, {})["peak_pos"], 0.5)
        self.assertTrue(te._strategy("steady", (), 1500, 2500, {})["steady"])
        self.assertEqual(te._strategy("motion-peaks", (), 500, 1000, {"lengthsMs": [600]})["lengths"], (600,))

    def test_chronological_only_moves_forward(self):
        cands = [fc.Candidate(snap, 0, 1500) for snap in range(5)]
        seq = fc.beam(cands, lambda i, j: 1.0 if j < i else 0.0, 6000,
                      allowed=lambda i, j: cands[j].snap > cands[i].snap, first=[0])
        self.assertEqual([cands[k].snap for k in seq], [0, 1, 2, 3])  # 가장 이른 스냅에서 시작해 앞으로만

    def test_contrast_likes_the_same_layout_with_a_changed_look(self):
        a = mc.ShotEnd(0.5, 0.5, 0.4, "static", (40.0, 5.0, 5.0), 0.4)
        changed = mc.ShotEnd(0.5, 0.5, 0.4, "static", (80.0, -20.0, 30.0), 0.8)
        same = mc.ShotEnd(0.5, 0.5, 0.4, "static", (40.0, 5.0, 5.0), 0.4)
        moved = mc.ShotEnd(0.1, 0.9, 0.9, "static", (80.0, -20.0, 30.0), 0.8)
        tags = {"objects:food"}
        self.assertGreater(mc.link_contrast(a, changed, tags, tags)["score"], mc.link_contrast(a, same, tags, tags)["score"])
        self.assertGreater(mc.link_contrast(a, changed, tags, tags)["score"], mc.link_contrast(a, moved, tags, tags)["score"])


class NoRepeatTest(unittest.TestCase):
    """같은 장면을 되풀이하지 않고 최소 길이를 채운다(2026-10-29 사용자 '같은 부분은 반복하지 말라')."""

    def test_short_cuts_grow_inside_their_own_snap(self):
        planned = [ct.PlannedCut(k, 1000, 2000, 1.0, None) for k in range(4)]  # 1초 × 4
        out = te.fill_without_repeats(planned, [6000] * 4, 15000)
        self.assertEqual([c.index for c in out], [0, 1, 2, 3])  # 컷을 더하지 않는다
        self.assertGreaterEqual(sum(c.out_ms for c in out), 15000)
        self.assertTrue(all(0 <= c.start_ms < c.end_ms <= 6000 for c in out))

    def test_it_stops_short_rather_than_repeating_when_the_source_runs_out(self):
        planned = [ct.PlannedCut(k, 0, 1000, 1.0, None) for k in range(3)]
        out = te.fill_without_repeats(planned, [2000, 2000, 2000], 15000)
        self.assertEqual(sum(c.out_ms for c in out), 6000)  # 원본 6초가 전부 — 15초를 위해 같은 장면을 다시 쓰지 않는다
        self.assertEqual(len(out), 3)

    def test_a_zoom_in_end_stays_and_the_cut_grows_backwards(self):
        out = te.fill_without_repeats([ct.PlannedCut(0, 3000, 4000, 1.0, None)], [5000], 2500, keep_end=[True])
        self.assertEqual((out[0].start_ms, out[0].end_ms), (1500, 4000))

    def test_beam_and_zoom_pair_formats_use_each_snap_once(self):
        # 빔 서치는 per_snap 1 로, 원본 줌 쌍은 스냅마다 첫 구간만 — 레시피의 perSnap 값은 없다
        self.assertFalse(any("perSnap" in r["match"] for r in recipe.RECIPES.values()))


class OnBeatTest(unittest.TestCase):
    """컷 고르기와 상관없이 경계를 박자에(MOV-28) — 찍힌 동작 · 원본 줌으로 이어지는 경계는 그 순간의 화면을 지킨다."""

    SPEC = {"continuity": {"shotMs": [700, 2500]}}
    BEATS = tuple(range(230, 60000, 484))

    def test_a_cover_seam_keeps_its_frames_and_only_its_time_moves(self):
        planned = [ct.PlannedCut(0, 500, 2100, 1.0, "cover"), ct.PlannedCut(1, 400, 1900, 1.0, None)]
        out = te.on_beat(planned, [3000, 3000], None, self.BEATS, self.SPEC)
        self.assertEqual(out[0].end_ms, 2100)  # 손이 렌즈를 덮는 프레임에서 끝난다
        self.assertEqual(out[1].start_ms, 400)  # 손이 걷히는 프레임에서 시작한다
        at = out[0].out_ms
        self.assertLessEqual(min(abs(b - at) for b in self.BEATS), 17)

    def test_a_real_zoom_link_is_kept_on_both_sides(self):
        planned = [ct.PlannedCut(0, 500, 2100, 1.0, None), ct.PlannedCut(1, 0, 1500, 1.0, None)]
        out = te.on_beat(planned, [3000, 3000], [{"real": True}], self.BEATS, self.SPEC)
        self.assertEqual((out[0].end_ms, out[1].start_ms), (2100, 0))


class TiedTest(unittest.TestCase):
    """흔들림 게이트가 옮기지 않을 컷 — 이음의 요점인 자리(trend-recipes §20)."""

    def test_seams_and_links_tie_both_sides(self):
        planned = [ct.PlannedCut(0, 0, 1000, 1.0, "cover"), ct.PlannedCut(1, 0, 1000, 1.0, None),
                   ct.PlannedCut(2, 0, 1000, 1.0, None), ct.PlannedCut(3, 0, 1000, 1.0, None), ct.PlannedCut(4, 0, 1000, 1.0, None)]
        links = [None, None, {"real": True}, None]
        seam, link = steadiness.SEAM, steadiness.LINK
        self.assertEqual(te._tied(planned, links), [seam, seam, link, link, None])
        self.assertEqual(te._tied(planned, None), [seam, seam, None, None, None])


class StabilizeOptInTest(unittest.TestCase):
    """손떨림 보정은 실험 — 운영 워커는 켜지 않고, 켜도 결과물 화면에서 확실히 나을 때만 쓴다(trend-recipes §21)."""

    def test_render_does_not_stabilize_unless_asked(self):
        import inspect

        self.assertIs(inspect.signature(te.render).parameters["stabilize"].default, False)

    def _keep(self, fixed_jitter: float):
        from unittest.mock import patch

        planned = [ct.PlannedCut(0, 0, 1500, 1.0, None)]
        originals = [te.editor.ClipSource("src.mp4", 0, 1500)]
        prepared, stabilized = ["fixed.mp4"], {0: "stab.mp4"}
        jitter = {"fixed.mp4": fixed_jitter, "orig/prep_0.mp4": 3.0}
        with patch.object(te.editor, "prepare_segments", return_value=["orig/prep_0.mp4"]), \
                patch.object(te.os, "makedirs"), \
                patch.object(te.steadiness, "read", side_effect=lambda p: steadiness.Steadiness(
                    np.full(15, jitter[p]), np.ones(15))):
            te._keep_steadier(prepared, stabilized, originals, planned, [None], [""], None, {"audio": {"sourceGain": 0}}, "w")
        return prepared, stabilized

    def test_the_original_wins_when_the_fix_is_not_clearly_steadier_on_screen(self):
        self.assertEqual(self._keep(2.8), (["orig/prep_0.mp4"], {}))  # 3.0 → 2.8 은 20% 가 못 된다
        self.assertEqual(self._keep(1.0), (["fixed.mp4"], {0: "stab.mp4"}))


class TalkingTest(unittest.TestCase):
    """말하는 컷의 발화 구간(trend-recipes §24) — 원본 소리를 이미 다 쓰는 레시피는 따로 살리지 않는다."""

    def test_music_only_recipes_get_the_speech_windows(self):
        from unittest.mock import patch

        snaps = [te.Snap("a.mp4", {}), te.Snap("b.mp4", {})]
        planned = [ct.PlannedCut(0, 0, 1000, 1.0, None), ct.PlannedCut(1, 0, 1000, 1.0, None)]
        spans = {"a.mp4": (), "b.mp4": ((100, 900),)}
        with patch.object(te.snap_signals, "speech_spans", side_effect=lambda p: spans[p]):
            self.assertEqual(te._talking(snaps, planned, {"audio": {"sourceGain": 0.0}}), [(1100, 1900)])
            self.assertEqual(te._talking(snaps, planned, {"audio": {"sourceGain": 1.0}}), [])  # ASMR · 말소리 브이로그

    def test_a_failed_detection_falls_back_to_music_only(self):
        from unittest.mock import patch

        with patch.object(te.snap_signals, "speech_spans", side_effect=RuntimeError("decode")):
            self.assertEqual(te._talking([te.Snap("a.mp4", {})], [ct.PlannedCut(0, 0, 1000, 1.0, None)], {"audio": {"sourceGain": 0.0}}), [])


class PrimitiveTest(unittest.TestCase):
    def test_ramp_and_freeze_change_the_output_length(self):
        plain = ct.PlannedCut(0, 0, 3000, 1.0, None)
        ramped = ct.PlannedCut(0, 0, 3000, 1.0, None, ramp=2.5)
        frozen = ct.PlannedCut(0, 0, 1000, 1.0, None, hold_ms=500, hold_at_ms=400)
        self.assertEqual(plain.out_ms, 3000)
        self.assertEqual(ramped.out_ms, round(900 + 1200 / 2.5 + 900))
        self.assertEqual(frozen.out_ms, 1500)


class OverlayTest(unittest.TestCase):
    def test_timestamps_follow_the_capture_time(self):
        self.assertEqual(title_card.stamp_text(datetime(2026, 10, 22, 9, 5)), "AM 9:05")
        self.assertEqual(title_card.stamp_text(datetime(2026, 10, 22, 0, 30)), "AM 12:30")
        self.assertEqual(title_card.stamp_text(datetime(2026, 10, 22, 18, 40)), "PM 6:40")
        lines = title_card.timestamps([(0, 1000), (1000, 2000)], [datetime(2026, 10, 22, 13, 2), None])
        self.assertEqual(len(lines), 1)  # 시각을 모르는 컷은 비운다
        self.assertIn("PM 1:02", lines[0])

    def test_freeze_labels_show_while_frozen(self):
        line, = title_card.freeze_labels([(1200, 500, "바삭!")])
        self.assertIn("바삭!", line)
        self.assertIn("0:00:01.20", line)
        self.assertIn("0:00:01.70", line)


if __name__ == "__main__":
    unittest.main()
