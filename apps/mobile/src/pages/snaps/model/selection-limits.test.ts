import { movieLimitNotice, pickingCapacity } from './selection-limits';

jest.mock('@/entities/movie', () => ({ MovieSnapLimit: 10 }));

describe('pickingCapacity', () => {
  // Saving or deleting eleven snaps from the library was refused with the
  // movie's "한 편에는 스냅 10개까지 들어가요" (2026-10-14 review, backlog E-55).
  it.each([
    ['movie', Number.POSITIVE_INFINITY],
    ['album', Number.POSITIVE_INFINITY],
    ['draft', 30],
  ] as const)('lets %s picks run to %s', (purpose, capacity) => {
    expect(pickingCapacity(purpose, 30)).toBe(capacity);
  });
});

describe('movieLimitNotice', () => {
  it('says how many to take out once the picks are past one movie', () => {
    expect(movieLimitNotice('movie', 13)).toBe(
      '한 편에는 스냅 10개까지 들어가요. 무비로 만들려면 3개를 빼 주세요.',
    );
  });

  it.each([
    ['movie', 10],
    ['album', 40],
    ['draft', 20],
  ] as const)('says nothing for %s with %s picks', (purpose, count) => {
    expect(movieLimitNotice(purpose, count)).toBeUndefined();
  });
});
