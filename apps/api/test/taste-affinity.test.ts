/**
 * 취향을 점수로 읽는 규칙(docs/decisions/ontology-personalization.md §4.4 · §7, specs PRF-3). DB 없는 순수 테스트다.
 */
import { describe, expect, it } from 'vitest';
import {
  buildTasteLookup,
  conceptAffinity,
  moodsOfAnalysis,
  recommendedStyle,
  snapAffinity,
  transitionsSuiting,
} from '../src/services/taste/taste-affinity.js';
import { TASTE_PROPAGATION_RATIO, TASTE_RELATION_RATIO } from '../src/services/taste/taste-policy.js';

const lookup = (...rows: Array<[string, string, number]>) =>
  buildTasteLookup(rows.map(([field, concept, weight]) => ({ field, concept, weight })));

describe('buildTasteLookup', () => {
  it('adds what was chosen and what was learned, kept within −1~1', () => {
    const taste = lookup(['places', 'cafe', 0.8], ['places', 'cafe', 0.6], ['style', '감성', -0.3]);
    expect(taste.weightOf('places', 'cafe')).toBe(1);
    expect(taste.weightOf('style', '감성')).toBe(-0.3);
    expect(taste.weightOf('places', 'sea')).toBe(0);
    expect(taste.isEmpty()).toBe(false);
    expect(lookup().isEmpty()).toBe(true);
  });
});

describe('conceptAffinity', () => {
  it('uses the concept’s own weight first', () => {
    expect(conceptAffinity(lookup(['places', 'cafe', 0.4], ['places', 'shop', 0.9]), 'places', 'cafe')).toBe(0.4);
  });

  it('falls back to the nearest ancestor, shrunk per level', () => {
    expect(conceptAffinity(lookup(['objects', 'food', 0.8]), 'objects', 'cake')).toBeCloseTo(
      0.8 * TASTE_PROPAGATION_RATIO ** 2,
      10,
    );
  });

  it('adds the taste for where an object is usually seen', () => {
    // 카페를 좋아하면 커피 스냅도 — 커피는 흔히 카페에서 보인다(typicallyAt).
    expect(conceptAffinity(lookup(['places', 'cafe', 0.6]), 'objects', 'coffee')).toBeCloseTo(
      TASTE_RELATION_RATIO * 0.6,
      10,
    );
  });

  it('is neutral without any taste', () => {
    expect(conceptAffinity(lookup(), 'places', 'sea')).toBe(0);
  });
});

describe('snapAffinity', () => {
  it('averages the taste over what the snap shows', () => {
    const taste = lookup(['places', 'sea', 0.6], ['objects', 'sky', -0.2]);
    expect(snapAffinity(taste, { places: ['해변'], objects: ['하늘', '스테이플러'] })).toBeCloseTo((0.6 - 0.2) / 2, 10);
  });

  it('is neutral for a snap with nothing the vocabulary knows', () => {
    expect(snapAffinity(lookup(['places', 'sea', 1]), { places: ['주차장'] })).toBe(0);
  });
});

describe('moods and the transitions they suit', () => {
  it('gathers the analysis moods and the moods the concepts evoke', () => {
    expect(moodsOfAnalysis({ places: ['바닷가'], moods: ['잔잔한'] }).sort()).toEqual(['calm', 'refreshing']);
  });

  it('lists the transitions those moods suit', () => {
    expect([...transitionsSuiting(['calm'])]).toEqual(['crossfade']);
    expect(transitionsSuiting([]).size).toBe(0);
  });
});

describe('recommendedStyle', () => {
  it('recommends nothing without enough to go by', () => {
    expect(recommendedStyle(lookup())).toBeNull();
    // 스타일을 한 번 바꾼 정도(0.1)로는 권하지 않는다.
    expect(recommendedStyle(lookup(['style', '여행', 0.1]))).toBeNull();
  });

  it('recommends the style the user keeps finishing movies in', () => {
    expect(recommendedStyle(lookup(['style', '여행', 0.2]))).toBe('여행');
    expect(recommendedStyle(lookup(['style', '여행', 0.2], ['style', '감성', 0.4]))).toBe('감성');
  });

  it('adds the styles the liked moods suit, and ignores disliked moods', () => {
    // 그리움(nostalgic)은 감성에 어울린다 — 0.4 × 비율 0.5 = 0.2.
    expect(recommendedStyle(lookup(['moods', 'nostalgic', 0.4]))).toBe('감성');
    expect(recommendedStyle(lookup(['moods', 'nostalgic', -1], ['style', '일상', 0.2]))).toBe('일상');
  });
});

