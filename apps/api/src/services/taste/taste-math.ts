/**
 * 취향 가중치의 계산 — 순수 함수다. DB · 시각을 읽지 않으므로(시각은 인자로 받는다) 규칙을 테스트가 그대로 고정한다.
 * 규칙: docs/decisions/ontology-personalization.md §4.3 · §4.4. 숫자: `taste-policy.ts`.
 */
import { CONTENT_FIELDS, contentConceptLineage, type ContentField } from '@vlog-studio/shared-types';
import { TASTE_HALF_LIFE_MS, TASTE_LEARNING_RATE, TASTE_PROPAGATION_RATIO } from './taste-policy.js';

/** 내용 개념(개념 사전의 필드)과 편집 개념(전환 kind · 스타일 프리셋). */
export type TasteField = ContentField | 'transition' | 'style';

export interface TasteSignal {
  field: TasteField;
  concept: string;
  strength: number;
}

export function isContentTasteField(field: TasteField): field is ContentField {
  return (CONTENT_FIELDS as readonly string[]).includes(field);
}

/**
 * 마지막 신호 뒤로 흐른 시간만큼 옅어진 가중치. 신호가 없으면 0(중립)으로 서서히 돌아온다 — 예전의 비선호도 다시 기회를 얻는다.
 */
export function decayedWeight(weight: number, updatedAt: Date, now: Date): number {
  const elapsed = Math.max(0, now.getTime() - updatedAt.getTime());
  return weight * 0.5 ** (elapsed / TASTE_HALF_LIFE_MS);
}

/**
 * 신호 하나를 반영한 가중치: `w + 학습률 × 강도 × (1 − |w|)`. ±1 에 가까울수록 덜 움직여 범위를 넘지 않고,
 * 굳은 취향은 한두 번의 반대 신호로 뒤집히지 않는다.
 */
export function nextWeight(weight: number, strength: number): number {
  const next = weight + TASTE_LEARNING_RATE * strength * (1 - Math.abs(weight));
  return Math.min(1, Math.max(-1, next));
}

/**
 * 신호를 상위 개념으로 올린다 — 한 단계마다 `TASTE_PROPAGATION_RATIO` 를 곱한다. 편집 개념과 사전 밖 개념은 그대로다.
 * 돌려주는 순서는 받은 순서이고, 신호마다 자기 → 부모 → 조부모 순이다.
 */
export function propagateSignals(signals: readonly TasteSignal[]): TasteSignal[] {
  return signals.flatMap((signal) => {
    if (!isContentTasteField(signal.field)) return [signal];
    const lineage = contentConceptLineage(signal.field, signal.concept);
    if (lineage.length === 0) return [signal];
    return lineage.map((concept, depth) => ({
      field: signal.field,
      concept,
      strength: signal.strength * TASTE_PROPAGATION_RATIO ** depth,
    }));
  });
}
