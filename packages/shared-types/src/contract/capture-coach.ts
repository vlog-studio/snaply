import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';

/**
 * 촬영 코치가 읽는 장면 한 장의 크기 한도(base64 문자 수). 앱이 보내는 것은 이미 뽑아 둔 썸네일
 * (품질 0.6 JPEG)이라 보통 수십 KB 다 — 한도는 원본 해상도 프레임이 실수로 올라오는 것만 막는다.
 */
export const CAPTURE_COACH_MAX_IMAGE_BASE64 = 1_500_000;

export const captureCoachSceneSchema = z
  .enum(['food', 'person', 'person_landscape', 'landscape', 'other'])
  .describe('장면 종류 — 음식 · 인물 · 인물과 풍경 · 풍경 · 그 밖');
export type CaptureCoachScene = z.infer<typeof captureCoachSceneSchema>;

export const captureCoachSubjectSchema = z
  .object({
    cx: z.number().min(0).max(1).describe('피사체 중심의 가로 위치(장면 너비 몫, 왼쪽 0)'),
    cy: z.number().min(0).max(1).describe('피사체 중심의 세로 위치(장면 높이 몫, 위 0)'),
    size: z.number().min(0).max(1).describe('피사체 크기(장면 너비 몫)'),
  })
  .describe('편집기의 피사체 정의(match_cut 의 `subject`)와 같은 단위');

export const previousCutReadSchema = z
  .object({
    scene: captureCoachSceneSchema,
    subject: captureCoachSubjectSchema.nullable().describe('뚜렷한 피사체가 없으면 null'),
    advice: z.string().min(1).max(60).describe('다음 컷을 어떻게 이어 찍을지 한 줄(해요체). 사용자에게 그대로 보인다'),
    model: z.string().describe('해석한 모델'),
  })
  .meta({ id: 'PreviousCutRead' });
export type PreviousCutRead = z.infer<typeof previousCutReadSchema>;

export const readPreviousCutBodySchema = z.object({
  image: z
    .string()
    .min(1)
    .max(CAPTURE_COACH_MAX_IMAGE_BASE64)
    .regex(/^[A-Za-z0-9+/]+=*$/, 'base64 여야 합니다')
    .describe('앞 컷 마지막 장면의 JPEG, base64(데이터 URL 접두어 없이)'),
});
export type ReadPreviousCutBody = z.infer<typeof readPreviousCutBodySchema>;

export const readPreviousCut = defineRoute({
  method: 'POST',
  path: '/capture-coach/previous-cut',
  schema: {
    body: readPreviousCutBodySchema,
    response: {
      200: apiSuccess(previousCutReadSchema),
      400: apiErrorSchema,
      502: apiErrorSchema,
      503: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
