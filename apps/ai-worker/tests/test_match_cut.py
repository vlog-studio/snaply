"""매치컷의 계약 — 피사체 찾기(눈에 띄는 영역), 카메라 움직임(줌 인 · 아웃 · 팬), 연결 점수, 점수 위주 순서, 매치 줌 필터.

프레임은 numpy 로 만든다(ffmpeg 없이). 움직임은 opencv 가 있을 때만.
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import continuity as ct, cut_fx, match_cut as mc, recipe  # noqa: E402
from pipeline.render_spec import DEFAULT_RENDER_SPEC  # noqa: E402

try:
    import cv2  # noqa: F401
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

W, H = 90, 160


def scene(cx: float, cy: float, r: float, color=(220, 60, 40), bg=(120, 120, 120)) -> np.ndarray:
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = bg
    yy, xx = np.mgrid[0:H, 0:W]
    img[((xx - cx * W) ** 2 + (yy - cy * H) ** 2) < (r * W) ** 2] = color
    return img


def textured(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    base = rng.integers(0, 255, (H // 4, W // 4, 3), dtype=np.uint8)
    return np.kron(base, np.ones((4, 4, 1), np.uint8))


def zoom_seq(img: np.ndarray, scales) -> np.ndarray:
    import cv2
    out = []
    for s in scales:
        m = cv2.getRotationMatrix2D((W / 2, H / 2), 0, s)
        out.append(cv2.warpAffine(img, m, (W, H), borderMode=cv2.BORDER_REFLECT))
    return np.stack(out)


def end(cx=0.5, cy=0.5, size=0.3, motion="static", lab=(50.0, 0.0, 0.0)) -> mc.ShotEnd:
    return mc.ShotEnd(cx, cy, size, motion, lab, lab[0] / 100)


class SubjectTest(unittest.TestCase):
    def test_a_bright_object_is_the_subject(self):
        cx, cy, size = mc.subject(scene(0.7, 0.35, 0.15))
        self.assertAlmostEqual(cx, 0.7, delta=0.08)
        self.assertAlmostEqual(cy, 0.35, delta=0.08)
        self.assertLess(size, 0.6)

    def test_a_flat_frame_has_its_subject_in_the_middle(self):
        """검은 프레임 · 단색 — 눈에 띄는 곳이 없어도 멈추지 않는다(2026-10-26 레퍼런스의 검은 컷에서 ZeroDivisionError)."""
        self.assertEqual(mc.subject(np.zeros((H, W, 3), np.uint8)), (0.5, 0.5, 0.5))

    def test_focus_zoom_fills_and_is_bounded(self):
        self.assertAlmostEqual(mc.focus_zoom(0.3, 0.5), 0.5 / 0.3)
        self.assertEqual(mc.focus_zoom(0.9, 0.5), mc.ZOOM_RANGE[0])
        self.assertEqual(mc.focus_zoom(0.05, 0.5), mc.ZOOM_RANGE[1])

    def test_read_size_keeps_the_segment_shape(self):
        self.assertEqual(mc.read_size(1080, 608), (160, 90))
        self.assertEqual(mc.read_size(1080, 1920), (90, 160))


@unittest.skipUnless(HAS_CV2, "opencv 없음")
class MotionTest(unittest.TestCase):
    def test_zoom_in_out_and_static(self):
        img = textured(3)
        self.assertEqual(mc.motion_of(zoom_seq(img, [1.0, 1.06, 1.12, 1.18])), "zoom_in")
        self.assertEqual(mc.motion_of(zoom_seq(img, [1.18, 1.12, 1.06, 1.0])), "zoom_out")
        self.assertEqual(mc.motion_of(np.stack([img] * 4)), "static")


@unittest.skipUnless(HAS_CV2, "opencv 없음")
class ZoomRunTest(unittest.TestCase):
    def series_of(self, scales):
        import cv2
        base = (textured(5)[..., 0].astype(np.float32) / 255)
        frames = []
        for sc in scales:
            m = cv2.getRotationMatrix2D((W / 2, H / 2), 0, sc)
            frames.append(cv2.resize(cv2.warpAffine(base, m, (W, H), borderMode=cv2.BORDER_REFLECT), (ct.THUMB_W, ct.THUMB_H)))
        return ct.series_of(np.stack(frames))

    def test_runs_and_one_out_then_in_per_cut(self):
        # 0.6초 정지 · 0.8초 줌 아웃 · 0.8초 줌 인 · 0.8초 줌 아웃 · 0.8초 줌 인
        scales = [1.3] * 6
        for a, b in ((1.3, 1.0), (1.0, 1.3), (1.3, 1.0), (1.0, 1.3)):
            scales += list(np.linspace(a, b, 8))
        s = self.series_of(scales)
        runs = mc.zoom_runs(mc.zoom_track(s))
        self.assertEqual([r[0] for r in runs], ["zoom_out", "zoom_in", "zoom_out", "zoom_in"])
        windows = mc.motion_windows(s, runs, 700, 2500)
        self.assertEqual(len(windows), 2)  # 줌 아웃 → 줌 인 한 쌍씩, 겹치지 않게
        for w in windows:
            self.assertTrue(w.starts_out and w.ends_in)
            inside = [r for r in runs if w.start_ms <= r[1] and r[2] <= w.end_ms]
            self.assertEqual([r[0] for r in inside], ["zoom_out", "zoom_in"])  # 되풀이를 담지 않는다

    def test_no_zoom_falls_back_to_the_steadiest_window(self):
        s = self.series_of([1.0] * 40)
        w, = mc.motion_windows(s, mc.zoom_runs(mc.zoom_track(s)), 700, 2500)
        self.assertFalse(w.starts_out or w.ends_in)
        self.assertEqual(w.end_ms - w.start_ms, 1500)
        longer, = mc.motion_windows(s, mc.zoom_runs(mc.zoom_track(s)), 700, 2500, target=5000)
        self.assertEqual(longer.end_ms - longer.start_ms, 2500)  # 최소 길이 몫을 따르되 hi 까지


class LinkTest(unittest.TestCase):
    def test_same_food_same_layout_scores_higher_than_a_different_scene(self):
        food = {"objects": ["떡볶이", "종이컵"]}
        food2 = {"objects": ["디저트", "종이컵"]}
        street = {"places": ["도심 거리"]}
        a = end(0.5, 0.45, 0.4, "zoom_in", (60, 20, 30))
        near = mc.link(a, end(0.52, 0.47, 0.38, "zoom_out", (62, 18, 28)), mc.tags_of(food), mc.tags_of(food2))
        far = mc.link(a, end(0.15, 0.85, 0.9, "pan_left", (20, -10, -20)), mc.tags_of(food), mc.tags_of(street))
        self.assertGreater(near["score"], far["score"])
        self.assertEqual(near["motion"], 1.0)  # 줌 인 → 줌 아웃
        self.assertTrue(0 <= far["score"] <= 1)

    def test_order_follows_the_scores_not_the_input_order(self):
        s = np.full((4, 4), 0.1)
        s[0][2], s[2][1], s[1][3] = 0.9, 0.9, 0.9  # 0 → 2 → 1 → 3 이 가장 잘 이어진다
        self.assertEqual(mc.order(s), [0, 2, 1, 3])
        self.assertEqual(mc.order(s), mc.order(s.copy()))


class OntologyTest(unittest.TestCase):
    def test_concepts_meet_at_their_common_ancestor(self):
        self.assertEqual(mc.concept_similarity("objects:cake", "objects:cake"), 1.0)
        self.assertAlmostEqual(mc.concept_similarity("objects:cake", "objects:bread"), 1 / 3)  # cake → dessert → food · bread → food
        self.assertAlmostEqual(mc.concept_similarity("objects:cake", "objects:dessert"), 2 / 3)
        self.assertEqual(mc.concept_similarity("objects:cake", "objects:chair"), 0.0)
        self.assertEqual(mc.concept_similarity("objects:cake", "places:cafe"), 0.0)

    def test_tag_similarity_mixes_the_hierarchy_and_free_words(self):
        cake, bread = {"objects:cake", "w:케이크"}, {"objects:bread", "w:빵"}
        self.assertGreater(mc.tag_similarity(cake, bread), mc.tag_similarity(cake, {"objects:chair"}))
        self.assertAlmostEqual(mc.tag_similarity({"w:꼬치"}, {"w:꼬치"}), 0.3)  # 사전 밖 낱말도 버리지 않는다

    def test_motion_rules_are_soft_scores_from_the_vocabulary(self):
        self.assertEqual(mc.motion_score("zoom_in", "zoom_out"), 1.0)
        self.assertLess(mc.motion_score("pan_left", "pan_right"), 0)  # 어색한 조합만 뺀다
        self.assertEqual(mc.motion_score("static", "zoom_in"), mc.MOTION_LINKS["default"])
        for link in mc.MOTION_LINKS["links"]:
            self.assertIn(link["from"], mc.MOTION_LINKS["motions"])
            self.assertIn(link["to"], mc.MOTION_LINKS["motions"])

    def test_sampled_order_is_seeded_and_still_good(self):
        rng = np.random.default_rng(1)
        s = rng.random((7, 7)) * 0.3
        for a, b in ((0, 3), (3, 1), (1, 5), (5, 2), (2, 6), (6, 4)):
            s[a][b] = 0.95
        best = mc.order(s)
        sampled = mc.order(s, temperature=0.2, explore=0.15, seed=7)
        self.assertEqual(sampled, mc.order(s, temperature=0.2, explore=0.15, seed=7))  # 같은 시드면 같은 답
        self.assertEqual(sorted(sampled), list(range(7)))

        def total(p):
            return sum(s[x][y] for x, y in zip(p, p[1:]))
        self.assertGreater(total(sampled), total(best) * 0.6)  # 자유도를 열어도 엉망이 되지 않는다
        orders = {tuple(mc.order(s, temperature=0.5, explore=0.3, seed=k)) for k in range(12)}
        self.assertGreater(len(orders), 1)  # 무비(시드)마다 달라질 수 있다


class MatchFxTest(unittest.TestCase):
    def test_links_make_match_boundaries_with_focus_on_both_sides(self):
        cine = recipe.get("cinematic").spec
        planned = [ct.PlannedCut(i, 0, 2000, 1.0, None) for i in range(3)]
        links = [{"out": (0.3, 0.4, 1.5), "in": (0.6, 0.5, 1.4)}, None]
        p = cut_fx.plan(planned, (), cine, 1, links)
        self.assertEqual(p.boundaries, ["match", "hardcut"])
        self.assertEqual((p.cuts[0].outro_focus, p.cuts[1].intro_focus), ((0.3, 0.4, 1.5), (0.6, 0.5, 1.4)))
        self.assertIsNone(p.cuts[0].zoom)  # 매치가 있는 컷은 번갈아 줌을 걸지 않는다
        self.assertIsNotNone(p.cuts[2].zoom)

    def test_real_motion_links_add_no_digital_zoom(self):
        cine = recipe.get("cinematic").spec
        planned = [ct.PlannedCut(i, 0, 1500, 1.0, None) for i in range(3)]
        p = cut_fx.plan(planned, (), {**cine, "zoom": {**cine["zoom"], "rate": 0.0}}, 1, [{"real": True}, None])
        self.assertEqual(p.boundaries, ["motion", "hardcut"])
        self.assertTrue(all(c.zoom is None and c.outro_focus is None and c.intro_focus is None for c in p.cuts))

    def test_match_zoom_centres_on_the_subject(self):
        vf = cut_fx.video_filter(cut_fx.CutFx(outro_focus=(0.3, 0.4, 1.5)), 2.0, DEFAULT_RENDER_SPEC, None)
        self.assertIn("clip(iw*(0.5+-0.200*", vf)
        self.assertIn("*(1+0.500*", vf)


if __name__ == "__main__":
    unittest.main()
