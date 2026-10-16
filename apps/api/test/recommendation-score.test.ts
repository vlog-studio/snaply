/**
 * 규칙 기반 슬롯 배정. DB·인프라 없이 도는 순수 함수 테스트다.
 *
 * 여기서 고정하는 것은 "어떤 스냅이 뽑히는가"가 아니라 **규칙이 무엇을 보장하는가**다.
 *   - 키워드가 하나도 맞지 않아도 시간순 배치보다 나빠지지 않는다 (안전망)
 *   - 못 쓸 스냅은 슬롯을 채우지 않는다
 *   - 같은 입력이면 같은 배정이 나온다
 *
 * 결정: docs/decisions/template-snap-recommendation.md §7
 */
import { describe, it, expect } from 'vitest';
import {
  assignSlots,
  parseMatchHints,
  scorePair,
  SCORE_WEIGHTS,
  type CandidateAnalysis,
  type ScoringCandidate,
  type ScoringSlot,
} from '../src/services/recommendation/score-slots.js';
import { TASTE_RECOMMENDATION_WEIGHT } from '../src/services/taste/taste-policy.js';

function analysis(over: Partial<CandidateAnalysis> = {}): CandidateAnalysis {
  return {
    topics: [],
    places: [],
    objects: [],
    actions: [],
    visualQualityScore: 0.8,
    usableForEdit: true,
    confidence: 0.9,
    ...over,
  };
}

function candidate(videoId: string, index: number, over?: Partial<CandidateAnalysis>) {
  return { videoId, index, analysis: analysis(over) } satisfies ScoringCandidate;
}

/** 시간 사전값만 가진 슬롯 n개 — 현행(시간순) 배치와 같은 조건. */
function plainSlots(count: number): ScoringSlot[] {
  return Array.from({ length: count }, (_, position) => ({
    slotId: `s${position}`,
    position,
    hints: {},
  }));
}

