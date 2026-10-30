import type { MOVIE_RECIPES } from '@vlog-studio/shared-types';

import type { Movie, MovieDecorations, MovieEditing, MovieRecipe } from '../model/movie';

/** One entry of the recipe catalog, as the recipe sheet draws it. */
export type MovieRecipeOption = {
  id: MovieRecipe;
  label: string;
  /** One line on what the recipe does to the cut. */
  description: string;
};

/**
 * What each recipe is. Keyed by `MovieRecipe` rather than listed, so a recipe
 * added to the contract fails to compile until it is described here.
 *
 * The descriptions are written from what the server's recipe dictionary
 * (`packages/shared-types/src/recipe-vocabulary.json`, decision
 * `docs/decisions/trend-recipes.md`) really does, for the same reason the style
 * catalog's are: a card that promises an edit the renderer does not make is
 * found out only after the wait.
 */
const RecipeOptions: Record<MovieRecipe, Omit<MovieRecipeOption, 'id'>> = {
  classic: { label: '기본', description: '지금까지처럼 담백한 컷편집' },
  'trend-routine': {
    label: '루틴',
    description: '원본 줌으로 자연스럽게 잇고, 의성어·이모지를 맞는 순간에만',
  },
  'trend-montage': {
    label: '몽타주',
    description: '0.5~1.5초 빠른 컷으로 장소를 훑는 여행 미니 브이로그',
  },
  cinematic: {
    label: '시네마틱',
    description: "위아래 검은 띠(레터박스)와 'Vlog' 타이틀, 담백한 매치컷",
  },
  'fast-cut': {
    label: '빠른 컷',
    description: '0.5~1초 컷을 빠르게 잇고, 컷마다 어울리는 효과음을 겹치게',
  },
  'beat-sync': {
    label: '비트싱크',
    description: '컷이 박자에 딱 맞게 넘어가고, 음악이 터지는 순간 번쩍',
  },
  'speed-ramp': {
    label: '스피드램프',
    description: '동작 가운데만 빨라졌다 다시 느려지는 속도 연출',
  },
  'day-stamp': {
    label: '하루 타임스탬프',
    description: '찍은 순서대로, 화면 아래에 촬영 시각(AM 9:12)',
  },
  'before-after': {
    label: '비포·애프터',
    description: '같은 구도에서 달라진 모습끼리 이어 보여 주기',
  },
  asmr: { label: 'ASMR', description: '고요한 장면을 길게, 원본 소리를 살리고 음악은 작게' },
  'freeze-text': {
    label: '프리즈',
    description: '가장 또렷한 순간에 잠깐 멈추고 큰 글자로 강조',
  },
  'whip-montage': {
    label: '휩 몽타주',
    description: '짧은 컷을 휙휙 밀어 넘기는 몽타주',
  },
  'letterbox-montage': {
    label: '가로 몽타주',
    description: '위아래 검은 띠 안에서 가로 영상을 흐르듯 잇는 몽타주',
  },
  'talk-vlog': {
    label: '말소리 브이로그',
    description: '말소리와 현장음을 살리고 음악은 작게, 찍은 순서대로',
  },
  daylog: { label: '하루로그', description: '조금 긴 컷, 필름 색감, 아주 맞는 순간에만 글' },
};

/**
 * Presentation order — the contract's own (`MOVIE_RECIPES`, the dictionary's
 * order). Typed as that tuple, so a reorder or a new name on the server is a
 * compile error here rather than a sheet in a different order from the server's.
 * A copy rather than an import because the contract package is type-only in the
 * app (it is not in the bundle).
 */
const RecipeOrder: typeof MOVIE_RECIPES = [
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
];

/** The recipes a movie can be cut with, in the server's order. */
export const MovieRecipeCatalog: readonly MovieRecipeOption[] = RecipeOrder.map((id) => ({
  id,
  ...RecipeOptions[id],
}));

/**
 * What a movie is cut with until the user picks otherwise — the contract's
 * `DEFAULT_MOVIE_RECIPE`, which is also what the server records when a write
 * names none.
 */
export const DefaultMovieRecipe: MovieRecipe = 'classic';

/**
 * The recipe a stored movie is really cut with. Movies stored before recipes
 * existed have none, and a server newer than this build may name one it has not
 * heard of; both read as {@link DefaultMovieRecipe} rather than crashing a card
 * or being sent back as a value the build cannot describe.
 */
export function movieRecipeOrDefault(recipe: string | undefined): MovieRecipe {
  return recipe !== undefined && Object.prototype.hasOwnProperty.call(RecipeOptions, recipe)
    ? (recipe as MovieRecipe)
    : DefaultMovieRecipe;
}

export function movieRecipeLabel(recipe: string | undefined): string {
  return RecipeOptions[movieRecipeOrDefault(recipe)].label;
}

