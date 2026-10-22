"""컷 효과의 계약 — 이음이 있는 경계는 그대로, 나머지에 전환 효과(비율 · 무게 · 연달아 같은 것 피하기), 화면 분할의 조건,
줌 · punch 의 박자, 필터 문자열, 같은 시드면 같은 결과.

ffmpeg 없이 도는 순수 검사다. 실제로 굽히는지는 `test_ffmpeg_contract.py` 의 `CutFxContract`.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, cut_fx, recipe  # noqa: E402
from pipeline.render_spec import DEFAULT_RENDER_SPEC  # noqa: E402

MONTAGE = recipe.get("trend-montage").spec


def cuts(n: int, out_ms: int = 800, seams: dict | None = None) -> list[ct.PlannedCut]:
    seams = seams or {}
    return [ct.PlannedCut(i, 0, out_ms, 1.0, seams.get(i)) for i in range(n)]


def spec(**over) -> dict:
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in MONTAGE.items()}
    for key, value in over.items():
        out[key] = {**out[key], **value} if isinstance(value, dict) else value
    return out


class PlanTest(unittest.TestCase):
    def test_natural_seams_stay_hardcuts(self):
        p = cut_fx.plan(cuts(6, seams={1: "cover", 3: "whip"}), (), spec(transitions={"rate": 1.0}, split={"everyCuts": None}), 7)
        self.assertEqual(p.boundaries[1], "hardcut")
        self.assertEqual(p.boundaries[3], "hardcut")
        self.assertTrue(all(b not in ("hardcut", "inside") for i, b in enumerate(p.boundaries) if i not in (1, 3)))

    def test_rate_zero_means_no_effects_and_the_same_seed_the_same_plan(self):
        self.assertEqual(set(cut_fx.plan(cuts(8), (), recipe.get("classic").spec, 1).boundaries), {"hardcut"})
        a = cut_fx.plan(cuts(12), (0, 500, 1000, 1500), MONTAGE, 42)
        b = cut_fx.plan(cuts(12), (0, 500, 1000, 1500), MONTAGE, 42)
        self.assertEqual((a.boundaries, a.cuts, a.splits), (b.boundaries, b.cuts, b.splits))

    def test_the_same_effect_does_not_repeat_back_to_back(self):
        p = cut_fx.plan(cuts(30), (), spec(transitions={"rate": 1.0}, split={"everyCuts": None}), 3)
        effects = [b for b in p.boundaries if b != "hardcut"]
        self.assertTrue(all(x != y for x, y in zip(effects, effects[1:])))

    def test_edge_effects_are_baked_on_both_sides(self):
        p = cut_fx.plan(cuts(10), (), spec(transitions={"rate": 1.0, "palette": {"whip": 1, "spin": 1}}, split={"everyCuts": None}), 5)
        for b, kind in enumerate(p.boundaries):
            self.assertEqual((p.cuts[b].outro, p.cuts[b + 1].intro), (kind, kind))

    def test_vocabulary_effects_are_baked_into_cuts_too(self):
        p = cut_fx.plan(cuts(6), (), spec(transitions={"rate": 1.0, "palette": {"flash": 1}}, split={"everyCuts": None}), 5)
        self.assertEqual(set(p.boundaries), {"flash"})
        self.assertTrue(all(c.outro == "flash" for c in p.cuts[:-1]) and all(c.intro == "flash" for c in p.cuts[1:]))

    def test_splits_take_short_runs_without_natural_seams_and_not_the_first_cut(self):
        p = cut_fx.plan(cuts(12), (), spec(split={"everyCuts": 3, "sizes": [2]}), 9)
        self.assertTrue(p.splits)
        for a, z in p.splits:
            self.assertGreater(a, 0)
            self.assertEqual(z - a, 2)
            self.assertEqual(p.boundaries[a], "inside")
        long_cuts = cut_fx.plan(cuts(12, out_ms=3000), (), spec(split={"everyCuts": 3, "sizes": [2]}), 9)
        self.assertEqual(long_cuts.splits, [])
        seamed = cut_fx.plan(cuts(4, seams={1: "cover", 2: "cover"}), (), spec(split={"everyCuts": 1, "sizes": [2]}), 9)
        self.assertTrue(all(not (a <= 1 < z - 1) and not (a <= 2 < z - 1) for a, z in seamed.splits))

    def test_units_cover_every_cut_once(self):
        p = cut_fx.plan(cuts(14), (), spec(split={"everyCuts": 3, "sizes": [2, 3]}), 11)
        covered = [k for a, z in p.units() for k in range(a, z)]
        self.assertEqual(covered, list(range(14)))

    def test_punch_lands_on_a_beat_inside_the_cut(self):
        p = cut_fx.plan(cuts(4, out_ms=1000), (0, 500, 1500, 2600, 3500), spec(zoom={"rate": 1.0, "kinds": ["punch"]},
                                                                           transitions={"rate": 0.0}, split={"everyCuts": None}), 2)
        self.assertEqual([c.zoom for c in p.cuts], ["punch", "punch", "punch", "punch"])
        self.assertEqual([c.punch_ms for c in p.cuts], [500, 500, 600, 500])

    def test_alternating_zoom_goes_in_then_out(self):
        p = cut_fx.plan(cuts(5), (), recipe.get("cinematic").spec, 4)
        self.assertEqual([c.zoom for c in p.cuts], ["push", "pull", "push", "pull", "push"])
        self.assertEqual({c.zoom_range for c in p.cuts}, {0.18})
        self.assertEqual(set(p.boundaries), {"hardcut"})

    def test_letterbox_on_band_sized_cuts_only_adds_the_bars(self):
        band = cut_fx.band_spec(DEFAULT_RENDER_SPEC)
        self.assertEqual((band.width, band.height), (1080, 608))
        vf = cut_fx.video_filter(cut_fx.CutFx(zoom="push"), 1.0, band, None, "letterbox", DEFAULT_RENDER_SPEC)
        self.assertIn("s=1080x608", vf)  # 줌은 띠 크기에서
        self.assertNotIn("crop=1080:608", vf)
        self.assertIn("pad=1080:1920:0:(1920-608)/2:color=black", vf)

    def test_unknown_effect_is_refused(self):
        with self.assertRaises(cut_fx.CutFxError):
            cut_fx.validate(spec(transitions={"palette": {"cube": 1}}))


class FilterTest(unittest.TestCase):
    def test_nothing_to_do_is_none(self):
        self.assertIsNone(cut_fx.video_filter(cut_fx.CutFx(), 1.0, DEFAULT_RENDER_SPEC, None))

    def test_each_effect_builds_its_filter(self):
        expect = {"whip": "avgblur", "zoom": "gblur", "spin": "rotate", "glitch": "rgbashift", "shake": "zoompan"}
        for kind, needle in expect.items():
            with self.subTest(kind=kind):
                vf = cut_fx.video_filter(cut_fx.CutFx(outro=kind, intro=kind), 1.2, DEFAULT_RENDER_SPEC, None)
                self.assertIn(needle, vf)
                self.assertTrue(vf.endswith("format=yuv420p"))

    def test_vocabulary_effects_keep_the_vocabulary_shape(self):
        flash = cut_fx.video_filter(cut_fx.CutFx(outro="flash"), 1.0, DEFAULT_RENDER_SPEC, None)
        self.assertIn("fade=t=out:st=0.900:d=0.100:color=#FFFFFF", flash)  # 200ms 의 절반씩
        dip = cut_fx.video_filter(cut_fx.CutFx(intro="dip"), 1.0, DEFAULT_RENDER_SPEC, None)
        self.assertIn("fade=t=in:st=0:d=0.200:color=#000000", dip)
        punch = cut_fx.video_filter(cut_fx.CutFx(intro="zoompunch"), 1.0, DEFAULT_RENDER_SPEC, None)
        self.assertIn("1+0.08*pow(1-clip(it/0.300", punch)  # 들어오는 쪽만, 300ms 에 1.08 → 1
        self.assertIsNone(cut_fx.video_filter(cut_fx.CutFx(outro="zoompunch"), 1.0, DEFAULT_RENDER_SPEC, None))

    def test_split_edges_and_look_go_on_the_whole_split(self):
        graph, _ = cut_fx.split_graph([0.8, 0.8], DEFAULT_RENDER_SPEC, "mono", cut_fx.CutFx(intro="flash"))
        self.assertIn("fade=t=in", graph)
        self.assertIn("hue=s=0", graph)

    def test_letterbox_keeps_a_16_9_band_after_the_look(self):
        vf = cut_fx.video_filter(cut_fx.CutFx(), 1.0, DEFAULT_RENDER_SPEC, "soft", "letterbox")
        self.assertIn("crop=1080:608:", vf)
        self.assertIn("pad=1080:1920:0:(1920-608)/2:color=black", vf)
        self.assertLess(vf.index("eq="), vf.index("crop=1080:608"))  # 색 필터가 띠에 먼저 — 검은 띠는 검게
        with self.assertRaises(cut_fx.CutFxError):
            cut_fx.video_filter(cut_fx.CutFx(), 1.0, DEFAULT_RENDER_SPEC, None, "circle")

    def test_letterbox_split_stacks_bands_on_black(self):
        graph, total = cut_fx.split_graph([0.8, 0.8], DEFAULT_RENDER_SPEC, None, band=608)
        self.assertIn("color=c=black", graph)
        self.assertNotIn("crop=1080", graph)  # 칸은 띠 그대로
        center = (1920 - 608) // 2  # 첫 칸은 원래 띠 자리 — 타이틀이 걸린 띠가 움직이지 않는다
        self.assertIn(f"y={center}:", graph)
        self.assertIn(f"y={center + 608 + cut_fx.SPLIT_GAP_PX}:", graph)  # 둘째 칸은 아래에서 열린다

    def test_zoom_and_look_go_in_the_same_pass(self):
        vf = cut_fx.video_filter(cut_fx.CutFx(zoom="push"), 2.0, DEFAULT_RENDER_SPEC, "film")
        self.assertIn("zoompan", vf)
        self.assertIn("vignette", vf)

    def test_edge_window_is_at_most_a_third_of_the_cut(self):
        self.assertAlmostEqual(cut_fx._edge_window("spin", 0.45), 0.15)
        self.assertAlmostEqual(cut_fx._edge_window("whip", 3.0), 0.16)

    def test_split_lasts_the_sum_of_its_panels(self):
        graph, total = cut_fx.split_graph([0.8, 0.7, 0.9], DEFAULT_RENDER_SPEC, None)
        self.assertAlmostEqual(total, 2.4)
        self.assertEqual(graph.count("overlay="), 3)
        self.assertIn("concat=n=3:v=0:a=1[a]", graph)

    def test_panels_play_on_and_hold_only_when_the_source_runs_out(self):
        durations = [0.8, 0.8]
        offsets = cut_fx.split_offsets(durations)
        self.assertEqual(offsets, [0.0, 0.4])
        frozen, _ = cut_fx.split_graph(durations, DEFAULT_RENDER_SPEC, None)
        self.assertIn("stop_duration=0.800", frozen)  # 늘리지 않으면 첫 칸이 0.8초 멈춘다
        moving, _ = cut_fx.split_graph(durations, DEFAULT_RENDER_SPEC, None, lengths=[1.6, 1.2])
        self.assertEqual(moving.count("stop_duration=0.000"), 2)  # 분할이 끝날 때까지 원본이 움직인다
        self.assertIn("atrim=0:0.800", moving)  # 소리는 칸 길이만큼만 차례로

    def test_last_split_closes_to_black(self):
        graph, _ = cut_fx.split_graph([0.8, 0.8], DEFAULT_RENDER_SPEC, None, fade_out=0.5)
        self.assertIn("fade=t=out:st=1.100:d=0.500", graph)


if __name__ == "__main__":
    unittest.main()
