"""분석 결과 계약 — Structured Outputs 용 JSON Schema + 애플리케이션 검증.

모델이 스키마를 지켰다고 값이 쓸 만하다는 뜻은 아니다(0~1 범위, 목록 길이, 빈 문자열).
그래서 스키마 강제와 별개로 애플리케이션에서 한 번 더 검증한다.
"""

from loguru import logger

from pipeline.video_analysis.prompt import VISUAL_ISSUE_CODES

SCHEMA_NAME = "snap_analysis"

MAX_SUMMARY_LENGTH = 200
MAX_LIST_ITEMS = 6
MAX_ITEM_LENGTH = 40

# 프레임별 피사체 상자(docs/decisions/subject-boxes.md §5) — 꾸밈을 피사체 옆에 놓는 데만 쓴다. 옆자리가 없는 상자는 저장하지 않는다:
# 화면을 거의 다 덮거나(면적), 화면 끝에서 끝까지 걸친 띠(가로 · 세로), 너무 작아 옆에 붙이면 상관없어 보이는 것. 값은 잠정.
MAX_SUBJECTS_PER_FRAME = 3
SUBJECT_MAX_AREA = 0.6
SUBJECT_MAX_SPAN = 0.9
SUBJECT_MIN_AREA = 0.005

_STRING_LIST = {
    "type": "array",
    "items": {"type": "string"},
}

RESULT_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "summary", "topics", "places", "objects", "actions", "moods",
        "visualQuality", "confidence", "subjects",
    ],
    "properties": {
        "summary": {"type": "string"},
        "topics": _STRING_LIST,
        "places": _STRING_LIST,
        "objects": _STRING_LIST,
        "actions": _STRING_LIST,
        "moods": _STRING_LIST,
        "visualQuality": {
            "type": "object",
            "additionalProperties": False,
            "required": ["score", "issues", "usableForEdit"],
            "properties": {
                "score": {"type": "number"},
                "issues": {
                    "type": "array",
                    "items": {"type": "string", "enum": list(VISUAL_ISSUE_CODES)},
                },
                "usableForEdit": {"type": "boolean"},
            },
        },
        "confidence": {"type": "number"},
        "subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["frame", "items"],
                "properties": {
                    "frame": {"type": "integer"},
                    "items": {
                        "type": "array",
                        "maxItems": MAX_SUBJECTS_PER_FRAME,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["label", "box"],
                            "properties": {
                                "label": {"type": "string"},
                                "box": {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4},
                            },
                        },
                    },
                },
            },
        },
    },
}

LIST_FIELDS = ("topics", "places", "objects", "actions", "moods")


class ResultSchemaError(ValueError):
    """모델 출력이 계약을 벗어남 — 재시도 대상으로 분류한다."""


def _validate_string_list(field: str, value: object) -> list[str]:
    if not isinstance(value, list):
        raise ResultSchemaError(f"{field} 는 배열이어야 합니다.")
    if len(value) > MAX_LIST_ITEMS:
        # 사물이 많은 장면에서 모델이 7개 이상을 낸다(샘플 32개 중 2개, backlog E-63). 거절하면 같은 호출을 한 번 더
        # 사므로 앞의 것만 남긴다 — 프롬프트에 한도를 적는 안은 프롬프트 버전(운영 시크릿)을 올려야 하고 지킨다는 보장도 없다.
        logger.info("{} 항목 {}개 중 앞 {}개만 남긴다", field, len(value), MAX_LIST_ITEMS)
        value = value[:MAX_LIST_ITEMS]
    items: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ResultSchemaError(f"{field} 항목이 문자열이 아닙니다: {item!r}")
        stripped = item.strip()
        if not stripped:
            raise ResultSchemaError(f"{field} 에 빈 문자열이 있습니다.")
        if len(stripped) > MAX_ITEM_LENGTH:
            raise ResultSchemaError(f"{field} 항목이 너무 깁니다: {stripped[:20]}...")
        items.append(stripped)
    return items


