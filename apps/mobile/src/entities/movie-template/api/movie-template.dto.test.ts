import { MovieTemplateCatalog } from '../lib/movie-template-catalog';
import { mapMovieTemplate, movieTemplateCatalogDtoSchema } from './movie-template.dto';

function dto(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'walk',
    name: '동네 산책',
    description: '걸으며 찍은 6컷',
    style: '감성',
    bgm: 'lofi-walk',
    slots: [{ id: 'start', label: '출발', hint: '집 앞이나 지하철 출구' }],
    ...over,
  };
}

describe('movieTemplateCatalogDtoSchema', () => {
  it('accepts the payload the backend documents', () => {
    const parsed = movieTemplateCatalogDtoSchema.parse({
      updatedAt: '2026-08-19T00:00:00.000Z',
      templates: [dto()],
    });

    expect(parsed.templates).toHaveLength(1);
  });

  it('strips the scoring internals if they ever leak into the payload', () => {
    // The server keeps `matchHints` out of the response on purpose; Zod makes
    // sure a future leak cannot reach the app and quietly become a dependency.
    const parsed = movieTemplateCatalogDtoSchema.parse({
      updatedAt: '2026-08-19T00:00:00.000Z',
      templates: [
        dto({
          slots: [{ id: 'start', label: '출발', hint: '집 앞이나 지하철 출구', matchHints: {} }],
        }),
      ],
    });

    expect(parsed.templates[0].slots[0]).toEqual({
      id: 'start',
      label: '출발',
      hint: '집 앞이나 지하철 출구',
    });
  });
});

describe('mapMovieTemplate', () => {
  it.each([
    ['감성', 'emotional'],
    ['여행', 'travel'],
    ['일상', 'daily'],
  ] as const)('reads the %s preset as %s', (preset, style) => {
    expect(mapMovieTemplate(dto({ style: preset }))?.style).toBe(style);
  });

  it('skips a template whose preset this build does not know', () => {
    // The server does not filter these — it cannot know which presets a given
    // build understands, and filtering there would hide the template from the
    // newer builds that do.
    expect(mapMovieTemplate(dto({ style: '빈티지' }))).toBeUndefined();
  });

  it('skips a template with no slots, since there is nothing to shoot', () => {
    expect(mapMovieTemplate(dto({ slots: [] }))).toBeUndefined();
  });

  it('maps the seeded catalog back to what the build ships', () => {
    // The ids and copy are seeded from this constant, so a mapped server row and
    // the offline fallback must describe the same template.
    const shipped = MovieTemplateCatalog.find((template) => template.id === 'walk');
    const mapped = mapMovieTemplate(
      dto({
        slots: shipped?.slots.map((slot) => ({ ...slot })),
      }),
    );

    expect(mapped).toEqual(shipped);
  });
});
