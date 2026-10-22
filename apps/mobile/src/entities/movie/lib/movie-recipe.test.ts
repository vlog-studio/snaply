import {
  DefaultMovieRecipe,
  MovieRecipeCatalog,
  movieRecipeLabel,
  movieRecipeOrDefault,
} from './movie-recipe';

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