describe('assignSlots', () => {
  it('힌트가 없으면 촬영 순서대로 채운다 — 현행 배치가 하한선이다', () => {
    const slots = plainSlots(3);
    const candidates = [candidate('a', 0), candidate('b', 1), candidate('c', 2)];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(assigned.map((s) => s.videoId)).toEqual(['a', 'b', 'c']);
  });

  it('키워드가 맞는 스냅을 시간 순서보다 앞세운다', () => {
    const slots: ScoringSlot[] = [
      { slotId: 'front', position: 0, hints: { objects: ['signboard'], temporalPrior: 0 } },
      { slotId: 'drink', position: 1, hints: { objects: ['coffee', 'cup'], temporalPrior: 1 } },
    ];
    // 시간순으로는 커피가 먼저지만, 슬롯이 원하는 신호는 반대다.
    const candidates = [
      candidate('coffee', 0, { objects: ['커피', '케이크'] }),
      candidate('sign', 1, { objects: ['간판'] }),
    ];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(assigned.find((s) => s.slotId === 'front')?.videoId).toBe('sign');
    expect(assigned.find((s) => s.slotId === 'drink')?.videoId).toBe('coffee');
  });

  it('분석의 자유 문자열을 개념으로 바꿔 힌트 개념과 맞춘다', () => {
    const slot: ScoringSlot = { slotId: 'alley', position: 0, hints: { places: ['alley'] } };

    const score = scorePair(slot, 1, candidate('x', 0, { places: ['좁은 골목길'] }), 1);
    const noMatch = scorePair(slot, 1, candidate('y', 0, { places: ['해변'] }), 1);

    expect(score - noMatch).toBeCloseTo(SCORE_WEIGHTS.keyword, 5);
  });

  it('하위 개념은 슬롯을 온전히 채우고, 상위 개념은 반만 채운다', () => {
    const shop: ScoringSlot = { slotId: 'shop', position: 0, hints: { places: ['shop'] } };
    const cafe: ScoringSlot = { slotId: 'cafe', position: 0, hints: { places: ['cafe'] } };
    const empty = (slot: ScoringSlot) => scorePair(slot, 1, candidate('none', 0), 1);

    // 카페는 가게다 — 가게 슬롯을 채운다.
    expect(scorePair(shop, 1, candidate('x', 0, { places: ['커피숍'] }), 1) - empty(shop)).toBeCloseTo(
      SCORE_WEIGHTS.keyword,
      5,
    );
    // 가게라고만 했으면 카페일 수도 있다 — 잠정 0.5.
    expect(scorePair(cafe, 1, candidate('y', 0, { places: ['가게'] }), 1) - empty(cafe)).toBeCloseTo(
      SCORE_WEIGHTS.keyword * 0.5,
      5,
    );
    // 형제(식당)는 맞지 않는다.
    expect(scorePair(cafe, 1, candidate('z', 0, { places: ['음식점'] }), 1)).toBeCloseTo(empty(cafe), 5);
  });

  it('힌트마다 가장 잘 맞는 스냅 개념을 쓰고, 힌트 점수를 평균한다', () => {
    const slot: ScoringSlot = { slotId: 'drink', position: 0, hints: { objects: ['coffee', 'cup'] } };
    const empty = scorePair(slot, 1, candidate('none', 0), 1);

    const half = scorePair(slot, 1, candidate('x', 0, { objects: ['아메리카노', '잔디'] }), 1);

    expect(half - empty).toBeCloseTo(SCORE_WEIGHTS.keyword * 0.5, 5);
  });

  it('사전에 없는 힌트 id 는 맞지 않는다', () => {
    const slot: ScoringSlot = { slotId: 's', position: 0, hints: { places: ['카페'] } };

    const withValue = scorePair(slot, 1, candidate('x', 0, { places: ['카페'] }), 1);
    const without = scorePair(slot, 1, candidate('y', 0), 1);

    expect(withValue).toBeCloseTo(without, 5);
  });

  it('편집에 못 쓰는 스냅은 슬롯을 채우지 않고 이유와 함께 빠진다', () => {
    const slots = plainSlots(2);
    const candidates = [
      candidate('shaky', 0, { usableForEdit: false, visualQualityScore: 0.2 }),
      candidate('good', 1),
    ];

    const { slots: assigned, excluded } = assignSlots(slots, candidates);

    expect(assigned.map((s) => s.videoId)).toContain('good');
    expect(assigned.map((s) => s.videoId)).not.toContain('shaky');
    expect(excluded).toContainEqual({ videoId: 'shaky', reason: 'unusable' });
  });

  it('분석이 없는 후보는 analysis_failed 로 빠진다', () => {
    const slots = plainSlots(1);
    const candidates: ScoringCandidate[] = [{ videoId: 'nope', index: 0, analysis: null }];

    const { slots: assigned, excluded } = assignSlots(slots, candidates);

    expect(assigned[0]).toMatchObject({ videoId: null, score: null });
    expect(excluded).toEqual([{ videoId: 'nope', reason: 'analysis_failed' }]);
  });

  it('후보가 슬롯보다 적으면 남는 슬롯을 비워 둔다', () => {
    const { slots: assigned } = assignSlots(plainSlots(4), [candidate('a', 0), candidate('b', 1)]);

    expect(assigned.filter((s) => s.videoId === null)).toHaveLength(2);
  });

  it('슬롯보다 후보가 많으면 남은 후보는 no_match 다', () => {
    const { excluded } = assignSlots(plainSlots(1), [
      candidate('a', 0),
      candidate('b', 1),
      candidate('c', 2),
    ]);

    expect(excluded.map((e) => e.reason)).toEqual(['no_match', 'no_match']);
  });

  it('한 스냅이 두 슬롯을 차지하지 않는다', () => {
    const slots: ScoringSlot[] = [
      { slotId: 'a', position: 0, hints: { objects: ['coffee'] } },
      { slotId: 'b', position: 1, hints: { objects: ['coffee'] } },
    ];
    const candidates = [candidate('one', 0, { objects: ['커피'] }), candidate('two', 1)];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(new Set(assigned.map((s) => s.videoId))).toEqual(new Set(['one', 'two']));
  });

  it('같은 입력이면 같은 배정이 나온다 — 동점도 순서가 고정돼 있다', () => {
    const slots = plainSlots(3);
    const candidates = [candidate('a', 0), candidate('b', 1), candidate('c', 2)];

    const first = assignSlots(slots, candidates);
    const again = assignSlots(slots, candidates);

    expect(again).toEqual(first);
  });

  it('화질이 낮은 쪽이 같은 조건에서 밀린다', () => {
    const slots = plainSlots(1);
    const candidates = [
      candidate('blurry', 0, { visualQualityScore: 0.1 }),
      candidate('sharp', 0, { visualQualityScore: 1 }),
    ];

    const { slots: assigned } = assignSlots(slots, candidates);

    expect(assigned[0]).toMatchObject({ videoId: 'sharp' });
  });

  it('후보가 하나뿐이어도 시간 항이 무너지지 않는다', () => {
    const { slots: assigned } = assignSlots(plainSlots(1), [candidate('only', 0)]);

    expect(assigned[0]).toMatchObject({ videoId: 'only' });
    expect(assigned[0]?.score ?? 0).toBeGreaterThan(0);
  });
});

