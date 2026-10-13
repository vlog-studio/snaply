/**
 * 취향 가중치의 계산 규칙(docs/decisions/ontology-personalization.md §4.3 · §4.4, specs PRF-2). DB 없는 순수 테스트다.
 * 숫자는 잠정값이라(`taste-policy.ts`) 값 자체보다 **규칙이 보장하는 것**을 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { decayedWeight, nextWeight, propagateSignals } from '../src/services/taste/taste-math.js';
import {
  TASTE_HALF_LIFE_MS,
  TASTE_LEARNING_RATE,
  TASTE_PROPAGATION_RATIO,
} from '../src/services/taste/taste-policy.js';

describe('nextWeight', () => {
  it('moves by learning rate × strength from neutral', () => {
    expect(nextWeight(0, 1)).toBeCloseTo(TASTE_LEARNING_RATE, 10);
    expect(nextWeight(0, -0.5)).toBeCloseTo(-TASTE_LEARNING_RATE * 0.5, 10);
  });

  it('moves less the closer it is to ±1 and never leaves −1~1', () => {
    expect(nextWeight(0.9, 1) - 0.9).toBeLessThan(nextWeight(0, 1));
    let weight = 0;
    for (let i = 0; i < 500; i += 1) weight = nextWeight(weight, 1);
    expect(weight).toBeLessThanOrEqual(1);
    for (let i = 0; i < 500; i += 1) weight = nextWeight(weight, -1);
    expect(weight).toBeGreaterThanOrEqual(-1);
  });

  it('does not flip a firm preference with one opposite signal (PRF-2)', () => {
    let weight = 0;
    for (let i = 0; i < 10; i += 1) weight = nextWeight(weight, 1);
    expect(nextWeight(weight, -1)).toBeGreaterThan(0);
  });

  it('firms up only when the same choice repeats', () => {
    const once = nextWeight(0, 0.5);
    const thrice = nextWeight(nextWeight(once, 0.5), 0.5);
    expect(thrice).toBeGreaterThan(once);
    expect(once).toBeLessThan(0.2);
  });
});

describe('decayedWeight', () => {
  const at = new Date('2026-10-13T00:00:00Z');

  it('halves after one half-life and keeps the sign', () => {
    const later = new Date(at.getTime() + TASTE_HALF_LIFE_MS);
    expect(decayedWeight(0.6, at, later)).toBeCloseTo(0.3, 10);
    expect(decayedWeight(-0.6, at, later)).toBeCloseTo(-0.3, 10);
  });

  it('does not change without elapsed time, nor with a clock behind', () => {
    expect(decayedWeight(0.6, at, at)).toBe(0.6);
    expect(decayedWeight(0.6, at, new Date(at.getTime() - 1000))).toBe(0.6);
  });
});

describe('propagateSignals', () => {
  it('passes a content signal up the tree, halving each level', () => {
    expect(propagateSignals([{ field: 'objects', concept: 'cake', strength: 0.8 }])).toEqual([
      { field: 'objects', concept: 'cake', strength: 0.8 },
      { field: 'objects', concept: 'dessert', strength: 0.8 * TASTE_PROPAGATION_RATIO },
      { field: 'objects', concept: 'food', strength: 0.8 * TASTE_PROPAGATION_RATIO ** 2 },
    ]);
  });

  it('leaves edit concepts and unknown concepts alone', () => {
    const edit = [
      { field: 'transition' as const, concept: 'crossfade', strength: 1 },
      { field: 'style' as const, concept: '감성', strength: -0.5 },
      { field: 'places' as const, concept: 'nowhere', strength: 1 },
    ];
    expect(propagateSignals(edit)).toEqual(edit);
  });
});
