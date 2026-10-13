/**
 * 취향을 읽어 점수로 바꾼다 — 순수 함수다. 템플릿 순서 · 추천 가중 · 전환이 쓴다(결정 §4.4 · §7, PRF-3).
 *
 * 가중치는 감쇠를 적용한 값(`readTasteProfile`)을 받는다. 관심사(`explicit`)와 행동(`derived`)은 더해 −1~1 로 자른다.
 */
import {
  contentConceptLineage,
  contentEvokedMoods,
  contentMoodSuits,
  contentTypicalPlaces,
  contentConceptIds,
  normalizeContentValues,
  CONTENT_FIELDS,
  STYLE_PRESETS,
  type ContentField,
  type StylePreset,
} from '@vlog-studio/shared-types';
import type { TasteField } from './taste-math.js';
import { TASTE_PROPAGATION_RATIO, TASTE_RELATION_RATIO, TASTE_STYLE_MIN } from './taste-policy.js';

export interface TasteLookup {
  weightOf(field: TasteField, concept: string): number;
  isEmpty(): boolean;
}

const clamp = (value: number) => Math.min(1, Math.max(-1, value));

export function buildTasteLookup(
  entries: ReadonlyArray<{ field: string; concept: string; weight: number }>,
): TasteLookup {
  const weights = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.field}\n${entry.concept}`;
    weights.set(key, clamp((weights.get(key) ?? 0) + entry.weight));
  }
  return {
    weightOf: (field, concept) => weights.get(`${field}\n${concept}`) ?? 0,
    isEmpty: () => weights.size === 0,
  };
}

/**
 * 내용 개념 하나의 취향. 자기 행이 없으면 가장 가까운 상위 개념의 값을 한 단계마다 줄여 쓴다(가게를 좋아하면 카페도 조금).
 * 사물 · 행동은 흔히 보이는 장소의 취향을 `TASTE_RELATION_RATIO` 만큼 더한다(관계 확장).
 */
export function conceptAffinity(lookup: TasteLookup, field: ContentField, concept: string): number {
  let own = 0;
  const lineage = contentConceptLineage(field, concept);
  for (const [depth, ancestor] of lineage.entries()) {
    const weight = lookup.weightOf(field, ancestor);
    if (weight !== 0) {
      own = weight * TASTE_PROPAGATION_RATIO ** depth;
      break;
    }
  }
  const places = contentTypicalPlaces(field, concept);
  const related =
    places.length === 0
      ? 0
      : places.reduce((sum, place) => sum + conceptAffinity(lookup, 'places', place), 0) / places.length;
  return clamp(own + TASTE_RELATION_RATIO * related);
}

/** 개념 목록의 평균 취향. 개념이 없으면 0(중립). */
export function conceptsAffinity(
  lookup: TasteLookup,
  concepts: ReadonlyArray<{ field: ContentField; concept: string }>,
): number {
  if (concepts.length === 0) return 0;
  return concepts.reduce((sum, { field, concept }) => sum + conceptAffinity(lookup, field, concept), 0) / concepts.length;
}

export type AnalysisValues = Partial<Record<ContentField, readonly string[]>>;

/** 분석 값(자유 문자열)을 개념으로 바꾼 목록. */
export function conceptsOfAnalysis(analysis: AnalysisValues): Array<{ field: ContentField; concept: string }> {
  return CONTENT_FIELDS.flatMap((field) =>
    normalizeContentValues(field, analysis[field] ?? []).map((concept) => ({ field, concept })),
  );
}

/** 스냅 하나의 취향 — 그 스냅에 보이는 개념들의 평균. */
export function snapAffinity(lookup: TasteLookup, analysis: AnalysisValues): number {
  return conceptsAffinity(lookup, conceptsOfAnalysis(analysis));
}

/** 스냅의 분위기 — 분석이 낸 분위기와, 보이는 개념이 자아내는 분위기(`evokes`). */
export function moodsOfAnalysis(analysis: AnalysisValues): string[] {
  const moods = new Set<string>(normalizeContentValues('moods', analysis.moods ?? []));
  for (const { field, concept } of conceptsOfAnalysis(analysis)) {
    for (const mood of contentEvokedMoods(field, concept)) moods.add(mood);
  }
  return [...moods];
}

/** 분위기들에 어울리는 전환 kind. */
export function transitionsSuiting(moods: readonly string[]): Set<string> {
  return new Set(moods.flatMap((mood) => contentMoodSuits(mood)?.transitions ?? []));
}

/**
 * 이 사용자에게 권하는 스타일(PRF-3) — 스타일 취향에, 좋아하는 분위기가 어울리는 스타일(`suits.styles`)을 `TASTE_RELATION_RATIO` 만큼 더한 점수가
 * 가장 큰 것. 그 점수가 `TASTE_STYLE_MIN` 에 못 미치면 `null` — 권할 근거가 없으면 앱의 기본값(일상)을 쓴다. 동점이면 `STYLE_PRESETS` 순서.
 */
export function recommendedStyle(lookup: TasteLookup): StylePreset | null {
  const moods = contentConceptIds('moods');
  let best: { style: StylePreset; score: number } | null = null;
  for (const style of STYLE_PRESETS) {
    const suited = moods.filter((mood) => contentMoodSuits(mood)?.styles.includes(style));
    const fromMoods = suited.reduce((sum, mood) => sum + Math.max(0, lookup.weightOf('moods', mood)), 0);
    const score = lookup.weightOf('style', style) + TASTE_RELATION_RATIO * fromMoods;
    if (best === null || score > best.score) best = { style, score };
  }
  return best !== null && best.score >= TASTE_STYLE_MIN ? best.style : null;
}

