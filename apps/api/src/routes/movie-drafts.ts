import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MAX_DRAFT_SNAPS, getMovieDraftAllowance, ok, requestMovieDraft } from '@vlog-studio/shared-types';
import { EDIT_DRAFT_COST, FREE_EDIT_DRAFTS_PER_DAY } from '../services/billing/credit-policy.js';
import { DAILY_DRAFT_LIMIT, getDraftAllowance, requestDraft } from '../services/movie-draft.service.js';

export async function movieDraftRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // POST /movie-drafts — 편집 초안 제안 (동기, 멱등)
  routes.post(
    requestMovieDraft.fastifyPath,
    {
      preHandler: app.authenticate,
      config: {
        // 유저(토큰)당 분당 10회. 비용 방어는 일일 한도가 하고, 이건 버스트만 막는다.
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.headers.authorization ?? req.ip,
        },
      },
      schema: {
        ...requestMovieDraft.schema,
        tags: ['movies'],
        summary: '넘긴 스냅으로 편집 초안 제안 받기',
        description: [
          '넘긴 스냅 중 쓸 것을 고르고(못 쓰는 것·중복은 뺀다), 촬영순으로 놓고, 컷마다 구간을 자른 **제안**을 돌려준다.',
          '**무비를 만들지 않는다** — 앱이 이 컷들로 무비를 만들고(`POST /movies`, `arranger: ai`, 컷마다',
          '`trimOwner: ai`) 업로드가 끝나면 지금처럼 보낸다. 전환은 그때 서버가 고른다.',
          '',
          '**업로드되지 않은 스냅도 넘긴다**(`localId` + `capturedAt`). 빼지 않고 촬영 시각 자리에 구간 없이 놓는다.',
          '업로드됐지만 신호가 아직 없는 스냅도 같다 — 서버가 신호 계산을 적재해 두고 다음 요청부터 쓴다.',
          '',
          '**분석을 기다리지 않는다.** 응답이 곧 결과다 — AI 에이전트가 계획하는 동안(수 초, 길어야 20초) 걸린다(MOV-25).',
          '분석에 동의하지 않았거나 분석이 꺼져 있어도 초안은 나온다.',
          '',
          `**과금**(CRD-9): 에이전트가 만든 초안은 최근 24시간 **${FREE_EDIT_DRAFTS_PER_DAY}번까지 무료**이고, 그 뒤로는 1번에`,
          `**${EDIT_DRAFT_COST}크레딧**이다. 잔액이 모자라면 402 \`INSUFFICIENT_CREDITS\` + \`required\` · \`balance\` 로 시작하지 않는다.`,
          '에이전트가 끝까지 만들지 못해 규칙으로 만든 초안은 돌려주고, 쓴 크레딧은 응답의 `chargedCredits` 다. 다음 초안의 비용은',
          '`GET /movie-drafts/allowance`.',
          '',
          `**상한**: 한 번에 스냅 **${MAX_DRAFT_SNAPS}개**(넘으면 400 \`TOO_MANY_SNAPS\` + \`max\`), 최근 24시간 **${DAILY_DRAFT_LIMIT}번**`,
          '(유료 포함, 넘으면 429 `DRAFT_LIMIT`). 같은 스타일 · 같은 스냅 집합이 24시간 안에 다시 오면 같은 제안을 돌려주고',
          '횟수에도 비용에도 세지 않는다.',
          '',
          '`excluded` 는 넣지 않은 스냅이다. **이유는 주지 않는다** — 앱은 개수를 알리고 다시 넣을 수 있게 한다.',
          '',
          '`unavailable` 은 넘긴 자기 스냅 중 지워졌거나 준비되지 않아 서버가 쓸 수 없는 것이다. 나머지로 초안을 만들고, 모두',
          '그렇다면 `cuts` 가 비어 있다(기록하지 않고 횟수에 세지 않는다). 남의 스냅이 섞이면 어느 것인지 알리지 않고 403 이다.',
        ].join('\n'),
      },
    },
    async (request) => {
      const draft = await requestDraft({
        userId: request.user.id,
        ...(request.body.stylePreset !== undefined ? { stylePreset: request.body.stylePreset } : {}),
        snaps: request.body.snaps,
      });
      return ok(draft);
    },
  );

  // GET /movie-drafts/allowance — 다음 초안이 무료인지, 얼마인지
  routes.get(
    getMovieDraftAllowance.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getMovieDraftAllowance.schema,
        tags: ['movies'],
        summary: '다음 편집 초안의 비용',
        description: [
          `AI 에이전트가 만드는 초안은 최근 24시간 ${FREE_EDIT_DRAFTS_PER_DAY}번까지 무료이고 그 뒤로 1번에 ${EDIT_DRAFT_COST}크레딧이다(CRD-9).`,
          '앱은 초안을 요청하기 전에 남은 무료 횟수(`freeRemaining`)나 이번 비용(`nextCost`)을 보인다. 서버에 에이전트가 없으면',
          '(`agent: false`) 초안은 늘 무료이고 횟수도 세지 않는다.',
        ].join('\n'),
      },
    },
    async (request) => ok(await getDraftAllowance(request.user.id)),
  );
}
