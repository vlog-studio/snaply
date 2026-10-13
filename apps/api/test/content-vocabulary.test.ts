/**
 * 스냅 내용 개념 사전의 정합성을 고정한다.
 *
 * 원본은 `packages/shared-types/src/content-vocabulary.json` **하나**이고 워커도 같은 파일을 같은 규칙으로
 * 검사한다(`tests/test_content_vocabulary.py`). 시드 힌트가 사전에 있는지는 카탈로그를 읽는 DB 테스트
 * (`movie-templates.test.ts`)가 본다.
 *
 * 계획: docs/plans/content-vocabulary.md §5.2. DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTENT_FIELDS,
  CONTENT_MATCH_FIELDS,
  CONTENT_VOCABULARY_VERSION,
  CUT_ROLES,
  contentConceptIds,
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

/** 정규화 규칙 — 사전 `_normalizeNote` · docs/plans/content-vocabulary.md §3 · §5.3. */
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

/** 매칭 관계 — docs/plans/content-vocabulary.md §4 의 네 줄. */
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
