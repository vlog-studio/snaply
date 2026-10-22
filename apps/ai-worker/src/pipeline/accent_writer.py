"""텍스트 액센트의 층 c — LLM 이 컷마다 짧은 글과 이모지를 지어낸다.

- **무비 하나에 호출 한 번** — 컷을 전부 한 요청에 담는다. 컷마다 부르면 비용이 컷 수만큼 늘고, 모델이 앞뒤 컷을 보지 못해
  같은 글을 되풀이한다
- **결과는 믿지 않는다** — 글은 `text_accent.validate_generated` 문턱을, 종류는 사전 `generated.categories` 를, 이모지는
  `stickers.generatedPool` 을 지나야 한다. 못 지나면 그 컷은 사전(층 a)으로 돌아간다
- **결과는 스펙에 그대로 고정한다** — 다시 만들 때 부르지 않는다(MOV-14). 이 모듈은 그 고정할 값을 만든다

요청 구성 · 응답 해석은 순수 함수라 SDK 없이 테스트한다. `openai` SDK 는 호출 시점에만 import 한다
(`pipeline/video_analysis/openai_client.py` 와 같은 방식). 결정: docs/decisions/text-accent-stickers.md §2
"""

import json
import time
from dataclasses import dataclass

import config
from pipeline import text_accent as ta

SCHEMA_NAME = "accent_writer"
MAX_OUTPUT_TOKENS = 900
TIMEOUT_SECONDS = 30
POOL: tuple[str, ...] = tuple(ta.VOCABULARY["stickers"]["generatedPool"])
GENERATED = ta.GENERATED
VARIATION_SELECTORS = {"️", "︎"}

SYSTEM_PROMPT = f"""당신은 틱톡 · 릴스형 BGM 컷편집 숏폼 영상에 들어갈 짧은 화면 글(텍스트 스티커)을 쓰는 사람이다.
컷마다 장면 설명을 받아, 그 장면에 딱 맞는 글 하나와 이모지를 고른다.

규칙:
- 글은 한글로 {GENERATED["maxChars"]}자 이하. 쓸 수 있는 문장부호는 {GENERATED["allowedPunctuation"]} 뿐이다. 영어 · 숫자 · 이모지는 글에 넣지 않는다.
- 의성어 · 의태어(sound), 감정 · 분위기(feeling), 감탄 · 밈(exclaim) 중 하나로 쓴다.
- 장면에 실제로 있는 것에 반응한다. 사람 이름 · 상호 · 지명 · 브랜드를 지어내지 않는다. 비속어 · 혐오 · 성적 표현 금지.
- 앞뒤 컷과 같은 글을 되풀이하지 않는다. 쓸 말이 마땅치 않은 컷은 text 를 빈 문자열로 둔다.
- 이모지는 주어진 목록에서만, 컷마다 0~{GENERATED["maxEmojiPerCut"]}개.
- dictionary 는 규칙이 고른 후보다. 더 나은 글이 없으면 그대로 써도 된다."""

RESULT_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["cuts"],
    "properties": {
        "cuts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["cutId", "text", "category", "emoji"],
                "properties": {
                    "cutId": {"type": "string"},
                    "text": {"type": "string"},
                    "category": {"type": "string", "enum": list(GENERATED["categories"])},
                    "emoji": {"type": "array", "items": {"type": "string"}},
                },
            },
        }
    },
}


class AccentWriterError(RuntimeError):
    """생성 호출 실패 — 호출하는 쪽은 사전(층 a)만으로 진행한다."""


@dataclass(frozen=True)
class WriterCut:
    cut_id: str
    # 스냅 분석의 summary(한 문장)와 개념 이름들
    summary: str
    concepts: tuple[str, ...]
    energy: str
    dictionary: str = ""


@dataclass(frozen=True)
class Written:
    cut_id: str
    text: str | None
    category: str
    emoji: tuple[str, ...]
    # 문턱에서 버린 것 — 집계 · 금칙어 보강에 쓴다
    rejected: tuple[str, ...] = ()


def emoji_char(codepoint: str) -> str:
    return "".join(chr(int(part, 16)) for part in codepoint.split("-"))


def codepoint_of(char: str) -> str:
    return "-".join(f"{ord(ch):x}" for ch in char if ch not in VARIATION_SELECTORS)


