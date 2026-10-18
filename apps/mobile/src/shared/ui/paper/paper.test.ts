import { tiltFor } from './paper';

describe('tiltFor', () => {
  it('gives the same item the same tilt every time', () => {
    expect(tiltFor('snap-1', 3)).toBe(tiltFor('snap-1', 3));
  });

  it('stays within the step for the kind of piece', () => {
    for (const id of ['a', 'snap-2', 'movie-9f3', '한글', '']) {
      expect(Math.abs(tiltFor(id, 2))).toBeLessThanOrEqual(2);
    }
    expect(tiltFor('anything', 0)).toBe(0);
  });

  it('spreads different items across both directions', () => {
    const tilts = new Set(
      Array.from({ length: 40 }, (_, index) => Math.sign(tiltFor(`snap-${index}`, 3))),
    );
    expect(tilts).toEqual(new Set([-1, 0, 1]));
  });
});
