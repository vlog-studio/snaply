"""레퍼런스 말뭉치 시트 — 사람이 영상마다 적는 한 줄(`sheet.csv`)의 칸과 검증(`reference_corpus` 가 다시 내보낸다).

id 는 파일 이름(`videos/<id>.*` · `features/<id>.json`)이 되므로 안전한 글자만 받는다. crop_top · crop_bottom 은 화면 녹화의 상태 표시줄 ·
앱 UI 를 잘라 낼 화면 높이의 몫(0~0.4), trim_start_s · trim_end_s 는 앞 · 뒤에서 잘라 낼 초(엔딩 카드 등). format_label 은 사람이 본 가장
가까운 레시피 id — 모르면 unknown, 안 봤으면 빈칸. 잘못된 행은 예외 대신 이유(문자열)를 돌려준다 — 시트 한 줄 때문에 전체가 멈추지 않게.
"""

import math
import re
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from datetime import datetime

from pipeline import recipe

PLATFORMS = ("instagram", "tiktok", "youtube_shorts")
CAPTURES = ("save", "screen", "download")  # 앱 저장 · 화면 녹화 · 수집 도구(yt-dlp) 다운로드
SHEET_COLUMNS = (
    "id", "platform", "capture", "url", "uploaded_at", "views", "likes", "followers", "music", "format_label", "labeler",
    "trim_start_s", "trim_end_s", "crop_top", "crop_bottom", "note",
)
UNKNOWN_LABEL = "unknown"
MAX_CROP = 0.4
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
COUNT = re.compile(r"\d+")


@dataclass(frozen=True)
class Row:
    id: str
    platform: str
    capture: str
    url: str
    uploaded_at: str
    views: int | None
    likes: int | None
    followers: int | None
    music: str
    format_label: str | None  # 레시피 id · unknown · None(빈칸)
    labeler: str
    trim_start_s: float | None
    trim_end_s: float | None
    crop_top: float | None
    crop_bottom: float | None
    note: str


class RowError(ValueError):
    """시트 한 칸이 잘못됐다 — 메시지가 사람에게 보이는 이유다."""


def _text(raw: Mapping[str, str | None], key: str) -> str:
    return (raw.get(key) or "").strip()


def _id(raw: Mapping[str, str | None]) -> str:
    value = _text(raw, "id")
    if not SAFE_ID.fullmatch(value):
        raise RowError(f"id: 영문 · 숫자 · _ · - 만, 64자까지 ({value or '빈칸'})")
    return value


def _choice(raw: Mapping[str, str | None], key: str, options: Collection[str]) -> str:
    value = _text(raw, key)
    if value not in options:
        raise RowError(f"{key}: {', '.join(options)} 중 하나 ({value or '빈칸'})")
    return value


def _url(raw: Mapping[str, str | None]) -> str:
    value = _text(raw, "url")
    if value and not value.startswith(("http://", "https://")):
        raise RowError(f"url: http(s) 주소가 아님 ({value})")
    return value


def _uploaded_at(raw: Mapping[str, str | None]) -> str:
    value = _text(raw, "uploaded_at")
    if value:
        try:
            datetime.fromisoformat(value)
        except ValueError as exc:
            raise RowError(f"uploaded_at: ISO 날짜가 아님 ({value})") from exc
    return value


def _count(raw: Mapping[str, str | None], key: str) -> int | None:
    """선택 정수 — 천 단위 쉼표 허용."""
    value = _text(raw, key).replace(",", "")
    if not value:
        return None
    if not COUNT.fullmatch(value):
        raise RowError(f"{key}: 0 이상의 정수가 아님 ({value})")
    return int(value)


def _number(raw: Mapping[str, str | None], key: str, high: float = math.inf) -> float | None:
    """선택 숫자 — 0 이상 high 이하."""
    value = _text(raw, key)
    if not value:
        return None
    try:
        number = float(value)
    except ValueError as exc:
        raise RowError(f"{key}: 숫자가 아님 ({value})") from exc
    if not (math.isfinite(number) and 0 <= number <= high):
        raise RowError(f"{key}: 0~{high:g} 범위 밖 ({value})")
    return number


def _label(raw: Mapping[str, str | None], recipe_ids: Collection[str]) -> str | None:
    value = _text(raw, "format_label")
    if value and value != UNKNOWN_LABEL and value not in recipe_ids:
        raise RowError(f"format_label: 레시피 id · {UNKNOWN_LABEL} · 빈칸 중 하나 ({value})")
    return value or None


def parse_row(raw: Mapping[str, str | None], recipe_ids: Collection[str] = tuple(recipe.RECIPES)) -> Row | str:
    """시트 한 줄 → Row, 잘못됐으면 이유(문자열). 칸 이름은 SHEET_COLUMNS, 값은 csv 그대로(문자열 · 빈칸)."""
    try:
        return Row(
            id=_id(raw), platform=_choice(raw, "platform", PLATFORMS), capture=_choice(raw, "capture", CAPTURES),
            url=_url(raw), uploaded_at=_uploaded_at(raw), views=_count(raw, "views"), likes=_count(raw, "likes"),
            followers=_count(raw, "followers"), music=_text(raw, "music"), format_label=_label(raw, recipe_ids),
            labeler=_text(raw, "labeler"), trim_start_s=_number(raw, "trim_start_s"), trim_end_s=_number(raw, "trim_end_s"),
            crop_top=_number(raw, "crop_top", MAX_CROP), crop_bottom=_number(raw, "crop_bottom", MAX_CROP),
            note=_text(raw, "note"),
        )
    except RowError as exc:
        return str(exc)
