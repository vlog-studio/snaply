import {
  DefaultMovieRecipe,
  MovieRecipeCatalog,
  RecipeDecorationDefaults,
  movieDecorations,
  movieDecorationsLabel,
  movieRecipeLabel,
  movieRecipeOrDefault,
} from './movie-recipe';

// The server's original. The app keeps a copy of each recipe's decoration
// defaults (the contract package is not in the app bundle); this keeps the copy
// honest — a stale default would draw switches the server has already replaced.
const vocabulary = jest.requireActual(
  '../../../../../../packages/shared-types/src/recipe-vocabulary.json',
) as { recipes: Record<string, { decorations: { text: boolean; emoji: boolean; face: boolean } }> };

describe('MovieRecipeCatalog', () => {
  // The names and their order are the contract's (`MOVIE_RECIPES`): the catalog's
  // order is typed as that tuple, so a drift is a compile error, not a test
  // failure. The contract — not the worker's dictionary, which may hold recipes
  // not yet offered — is what the server accepts.
  it('describes each recipe once', () => {
    const ids = MovieRecipeCatalog.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every recipe a label and a description', () => {
    for (const option of MovieRecipeCatalog) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });

  it('leads with classic, the default', () => {
    expect(DefaultMovieRecipe).toBe('classic');
    expect(MovieRecipeCatalog[0].id).toBe(DefaultMovieRecipe);
    expect(movieRecipeLabel(undefined)).toBe('기본');
  });
});

describe('movieRecipeOrDefault', () => {
  it.each(MovieRecipeCatalog.map((option) => option.id))('keeps %s', (recipe) => {
    expect(movieRecipeOrDefault(recipe)).toBe(recipe);
  });

  // A movie stored before recipes existed has none; a newer server may name one
  // this build has not heard of — or a name that only looks like a key.
  it.each([undefined, 'vaporwave', 'constructor'])('reads %s as classic', (recipe) => {
    expect(movieRecipeOrDefault(recipe)).toBe('classic');
  });
});

describe('RecipeDecorationDefaults', () => {
  it.each(MovieRecipeCatalog.map((option) => option.id))(
    'matches the server’s recipe dictionary for %s',
    (recipe) => {
      const { text, emoji, face } = vocabulary.recipes[recipe].decorations;
      expect(RecipeDecorationDefaults[recipe]).toEqual({ text, emoji, face });
    },
  );
});

describe('movieDecorations', () => {
  it('keeps the movie’s own, and reads a movie stored before them as its recipe’s defaults', () => {
    const own = { text: false, emoji: true, face: false };
    expect(movieDecorations({ recipe: 'cinematic', decorations: own })).toBe(own);
    expect(movieDecorations({ recipe: 'cinematic' })).toEqual({
      text: true,
      emoji: true,
      face: true,
    });
    expect(movieDecorations({})).toEqual({ text: false, emoji: false, face: false });
  });

  it('reads out what is on, or 없음', () => {
    expect(movieDecorationsLabel({ text: true, emoji: true, face: false })).toBe('글자·이모지');
    expect(movieDecorationsLabel({ text: false, emoji: false, face: true })).toBe('얼굴 스티커');
    expect(movieDecorationsLabel({ text: false, emoji: false, face: false })).toBe('없음');
  });
});
