/**
 * 관심사(specs ACC-5) — 고를 수 있는 주제 목록, 고른 값의 검증, 취향 프로필과의 연결.
 *
 * 관심사는 개념 사전의 `topics` 에서만 고른다. 고른 관심사는 취향 프로필의 `explicit` 행이 되어 템플릿 순서 · 추천 · AI 편집 초안에
 * 반영되고(PRF-1 · PRF-3), 해제하면 그 행을 지운다(PRF-4). 결정: docs/decisions/ontology-personalization.md §4 · §5.
 */
import { contentConcept, contentConceptIds, type InterestTopic } from '@vlog-studio/shared-types';
import type { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { TASTE_INTEREST_WEIGHT } from './taste/taste-policy.js';

/** 고를 수 있는 주제, 사전 순서. */
export function listInterestTopics(): InterestTopic[] {
  return contentConceptIds('topics').map((id) => ({ id, label: contentConcept('topics', id)!.label }));
}

/** 사전에 있는 주제만, 처음 나온 순서로 중복 없이. 예전 빌드가 저장한 자유 문자열은 여기서 빠진다. */
export function knownInterests(values: readonly string[]): string[] {
  return [...new Set(values)].filter((value) => contentConcept('topics', value) !== undefined);
}

/** 쓰기 전의 검증 — 사전에 없는 값이 하나라도 있으면 400. 고칠 수 있게 무엇이 틀렸는지 알린다. */
export function requireKnownInterests(values: readonly string[]): string[] {
  const unknown = [...new Set(values)].filter((value) => contentConcept('topics', value) === undefined);
  if (unknown.length > 0) {
    throw new AppError(400, 'UNKNOWN_INTEREST', '고를 수 없는 관심사가 있습니다.', { unknown });
  }
  return [...new Set(values)];
}

/** 취향 프로필의 관심사 행을 고른 것과 같게 맞춘다 — 해제한 것은 지우고, 고른 것은 넣는다. 트랜잭션 안에서 부른다. */
export async function syncInterestTastes(
  tx: Prisma.TransactionClient,
  userId: string,
  interests: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  await tx.userTaste.deleteMany({
    where: { userId, source: 'explicit', field: 'topics', concept: { notIn: [...interests] } },
  });
  for (const concept of interests) {
    await tx.userTaste.upsert({
      where: { userId_field_concept_source: { userId, field: 'topics', concept, source: 'explicit' } },
      create: { userId, field: 'topics', concept, source: 'explicit', weight: TASTE_INTEREST_WEIGHT, evidence: 1, updatedAt: now },
      update: {},
    });
  }
}
