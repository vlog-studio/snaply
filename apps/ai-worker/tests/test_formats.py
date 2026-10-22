"""포맷(전략 묶음)의 계약 — 레시피마다 컷 선택 · 연결 기준이 엔진이 아는 이름이고, 전략이 후보 길이를 정하며(박자 배수 · 동작 전체 ·
안정 구간), 촬영 순서 제약 · before/after 점수 · 스피드램프 · 프리즈 길이 계산 · 타임스탬프 · 프리즈 라벨이 맞다.

ffmpeg 없이 도는 순수 검사다. 실제 렌더(램프 · 프리즈 길이)는 `test_ffmpeg_contract.py` 의 `FormatContract`.
"""

import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, fast_cut as fc, match_cut as mc, recipe, title_card, trend_edit as te  # noqa: E402

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
