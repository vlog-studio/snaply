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

/** 분위기에 어울리는 전환(`transition-vocabulary.json` 의 kind)과 스타일 프리셋, 앞일수록 더 어울린다. */
export interface ContentMoodSuits {
  transitions: string[];
  styles: string[];
}

export interface ContentConcept {
  label: string;
  parent?: string;
  roleAffinity?: string;
  aliases: string[];
  /** objects · actions 만. 흔히 보이는 places 개념. */
  typicallyAt?: string[];
  /** places · objects · actions 만. 자아내는 moods 개념. */
  evokes?: string[];
  /** moods 만. */
  suits?: ContentMoodSuits;
}

/** `typicallyAt` 을 가질 수 있는 필드. */
export const CONTENT_TYPICALLY_AT_FIELDS = ['objects', 'actions'] as const;
/** `evokes` 를 가질 수 있는 필드. */
export const CONTENT_EVOKES_FIELDS = ['places', 'objects', 'actions'] as const;

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

const PARTICLES: readonly string[] = vocabulary.normalize.particles;

/** 별칭(label 포함) → 개념 id. 필드마다 따로 둔다 — 같은 표기가 필드에 따라 다른 개념일 수 있다(`차`). */
const ALIASES = new Map<ContentField, Map<string, string>>(
  CONTENT_FIELDS.map((field) => {
    const byAlias = new Map<string, string>();
    for (const [id, concept] of Object.entries(CONCEPTS[field])) {
      for (const alias of [concept.label, ...concept.aliases]) byAlias.set(alias, id);
    }
    return [field, byAlias];
  }),
);

function aliasOf(field: ContentField, text: string): string | undefined {
  return ALIASES.get(field)?.get(text);
}

/** 끝의 조사를 하나 떼어 남은 것이 별칭이면 그 개념. 조사 목록은 긴 것부터다(`에서` 가 `에` 보다 먼저). */
function aliasWithoutParticle(field: ContentField, word: string): string | undefined {
  for (const particle of PARTICLES) {
    if (word.length > particle.length && word.endsWith(particle)) {
      const found = aliasOf(field, word.slice(0, -particle.length));
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * 분석의 자유 문자열 하나를 그 필드의 개념 하나로 바꾼다. 사전 밖이면 `undefined`.
 *
 * 규칙은 사전 `_normalizeNote` 와 `docs/plans/content-vocabulary.md` §3 이다 — 값 전체 → 끝 낱말로 끝나는 구(긴 것부터) →
 * 나머지 낱말을 오른쪽부터(조사 하나를 떼어 볼 수 있다). 한국어 명사구 · 동사구는 머리가 끝에 온다. 부분 문자열은 보지 않는다.
 */
export function normalizeContentValue(field: ContentField, value: string): string | undefined {
  const words = value.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return undefined;

  for (let start = 0; start < words.length; start += 1) {
    const found = aliasOf(field, words.slice(start).join(' '));
    if (found) return found;
  }
  for (let index = words.length - 2; index >= 0; index -= 1) {
    const word = words[index]!;
    const found = aliasOf(field, word) ?? aliasWithoutParticle(field, word);
    if (found) return found;
  }
  return undefined;
}

/** 값 목록을 개념 목록으로. 사전 밖은 빠지고, 같은 개념은 한 번만 남는다(처음 나온 순서). */
export function normalizeContentValues(field: ContentField, values: readonly string[]): string[] {
  const concepts: string[] = [];
  for (const value of values) {
    const concept = normalizeContentValue(field, value);
    if (concept !== undefined && !concepts.includes(concept)) concepts.push(concept);
  }
  return concepts;
}

/**
 * 슬롯 힌트의 개념이 스냅의 개념으로 얼마나 채워지는가 — 같거나 스냅이 하위면 1, 스냅이 상위면 0.5(잠정), 그 밖(형제 포함) 0.
 * 사전 밖 개념은 0 이다. 계획 §4.
 */
export function contentMatchScore(field: ContentField, hint: string, snap: string): number {
  if (!isContentConcept(field, hint) || !isContentConcept(field, snap)) return 0;
  if (hint === snap) return vocabulary.match.exact;
  if (contentConceptLineage(field, snap).includes(hint)) return vocabulary.match.narrower;
  if (contentConceptLineage(field, hint).includes(snap)) return vocabulary.match.broader;
  return 0;
}

/** 자기부터 위로 올라가며 처음 값이 있는 개념의 값 — 하위 개념은 상위의 값을 물려받는다(사전 `_relationsNote`). */
function inherited(field: ContentField, id: string, key: 'typicallyAt' | 'evokes'): readonly string[] {
  for (const ancestor of contentConceptLineage(field, id)) {
    const value = contentConcept(field, ancestor)?.[key];
    if (value !== undefined) return value;
  }
  return [];
}

/** 이 개념이 흔히 보이는 places 개념(`typicallyAt`, 물려받기 포함). 커피 → 카페. */
export function contentTypicalPlaces(field: ContentField, id: string): readonly string[] {
  return (CONTENT_TYPICALLY_AT_FIELDS as readonly string[]).includes(field) ? inherited(field, id, 'typicallyAt') : [];
}

/** 이 개념이 자아내는 moods 개념(`evokes`, 물려받기 포함). 바다 → 청량함. */
export function contentEvokedMoods(field: ContentField, id: string): readonly string[] {
  return (CONTENT_EVOKES_FIELDS as readonly string[]).includes(field) ? inherited(field, id, 'evokes') : [];
}

/** 분위기에 어울리는 전환 · 스타일(`suits`). 사전 밖 분위기면 `undefined`. */
export function contentMoodSuits(mood: string): ContentMoodSuits | undefined {
  return contentConcept('moods', mood)?.suits;
}
