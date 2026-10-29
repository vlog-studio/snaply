/**
 * 무비의 편집 스타일 레시피(specs/movie.md MOV-28) — 소리 구성 · 타이틀 · 글 밀도 · 효과음 · 컷 고르기(매치컷) · 화면 틀 · 효과.
 *
 * 원본은 `recipe-vocabulary.json` **하나**이고 워커(`pipeline/recipe.py`)가 값을 읽는다. 여기는 사용자가 고를 수 있는 이름 목록만
 * 계약으로 내보낸다 — 이름이 사전과 어긋나면 `apps/api/test/recipe-vocabulary.test.ts` 가 잡는다.
 *
 * 결정: `docs/decisions/trend-recipes.md`
 */
import vocabulary from './recipe-vocabulary.json' with { type: 'json' };

export const RECIPE_VOCABULARY_VERSION = vocabulary.recipeVocabularyVersion;

/** 사전의 레시피 순서. `classic` 이 지금까지의 무비이고 기본값이다. */
export const MOVIE_RECIPES = [
  'classic',
  'trend-routine',
  'trend-montage',
  'cinematic',
  'fast-cut',
  'beat-sync',
  'speed-ramp',
  'day-stamp',
  'before-after',
  'asmr',
  'freeze-text',
  'whip-montage',
  'letterbox-montage',
  'talk-vlog',
  'daylog',
] as const;
export type MovieRecipe = (typeof MOVIE_RECIPES)[number];

export const DEFAULT_MOVIE_RECIPE: MovieRecipe = 'classic';

/** 사전에 적힌 레시피 이름들 — 테스트가 `MOVIE_RECIPES` 와 비교한다. */
export const RECIPE_VOCABULARY_NAMES: readonly string[] = Object.keys(vocabulary.recipes);

/** 무비의 꾸밈 — 글자(텍스트 액센트) · 이모지 스티커 · 얼굴 스티커를 각각 켜고 끈다(specs/movie.md MOV-27). */
export const MOVIE_DECORATION_KEYS = ['text', 'emoji', 'face'] as const;
export type MovieDecorationKey = (typeof MOVIE_DECORATION_KEYS)[number];
export type MovieDecorationFlags = Record<MovieDecorationKey, boolean>;

/**
 * 레시피의 꾸밈 기본값 — 무비를 만들 때와 레시피를 바꿀 때 무비에 채운다(decisions/text-accent-stickers.md §9).
 * 붙일지는 무비 설정이 정하고 레시피는 양만 정한다. 값은 사전의 `decorations`.
 */
export function recipeDecorations(recipe: MovieRecipe): MovieDecorationFlags {
  const { text, emoji, face } = vocabulary.recipes[recipe].decorations;
  return { text, emoji, face };
}
