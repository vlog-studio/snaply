import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';

/**
 * 관심사로 고를 수 있는 주제 — 서버 개념 사전(`content-vocabulary.json`)의 `topics` 다(specs ACC-5).
 * 앱은 이 목록을 그대로 보이고, 고른 `id` 를 `PATCH /auth/me` 의 `interests` 로 보낸다. 자유 입력은 받지 않는다.
 */
export const interestTopicSchema = z
  .object({
    id: z.string().describe("개념 id ('cafe' 처럼). `interests` 에 넣는 값"),
    label: z.string().describe('사람에게 보이는 이름 (예: 카페)'),
  })
  .meta({ id: 'InterestTopic' });
export type InterestTopic = z.infer<typeof interestTopicSchema>;

export const interestTopicsSchema = z.object({
  topics: z.array(interestTopicSchema).describe('사전 순서'),
});
export type InterestTopics = z.infer<typeof interestTopicsSchema>;

export const getInterestTopics = defineRoute({
  method: 'GET',
  path: '/interest-topics',
  schema: {
    response: {
      200: apiSuccess(interestTopicsSchema),
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
