/**
 * 사용자 취향 프로필 — 신호를 받아 개념별 가중치를 갱신하고, 읽고, 파기한다.
 *
 * 결정: docs/decisions/ontology-personalization.md §4 · §5, 요구: specs PRF-1 · PRF-2 · PRF-4. 숫자는 `taste-policy.ts`,
 * 계산은 `taste-math.ts` 다.
 *
 * **신호는 요청을 늦추지 않는다.** 신호를 내는 곳(추천 · 초안 · 무비 저장 · 무비 완성)은 `emitTasteSignals` 로 넘기고 기다리지
 * 않는다. 착수 계획(plans/agentic-ontology-rollout.md §2.2)은 큐를 말하지만, 새 큐는 워커 프로세스와 배포 구성을 늘린다 —
 * 취향은 근사값이라 프로세스가 죽을 때 사라지는 신호 몇 개는 감수하고, 같은 프로세스 안에서 응답 뒤에 반영한다.
 *
 * **내용 개념은 분석 동의 아래에서만 쓴다.** 분석 결과에서 나온 개념이라 동의를 철회하면 파기한다(PRF-4). 철회와 반영이
 * 엇갈리지 않게 둘 다 같은 사용자 잠금(`tasteLockKey`) 안에서 하고, 반영은 잠금 안에서 동의를 다시 본다.
 */
import { CONTENT_FIELDS, normalizeContentValues, type ContentField } from '@vlog-studio/shared-types';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../db/client.js';
import { captureException } from '../../lib/sentry.js';
import { activeAnalysisConsentWhere } from '../analysis-consent.service.js';
import { ANALYSIS_VERSION } from '../video-analysis.service.js';
import {
  decayedWeight,
  isContentTasteField,
  nextWeight,
  propagateSignals,
  type TasteField,
  type TasteSignal,
} from './taste-math.js';

export type { TasteField, TasteSignal } from './taste-math.js';

/** 철회(`withdrawAnalysisConsent`)와 반영이 같이 잡는 사용자 잠금의 키. */
export function tasteLockKey(userId: string): string {
  return `taste:${userId}`;
}

export interface TasteEntry {
  field: TasteField;
  concept: string;
  source: 'explicit' | 'derived';
  /** 지금 시각까지 감쇠한 값. */
  weight: number;
  evidence: number;
}

/** 지금 시각의 취향 — 감쇠를 적용한 값. 5단계(취향 반영)가 읽는다. */
export async function readTasteProfile(userId: string, now: Date = new Date()): Promise<TasteEntry[]> {
  const rows = await getPrisma().userTaste.findMany({
    where: { userId },
    orderBy: [{ field: 'asc' }, { concept: 'asc' }, { source: 'asc' }],
  });
  return rows.map((row) => ({
    field: row.field as TasteField,
    concept: row.concept,
    source: row.source as TasteEntry['source'],
    // 관심사(`explicit`)는 사용자가 고른 것이라 옅어지지 않는다 — 해제할 때 지운다.
    weight: row.source === 'explicit' ? row.weight : decayedWeight(row.weight, row.updatedAt, now),
    evidence: row.evidence,
  }));
}

/**
 * 신호를 반영한다. 상위 개념으로 올린 뒤 개념마다 받은 순서대로 갱신한다 — 같은 개념이 두 번 오면 두 번 움직인다(반복된 근거다).
 * 행동에서 배운 것(`derived`)만 쓴다. 내용 개념은 동의가 없으면 버린다.
 */