/**
 * Whether every cut is still the edit draft's — the order and every window.
 * Only then does the server re-cut the movie by its recipe; a movie the user
 * has touched keeps its cuts (root docs/api-spec.md, 무비 · `recipe`).
 */
export function cutsAreAllAi(movie: Pick<Movie, 'arranger' | 'snapRefs'>): boolean {
  return (
    movie.arranger === 'ai' &&
    movie.snapRefs.length > 0 &&
    movie.snapRefs.every((ref) => ref.trimOwner === 'ai')
  );
}

/**
 * Whether a run of this movie lets its recipe pick the cuts (root
 * docs/specs/movie.md MOV-28): a recipe other than `classic` on cuts the AI
 * still owns. The file of such a run is the recipe's edit — the same snap more
 * than once, sped-up or split windows — which the cut list cannot say, so the
 * list is the material the recipe chose from, not what the file plays.
 */
export function recipePicksCuts(movie: Pick<Movie, 'recipe' | 'arranger' | 'snapRefs'>): boolean {
  return movieRecipeOrDefault(movie.recipe) !== DefaultMovieRecipe && cutsAreAllAi(movie);
}

const AllOn: MovieDecorations = { text: true, emoji: true, face: true };
const AllOff: MovieDecorations = { text: false, emoji: false, face: false };

/**
 * Each recipe's decoration defaults — what a movie is filled with when it is
 * made and when its recipe changes (root docs/specs/movie.md MOV-27). A copy of
 * the server's recipe dictionary (`recipe-vocabulary.json`, each recipe's
 * `decorations`), for the same reason {@link RecipeOrder} is one: the contract
 * package is type-only in the app. Keyed by `MovieRecipe`, so a new recipe fails
 * to compile until it has defaults; the values are checked against the
 * dictionary by `movie-recipe.test.ts`.
 */
export const RecipeDecorationDefaults: Record<MovieRecipe, MovieDecorations> = {
  classic: AllOff,
  'trend-routine': AllOn,
  'trend-montage': AllOn,
  cinematic: AllOn,
  'fast-cut': AllOn,
  'beat-sync': AllOn,
  'speed-ramp': { text: true, emoji: true, face: false },
  'day-stamp': AllOff,
  'before-after': { text: true, emoji: false, face: false },
  asmr: AllOff,
  'freeze-text': { text: true, emoji: false, face: false },
  'whip-montage': { text: true, emoji: false, face: false },
  'letterbox-montage': { text: true, emoji: false, face: false },
  'talk-vlog': { text: true, emoji: true, face: false },
  daylog: { text: true, emoji: false, face: false },
};

/**
 * The decorations a movie's next run puts on: its own, or — for a movie stored
 * before the field existed — its recipe's defaults, which is what the server
 * filled it with.
 */
export function movieDecorations(movie: Pick<Movie, 'recipe' | 'decorations'>): MovieDecorations {
  return movie.decorations ?? RecipeDecorationDefaults[movieRecipeOrDefault(movie.recipe)];
}

/** The switches in the order the sheet draws them, with their names on screen. */
export const MovieDecorationOptions: readonly { key: keyof MovieDecorations; label: string }[] = [
  { key: 'text', label: '글자' },
  { key: 'emoji', label: '이모지' },
  { key: 'face', label: '얼굴 스티커' },
];

/** What the 꾸밈 chip reads out: the switches that are on, or 없음. */
export function movieDecorationsLabel(decorations: MovieDecorations): string {
  const on = MovieDecorationOptions.filter((option) => decorations[option.key]);
  return on.length === 0 ? '없음' : on.map((option) => option.label).join('·');
}

export function sameDecorations(left: MovieDecorations, right: MovieDecorations): boolean {
  return left.text === right.text && left.emoji === right.emoji && left.face === right.face;
}

const EditingOff: MovieEditing = { speech: false, sceneOrder: false };

/**
 * The editing choices a movie's next run follows (root docs/specs/movie.md
 * MOV-29): its own, or both off for a movie stored before the field existed —
 * which is also what the server holds for it. Unlike the decorations they do
 * not follow the recipe.
 */
export function movieEditing(movie: Pick<Movie, 'editing'>): MovieEditing {
  return movie.editing ?? EditingOff;
}

/** The editing switches in the order the sheet draws them, with their names on screen. */
export const MovieEditingOptions: readonly { key: keyof MovieEditing; label: string }[] = [
  { key: 'speech', label: '말소리' },
  { key: 'sceneOrder', label: '장면 순서' },
];

/** The editing switches that are on, joined for the 꾸밈 chip; empty when none is. */
export function movieEditingLabel(editing: MovieEditing): string {
  return MovieEditingOptions.filter((option) => editing[option.key])
    .map((option) => option.label)
    .join('·');
}

export function sameEditing(left: MovieEditing, right: MovieEditing): boolean {
  return left.speech === right.speech && left.sceneOrder === right.sceneOrder;
}
