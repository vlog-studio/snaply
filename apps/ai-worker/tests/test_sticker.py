"""이모지 스티커 배치와 모션의 계약 — 무엇을 · 몇 개 · 어디에 · 언제, 결정론, 프레임 한 장.

배치는 순수 검사다. 프레임 그리기는 Pillow 가 있어야 돈다(requirements 에 있다). 오버레이 트랙을 ffmpeg 로 굽는 것은
`test_ffmpeg_contract.py` 가 맡는다.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import layout, sticker, text_accent  # noqa: E402
from pipeline.text_accent import CutContext  # noqa: E402

SEED = 1837462
BEAT = 500
CENTER = (0.30, 0.40, 0.70, 0.70)


def cut(cut_id="t1", start=0, end=1000, subject=CENTER, **concepts) -> CutContext:
    return CutContext(cut_id, start, end, {k: tuple(v) for k, v in concepts.items()}, subject)


class CandidatesTest(unittest.TestCase):
    def test_own_concept_first_then_inherited_and_no_duplicates(self):
        found = sticker.candidates(cut(objects=["coffee"], actions=["drink"]), "default")
        emojis = [cp for cp, _ in found]
        self.assertEqual(emojis[0], "2615")  # 마시기 → ☕
        self.assertEqual(len(emojis), len(set(emojis)))
        self.assertIn("1f4a6", emojis)  # coffee 는 drink 의 하위 — drink 의 💦 를 물려받는다

    def test_lively_and_emotional_moods_add_sparkles(self):
        self.assertIn("2728", [cp for cp, _ in sticker.candidates(cut(topics=["shopping"]), "lively")])
        self.assertNotIn("2728", [cp for cp, _ in sticker.candidates(cut(topics=["shopping"]), "calm")])


class PlanTest(unittest.TestCase):
    def test_count_order_and_staggered_entry(self):
        c = cut(end=1000, objects=["coffee"], actions=["drink"], moods=["calm"])
        placed = sticker.plan_cut(c, None, BEAT, SEED)
        self.assertTrue(1 <= len(placed) <= 3)
        self.assertEqual([s.start_ms for s in placed], [i * BEAT // 2 for i in range(len(placed))])
        for s in placed:
            self.assertLessEqual(s.end_ms, c.end_ms + BEAT // 2)

    def test_stickers_avoid_the_accent_and_each_other(self):
        c = cut(objects=["coffee"], actions=["drink"], moods=["lively"])
        accent = text_accent.plan([c], BEAT, SEED).accents[0]
        placed = sticker.plan_cut(c, accent, BEAT, SEED)
        boxes = [sticker._sticker_rect(s) for s in placed]
        for i, box in enumerate(boxes):
            self.assertFalse(layout.overlaps(box, accent.rect))
            self.assertTrue(layout.inside_safe(box))
            for other in boxes[i + 1:]:
                self.assertFalse(layout.overlaps(box, other))

    def test_hugging_spots_need_a_subject(self):
        with_subject = sticker.plan_cut(cut(objects=["coffee"]), None, BEAT, SEED)
        without = sticker.plan_cut(cut(subject=None, objects=["coffee"]), None, BEAT, SEED)
        self.assertEqual(with_subject[0].anchor, "object.beside")
        self.assertTrue(all(s.anchor.startswith("freezone.") for s in without))

    def test_nothing_to_say_means_no_stickers(self):
        # 직접 받은 스티커가 모든 개념을 덮어 이제 개념이 없는 컷만 비는다 — 되돌리면 cut(objects=["wall"]) 로
        self.assertEqual(sticker.plan_cut(cut(), None, BEAT, SEED), [])

    def test_the_next_cut_prefers_emoji_it_did_not_just_see(self):
        # 바다 → 친구들과 바다: 같은 장소라도 바로 앞 컷의 🌊 💦 🫧 를 그대로 되풀이하지 않는다
        cuts = [cut("a", 0, 1000, places=["sea"]), cut("b", 1000, 2000, places=["sea"], topics=["friends"], moods=["lively"])]
        planned = sticker.plan(cuts, [], BEAT, SEED)
        seen = {s.emoji for s in planned if s.cut_id == "a"}
        following = [s.emoji for s in planned if s.cut_id == "b"]
        self.assertTrue(seen)
        self.assertNotIn(following[0], seen, (seen, following))

    def test_same_seed_same_stickers(self):
        cuts = [cut("a", 0, 1000, objects=["cake"]), cut("b", 1000, 2000, places=["sea"], moods=["refreshing"])]
        accents = text_accent.plan(cuts, BEAT, SEED).accents
        self.assertEqual(sticker.plan(cuts, accents, BEAT, SEED), sticker.plan(cuts, accents, BEAT, SEED))


class PoseTest(unittest.TestCase):
    STICKER = sticker.Sticker("t1", "2615", "", "object.beside", (0.5, 0.5), 200, 0.0, "popBob", 0, 1500, (0, 500, 1000))

    def test_pops_in_bumps_on_beats_and_fades_out(self):
        render = _render_module()
        self.assertLess(render.pose(self.STICKER, 0)[0], 0.1)
        self.assertGreater(render.pose(self.STICKER, 500)[0], render.pose(self.STICKER, 400)[0])
        self.assertLess(render.pose(self.STICKER, 1499.9)[3], 0.01)

    def test_frame_draws_only_live_stickers(self):
        render = _render_module()
        live = render.frame([self.STICKER], 600)
        self.assertGreater(live.getpixel((540, 960))[3], 200)
        self.assertEqual(render.frame([self.STICKER], 1600).getbbox(), None)

    def test_the_picture_is_drawn_as_is_without_an_outline_or_shadow(self):
        # 2026-10-29 흰 칼선 · 그림자를 없앴다(text-accent-stickers.md §3) — 그려진 불투명 영역이 원본 그림을 넘지 않는다
        render = _render_module()
        at = 1000  # 등장 · 통통 · 사라짐이 끝난 정지 자세
        scale, rotation, _dy, alpha = render.pose(self.STICKER, at)
        self.assertEqual((rotation, alpha), (0.0, 1.0))
        px = max(2, int(self.STICKER.size_px * scale))
        original = sum(1 for a in render.raw(self.STICKER.emoji).resize((px, px)).getchannel("A").getdata() if a > 40)
        drawn = sum(1 for a in render.frame([self.STICKER], at).getchannel("A").getdata() if a > 40)
        self.assertLessEqual(drawn, original * 1.02)


def _render_module():
    try:
        from pipeline import sticker_render
    except ImportError as error:  # Pillow 없음
        raise unittest.SkipTest(f"Pillow 없음: {error}") from error
    return sticker_render


if __name__ == "__main__":
    unittest.main()
