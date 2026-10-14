import { renderHook } from '@testing-library/react-native';

import type { Snap } from '@/entities/snap';

import { useTemplateOffers } from './use-template-offers';

const mockSnaps = jest.fn<Snap[], []>();

jest.mock('@/entities/snap', () => ({
  useSnapsForMovies: () => mockSnaps(),
}));

// The catalog is a server read now. What this hook owns is the *order* it puts
// the templates in, so the source is pinned to the shipped catalog rather than
// dragged through a query client — `use-movie-templates.test.ts` covers the read.
const mockTemplateOrder = jest.fn<string[] | undefined, []>();
jest.mock('@/entities/movie-template', () => ({
  useMovieTemplates: () => {
    const catalog: { id: string }[] = jest.requireActual(
      '@/entities/movie-template/lib/movie-template-catalog',
    ).MovieTemplateCatalog;
    // The server answers in the user's taste order when it has one.
    const order = mockTemplateOrder();
    return order ? order.map((id) => catalog.find((template) => template.id === id)) : catalog;
  },
}));

const Noon = new Date('2026-08-12T12:00:00+09:00').getTime();
const MinuteMs = 60 * 1000;
const seongsu = { latitude: 37.5445, longitude: 127.0557 };

function makeSnap(id: string, minutesFromNoon: number): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec: 3,
    capturedAt: Noon + minutesFromNoon * MinuteMs,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    place: seongsu,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnaps.mockReturnValue([]);
  mockTemplateOrder.mockReturnValue(undefined);
});

function renderOffers() {
  return renderHook(() => useTemplateOffers());
}

describe('useTemplateOffers', () => {
  it('offers every template in the catalog, with what the library fills', async () => {
    const { result } = await renderOffers();

    expect(result.current).toHaveLength(4);
    expect(result.current.every((offer) => offer.filled === 0)).toBe(true);
  });

  // The studio's row fits two cards and a sliver, so the order decides which
  // templates a user ever sees.
  it('puts the templates the library fills first', async () => {
    mockSnaps.mockReturnValue([
      makeSnap('a', 0),
      makeSnap('b', 10),
      makeSnap('c', 20),
      makeSnap('d', 30),
    ]);

    const { result } = await renderOffers();

    // 하루 요약 asks for four and has them; the rest are short and, with no
    // taste, keep the catalog's order (동네 산책 · 카페 한 곳 · 나들이) — how
    // many cuts each is short no longer reorders them (2026-10-15).
    expect(result.current.map((offer) => offer.template.id)).toEqual([
      'day',
      'walk',
      'cafe',
      'trip',
    ]);
    expect(result.current[0]).toMatchObject({ filled: 4, slotCount: 4 });
  });

  // PRF-3: the server's taste order decides within each group — the filled
  // ones still lead.
  it('orders by the taste within the filled and the unfilled templates', async () => {
    mockSnaps.mockReturnValue([
      makeSnap('a', 0),
      makeSnap('b', 10),
      makeSnap('c', 20),
      makeSnap('d', 30),
    ]);
    mockTemplateOrder.mockReturnValue(['trip', 'cafe', 'day', 'walk']);

    const { result } = await renderOffers();

    // 하루 요약 is the one the library fills, so it stays first even though the
    // taste ranks it third; 나들이 (two short) now leads 카페 한 곳 (one short).
    expect(result.current.map((offer) => offer.template.id)).toEqual([
      'day',
      'trip',
      'cafe',
      'walk',
    ]);
  });

  // The studio card draws these as its strip, so they must be the cuts the
  // template screen will propose on opening: the outing in capture order, the
  // slots past it empty.
  it('lays the matched outing into the slots, leaving the unfilled ones empty', async () => {
    mockSnaps.mockReturnValue([makeSnap('b', 10), makeSnap('a', 0)]);

    const { result } = await renderOffers();
    const day = result.current.find((offer) => offer.template.id === 'day');

    expect(day?.slots.map((snap) => snap?.id)).toEqual(['a', 'b', undefined, undefined]);
    expect(day).toMatchObject({ filled: 2, slotCount: 4 });
  });

  it('draws every slot empty when the library has nothing to offer', async () => {
    const { result } = await renderOffers();

    for (const offer of result.current) {
      expect(offer.slots).toHaveLength(offer.slotCount);
      expect(offer.slots.every((snap) => snap === undefined)).toBe(true);
    }
  });

  it('keeps the catalog order when the library fills none and there is no taste', async () => {
    const { result } = await renderOffers();

    expect(result.current.map((offer) => offer.template.id)).toEqual([
      'walk',
      'day',
      'cafe',
      'trip',
    ]);
  });
});
