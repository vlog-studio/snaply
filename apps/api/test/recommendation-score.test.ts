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
      { slotId: 'front', position: 0, hints: { objects: ['간판'], temporalPrior: 0 } },
      { slotId: 'drink', position: 1, hints: { objects: ['커피', '잔'], temporalPrior: 1 } },
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

  it('부분 문자열로 맞춘다 — 분석은 자유 문자열을 돌려준다', () => {
    const slot: ScoringSlot = { slotId: 'alley', position: 0, hints: { places: ['골목'] } };

    const score = scorePair(slot, 1, candidate('x', 0, { places: ['좁은 골목길'] }), 1);
    const noMatch = scorePair(slot, 1, candidate('y', 0, { places: ['해변'] }), 1);

    expect(score - noMatch).toBeCloseTo(SCORE_WEIGHTS.keyword, 5);
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
      { slotId: 'a', position: 0, hints: { objects: ['커피'] } },
      { slotId: 'b', position: 1, hints: { objects: ['커피'] } },
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

describe('parseMatchHints', () => {
  it('시드가 넣는 형태를 그대로 읽는다', () => {
    const hints = parseMatchHints({
      places: ['카페'],
      objects: ['메뉴판'],
      actions: [],
      topics: ['카페'],
      temporalPrior: 0.2,
    });

    expect(hints).toEqual({
      places: ['카페'],
      objects: ['메뉴판'],
      actions: [],
      topics: ['카페'],
      temporalPrior: 0.2,
    });
  });

  it('형태가 어긋난 힌트는 그 슬롯만 힌트 없이 돌게 한다', () => {
    // 한 행의 오타가 추천 전체를 무너뜨리면 안 된다.
    expect(parseMatchHints(null)).toEqual({});
    expect(parseMatchHints('nope')).toEqual({});
    expect(parseMatchHints({ places: 'cafe', temporalPrior: 'soon' })).toEqual({});
    expect(parseMatchHints({ places: ['카페', 3] })).toEqual({ places: ['카페'] });
  });

  it('temporalPrior 를 0~1 로 가둔다', () => {
    expect(parseMatchHints({ temporalPrior: 4 }).temporalPrior).toBe(1);
    expect(parseMatchHints({ temporalPrior: -2 }).temporalPrior).toBe(0);
  });
});

/**
 * 지금 키워드 매칭(양방향 부분 문자열)의 오탐 · 미탐을 **현행 결과로** 고정한다.
 *
 * 사례는 docs/plans/content-vocabulary.md §1 의 표다(오탐 16 · 미탐 12 · 유지 3). 개념 사전을 들이는
 * 변경에서 이 기대값이 뒤집히는 것이 그 변경의 증거다 — 어느 사례가 뒤집혔는지 diff 로 보이도록
 * `it.fails` 로 두지 않는다. 사례마다 사전 도입 뒤의 기대값(`then`)과 힌트가 옮겨 갈 개념 id 를 함께 적었다.
 */
describe('keyword matching — current substring rule', () => {
  type Field = 'places' | 'objects' | 'actions' | 'topics';
  interface Case {
    field: Field;
    /** 지금 시드에 있는 힌트. */
    hint: string;
    /** 사전 도입 뒤 그 힌트가 옮겨 갈 개념 id (계획 §2.1). */
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
  function keywordShare(field: Field, hint: string, value: string): number {
    const slot: ScoringSlot = { slotId: 's', position: 0, hints: { [field]: [hint] } };
    const withValue = scorePair(slot, 1, candidate('x', 0, { [field]: [value] }), 1);
    const without = scorePair(slot, 1, candidate('y', 0), 1);
    return Math.round((withValue - without) / SCORE_WEIGHTS.keyword);
  }

  it('counts the cases of the plan table', () => {
    expect([falsePositives.length, misses.length, kept.length]).toEqual([16, 12, 3]);
  });

  it.each(falsePositives)('false positive: $field "$hint" ← "$value"', (c) => {
    expect(keywordShare(c.field, c.hint, c.value)).toBe(c.now);
  });

  it.each(misses)('miss: $field "$hint" ← "$value"', (c) => {
    expect(keywordShare(c.field, c.hint, c.value)).toBe(c.now);
  });

  it.each(kept)('kept: $field "$hint" ← "$value"', (c) => {
    expect(keywordShare(c.field, c.hint, c.value)).toBe(c.now);
  });
});