def build_request(cuts: list[WriterCut], model: str | None = None) -> dict:
    if not cuts:
        raise ValueError("컷이 없는 요청은 만들지 않습니다.")
    payload = {
        "emojiAllowed": [emoji_char(cp) for cp in POOL],
        "cuts": [{"cutId": c.cut_id, "scene": c.summary, "concepts": list(c.concepts), "energy": c.energy,
                  "dictionary": c.dictionary} for c in cuts],
    }
    return {
        "model": model or config.EDIT_AGENT_MODEL,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
            {"role": "user", "content": [{"type": "input_text", "text": json.dumps(payload, ensure_ascii=False)}]},
        ],
        "text": {"format": {"type": "json_schema", "name": SCHEMA_NAME, "strict": True, "schema": RESULT_JSON_SCHEMA}},
        "max_output_tokens": MAX_OUTPUT_TOKENS,
    }


def output_text(payload: dict) -> str:
    """Responses API 응답에서 모델이 쓴 글(JSON) 하나."""
    if payload.get("output_text"):
        return payload["output_text"]
    for item in payload.get("output") or []:
        for part in item.get("content") or []:
            if part.get("type") == "output_text":
                return part.get("text", "")
    raise AccentWriterError("응답에 글이 없습니다")


def parse_result(text: str, cut_ids: list[str]) -> dict[str, Written]:
    """문턱을 지난 것만 남긴다. 모르는 컷 · 중복 컷은 버리고, 같은 컷이 두 번이면 첫 번째."""
    try:
        cuts = json.loads(text)["cuts"]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise AccentWriterError(f"응답 형식이 맞지 않습니다: {exc}") from exc
    wanted, result = set(cut_ids), {}
    for raw in cuts:
        cut_id = raw.get("cutId")
        if cut_id in wanted and cut_id not in result:
            result[cut_id] = _written(cut_id, raw)
    return result


def _written(cut_id: str, raw: dict) -> Written:
    rejected: list[str] = []
    text = None
    if raw.get("text"):
        try:
            text = ta.validate_generated(raw["text"])
        except ta.AccentError:
            rejected.append(f"text:{raw['text']}")
    category = raw.get("category") if raw.get("category") in GENERATED["categories"] else "exclaim"
    emoji: list[str] = []
    for char in raw.get("emoji") or []:
        cp = codepoint_of(char)
        if cp in POOL and cp not in emoji and len(emoji) < GENERATED["maxEmojiPerCut"]:
            emoji.append(cp)
        elif cp not in POOL:
            rejected.append(f"emoji:{char}")
    return Written(cut_id, text, category, tuple(emoji), tuple(rejected))


def to_inputs(written: dict[str, Written]) -> tuple[dict[str, ta.Override], dict[str, tuple[str, ...]]]:
    """엔진 입력으로 — 글은 `text_accent.plan` 의 overrides, 이모지는 `sticker.plan` 의 emoji_overrides."""
    overrides = {k: ta.Override(text=w.text, category=w.category) for k, w in written.items() if w.text}
    emoji = {k: w.emoji for k, w in written.items() if w.emoji}
    return overrides, emoji


def call(request: dict, timeout_seconds: int = TIMEOUT_SECONDS) -> tuple[str, dict]:
    """실제 호출 — (모델이 쓴 JSON, 사용량). 키는 SDK 가 OPENAI_API_KEY 환경변수에서 읽는다."""
    from openai import OpenAI  # noqa: PLC0415 — SDK 없이도 순수 함수 테스트가 돌아야 한다

    started = time.monotonic()
    try:
        response = OpenAI(timeout=timeout_seconds).responses.create(**request)
    except Exception as exc:  # noqa: BLE001 — 사전만으로 진행하도록 한 가지 오류로 올린다
        raise AccentWriterError(f"{type(exc).__name__}: {exc}") from exc
    payload = response.model_dump() if hasattr(response, "model_dump") else response
    usage = dict(payload.get("usage") or {})
    usage["latency_ms"] = int((time.monotonic() - started) * 1000)
    return output_text(payload), usage


def write(cuts: list[WriterCut], model: str | None = None) -> tuple[dict[str, Written], dict]:
    text, usage = call(build_request(cuts, model))
    return parse_result(text, [c.cut_id for c in cuts]), usage
