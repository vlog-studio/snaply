/**
 * 스냅 내용의 개념 사전 — 분석의 자유 문자열을 닫힌 개념으로 바꾼다. 사용자에게 보이지 않는 내부 값이다(ANA-2).
 *
 * 원본은 `content-vocabulary.json` **하나**이고 워커(`tests/test_content_vocabulary.py`)도 같은 파일을 같은 규칙으로 검사한다.
 * 개념은 필드 안에서 id 로 구분하고, 상위 개념(`parent`)은 하나다(트리).
 *
 * 계획: `docs/plans/content-vocabulary.md` · 온톨로지로서의 결정: `docs/decisions/ontology-personalization.md`
 */
import vocabulary from './content-vocabulary.json' with { type: 'json' };

export const CONTENT_VOCABULARY = vocabulary;

/** 개념을 바꾸면 올린다. 추천 재사용 키에 들어간다. */
export const CONTENT_VOCABULARY_VERSION = vocabulary.contentVocabularyVersion;

/** 분석 결과의 목록 필드와 같은 이름, 사전 순서. */
export const CONTENT_FIELDS = ['places', 'objects', 'actions', 'topics', 'moods'] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

/** 템플릿 슬롯 힌트(`match_hints`)가 쓰는 필드. `moods` 는 매칭에 쓰지 않는다. */
export const CONTENT_MATCH_FIELDS = ['places', 'objects', 'actions', 'topics'] as const;
export type ContentMatchField = (typeof CONTENT_MATCH_FIELDS)[number];

export interface ContentConcept {
  label: string;
  parent?: string;
  roleAffinity?: string;
  aliases: string[];
}

const CONCEPTS = vocabulary.concepts as unknown as Record<ContentField, Record<string, ContentConcept>>;

export function isContentField(value: unknown): value is ContentField {
  return typeof value === 'string' && (CONTENT_FIELDS as readonly string[]).includes(value);
}

/** 그 필드의 개념 id, 사전 순서. */
export function contentConceptIds(field: ContentField): readonly string[] {
  return Object.keys(CONCEPTS[field]);
}

export function contentConcept(field: ContentField, id: string): ContentConcept | undefined {
  return Object.hasOwn(CONCEPTS[field], id) ? CONCEPTS[field][id] : undefined;
}

export function isContentConcept(field: ContentField, id: unknown): id is string {
  return typeof id === 'string' && contentConcept(field, id) !== undefined;
}

/** 자기부터 뿌리까지의 개념 id. 사전 밖이면 빈 배열이다. */
export function contentConceptLineage(field: ContentField, id: string): readonly string[] {
  const lineage: string[] = [];
  let current: string | undefined = id;
  while (current !== undefined && contentConcept(field, current) && !lineage.includes(current)) {
    lineage.push(current);
    current = contentConcept(field, current)?.parent;
  }
  return lineage;
}
