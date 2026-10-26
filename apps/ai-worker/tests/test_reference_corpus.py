"""레퍼런스 말뭉치의 계약 — 시트 행 검증, 레시피로 표현 못 하는 축(misfits), 커버리지 · best 선택, 결정적 군집화, 지문, 리포트 모양,
init 의 저장소 안 경로 거부.

특징 문서는 합성 dict 로 만든다(ffmpeg 없이).
"""

import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import recipe, reference_corpus as rc  # noqa: E402

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "reference-corpus.py"


def load_script():
    spec = importlib.util.spec_from_file_location("reference_corpus_cli", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def doc(vid="a", platform="instagram", median=800, cuts=20, whips=0, on_beat=None, speech=False, letterbox=False,
        motions=()):
    """특징 문서 한 편 — 20초, 컷 cuts 개, 경계 움직임 쌍 motions."""
    bounds = [{"at_ms": 0, "prev_end": {"motion": a}, "next_start": {"motion": b}, "link": {"layout": 0.8, "color": 0.6}}
              for a, b in motions]
    reading = {"duration_ms": 20000, "cuts_ms": list(range(500, 500 * (cuts + 1), 500)), "shot_median_ms": median,
               "shot_p20_ms": int(median * 0.8), "shot_p80_ms": int(median * 1.3), "covers": 0, "whips": whips,
               "bpm": 100.0 if on_beat is not None else None, "on_beat_ratio": on_beat, "speech": speech, "suggestion": "x"}
    return {"id": vid, "platform": platform, "featureVersion": rc.CORPUS_FEATURE_VERSION, "reading": reading,
            "letterbox": letterbox, "boundaries": bounds}


def spec(shot=(500, 1000), beat=False, frame=None, gain=0.0, rate=0.0, palette=None):
    return {"continuity": {"shotMs": list(shot), "beatSnap": beat}, "frame": frame, "audio": {"sourceGain": gain},
            "transitions": {"rate": rate, "palette": palette or {}}}


def raw_row(**over):
    base = {"id": "ig_001", "platform": "instagram", "capture": "screen", "url": "https://www.instagram.com/reel/x",
            "uploaded_at": "2026-10-01", "views": "1,234,000", "format_label": "", "crop_top": "0.08", "crop_bottom": ""}
    return {**base, **over}


class ParseRowTest(unittest.TestCase):
    def test_a_good_row(self):
        row = rc.parse_row(raw_row())
        self.assertIsInstance(row, rc.Row)
        self.assertEqual(row.views, 1234000)
        self.assertEqual(row.crop_top, 0.08)
        self.assertIsNone(row.crop_bottom)
        self.assertIsNone(row.format_label)

    def test_platform_and_capture_are_enums(self):
        self.assertIn("platform", rc.parse_row(raw_row(platform="facebook")))
        self.assertIn("capture", rc.parse_row(raw_row(capture="")))

    def test_crop_is_a_share_up_to_0_4(self):
        self.assertIn("crop_top", rc.parse_row(raw_row(crop_top="0.5")))
        self.assertIn("crop_bottom", rc.parse_row(raw_row(crop_bottom="-0.1")))
        self.assertIn("trim_end_s", rc.parse_row(raw_row(trim_end_s="abc")))

    def test_unsafe_ids_are_refused(self):
        for bad in ("", "../etc", "a b", "a/b", ".hidden", "x" * 65):
            self.assertIn("id", rc.parse_row(raw_row(id=bad)), bad)

    def test_format_label_is_a_recipe_unknown_or_blank(self):
        self.assertEqual(rc.parse_row(raw_row(format_label="unknown")).format_label, "unknown")
        self.assertEqual(rc.parse_row(raw_row(format_label="cinematic")).format_label, "cinematic")
        self.assertIn("format_label", rc.parse_row(raw_row(format_label="vlog-ish")))
        self.assertIn("uploaded_at", rc.parse_row(raw_row(uploaded_at="어제")))


class MisfitsTest(unittest.TestCase):
    def test_shot_allows_15_percent_outside_the_range(self):
        self.assertEqual(rc.misfits(doc(median=1100), spec()), [])
        self.assertEqual(rc.misfits(doc(median=1200), spec()), ["shot"])
        self.assertEqual(rc.misfits(doc(median=400), spec()), ["shot"])

    def test_beat(self):
        self.assertEqual(rc.misfits(doc(on_beat=0.3), spec(beat=True)), ["beat"])
        self.assertEqual(rc.misfits(doc(on_beat=0.9), spec(beat=False)), ["beat"])
        self.assertEqual(rc.misfits(doc(on_beat=None), spec(beat=True)), [])  # 못 쟀으면 판정하지 않는다

    def test_frame(self):
        self.assertEqual(rc.misfits(doc(letterbox=True), spec()), ["frame"])
        self.assertEqual(rc.misfits(doc(letterbox=False), spec(frame="letterbox")), ["frame"])
        self.assertEqual(rc.misfits(doc(letterbox=True), spec(frame="letterbox")), [])

    def test_speech(self):
        self.assertEqual(rc.misfits(doc(speech=True), spec(gain=0.0)), ["speech"])
        self.assertEqual(rc.misfits(doc(speech=True), spec(gain=0.35)), [])
        self.assertEqual(rc.misfits(doc(speech=None), spec(gain=0.0)), [])

    def test_whip(self):
        whippy = doc(whips=3)  # 3/20 = 0.15
        self.assertEqual(rc.misfits(whippy, spec()), ["whip"])
        self.assertEqual(rc.misfits(whippy, spec(rate=0.0, palette={"whip": 1})), ["whip"])  # 0.15 > 0 + 0.1
        self.assertEqual(rc.misfits(whippy, spec(rate=0.1, palette={"whip": 1})), [])
        self.assertEqual(rc.misfits(doc(whips=1), spec()), [])  # 0.05 는 따지지 않는다


RECIPES = {"classic": spec(shot=(800, 800)), "wide": spec(shot=(500, 1500)), "tight": spec(shot=(600, 1000))}


class CoverageTest(unittest.TestCase):

    def test_best_is_fewest_misfits_then_nearest_center_and_never_classic(self):
        self.assertEqual(rc.best_fit(doc(median=800), RECIPES), ("tight", []))
        self.assertEqual(rc.best_fit(doc(median=1400), RECIPES), ("wide", []))
        self.assertEqual(rc.best_fit(doc(median=800, letterbox=True), RECIPES), ("tight", ["frame"]))

    def test_ratios_overall_and_by_platform(self):
        docs = [doc("a", "instagram"), doc("b", "tiktok"), doc("c", "tiktok", letterbox=True)]
        cov = rc.coverage(docs, RECIPES)
        self.assertEqual((cov["n"], cov["covered"], cov["ratio"]), (3, 2, 0.667))
        self.assertEqual(cov["byPlatform"]["tiktok"], {"n": 2, "covered": 1, "ratio": 0.5})
        self.assertEqual(cov["byPlatform"]["instagram"]["ratio"], 1.0)
        self.assertEqual(cov["axisFailures"]["frame"], 1)
        self.assertEqual([v["covered"] for v in cov["videos"]], [True, True, False])


class FingerprintTest(unittest.TestCase):
    def test_no_boundaries_is_zero(self):
        fp = rc.fingerprint(doc())
        self.assertEqual(tuple(fp), rc.FINGERPRINT_KEYS)
        self.assertEqual([fp[k] for k in (*rc.PAIR_KINDS, "link_layout", "link_color")], [0.0] * 6)
        self.assertEqual((fp["on_beat_ratio"], fp["has_beat"]), (0.0, 0.0))

    def test_motion_pairs_and_links(self):
        fp = rc.fingerprint(doc(on_beat=0.7, motions=[("zoom_in", "zoom_out"), ("pan_left", "pan_left"),
                                                      ("static", "static"), ("pan_left", "pan_right")]))
        self.assertEqual([fp[k] for k in rc.PAIR_KINDS], [0.25, 0.25, 0.25, 0.25])
        self.assertAlmostEqual(fp["link_layout"], 0.8)
        self.assertEqual((fp["on_beat_ratio"], fp["has_beat"]), (0.7, 1.0))
        self.assertAlmostEqual(fp["cuts_per_s"], 1.0)


class ClusterTest(unittest.TestCase):
    def blobs(self) -> np.ndarray:
        rng = np.random.default_rng(7)
        return np.vstack([rng.normal(0, 0.1, (10, 3)), rng.normal(5, 0.1, (10, 3))])

    def test_two_clear_blobs_become_two_clusters(self):
        found = rc.cluster(self.blobs())
        self.assertEqual(found.k, 2)
        self.assertEqual(len(set(found.labels[:10])), 1)
        self.assertEqual(len(set(found.labels[10:])), 1)
        self.assertNotEqual(found.labels[0], found.labels[10])
        self.assertGreater(found.silhouette, 0.8)

    def test_deterministic(self):
        x = np.random.default_rng(3).normal(0, 1, (30, 4))
        self.assertEqual(rc.cluster(x, seed=1), rc.cluster(x, seed=1))

    def test_too_few_points_is_one_cluster(self):
        self.assertEqual(rc.cluster([[0.0], [1.0], [2.0]]).labels, [0, 0, 0])
        self.assertEqual(rc.cluster([]).k, 0)


class ReportTest(unittest.TestCase):
    def test_shape(self):
        docs = [doc(f"s{i}", median=500 + i * 10, on_beat=0.9) for i in range(5)]
        docs += [doc(f"l{i}", "tiktok", median=2600 + i * 20, letterbox=True, whips=4) for i in range(5)]
        rows = [rc.parse_row(raw_row(id="s0", format_label="beat-sync")), rc.parse_row(raw_row(id="s1", format_label="unknown"))]
        out = rc.report(docs, rows, recipe.RECIPES)
        self.assertEqual(set(out), {"featureVersions", "oneTake", "coverage", "labelAgreement", "clustering", "clusters"})
        self.assertEqual(out["labelAgreement"]["n"], 1)  # unknown 은 빼고
        self.assertEqual(sum(c["size"] for c in out["clusters"]), 10)
        self.assertEqual(out["clustering"]["k"], 2)
        boxed = next(c for c in out["clusters"] if "l0" in c["ids"])
        self.assertEqual(boxed["platforms"], {"tiktok": 5})
        self.assertEqual(boxed["draft"]["spec"]["frame"], "letterbox")
        self.assertEqual(set(boxed["draft"]["spec"]), set(recipe.get(boxed["draft"]["base"]).spec))

    def test_one_take_videos_are_left_out(self):
        docs = [doc(f"e{i}", median=800 + i * 10) for i in range(4)] + [doc("one", median=20000, cuts=0), doc("two", cuts=2)]
        out = rc.report(docs, [], recipe.RECIPES)
        self.assertEqual(out["oneTake"], ["one", "two"])
        self.assertEqual(out["coverage"]["n"], 4)
        self.assertEqual(sum(c["size"] for c in out["clusters"]), 4)

    def test_fixed_k(self):
        docs = [doc(f"v{i}", median=500 + i * 300) for i in range(6)]
        self.assertEqual(rc.report(docs, [], recipe.RECIPES, k=3)["clustering"]["k"], 3)


class InitTest(unittest.TestCase):
    def test_creates_the_layout_outside_a_repo(self):
        cli = load_script()
        with tempfile.TemporaryDirectory() as tmp:
            root = cli.init(Path(tmp) / "corpus")
            self.assertTrue((root / "videos").is_dir() and (root / "features").is_dir())
            with (root / "sheet.csv").open(encoding="utf-8") as f:
                self.assertEqual(next(csv.reader(f)), list(rc.SHEET_COLUMNS))

    def test_refuses_a_directory_inside_a_git_repo(self):
        cli = load_script()
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".git").mkdir()
            with self.assertRaises(cli.CorpusError):
                cli.init(Path(tmp) / "nested" / "corpus")
            self.assertFalse((Path(tmp) / "nested").exists())
        inside = Path(__file__).resolve().parents[1] / "corpus-should-not-exist"
        with self.assertRaises(cli.CorpusError):
            cli.init(inside)
        self.assertFalse(inside.exists())


if __name__ == "__main__":
    unittest.main()
