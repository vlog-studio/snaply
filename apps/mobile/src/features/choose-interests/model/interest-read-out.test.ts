import { interestReadOut } from './interest-read-out';

const topics = [
  { id: 'walk', label: '산책' },
  { id: 'cafe', label: '카페' },
  { id: 'travel', label: '여행' },
  { id: 'pet', label: '반려동물' },
];

describe('interestReadOut', () => {
  it.each([
    [[], '고르지 않음'],
    [['cafe'], '카페'],
    [['travel', 'cafe'], '카페 · 여행'],
    [['pet', 'walk', 'travel', 'cafe'], '산책 · 카페 외 2개'],
    [['cafe', 'gone'], '카페'],
    [['gone'], '고르지 않음'],
  ])('reads %j as %s — names in the topics’ order, the rest counted', (chosen, readOut) => {
    expect(interestReadOut(chosen, topics)).toBe(readOut);
  });

  it('says nothing until both the choice and the names have arrived', () => {
    expect(interestReadOut(undefined, topics)).toBeUndefined();
    expect(interestReadOut(['cafe'], undefined)).toBeUndefined();
  });
});
