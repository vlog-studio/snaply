"""층 c(생성) 의 계약 — 요청 모양, 응답을 믿지 않고 문턱으로 거르기, 엔진 입력으로 잇기, 호출 실패의 모양.

SDK · 네트워크 없이 도는 순수 검사다. 호출은 가짜 `openai` 모듈로 대신한다.
"""

import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import accent_writer as aw  # noqa: E402
from pipeline import sticker, text_accent  # noqa: E402
from pipeline.accent_writer import AccentWriterError, WriterCut  # noqa: E402

CUTS = [
    WriterCut("t1", "라떼 아트가 올라간 커피를 마신다", ("커피", "마시기"), "low", "꿀꺽"),
    WriterCut("t2", "해 질 녘 바다에서 친구들이 뛴다", ("바다", "친구"), "high", "철썩~"),
]


def answer(*cuts: dict) -> str:
    return json.dumps({"cuts": list(cuts)}, ensure_ascii=False)


class RequestTest(unittest.TestCase):
    def test_one_request_carries_every_cut_and_the_allowed_emoji(self):
        request = aw.build_request(CUTS, model="m")
        self.assertEqual(request["model"], "m")
        self.assertTrue(request["text"]["format"]["strict"])
        body = json.loads(request["input"][1]["content"][0]["text"])
        self.assertEqual([c["cutId"] for c in body["cuts"]], ["t1", "t2"])
        # 그림 스티커만 쓰므로(2026-10-30, text-accent-stickers.md §10) 생성이 고를 이모지는 없다 — 글만 쓴다
        self.assertEqual(body["emojiAllowed"], [])

    def test_default_model_is_the_edit_agent_model(self):
        self.assertEqual(aw.build_request(CUTS)["model"], aw.config.EDIT_AGENT_MODEL)

    def test_no_cuts_no_request(self):
        with self.assertRaises(ValueError):
            aw.build_request([])


# 생성이 고르는 이모지 목록은 지금 비어 있다(그림 스티커엔 이모지 문자가 없다). 거르는 규칙은 목록이 다시 생길 때를 위해 예전 목록 일부로 검사한다
OLD_POOL = ("2615", "1f60d", "1f525", "2764")


@mock.patch.object(aw, "POOL", OLD_POOL)
class ParseTest(unittest.TestCase):
    def test_good_answers_pass(self):
        result = aw.parse_result(answer(
            {"cutId": "t1", "text": "라떼아트 미쳤다", "category": "exclaim", "emoji": ["☕", "😍"]},
            {"cutId": "t2", "text": "", "category": "sound", "emoji": []},
        ), ["t1", "t2"])
        self.assertEqual(result["t1"].text, "라떼아트 미쳤다")
        self.assertEqual(result["t1"].emoji, ("2615", "1f60d"))
        self.assertIsNone(result["t2"].text)

    def test_untrusted_parts_are_dropped_and_recorded(self):
        result = aw.parse_result(answer(
            {"cutId": "t1", "text": "Latte!!", "category": "sound", "emoji": ["☕", "🦖", "😍", "🔥", "✨"]},
        ), ["t1"])
        written = result["t1"]
        self.assertIsNone(written.text)
        self.assertEqual(written.emoji, ("2615", "1f60d", "1f525"))  # 목록 밖 🦖 는 버리고 셋까지
        self.assertIn("text:Latte!!", written.rejected)
        self.assertIn("emoji:🦖", written.rejected)

    def test_variation_selector_is_ignored(self):
        result = aw.parse_result(answer({"cutId": "t1", "text": "", "category": "feeling", "emoji": ["❤️"]}), ["t1"])
        self.assertEqual(result["t1"].emoji, ("2764",))

    def test_unknown_and_repeated_cuts_are_ignored(self):
        result = aw.parse_result(answer(
            {"cutId": "t9", "text": "좋아", "category": "feeling", "emoji": []},
            {"cutId": "t1", "text": "첫번째", "category": "feeling", "emoji": []},
            {"cutId": "t1", "text": "두번째", "category": "feeling", "emoji": []},
        ), ["t1"])
        self.assertEqual(list(result), ["t1"])
        self.assertEqual(result["t1"].text, "첫번째")

    def test_broken_answer_is_an_error(self):
        with self.assertRaises(AccentWriterError):
            aw.parse_result("{not json", ["t1"])

    def test_output_text_reads_both_response_shapes(self):
        self.assertEqual(aw.output_text({"output_text": "{}"}), "{}")
        nested = {"output": [{"content": [{"type": "output_text", "text": "{\"cuts\": []}"}]}]}
        self.assertEqual(aw.output_text(nested), "{\"cuts\": []}")
        with self.assertRaises(AccentWriterError):
            aw.output_text({"output": []})


class EngineInputTest(unittest.TestCase):
    @mock.patch.object(aw, "POOL", OLD_POOL)
    def test_generated_text_and_emoji_reach_the_plan(self):
        written = aw.parse_result(answer(
            {"cutId": "t1", "text": "라떼아트 미쳤다", "category": "exclaim", "emoji": ["😍"]},
        ), ["t1"])
        overrides, emoji = aw.to_inputs(written)
        cut = text_accent.CutContext("t1", 0, 1000, {"objects": ("coffee",)}, (0.3, 0.4, 0.7, 0.7))
        accent = text_accent.plan([cut], 500, 7, overrides).accents[0]
        self.assertEqual((accent.choice.text, accent.choice.source), ("라떼아트 미쳤다", "generated"))
        stickers = sticker.plan([cut], [accent], 500, 7, emoji)
        self.assertEqual((stickers[0].emoji, stickers[0].reason), ("1f60d", "생성"))

    def test_the_generated_pool_is_empty_while_stickers_are_pictures(self):
        # 사전은 그림(sk-*)만이고 그림엔 이모지 문자가 없어 생성(층 c)은 스티커를 고르지 않는다 — 사전(층 a)으로만 붙는다
        stickers = text_accent.VOCABULARY["stickers"]
        listed = set(stickers["sparkle"]).union(*(cps for table in stickers["byConcept"].values() for cps in table.values()))
        self.assertTrue(all(cp.startswith("sk-") for cp in listed))
        self.assertEqual(aw.POOL, ())


class CallTest(unittest.TestCase):
    def fake_openai(self, create):
        client = mock.Mock()
        client.responses.create.side_effect = create
        return types.SimpleNamespace(OpenAI=mock.Mock(return_value=client))

    def test_call_returns_text_and_usage(self):
        response = mock.Mock()
        response.model_dump.return_value = {"output_text": answer(), "usage": {"input_tokens": 10, "output_tokens": 5}}
        with mock.patch.dict(sys.modules, {"openai": self.fake_openai(lambda **_: response)}):
            text, usage = aw.call(aw.build_request(CUTS))
        self.assertEqual(json.loads(text), {"cuts": []})
        self.assertEqual((usage["input_tokens"], usage["output_tokens"]), (10, 5))
        self.assertIn("latency_ms", usage)

    def test_sdk_failure_becomes_one_error(self):
        def boom(**_):
            raise TimeoutError("slow")

        with mock.patch.dict(sys.modules, {"openai": self.fake_openai(boom)}):
            with self.assertRaises(AccentWriterError):
                aw.write(CUTS)


if __name__ == "__main__":
    unittest.main()
