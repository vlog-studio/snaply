/**
 * 스냅 내용 개념 사전의 정합성을 고정한다.
 *
 * 원본은 `packages/shared-types/src/content-vocabulary.json` **하나**이고 워커도 같은 파일을 같은 규칙으로
 * 검사한다(`tests/test_content_vocabulary.py`). 시드 힌트가 사전에 있는지는 카탈로그를 읽는 DB 테스트
 * (`movie-templates.test.ts`)가 본다.
 *
 * 결정: docs/decisions/ontology-personalization.md §3. DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTENT_FIELDS,
  CONTENT_MATCH_FIELDS,
  CONTENT_VOCABULARY_VERSION,
  CONTENT_EVOKES_FIELDS,
  CONTENT_TYPICALLY_AT_FIELDS,
  CUT_ROLES,
  STYLE_PRESETS,
  TRANSITION_KINDS,
  contentConceptIds,
  contentEvokedMoods,
  contentMoodSuits,
  contentTypicalPlaces,
  contentConceptLineage,
  contentMatchScore,
  isContentConcept,
  isContentField,
  normalizeContentValue,
  normalizeContentValues,
} from '@vlog-studio/shared-types';

const SHARED_TYPES = join(fileURLToPath(new URL('../../..', import.meta.url)), 'packages', 'shared-types');

interface ConceptEntry {
  label: string;
  parent?: string;
  roleAffinity?: string;
  aliases: string[];
  typicallyAt?: string[];
  evokes?: string[];
  suits?: { transitions: string[]; styles: string[] };
}

interface VocabularyFile {
  contentVocabularyVersion: number;
  fields: string[];
  matchFields: string[];
  normalize: { particles: string[] };
  match: { exact: number; narrower: number; broader: number };
  concepts: Record<string, Record<string, ConceptEntry>>;
}

const vocabulary = JSON.parse(
  readFileSync(join(SHARED_TYPES, 'src', 'content-vocabulary.json'), 'utf-8'),
) as VocabularyFile;

const entries = (field: string) => Object.entries(vocabulary.concepts[field] ?? {});

describe('content vocabulary', () => {
  it('exports the file version', () => {
    expect(CONTENT_VOCABULARY_VERSION).toBe(vocabulary.contentVocabularyVersion);
  });

  it('declares the same fields as the TS tuples, with concepts for each', () => {
    expect([...CONTENT_FIELDS]).toEqual(vocabulary.fields);
    expect([...CONTENT_MATCH_FIELDS]).toEqual(vocabulary.matchFields);
    expect(Object.keys(vocabulary.concepts)).toEqual(vocabulary.fields);
    expect(isContentField('moods')).toBe(true);
    expect(isContentField('summary')).toBe(false);
  });

  it('matches on every field but moods', () => {
    expect(vocabulary.fields.filter((field) => field !== 'moods')).toEqual(vocabulary.matchFields);
  });

  it('keeps every alias (label included) on one concept within a field', () => {
    for (const field of vocabulary.fields) {
      const owner = new Map<string, string>();
      for (const [id, concept] of entries(field)) {
        for (const alias of [concept.label, ...concept.aliases]) {
          expect(owner.get(alias), `${field} "${alias}" in ${id} and ${owner.get(alias)}`).toBeUndefined();
          owner.set(alias, id);
        }
      }
    }
  });

  it('writes aliases already normalised — trimmed, single spaces, not empty', () => {
    for (const field of vocabulary.fields) {
      for (const [id, concept] of entries(field)) {
        for (const alias of [concept.label, ...concept.aliases]) {
          expect(alias, `${field}.${id}`).toBe(alias.trim().replace(/\s+/g, ' '));
          expect(alias.length, `${field}.${id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('points every parent at a concept of the same field, without cycles', () => {
    for (const field of CONTENT_FIELDS) {
      for (const [id, concept] of entries(field)) {
        if (concept.parent !== undefined) {
          expect(isContentConcept(field, concept.parent), `${field}.${id} → ${concept.parent}`).toBe(true);
        }
        const lineage = contentConceptLineage(field, id);
        // 순환이 있으면 뿌리(parent 없음)에 닿기 전에 끊긴다.
        const root = lineage[lineage.length - 1]!;
        expect(vocabulary.concepts[field]![root]!.parent, `${field}.${id} cycles`).toBeUndefined();
      }
    }
  });

  it('uses only cut roles for roleAffinity', () => {
    for (const field of vocabulary.fields) {
      for (const [id, concept] of entries(field)) {
        if (concept.roleAffinity !== undefined) {
          expect(CUT_ROLES as readonly string[], `${field}.${id}`).toContain(concept.roleAffinity);
        }
      }
    }
  });

  it('lists the concept ids in the file order', () => {
    expect(contentConceptIds('topics')).toEqual(Object.keys(vocabulary.concepts.topics!));
    expect(isContentConcept('places', 'cafe')).toBe(true);
    expect(isContentConcept('places', 'tea')).toBe(false);
    expect(isContentConcept('objects', 'tea')).toBe(true);
    expect(isContentConcept('places', 'toString')).toBe(false);
  });

  it('walks a concept up to its root', () => {
    expect(contentConceptLineage('objects', 'cake')).toEqual(['cake', 'dessert', 'food']);
    expect(contentConceptLineage('places', 'trail')).toEqual(['trail', 'park', 'scenery']);
    expect(contentConceptLineage('places', 'nowhere')).toEqual([]);
  });

  it('declares particles longest first so 에서 is tried before 에', () => {
    const particles = vocabulary.normalize.particles;
    for (let i = 1; i < particles.length; i += 1) {
      expect(particles[i]!.length, particles[i]).toBeLessThanOrEqual(particles[i - 1]!.length);
    }
  });

  it('scores a broader concept below a narrower one', () => {
    const { exact, narrower, broader } = vocabulary.match;
    expect(exact).toBe(1);
    expect(narrower).toBe(1);
    expect(broader).toBeGreaterThan(0);
    expect(broader).toBeLessThan(narrower);
  });
});

/** 정규화 규칙 — 사전 `_normalizeNote`(docs/decisions/ontology-personalization.md §3.4). */
describe('normalizeContentValue', () => {
  it('takes the whole value when it is an alias, after tidying spaces', () => {
    expect(normalizeContentValue('topics', '카페 투어')).toBe('cafe');
    expect(normalizeContentValue('topics', '  카페   투어 ')).toBe('cafe');
    expect(normalizeContentValue('places', '강의실')).toBe('school');
  });

  it('reads the head — the last word — first', () => {
    expect(normalizeContentValue('objects', '나무 테이블')).toBe('table');
    expect(normalizeContentValue('places', '역사 박물관')).toBe('exhibition');
    expect(normalizeContentValue('objects', '붉은 노을')).toBe('sunset');
  });

  it('tries the phrases that end with the head, longest first', () => {
    expect(normalizeContentValue('actions', '카페에 앉아 있기')).toBe('sit');
    expect(normalizeContentValue('places', '역 앞 버스 정류장')).toBe('bus_stop');
  });

  it('drops one particle from a word that is not the head', () => {
    expect(normalizeContentValue('objects', '소파에 놓인 쿠션')).toBe('sofa');
    expect(normalizeContentValue('places', '바다에서 수영')).toBe('sea');
  });

  it('never drops a particle from the head', () => {
    // `강의` 에서 `의` 를 떼면 `강`(river)이 된다.
    expect(normalizeContentValue('places', '대학 강의')).toBeUndefined();
  });

  it('does not look at substrings', () => {
    expect(normalizeContentValue('places', '맛집')).toBe('restaurant');
    expect(normalizeContentValue('places', '주차장')).toBeUndefined();
    expect(normalizeContentValue('objects', '잔디')).toBeUndefined();
    expect(normalizeContentValue('actions', '기타 연주하기')).toBeUndefined();
  });

  it('looks only within the field', () => {
    expect(normalizeContentValue('places', '차')).toBe('car');
    expect(normalizeContentValue('objects', '차')).toBe('tea');
    expect(normalizeContentValue('topics', '소파')).toBeUndefined();
  });

  it('normalises moods too', () => {
    expect(normalizeContentValue('moods', '잔잔한')).toBe('calm');
    // 머리(`분위기`)가 사전 밖이면 앞 낱말을 읽는다.
    expect(normalizeContentValue('moods', '따뜻한 분위기')).toBe('cozy');
  });

  it('returns nothing for blank or out-of-vocabulary values', () => {
    expect(normalizeContentValue('places', '   ')).toBeUndefined();
    expect(normalizeContentValue('objects', '스테이플러')).toBeUndefined();
  });

  it('keeps one of each concept in first-seen order and drops the rest', () => {
    expect(normalizeContentValues('objects', ['라떼', '케이크', '아메리카노', '스테이플러'])).toEqual([
      'coffee',
      'cake',
    ]);
  });
});

