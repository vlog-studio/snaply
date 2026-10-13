import { draftCostReadOut } from './draft-cost';

describe('draftCostReadOut', () => {
  it.each([
    [{ agent: true, freeRemaining: 3, nextCost: 0 }, '무료 3번 남음'],
    [{ agent: true, freeRemaining: 1, nextCost: 0 }, '무료 1번 남음'],
    [{ agent: true, freeRemaining: 0, nextCost: 20 }, '20크레딧'],
  ])('reads %j as %s', (allowance, readOut) => {
    expect(draftCostReadOut(allowance)).toBe(readOut);
  });

  it('says nothing while unknown or when every draft is free (no agent)', () => {
    expect(draftCostReadOut(undefined)).toBeUndefined();
    expect(draftCostReadOut({ agent: false, freeRemaining: 3, nextCost: 0 })).toBeUndefined();
  });
});
