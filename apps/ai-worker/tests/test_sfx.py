"""효과음의 계약 — 사전 정합성(파일 · 개념), 점수(개념 + 분석 키워드), 고르기(문턱 · 상한 · 같은 소리 쉬기), 시각, 이음 소리.

ffmpeg 없이 도는 순수 검사다. 실제로 섞이는지는 `test_ffmpeg_contract.py` 의 `SfxMixContract`.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import sfx, text_accent as ta, vocabulary  # noqa: E402

CONTENT = vocabulary.load("content-vocabulary.json")["concepts"]
CFG = {"max": 6, "minScore": 3, "seams": True}


def cut(cut_id, start, end, motion=(), **concepts):
    return ta.CutContext(cut_id, start, end, {k: tuple(v) for k, v in concepts.items()}, None, motion=tuple(motion))


class VocabularyTest(unittest.TestCase):
    def test_required_files_and_concepts_exist(self):
        self.assertIn("sfx-vocabulary.json", vocabulary.REQUIRED)
        for sid, s in sfx.SOUNDS.items():
            with self.subTest(sound=sid):
                self.assertTrue((sfx.SFX_DIR / s["file"]).exists())
                self.assertIn(s["anchor"], ("action", "start"))
                for fld, concepts in s["evokedBy"].items():
                    self.assertIn(fld, sfx.VOCABULARY["fieldWeights"])
                    for c in concepts:
                        self.assertIn(c, CONTENT[fld])
        for kind, s in sfx.SEAMS.items():
            self.assertTrue((sfx.SFX_DIR / s["file"]).exists(), kind)


class ScoreTest(unittest.TestCase):
    def test_keyword_in_the_analysis_counts_when_the_concept_dictionary_has_no_word(self):
        pts, hits = sfx.score(sfx.SOUNDS["apple-bite"], cut("a", 0, 1000), {"objects": ["빨간 사과", "도마"]})
        self.assertEqual(pts, 3)
        self.assertIn("키워드:사과", hits)

    def test_keywords_are_two_letters_or_more(self):
        for sid, s in sfx.SOUNDS.items():
            for k in s["keywords"]:
                self.assertGreaterEqual(len(k), 2, (sid, k))  # 한 글자 '면' 이 '화면' 에 걸렸다

    def test_a_not_keyword_hides_the_word_inside_it(self):
        self.assertEqual(sfx.score(sfx.SOUNDS["sizzle"], cut("a", 0, 1000), {"summary": "물고기를 보는 아이"})[0], 0)
        self.assertEqual(sfx.score(sfx.SOUNDS["sizzle"], cut("a", 0, 1000), {"summary": "고기를 굽는다"})[0], 3)

    def test_concept_and_keyword_add_up(self):
        pts, _ = sfx.score(sfx.SOUNDS["gulp"], cut("a", 0, 1000, actions=["drink"]), {"summary": "커피를 마신다"})
        self.assertEqual(pts, 6)


class PlanTest(unittest.TestCase):
    def test_one_per_cut_threshold_and_cap(self):
        cuts = [cut("a", 0, 1000), cut("b", 1000, 2000), cut("c", 2000, 3000)]
        analyses = [{"objects": ["사과"]}, {"places": ["거리"]}, {"actions": ["수영"]}]
        events = sfx.plan(cuts, analyses, [], {**CFG, "seams": False})
        self.assertEqual([e.file for e in events], ["apple-bite.mp3", "water-splash.mp3"])
        self.assertEqual(len(sfx.plan(cuts, analyses, [], {"max": 1, "minScore": 3, "seams": False})), 1)

    def test_no_cap_means_every_matching_cut(self):
        cuts = [cut(c, i * 1000, i * 1000 + 1000) for i, c in enumerate("abcdefgh")]
        analyses = [{"objects": ["사과"]}, {"actions": ["수영"]}, {"objects": ["과자"]}] * 2 + [{}, {}]
        events = sfx.plan(cuts, analyses, [], {"max": None, "minScore": 3, "seams": False})
        self.assertEqual(len(events), 6)

    def test_boundary_sounds_for_effects_panels_and_faces_without_a_cap_but_spaced(self):
        moments = [(1000, "fx-whip"), (2000, "fx-flash"), (3000, "panel"), (3100, "panel"), (5000, "face"), (6000, "fx-glitch")]
        events = sfx.plan([cut("a", 0, 1000)], [{}], moments, CFG)
        self.assertEqual([e.reason for e in events], ["경계 fx-whip", "경계 fx-flash", "경계 panel", "경계 face"])  # 100ms 뒤 panel · 소리 없는 glitch 는 빠진다

    def test_the_same_sound_is_used_at_most_max_per_sound_times(self):
        cuts = [cut(c, i * 1000, i * 1000 + 1000) for i, c in enumerate("abcdefghij")]
        files = [e.file for e in sfx.plan(cuts, [{"objects": ["사과"]}] * 10, [], {"max": None, "minScore": 3, "seams": False})]
        self.assertEqual(files.count("apple-bite.mp3"), sfx.VOCABULARY["maxPerSound"])

    def test_action_sounds_put_their_transient_on_the_peak(self):
        motion = [0.0] * 10
        motion[5] = 1.0  # 2.5초에 정점
        e, = sfx.plan([cut("a", 2000, 3000, motion)], [{"objects": ["사과"]}], [], {**CFG, "seams": False})
        self.assertEqual(e.at_ms + sfx.transient_ms("apple-bite.mp3"), 2500)

    def test_voices_are_capped_and_tails_overlap_a_little(self):
        mk = lambda at, reason, ms=1000: sfx.SfxEvent(at, "pop.mp3", ms, -6, reason)
        events = sfx.arrange([mk(0, "아삭 ← a"), mk(100, "경계 panel"), mk(200, "바삭 ← b")])
        self.assertEqual([e.reason for e in events], ["아삭 ← a", "바삭 ← b"])  # 세 번째 목소리 — 경계 소리를 뺀다
        tail = sfx.arrange([mk(0, "아삭 ← a"), mk(400, "바삭 ← b")])
        self.assertEqual(tail[0].max_ms, 400 + sfx.VOCABULARY["tailOverlapMs"])  # 앞 꼬리는 다음 소리와 250ms 까지만

    def test_the_same_sound_rests_for_a_few_cuts(self):
        cuts = [cut(c, i * 1000, i * 1000 + 1000) for i, c in enumerate("abcd")]
        analyses = [{"objects": ["사과"]}] * 4
        files = [e.file for e in sfx.plan(cuts, analyses, [], {**CFG, "seams": False})]
        self.assertEqual(files.count("apple-bite.mp3"), 2)  # 0번 · 3번 컷(가운데 둘은 쉰다)

    def test_action_sounds_land_on_the_motion_peak(self):
        motion = (0.01, 0.01, 0.01, 0.01, 0.09, 0.01, 0.01, 0.01, 0.01, 0.01)
        bite = sfx.transient_ms("apple-bite.mp3")  # 소리가 터지는 순간을 피크에 — 파일 시작은 그만큼 앞
        events = sfx.plan([cut("a", 2000, 3000, motion)], [{"objects": ["사과"]}], [], {**CFG, "seams": False})
        self.assertEqual(events[0].at_ms, 2400 - bite)
        events = sfx.plan([cut("a", 2000, 3000)], [{"objects": ["사과"]}], [], {**CFG, "seams": False})
        self.assertEqual(events[0].at_ms, 2300 - bite)

    def test_seam_sounds_only_when_the_recipe_asks(self):
        seams = [(1000, "whip"), (3000, "cover")]
        on = sfx.plan([cut("a", 0, 1000)], [{}], seams, CFG)
        self.assertEqual([(e.file, e.at_ms) for e in on], [("whoosh.mp3", 820), ("swoosh-fast.mp3", 2880)])
        self.assertEqual(sfx.plan([cut("a", 0, 1000)], [{}], seams, {**CFG, "seams": False}), [])

    def test_no_events_no_reencode(self):
        self.assertEqual(sfx.mix_into("in.mp4", [], "out.mp4"), "in.mp4")


if __name__ == "__main__":
    unittest.main()
