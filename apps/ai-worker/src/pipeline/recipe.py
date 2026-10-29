"""숏브이로그 스타일 레시피 — `recipe-vocabulary.json` 을 읽는 얇은 층.

레시피는 스타일마다 다른 값(소리 구성 · 고정 타이틀 · 글 · 스티커 밀도 · 효과음 · 이음 · 배속)만 담고, 그 값을 쓰는 엔진은
각자의 모듈이다(`music.mix` · `title_card` · `text_accent` · `sticker` · `sfx` · `continuity` · `editor.retime_clip`).
`classic` 은 지금까지의 무비와 같다. 결정: docs/decisions/trend-recipes.md
"""

from dataclasses import dataclass

from pipeline import vocabulary as _vocabulary

VOCABULARY: dict = _vocabulary.load("recipe-vocabulary.json")
RECIPE_VOCABULARY_VERSION: int = VOCABULARY["recipeVocabularyVersion"]
RECIPES: dict[str, dict] = VOCABULARY["recipes"]
CLASSIC = "classic"


class RecipeError(ValueError):
    """사전에 없는 레시피 — 조용히 classic 으로 넘어가지 않는다."""


@dataclass(frozen=True)
class Recipe:
    name: str
    spec: dict

    @property
    def music_only(self) -> bool:
        return self.spec["audio"]["sourceGain"] == 0

    def section(self, key: str) -> dict:
        return self.spec[key] or {}


def get(name: str | None) -> Recipe:
    key = name or CLASSIC
    if key not in RECIPES:
        raise RecipeError(f"알 수 없는 레시피입니다: {key}")
    return Recipe(key, RECIPES[key])


# 무비의 꾸밈(글자 · 이모지 · 얼굴 스티커) — 붙일지는 무비 설정이, 양은 레시피가 정한다(text-accent-stickers.md §9).
DECORATION_KEYS = ("text", "emoji", "face")
DECORATION_FALLBACK: dict = VOCABULARY["decorationFallback"]


def decorations_of(name: str | None, raw: object) -> dict[str, bool]:
    """editSpec 의 `decorations` — 없거나 빠진 키는 레시피 기본값(이 결정 전의 작업도 같은 결과)."""
    out = dict(get(name).spec["decorations"])
    if isinstance(raw, dict):
        out.update({k: raw[k] for k in DECORATION_KEYS if isinstance(raw.get(k), bool)})
    return out


def decorated_spec(spec: dict, decorations: dict[str, bool] | None) -> dict:
    """레시피의 양에 무비의 꾸밈을 입힌다 — 끈 것은 0, 레시피가 0 으로 둔 것을 켜면 decorationFallback 의 양.
    글자를 끄고 이모지만 켜면 `stickerGate`(글이 쓰던 문턱 · 간격)로 이모지가 스스로 컷을 고른다. decorations 가 None 이면 그대로."""
    if decorations is None:
        return spec
    text_cfg = spec["accents"] if spec["accents"].get("max") != 0 else DECORATION_FALLBACK["accents"]
    stickers_off = spec["stickers"].get("perCut") == 0 or spec["stickers"].get("maxPerMovie") == 0
    face_cfg = (spec.get("faceStickers") or {}) if (spec.get("faceStickers") or {}).get("enabled") else DECORATION_FALLBACK["faceStickers"]
    return {
        **spec,
        "accents": text_cfg if decorations["text"] else {**text_cfg, "max": 0},
        "stickers": (DECORATION_FALLBACK["stickers"] if stickers_off else spec["stickers"]) if decorations["emoji"]
        else {"maxPerMovie": 0, "perCut": 0},
        "stickerGate": None if decorations["text"] else text_cfg,
        "faceStickers": face_cfg if decorations["face"] else {**face_cfg, "enabled": False},
    }