export async function applyTasteSignals(
  userId: string,
  signals: readonly TasteSignal[],
  now: Date = new Date(),
): Promise<void> {
  if (signals.length === 0) return;
  const expanded = propagateSignals(signals);

  await getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tasteLockKey(userId)}, 0))`;

    let usable = expanded;
    if (expanded.some((signal) => isContentTasteField(signal.field))) {
      const consented = await tx.userConsent.findFirst({ where: activeAnalysisConsentWhere(userId), select: { id: true } });
      if (!consented) usable = expanded.filter((signal) => !isContentTasteField(signal.field));
    }
    if (usable.length === 0) return;

    const keyOf = (field: string, concept: string) => `${field}\n${concept}`;
    const existing = await tx.userTaste.findMany({
      where: {
        userId,
        source: 'derived',
        OR: [...new Set(usable.map((signal) => keyOf(signal.field, signal.concept)))].map((key) => {
          const [field, concept] = key.split('\n') as [string, string];
          return { field, concept };
        }),
      },
    });
    const state = new Map(
      existing.map((row) => [
        keyOf(row.field, row.concept),
        { weight: decayedWeight(row.weight, row.updatedAt, now), evidence: row.evidence },
      ]),
    );
    for (const signal of usable) {
      const key = keyOf(signal.field, signal.concept);
      const current = state.get(key) ?? { weight: 0, evidence: 0 };
      state.set(key, { weight: nextWeight(current.weight, signal.strength), evidence: current.evidence + 1 });
    }

    for (const [key, value] of state) {
      const [field, concept] = key.split('\n') as [string, string];
      await tx.userTaste.upsert({
        where: { userId_field_concept_source: { userId, field, concept, source: 'derived' } },
        create: { userId, field, concept, source: 'derived', weight: value.weight, evidence: value.evidence, updatedAt: now },
        update: { weight: value.weight, evidence: value.evidence, updatedAt: now },
      });
    }
  });
}

const pending = new Set<Promise<void>>();

/**
 * 신호를 응답 뒤에 반영한다 — 기다리지 않는다. 신호를 모으는 일(분석 읽기 등)도 함께 미룬다.
 * 실패는 요청을 실패시키지 않고 보고만 한다(취향은 근사값이다).
 */
export function emitTasteSignals(
  userId: string,
  collect: () => Promise<readonly TasteSignal[]> | readonly TasteSignal[],
): void {
  const task = (async () => {
    try {
      await applyTasteSignals(userId, await collect());
    } catch (err) {
      captureException(err, { userId, phase: 'taste-signals' });
    }
  })();
  pending.add(task);
  void task.finally(() => pending.delete(task));
}

/** 미뤄 둔 반영이 모두 끝나기를 기다린다. 테스트와 종료 처리가 쓴다. */
export async function settleTasteSignals(): Promise<void> {
  while (pending.size > 0) {
    await Promise.all([...pending]);
  }
}

/**
 * 스냅들의 내용 개념 신호 — 끝난 분석이 있는 스냅만 낸다(분석은 요청될 때만 돈다, PRF-1). 스냅 하나의 개념은 필드마다
 * 한 번씩이고, 스냅이 여럿이면 스냅마다 낸다.
 */
export async function contentSignalsOf(
  userId: string,
  videoIds: readonly string[],
  strength: number,
): Promise<TasteSignal[]> {
  if (videoIds.length === 0) return [];
  const analyses = await getPrisma().videoAnalysis.findMany({
    where: { videoId: { in: [...new Set(videoIds)] }, userId, analysisVersion: ANALYSIS_VERSION, status: 'done' },
    select: { videoId: true, places: true, objects: true, actions: true, topics: true, moods: true },
  });
  const byVideo = new Map(analyses.map((analysis) => [analysis.videoId, analysis]));
  return videoIds.flatMap((videoId) => {
    const analysis = byVideo.get(videoId);
    if (!analysis) return [];
    return CONTENT_FIELDS.flatMap((field: ContentField) =>
      normalizeContentValues(field, analysis[field]).map((concept) => ({ field, concept, strength })),
    );
  });
}

/**
 * 분석 동의 철회 때 지울 것 — 내용 개념의 `derived` 행 전부. 편집 개념(전환 · 스타일)은 분석과 무관해 남긴다(결정 §5).
 * 철회 트랜잭션 안에서 잠금 뒤에 부른다.
 */
export function purgeContentTastes(client: Prisma.TransactionClient | ReturnType<typeof getPrisma>, userId: string) {
  return client.userTaste.deleteMany({
    where: { userId, source: 'derived', field: { in: [...CONTENT_FIELDS] } },
  });
}
