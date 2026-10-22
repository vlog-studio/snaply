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