describe('assignSlots — taste (PRF-3)', () => {
  it('gives the slot to the snap the user likes when the rest ties', () => {
    const slots = plainSlots(1);
    const candidates: ScoringCandidate[] = [
      { ...candidate('plain', 0), taste: 0 },
      { ...candidate('liked', 0), taste: 0.8 },
    ];

    expect(assignSlots(slots, candidates).slots[0]).toMatchObject({ videoId: 'liked' });
  });

  it('only lowers a disliked snap — it still fills a slot nothing else wants', () => {
    const { slots: assigned, excluded } = assignSlots(plainSlots(1), [{ ...candidate('disliked', 0), taste: -1 }]);

    expect(assigned[0]).toMatchObject({ videoId: 'disliked' });
    expect(excluded).toEqual([]);
  });

  it('scores exactly as before without taste', () => {
    const slot: ScoringSlot = { slotId: 's', position: 0, hints: { places: ['cafe'] } };
    // 점수가 상한(1)에 닿지 않는 후보 — 키워드가 맞지 않는다.
    const plain = candidate('x', 0, { places: ['해변'] });

    expect(scorePair(slot, 1, { ...plain, taste: 0 }, 1)).toBe(scorePair(slot, 1, plain, 1));
    expect(scorePair(slot, 1, { ...plain, taste: 1 }, 1) - scorePair(slot, 1, plain, 1)).toBeCloseTo(
      TASTE_RECOMMENDATION_WEIGHT,
      10,
    );
  });
});

describe('parseMatchHints', () => {
  it('시드가 넣는 형태를 그대로 읽는다', () => {
    const hints = parseMatchHints({
      places: ['cafe'],
      objects: ['menu'],
      actions: [],
      topics: ['cafe'],
      temporalPrior: 0.2,
    });

    expect(hints).toEqual({
      places: ['cafe'],
      objects: ['menu'],
      actions: [],
      topics: ['cafe'],
      temporalPrior: 0.2,
    });
  });

  it('형태가 어긋난 힌트는 그 슬롯만 힌트 없이 돌게 한다', () => {
    // 한 행의 오타가 추천 전체를 무너뜨리면 안 된다.
    expect(parseMatchHints(null)).toEqual({});
    expect(parseMatchHints('nope')).toEqual({});
    expect(parseMatchHints({ places: 'cafe', temporalPrior: 'soon' })).toEqual({});
    expect(parseMatchHints({ places: ['cafe', 3] })).toEqual({ places: ['cafe'] });
  });

  it('temporalPrior 를 0~1 로 가둔다', () => {
    expect(parseMatchHints({ temporalPrior: 4 }).temporalPrior).toBe(1);
    expect(parseMatchHints({ temporalPrior: -2 }).temporalPrior).toBe(0);
  });
});

/**
 * 부분 문자열 매칭이 만들던 오탐 · 미탐이 개념 매칭에서 사라졌는지 고정한다.
 *
 * 사례는 사전 도입 때(2026-10-07) 모은 표다(오탐 16 · 미탐 12 · 유지 3 — docs/decisions/ontology-personalization.md §1). 사전 도입 전에는 같은 사례를
 * 시드의 자유 문자열 힌트(`hint`)로 재어 `now` 를 고정했고, 사전을 들이는 변경에서 힌트를 개념 id(`concept`)로 바꾸고
 * 기대값을 `then` 으로 뒤집었다. 사전을 되돌리면 `hint` · `now` 로 되돌린다.
 */
