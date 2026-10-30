import { z } from 'zod';

import {
  AUTHENTICATED_ERROR_RESPONSES,
  apiErrorSchema,
  apiSuccess,
  conflictErrorSchema,
} from './common.js';
import { defineRoute } from './define-route.js';
import { VIDEO_ANALYSIS_ERROR_CODES, videoAnalysisStatusSchema } from './vocab.js';

/** 자동 편집 후보로 쓸 수 있는지의 판단. 오디오는 반영하지 않는다. */
export const videoVisualQualitySchema = z.object({
  score: z.number().min(0).max(1),
  issues: z.array(z.string()),
  usableForEdit: z.boolean().describe('자동 편집 후보로 쓸 수 있는지. 추천이 1차로 보는 값이다.'),
});
export type VideoVisualQuality = z.infer<typeof videoVisualQualitySchema>;

/** 분석한 프레임 하나의 피사체 — 눈에 띄는 순서, 최대 3개. 옆자리가 없는 상자(화면을 거의 다 덮거나 끝까지 걸친 것)는 빠져 있다. */
export const videoSubjectFrameSchema = z.object({
  frame: z.int().min(0).describe('`frameTimestampsMs` 의 순번.'),
  items: z.array(
    z.object({
      label: z.string().describe('사람이 읽는 이름. 내용 개념을 고르는 데는 쓰지 않는다.'),
      box: z
        .array(z.number().min(0).max(1))
        .length(4)
        .describe('그 프레임 전체를 0~1 로 본 `[x0, y0, x1, y1]`(왼쪽 위가 0,0).'),
    }),
  ),
});
export type VideoSubjectFrame = z.infer<typeof videoSubjectFrameSchema>;

export const videoAnalysisResultSchema = z.object({
  durationMs: z.int().nullable().describe('워커가 FFprobe 로 실측한 길이. 클라이언트가 보고한 값이 아니다.'),
  frameTimestampsMs: z.array(z.int()),
  summary: z.string(),
  topics: z.array(z.string()),
  places: z.array(z.string()),
  objects: z.array(z.string()),
  actions: z.array(z.string()),
  moods: z.array(z.string()),
  visualQuality: videoVisualQualitySchema,
  confidence: z.number().min(0).max(1).nullable(),
  subjects: z
    .array(videoSubjectFrameSchema)
    .describe('프레임별 피사체 위치(프롬프트 v2, 2026-10-29). 글 · 이모지를 피사체 옆에 놓는 데 쓴다. 그 전의 분석은 빈 배열.'),
});
export type VideoAnalysisResult = z.infer<typeof videoAnalysisResultSchema>;

export const videoAnalysisErrorSchema = z.object({
  code: z.string().describe(`분류 코드. 알려진 값: ${VIDEO_ANALYSIS_ERROR_CODES.join(' | ')}`),
  retryable: z.boolean().describe('false 면 다시 요청해도 같은 결과다(손상된 영상·정책 거절 등).'),
});

export const videoAnalysisSchema = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    version: z.int().min(1),
    status: videoAnalysisStatusSchema,
    /** status 가 'done' 일 때만 채워진다. */
    result: videoAnalysisResultSchema.nullable(),
    error: videoAnalysisErrorSchema.nullable(),
    /** 어떤 모델·프롬프트로 얻은 결과인지. 완료 전에는 null. */
    modelVersion: z.string().nullable(),
    promptVersion: z.string().nullable(),
    attempts: z.int().min(0),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'VideoAnalysis' });
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;

export const analysisQueuedSchema = z.object({
  analysisId: z.uuid(),
  version: z.int().min(1),
  status: z.enum(['queued', 'processing', 'done']),
});
export type AnalysisQueued = z.infer<typeof analysisQueuedSchema>;

const videoIdParamsSchema = z.object({
  videoId: z.uuid().describe('분석할 source 영상 id'),
});

export const requestVideoAnalysis = defineRoute({
  method: 'POST',
  path: '/videos/{videoId}/analysis',
  schema: {
    params: videoIdParamsSchema,
    response: {
      202: apiSuccess(analysisQueuedSchema),
      400: apiErrorSchema,
      404: apiErrorSchema,
      409: conflictErrorSchema,
      503: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getVideoAnalysis = defineRoute({
  method: 'GET',
  path: '/videos/{videoId}/analysis',
  schema: {
    params: videoIdParamsSchema,
    response: {
      200: apiSuccess(videoAnalysisSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
