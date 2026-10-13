import { createHash } from 'node:crypto';
import {
  CONTENT_VOCABULARY_VERSION,
  MAX_DRAFT_SNAPS,
  type MovieDraft,
  type MovieDraftBody,
  type StylePreset,
} from '@vlog-studio/shared-types';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { enqueueSignals, type SignalsEnqueueOutcome } from '../queue/rendition-queue.js';
import {
  EDIT_DIRECTOR_VERSION,
  SIGNALS_VERSION,
  directDraft,
  draftSeedRoot,
  type DraftAnalysis,
  type DraftCandidate,
  type DraftSignals,
} from './edit-director.js';
import { ANALYSIS_VERSION, requestAnalysis } from './video-analysis.service.js';
import { activeAnalysisConsentWhere, isSnapAnalysisEnabled } from './analysis-consent.service.js';
import { contentSignalsOf, emitTasteSignals, readTasteProfile } from './taste/taste.service.js';
import { TASTE_POLICY_VERSION, TASTE_SIGNAL_STRENGTH } from './taste/taste-policy.js';
import { conceptsOfAnalysis, moodsOfAnalysis } from './taste/taste-affinity.js';
import type { AgentModel } from './edit-agent/agent-model.js';
import {
  EDIT_AGENT_PROMPT_VERSION,
  EDIT_AGENT_TASTE_TOP,
  EDIT_AGENT_TIME_LIMIT_MS,
} from './edit-agent/agent-policy.js';
import { resolveEditAgentModel } from './edit-agent/agent-runtime.js';
import { EditAgentError, runEditAgent, type SnapConcepts } from './edit-agent/edit-agent.js';

/**
 * AI 편집 초안의 제안(specs/movie.md MOV-21). 고르는 규칙은 `edit-director.ts`, 상한은
 * docs/decisions/auto-edit-draft.md §5.
 *
 * **무비를 만들지 않는다.** 앱의 무비는 기기에서 먼저 만들어지고 컷이 모두 업로드된 뒤에 서버로 오므로,
 * 업로드되지 않은 스냅이 섞인 초안은 서버가 무비로 만들 수 없다. 그래서 제안만 돌려주고 앱이 그 제안으로
 * 무비를 만든다 — 템플릿 추천과 같은 모양이다.
 *
 * **기다리지 않는다.** 신호는 업로드 때 계산해 두었으므로 요청 안에서 끝난다. 신호가 없는 스냅은 검사 없이
 * 들어가고, 신호 계산을 적재해 다음 요청부터 쓴다. vision 분석은 부르지 않는다 — 이미 있는 분석 결과만 얹는다.
 */

const DEFAULT_STYLE: StylePreset = '일상';

/** 최근 24시간 초안 수(잠정값 — 단가 실측 A-3 뒤 다시 정한다). */
export const DAILY_DRAFT_LIMIT = 10;
/** 같은 요청에 같은 제안을 돌려주는 창. 재사용은 횟수에 세지 않는다. */
export const DRAFT_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

type SnapInput = MovieDraftBody['snaps'][number];

/**
 * 저장하는 제안 — 응답에서 `unavailable` 을 뺀 것. `unavailable` 은 요청마다 그때의 스냅 상태로 붙인다(재사용한 제안에도).
 */
type StoredDraft = Omit<MovieDraft, 'unavailable'>;

function keyOf(snap: SnapInput): string {
  return 'videoId' in snap ? snap.videoId : snap.localId;
}

/**
 * (규칙 버전, 에이전트, 스타일, 스냅 집합)의 해시. 업로드되지 않은 스냅은 촬영 시각까지 넣는다 — 시각이 바뀌면 자리가 바뀐다.
 * 규칙 버전이 들어가야 규칙을 고친 뒤 같은 요청이 예전 제안을 재사용하지 않는다. 에이전트의 프롬프트 버전 · 모델과 개념 사전 ·
 * 취향 규칙 버전도 넣는다(decisions/ai-edit-agent.md §4) — 에이전트를 켜고 끄거나 바꾸면 예전 초안이 돌아오지 않는다.
 */
function snapHashOf(stylePreset: StylePreset, snaps: SnapInput[], agent: AgentModel | null): string {
  const parts = snaps
    .map((snap) => ('videoId' in snap ? `v:${snap.videoId}` : `l:${snap.localId}@${Date.parse(snap.capturedAt)}`))
    .sort();
  const agentKey = agent ? `agent:${EDIT_AGENT_PROMPT_VERSION}:${agent.name}` : 'agent:off';
  return createHash('sha256')
    .update(
      `edit-director:${EDIT_DIRECTOR_VERSION}:signals:${SIGNALS_VERSION}:${agentKey}:vocabulary:${CONTENT_VOCABULARY_VERSION}:taste:${TASTE_POLICY_VERSION}\n${stylePreset}\n${parts.join(',')}`,
    )
    .digest('hex');
}