def _validate_unit_range(field: str, value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ResultSchemaError(f"{field} 는 숫자여야 합니다: {value!r}")
    number = float(value)
    if not 0.0 <= number <= 1.0:
        raise ResultSchemaError(f"{field} 가 0~1 범위를 벗어났습니다: {number}")
    return number


def subject_box(value: object) -> list[float] | None:
    """쓸 수 있는 상자면 0~1 로 자른 [x0, y0, x1, y1], 아니면 None — 거꾸로이거나, 면적이 너무 크거나 작거나, 화면 끝까지 걸친 띠."""
    if not isinstance(value, list) or len(value) != 4 or not all(
        isinstance(v, (int, float)) and not isinstance(v, bool) for v in value
    ):
        return None
    x0, y0, x1, y1 = (min(1.0, max(0.0, float(v))) for v in value)
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0 or not SUBJECT_MIN_AREA <= w * h <= SUBJECT_MAX_AREA:
        return None
    if w >= SUBJECT_MAX_SPAN or h >= SUBJECT_MAX_SPAN:
        return None
    return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]


def _validate_subjects(value: object) -> list[dict]:
    """프레임별 피사체 — 쓸 수 있는 상자만 남긴다. 위치는 보조 정보라 모양이 틀려도 분석을 실패시키지 않고 버린다."""
    if not isinstance(value, list):
        logger.info("subjects 가 배열이 아니다 — 버린다")
        return []
    frames: dict[int, list[dict]] = {}
    for entry in value:
        frame = entry.get("frame") if isinstance(entry, dict) else None
        if isinstance(frame, bool) or not isinstance(frame, int) or frame < 0 or frame in frames:
            continue
        items = []
        for item in (entry.get("items") or [])[:MAX_SUBJECTS_PER_FRAME]:
            label = item.get("label") if isinstance(item, dict) else None
            box = subject_box(item.get("box")) if isinstance(item, dict) else None
            if isinstance(label, str) and label.strip() and box is not None:
                items.append({"label": label.strip()[:MAX_ITEM_LENGTH], "box": box})
        frames[frame] = items
    return [{"frame": frame, "items": frames[frame]} for frame in sorted(frames)]


def validate_result(payload: object) -> dict:
    """검증된 결과를 정규화해서 돌려준다. 실패는 ResultSchemaError."""
    if not isinstance(payload, dict):
        raise ResultSchemaError("결과가 객체가 아닙니다.")

    summary = payload.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise ResultSchemaError("summary 가 비어 있습니다.")
    if len(summary) > MAX_SUMMARY_LENGTH:
        raise ResultSchemaError(f"summary 가 너무 깁니다: {len(summary)}자")

    quality = payload.get("visualQuality")
    if not isinstance(quality, dict):
        raise ResultSchemaError("visualQuality 가 객체가 아닙니다.")
    usable = quality.get("usableForEdit")
    if not isinstance(usable, bool):
        raise ResultSchemaError("visualQuality.usableForEdit 가 boolean 이 아닙니다.")
    issues = quality.get("issues")
    if not isinstance(issues, list):
        raise ResultSchemaError("visualQuality.issues 는 배열이어야 합니다.")
    unknown = [code for code in issues if code not in VISUAL_ISSUE_CODES]
    if unknown:
        raise ResultSchemaError(f"허용되지 않은 visualIssue: {unknown}")

    return {
        "summary": summary.strip(),
        **{field: _validate_string_list(field, payload.get(field)) for field in LIST_FIELDS},
        "visualQuality": {
            "score": _validate_unit_range("visualQuality.score", quality.get("score")),
            "issues": list(issues),
            "usableForEdit": usable,
        },
        "confidence": _validate_unit_range("confidence", payload.get("confidence")),
        "subjects": _validate_subjects(payload.get("subjects")),
    }