describe('keyword matching — concept vocabulary', () => {
  type Field = 'places' | 'objects' | 'actions' | 'topics';
  interface Case {
    field: Field;
    /** 지금 시드에 있는 힌트. */
    hint: string;
    /** 사전 도입 뒤 그 힌트가 옮겨 갈 개념 id(시드 힌트 마이그레이션). */
    concept: string;
    value: string;
    /** 1 = 키워드 몫이 맞음, 0 = 맞지 않음. */
    now: 0 | 1;
    then: 0 | 1;
  }

  const falsePositives: Case[] = [
    { field: 'places', hint: '집', concept: 'home', value: '맛집', now: 1, then: 0 },
    { field: 'places', hint: '강', concept: 'river', value: '강의실', now: 1, then: 0 },
    { field: 'places', hint: '역', concept: 'station', value: '역사 박물관', now: 1, then: 0 },
    { field: 'places', hint: '산', concept: 'mountain', value: '공원 산책로', now: 1, then: 0 },
    { field: 'places', hint: '차', concept: 'car', value: '주차장', now: 1, then: 0 },
    { field: 'objects', hint: '잔', concept: 'cup', value: '잔디', now: 1, then: 0 },
    { field: 'objects', hint: '손', concept: 'hand', value: '손님', now: 1, then: 0 },
    { field: 'objects', hint: '담', concept: 'wall', value: '담요', now: 1, then: 0 },
    { field: 'objects', hint: '문', concept: 'door', value: '신문', now: 1, then: 0 },
    { field: 'objects', hint: '창', concept: 'window', value: '창고', now: 1, then: 0 },
    { field: 'objects', hint: '나무', concept: 'tree', value: '나무 테이블', now: 1, then: 0 },
    { field: 'actions', hint: '들', concept: 'hold', value: '친구들과 대화하기', now: 1, then: 0 },
    { field: 'actions', hint: '타', concept: 'ride', value: '기타 연주하기', now: 1, then: 0 },
    { field: 'actions', hint: '보', concept: 'look_around', value: '보고서 작성하기', now: 1, then: 0 },
    { field: 'actions', hint: '보', concept: 'look_around', value: '스마트폰 보기', now: 1, then: 0 },
    { field: 'actions', hint: '돌아', concept: 'walk', value: '주변 돌아보기', now: 1, then: 0 },
  ];

  const misses: Case[] = [
    { field: 'objects', hint: '커피', concept: 'coffee', value: '아메리카노', now: 0, then: 1 },
    { field: 'objects', hint: '커피', concept: 'coffee', value: '라떼', now: 0, then: 1 },
    { field: 'objects', hint: '디저트', concept: 'dessert', value: '마카롱', now: 0, then: 1 },
    { field: 'places', hint: '카페', concept: 'cafe', value: '커피숍', now: 0, then: 1 },
    { field: 'places', hint: '바다', concept: 'sea', value: '바닷가', now: 0, then: 1 },
    { field: 'places', hint: '바다', concept: 'sea', value: '해변', now: 0, then: 1 },
    { field: 'places', hint: '식당', concept: 'restaurant', value: '음식점', now: 0, then: 1 },
    { field: 'places', hint: '가게', concept: 'shop', value: '편의점', now: 0, then: 1 },
    { field: 'places', hint: '가게', concept: 'shop', value: '빵집', now: 0, then: 1 },
    { field: 'places', hint: '풍경', concept: 'scenery', value: '야경', now: 0, then: 1 },
    { field: 'actions', hint: '걷', concept: 'walk', value: '산책하기', now: 0, then: 1 },
    { field: 'actions', hint: '먹', concept: 'eat', value: '식사하기', now: 0, then: 1 },
  ];

  const kept: Case[] = [
    { field: 'places', hint: '골목', concept: 'alley', value: '좁은 골목길', now: 1, then: 1 },
    { field: 'objects', hint: '커피', concept: 'coffee', value: '아이스 커피', now: 1, then: 1 },
    { field: 'actions', hint: '마시', concept: 'drink', value: '커피 마시기', now: 1, then: 1 },
  ];

  /** `scorePair` 의 키워드 몫만 꺼낸다 — 같은 슬롯에서 값이 없는 후보와의 차를 가중치로 나눈다. */
  function keywordShare(field: Field, concept: string, value: string): number {
    const slot: ScoringSlot = { slotId: 's', position: 0, hints: { [field]: [concept] } };
    const withValue = scorePair(slot, 1, candidate('x', 0, { [field]: [value] }), 1);
    const without = scorePair(slot, 1, candidate('y', 0), 1);
    return Math.round((withValue - without) / SCORE_WEIGHTS.keyword);
  }

  it('counts the cases of the plan table', () => {
    expect([falsePositives.length, misses.length, kept.length]).toEqual([16, 12, 3]);
  });

  it.each(falsePositives)('false positive no more: $field $concept ← "$value"', (c) => {
    expect(keywordShare(c.field, c.concept, c.value)).toBe(c.then);
  });

  it.each(misses)('miss no more: $field $concept ← "$value"', (c) => {
    expect(keywordShare(c.field, c.concept, c.value)).toBe(c.then);
  });

  it.each(kept)('still kept: $field $concept ← "$value"', (c) => {
    expect(keywordShare(c.field, c.concept, c.value)).toBe(c.then);
  });
});