function dedupeByKey(snaps: SnapInput[]): SnapInput[] {
  const seen = new Set<string>();
  return snaps.filter((snap) => {
    const key = keyOf(snap);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function requestDraft(params: {
  userId: string;
  stylePreset?: StylePreset;
  snaps: SnapInput[];
}): Promise<MovieDraft> {
  const prisma = getPrisma();
  const stylePreset = params.stylePreset ?? DEFAULT_STYLE;
  const snaps = dedupeByKey(params.snaps);

  if (snaps.length > MAX_DRAFT_SNAPS) {
    throw new AppError(400, 'TOO_MANY_SNAPS', `스냅은 한 번에 ${MAX_DRAFT_SNAPS}개까지 넘길 수 있습니다.`, {
      max: MAX_DRAFT_SNAPS,
    });
  }

  const handedIds = snaps.flatMap((snap) => ('videoId' in snap ? [snap.videoId] : []));
  // 소유·source 를 본다. 어느 것이 어긋났는지 알려주지 않는다 — 남의 id 로 존재를 떠보지 못하게.
  const owned = await prisma.video.findMany({
    where: { id: { in: handedIds }, userId: params.userId, kind: 'source' },
    select: { id: true, s3Key: true, capturedAt: true, createdAt: true, status: true, deletedAt: true },
  });
  if (owned.length !== handedIds.length) {
    throw AppError.forbidden('초안에 쓸 수 없는 스냅이 포함돼 있습니다.');
  }

  // 자기 스냅이지만 지워졌거나(다른 기기에서 지움 · 보관 기간 만료 — 기기는 아직 모를 수 있다) 준비되지 않은 스냅은 빼고
  // `unavailable` 로 알린다. 하나 때문에 요청 전체를 거절하면 앱은 다시 물어도 같은 거절을 받는다. `excluded` 에 넣지 않는
  // 것은 앱이 그 스냅을 다시 넣으라고 권하기 때문이다 — 서버에 없는 스냅으로는 무비를 만들 수 없다.
  const gone = new Set(owned.filter((video) => video.deletedAt !== null || video.status !== 'ready').map((video) => video.id));
  const unavailable = handedIds.filter((id) => gone.has(id)).map((videoId) => ({ videoId }));
  const videos = owned.filter((video) => !gone.has(video.id));
  const uploadedIds = videos.map((video) => video.id);
  const usable = snaps.filter((snap) => !('videoId' in snap) || !gone.has(snap.videoId));
  if (usable.length === 0) {
    // 고를 것이 없다. 비용도 없으므로 기록하지 않고 횟수에도 세지 않는다.
    return { stylePreset, cuts: [], excluded: [], unavailable };
  }

  const now = Date.now();
  const windowStart = new Date(now - DRAFT_REUSE_WINDOW_MS);
  // 쓸 수 있는 스냅만으로 따진다 — 초안은 그것만의 함수다. 그래서 스냅 하나가 나중에 사라져도 그 스냅을 담은 예전 제안은
  // 재사용되지 않는다(집합이 달라진다).
  const agent = resolveEditAgentModel();
  const snapHash = snapHashOf(stylePreset, usable, agent);

  // 에이전트가 실패해 규칙으로 만든 초안(`fallback`)은 재사용하지 않는다 — 일시적 실패가 하루 동안 남지 않게.
  const reusable = await prisma.movieDraft.findFirst({
    where: {
      userId: params.userId,
      snapHash,
      complete: true,
      mode: { not: 'fallback' },
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
    select: { result: true },
  });
  if (reusable) {
    return { ...(reusable.result as unknown as StoredDraft), unavailable };
  }

  // 한도는 새 초안에만 건다. 재사용은 비용이 없다. 여기서는 계산을 아끼는 빠른 거절이고, 집행은 기록할 때 잠금 안에서 한다.
  const recent = await prisma.movieDraft.count({
    where: { userId: params.userId, createdAt: { gte: windowStart } },
  });
  if (recent >= DAILY_DRAFT_LIMIT) {
    throw draftLimitError();
  }

  const [signalRows, analysisRows] = await Promise.all([
    prisma.videoSignals.findMany({ where: { videoId: { in: uploadedIds }, signalsVersion: SIGNALS_VERSION } }),
    // 이미 있는 분석만 쓴다. 분석 결과는 동의를 철회하면 지워지므로 남아 있는 것은 동의 아래 만든 것이다.
    prisma.videoAnalysis.findMany({
      where: { videoId: { in: uploadedIds }, userId: params.userId, analysisVersion: ANALYSIS_VERSION, status: 'done' },
      select: {
        videoId: true,
        usableForEdit: true,
        visualQualityScore: true,
        places: true,
        objects: true,
        actions: true,
        topics: true,
        moods: true,
      },
    }),
  ]);
  const signalsOf = new Map(signalRows.map((row) => [row.videoId, row]));
  const analysisOf = new Map(analysisRows.map((row) => [row.videoId, row]));
  const videoOf = new Map(videos.map((video) => [video.id, video]));

  const missing = videos.filter((video) => !signalsOf.has(video.id));
  const waiting = await enqueueMissingSignals(params.userId, missing);

  const candidates = usable.map((snap): DraftCandidate => {
    if (!('videoId' in snap)) {
      return { key: snap.localId, uploaded: false, capturedAt: Date.parse(snap.capturedAt), signals: null, analysis: null };
    }
    const video = videoOf.get(snap.videoId)!;
    const row = signalsOf.get(snap.videoId);
    const analysis = analysisOf.get(snap.videoId);
    const signals: DraftSignals | null = row
      ? {
          durationMs: row.durationMs,
          stepMs: row.stepMs,
          brightness: row.brightness,
          sharpness: row.sharpness,
          frameHashes: row.frameHashes,
          motion: row.motion,
          speech: row.speech as Array<[number, number]>,
        }
      : null;
    const draftAnalysis: DraftAnalysis | null = analysis
      ? {
          usableForEdit: analysis.usableForEdit,
          visualQualityScore: analysis.visualQualityScore,
          hasPlaces: analysis.places.length > 0,
          hasObjects: analysis.objects.length > 0,
          hasActions: analysis.actions.length > 0,
        }
      : null;
    return {
      key: snap.videoId,
      uploaded: true,
      // 촬영 시각이 없는 예전 스냅은 업로드 시각으로 대신한다(SNAP-10, 무비 정렬과 같은 기준).
      capturedAt: (video.capturedAt ?? video.createdAt).getTime(),
      signals,
      analysis: draftAnalysis,
    };
  });

  const seedRoot = draftSeedRoot(params.userId, usable.map(keyOf));
  const { direction, mode, plan } = await direct({
    userId: params.userId,
    agent,
    seedRoot,
    stylePreset,
    candidates,
    analyses: analysisRows,
  });
  const uploaded = new Set(uploadedIds);
  const draft: StoredDraft = {
    stylePreset,
    cuts: direction.cuts.map((cut) =>
      uploaded.has(cut.key)
        ? {
            videoId: cut.key,
            ...(cut.startMs !== undefined ? { startMs: cut.startMs } : {}),
            ...(cut.endMs !== undefined ? { endMs: cut.endMs } : {}),
          }
        : { localId: cut.key },
    ),
    excluded: direction.excluded.map((key) => (uploaded.has(key) ? { videoId: key } : { localId: key })),
  };

  await recordDraft(params.userId, windowStart, {
    stylePreset,
    snapHash,
    complete: waiting === 0,
    result: draft as unknown as Prisma.InputJsonValue,
    mode,
    ...(plan !== null ? { plan: plan as unknown as Prisma.InputJsonValue } : {}),
  });
  // 초안에 넘긴 스냅은 약한 선호 신호다(PRF-1). 새 제안에서만 낸다 — 재사용은 같은 요청의 반복이라 근거가 늘지 않는다.
  emitTasteSignals(params.userId, () => contentSignalsOf(params.userId, uploadedIds, TASTE_SIGNAL_STRENGTH.candidate));
  return { ...draft, unavailable };
}

/**
 * 초안을 정한다 — 에이전트를 쓸 수 있으면 에이전트로(MOV-25), 아니면 규칙만으로. 에이전트가 실패하거나 시간 상한을 넘기면
 * 규칙으로 돌아간다(`fallback`) — 초안은 언제나 나온다.
 *
 * 분석에 동의한 사용자만 개념(`content`)과 분석 툴을 받는다(ANA-5, decisions/ai-edit-agent.md §3.4). 이미 있는 분석은 동의 아래
 * 만든 것이지만(철회하면 지운다), 개념 툴을 열지는 지금의 동의로 정한다.
 */
async function direct(params: {
  userId: string;
  agent: AgentModel | null;
  seedRoot: string;
  stylePreset: StylePreset;
  candidates: DraftCandidate[];
  analyses: Array<{ videoId: string; places: string[]; objects: string[]; actions: string[]; topics: string[]; moods: string[] }>;
}): Promise<{ direction: ReturnType<typeof directDraft>; mode: 'agent' | 'rules' | 'fallback'; plan: unknown }> {
  const rules = () => directDraft({ seedRoot: params.seedRoot, stylePreset: params.stylePreset, candidates: params.candidates });
  if (params.agent === null) return { direction: rules(), mode: 'rules', plan: null };

  const prisma = getPrisma();
  const [consent, profile] = await Promise.all([
    prisma.userConsent.findFirst({ where: activeAnalysisConsentWhere(params.userId), select: { id: true } }),
    readTasteProfile(params.userId),
  ]);
  const content =
    consent === null
      ? null
      : new Map<string, SnapConcepts>(
          params.analyses.map((analysis) => [
            analysis.videoId,
            { concepts: conceptsOfAnalysis(analysis), moods: moodsOfAnalysis(analysis) },
          ]),
        );
  const taste = profile
    .filter((entry) => entry.weight !== 0)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, EDIT_AGENT_TASTE_TOP)
    .map(({ field, concept, weight }) => ({ field, concept, weight }));
  const analyze =
    consent !== null && isSnapAnalysisEnabled()
      ? async (videoIds: string[]) => {
          const requested: string[] = [];
          for (const videoId of videoIds) {
            try {
              await requestAnalysis({ userId: params.userId, videoId });
              requested.push(videoId);
            } catch (err) {
              // 분석할 수 없는 스냅(실패가 굳은 것 등)은 건너뛴다 — 초안은 지금 있는 개념으로 만든다.
              if (!(err instanceof AppError)) captureException(err, { videoId, phase: 'edit-agent-analyze' });
            }
          }
          return requested;
        }
      : null;

  try {
    const { result, plan } = await runEditAgent({
      model: params.agent,
      seedRoot: params.seedRoot,
      stylePreset: params.stylePreset,
      candidates: params.candidates,
      content,
      taste,
      analyze,
      deadline: Date.now() + EDIT_AGENT_TIME_LIMIT_MS,
    });
    return { direction: result, mode: 'agent', plan };
  } catch (err) {
    const reason = err instanceof EditAgentError ? err.reason : 'model';
    if (!(err instanceof EditAgentError)) captureException(err, { userId: params.userId, phase: 'edit-agent' });
    return {
      direction: rules(),
      mode: 'fallback',
      plan: { model: params.agent.name, error: reason, ...(err instanceof EditAgentError && err.usage ? { usage: err.usage } : {}) },
    };
  }
}

function draftLimitError(): AppError {
  return new AppError(429, 'DRAFT_LIMIT', '오늘 받을 수 있는 초안 수를 모두 썼습니다. 잠시 후 다시 시도하세요.');
}

/**
 * 제안을 기록한다 — 하루 한도를 다시 센 뒤에. 사용자별 잠금 안에서 세고 쓰므로 동시에 온 요청들이 같은 남은 횟수를 보고
 * 한도를 넘겨 쓰지 못한다. 잠금은 트랜잭션이 끝나면 풀린다(쿨다운 슬롯 `location.service.ts` 와 같은 방식).
 */
async function recordDraft(
  userId: string,
  windowStart: Date,
  data: Omit<Prisma.MovieDraftUncheckedCreateInput, 'userId'>,
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`movie-draft:${userId}`}, 0))`;
    const recent = await tx.movieDraft.count({ where: { userId, createdAt: { gte: windowStart } } });
    if (recent >= DAILY_DRAFT_LIMIT) {
      throw draftLimitError();
    }
    await tx.movieDraft.create({ data: { userId, ...data } });
  });
}

/**
 * 신호가 없는 스냅의 신호를 계산해 둔다. 돌려주는 값은 **아직 신호를 기다리는** 스냅 수다 — 이 신호 버전으로 읽을 수 없다고 끝난
 * 스냅과 원본이 없는 스냅은 기다릴 것이 없어 세지 않는다. 그런 스냅만 있었던 제안은 검사 없이 확정된 것이라 재사용한다 — 그러지
 * 않으면 같은 요청이 매번 새 행을 만들어 하루 한도를 썼다(backlog E-13).
 *
 * 적재가 실패해도 초안은 나간다 — 그 스냅은 검사 없이 들어갔을 뿐이고, 기다리는 것으로 센다.
 */
async function enqueueMissingSignals(
  userId: string,
  videos: Array<{ id: string; s3Key: string | null }>,
): Promise<number> {
  const outcomes = await Promise.all(
    videos.map(async (video): Promise<SignalsEnqueueOutcome> => {
      if (video.s3Key === null) return 'unreadable';
      try {
        return await enqueueSignals({ videoId: video.id, userId, s3Key: video.s3Key }, SIGNALS_VERSION);
      } catch (err) {
        captureException(err, { videoId: video.id, phase: 'signals-enqueue' });
        return 'queued';
      }
    }),
  );
  return outcomes.filter((outcome) => outcome !== 'unreadable').length;
}