/** 매칭 관계 — 사전 `_matchNote` · `match` 의 네 경우(같음 · 하위 · 상위 · 그 밖). */
describe('contentMatchScore', () => {
  it('scores the same concept 1', () => {
    expect(contentMatchScore('places', 'cafe', 'cafe')).toBe(1);
  });

  it('scores a narrower snap concept 1, at any depth', () => {
    expect(contentMatchScore('places', 'shop', 'convenience_store')).toBe(1);
    expect(contentMatchScore('objects', 'sky', 'sunset')).toBe(1);
    expect(contentMatchScore('objects', 'food', 'cake')).toBe(1);
  });

  it('scores a broader snap concept 0.5', () => {
    expect(contentMatchScore('places', 'cafe', 'shop')).toBe(0.5);
  });

  it('scores siblings, unrelated and unknown concepts 0', () => {
    expect(contentMatchScore('places', 'cafe', 'restaurant')).toBe(0);
    expect(contentMatchScore('actions', 'walk', 'look_around')).toBe(0);
    expect(contentMatchScore('places', 'cafe', 'tea')).toBe(0);
    expect(contentMatchScore('places', '카페', 'cafe')).toBe(0);
  });
});

/** 개념 사이의 관계 — 사전 `_relationsNote` · decisions/ontology-personalization.md §3.2. 매칭에는 쓰지 않는다. */
describe('content vocabulary relations', () => {
  const KEYS = ['label', 'parent', 'roleAffinity', 'aliases', 'typicallyAt', 'evokes', 'suits'];

  function expectDistinctList(list: unknown, where: string): asserts list is string[] {
    expect(Array.isArray(list), where).toBe(true);
    expect((list as string[]).length, where).toBeGreaterThan(0);
    expect(new Set(list as string[]).size, where).toBe((list as string[]).length);
  }

  it('declares no keys beyond the known ones', () => {
    for (const field of vocabulary.fields) {
      for (const [id, concept] of entries(field)) {
        for (const key of Object.keys(concept)) expect(KEYS, `${field}.${id}`).toContain(key);
      }
    }
  });

  it('puts typicallyAt only on objects and actions, pointing at places', () => {
    for (const field of vocabulary.fields) {
      for (const [id, concept] of entries(field)) {
        if (concept.typicallyAt === undefined) continue;
        const where = `${field}.${id}`;
        expect(CONTENT_TYPICALLY_AT_FIELDS as readonly string[], where).toContain(field);
        expectDistinctList(concept.typicallyAt, where);
        for (const place of concept.typicallyAt) expect(isContentConcept('places', place), `${where} → ${place}`).toBe(true);
      }
    }
  });

  it('puts evokes only on places, objects and actions, pointing at moods', () => {
    for (const field of vocabulary.fields) {
      for (const [id, concept] of entries(field)) {
        if (concept.evokes === undefined) continue;
        const where = `${field}.${id}`;
        expect(CONTENT_EVOKES_FIELDS as readonly string[], where).toContain(field);
        expectDistinctList(concept.evokes, where);
        for (const mood of concept.evokes) expect(isContentConcept('moods', mood), `${where} → ${mood}`).toBe(true);
      }
    }
  });

  it('gives every mood, and only moods, the transitions and styles it suits', () => {
    for (const field of vocabulary.fields) {
      for (const [id, concept] of entries(field)) {
        const where = `${field}.${id}`;
        if (field !== 'moods') {
          expect(concept.suits, where).toBeUndefined();
          continue;
        }
        // 분위기 → 전환 · 스타일의 사슬이 끊기지 않게, 모든 분위기가 갖는다.
        expect(concept.suits, where).toBeDefined();
        expectDistinctList(concept.suits!.transitions, `${where}.transitions`);
        expectDistinctList(concept.suits!.styles, `${where}.styles`);
        for (const kind of concept.suits!.transitions) {
          expect(TRANSITION_KINDS as readonly string[], where).toContain(kind);
        }
        for (const style of concept.suits!.styles) expect(STYLE_PRESETS as readonly string[], where).toContain(style);
      }
    }
  });

  it('does not repeat what a concept already inherits', () => {
    for (const field of vocabulary.fields) {
      for (const [id, concept] of entries(field)) {
        if (concept.parent === undefined) continue;
        for (const key of ['typicallyAt', 'evokes'] as const) {
          if (concept[key] === undefined) continue;
          const fromParent =
            key === 'typicallyAt'
              ? contentTypicalPlaces(field as 'objects', concept.parent)
              : contentEvokedMoods(field as 'places', concept.parent);
          expect(concept[key], `${field}.${id}.${key}`).not.toEqual(fromParent);
        }
      }
    }
  });

  it('inherits typicallyAt and evokes from the nearest ancestor that has them', () => {
    expect(contentTypicalPlaces('objects', 'coffee')).toEqual(['cafe']);
    expect(contentTypicalPlaces('objects', 'cake')).toEqual(['cafe', 'bakery']);
    expect(contentTypicalPlaces('objects', 'chair')).toEqual([]);
    expect(contentEvokedMoods('places', 'sea')).toEqual(['refreshing']);
    expect(contentEvokedMoods('places', 'trail')).toEqual(['calm']);
    expect(contentEvokedMoods('places', 'viewpoint')).toEqual(['emotional']);
    expect(contentEvokedMoods('objects', 'child')).toEqual(['lively']);
  });

  it('answers nothing for fields a relation does not belong to', () => {
    expect(contentTypicalPlaces('places', 'cafe')).toEqual([]);
    expect(contentEvokedMoods('topics', 'cafe')).toEqual([]);
    expect(contentMoodSuits('nowhere')).toBeUndefined();
  });

  it('chains a snap concept to transitions through its mood', () => {
    // 잔잔함 → crossfade · 신남 → zoompunch (결정 문서의 예).
    const [mood] = contentEvokedMoods('places', 'river');
    expect(mood).toBe('calm');
    expect(contentMoodSuits(mood!)?.transitions[0]).toBe('crossfade');
    expect(contentMoodSuits('lively')?.transitions[0]).toBe('zoompunch');
  });
});
