import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getInterestTopics, ok } from '@vlog-studio/shared-types';
import { listInterestTopics } from '../services/interest.service.js';

export async function interestTopicRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // GET /interest-topics — 관심사로 고를 수 있는 주제
  routes.get(
    getInterestTopics.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getInterestTopics.schema,
        tags: ['auth'],
        summary: '관심사로 고를 수 있는 주제',
        description: [
          '개념 사전의 주제(topics)를 사전 순서로 준다(specs ACC-5). 앱은 이 목록을 그대로 보이고,',
          '고른 `id` 를 `PATCH /auth/me` 의 `interests` 로 보낸다. 고른 관심사는 사용자 취향의 출발점이 되어',
          '템플릿 순서 · 추천 · AI 편집 초안에 반영된다(PRF-1 · PRF-3).',
        ].join('\n'),
      },
    },
    async () => ok({ topics: listInterestTopics() }),
  );
}
