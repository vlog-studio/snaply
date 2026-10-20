import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorSchema, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';
import {
  DEFAULT_FIT_MODE,
  DEFAULT_OUTPUT_PROFILE,
  MOVIE_CLIP_MAX,
  OUTPUT_PROFILE_CONFIGS,
  editJobErrorCodeSchema,
  editJobStatusSchema,
  fitModeSchema,
  outputProfileSchema,
  stylePresetSchema,
  transitionKindSchema,
  type FitMode,
  type OutputProfile,
} from './vocab.js';

export const clipSpecSchema = z.object({
  videoId: z.uuid(),
  startMs: z.int().min(0),
  endMs: z.int().min(1).optional(),
});
export type ClipSpec = z.infer<typeof clipSpecSchema>;

export const editSpecV1Schema = z.object({
  version: z.literal(1),
  stylePreset: stylePresetSchema,
});
export type EditSpecV1 = z.infer<typeof editSpecV1Schema>;

export const editSpecV2Schema = z.object({
  version: z.literal(2),
  stylePreset: stylePresetSchema,
  clips: z.array(clipSpecSchema).min(1).max(MOVIE_CLIP_MAX),
});
export type EditSpecV2 = z.infer<typeof editSpecV2Schema>;

/**
 * editSpec v3 — 컷과 경계마다의 전환(specs/movie.md MOV-22). v3 초안의 `timeline` 부분만 먼저 쓰고,
 * 색보정·음악은 아직 `stylePreset` 이 정한다. **`edit-v3` 큐로만 간다** — 구버전 워커가 받으면 전환을
 * 버리고 v2 로 "성공"해 사용자가 돈을 내고 다른 결과를 받는다(decisions/edit-spec-v3.md §4).
 *
 * 전환은 고른 값이다. 워커가 원본 길이를 재서 컷·여분 프레임에 맞춰 해석한다(`resolveTransition`).
 */
export const timelineCutSchema = z.object({
  cutId: z.string().min(1),
  videoId: z.uuid(),
  sourceInMs: z.int().min(0),
  sourceOutMs: z.int().min(1).optional().describe('생략하면 원본 끝까지.'),
});
export type TimelineCut = z.infer<typeof timelineCutSchema>;

export const timelineTransitionSchema = z.object({
  fromCutId: z.string().min(1),
  toCutId: z.string().min(1),
  kind: transitionKindSchema,
  durationMs: z.int().positive().optional().describe('`hardcut` 은 생략.'),
});
export type TimelineTransition = z.infer<typeof timelineTransitionSchema>;

export const editSpecV3Schema = z.object({
  version: z.literal(3),
  stylePreset: stylePresetSchema,
  timeline: z.object({
    cuts: z.array(timelineCutSchema).min(1).max(MOVIE_CLIP_MAX),
    transitions: z
      .array(timelineTransitionSchema)
      .describe('이어진 두 컷마다 하나씩, 컷 순서대로. 길이는 `cuts.length - 1`.'),
  }),
});
export type EditSpecV3 = z.infer<typeof editSpecV3Schema>;

export const editSpecSchema = z.union([editSpecV1Schema, editSpecV2Schema, editSpecV3Schema]);
export type EditSpec = z.infer<typeof editSpecSchema>;

export const renderSpecSchema = z.object({
  profileVersion: z.literal(1),
  outputProfile: outputProfileSchema,
  width: z.int().min(2),
  height: z.int().min(2),
  fps: z.int().min(1),
  fitMode: fitModeSchema,
});
export type RenderSpec = z.infer<typeof renderSpecSchema>;

export function createRenderSpec(
  outputProfile: OutputProfile = DEFAULT_OUTPUT_PROFILE,
  fitMode: FitMode = DEFAULT_FIT_MODE,
): RenderSpec {
  return {
    profileVersion: 1,
    outputProfile,
    ...OUTPUT_PROFILE_CONFIGS[outputProfile],
    fitMode,
  };
}

export const editJobSchema = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    pipelineVersion: z.string(),
    editSpec: editSpecSchema,
    renderSpec: renderSpecSchema,
    status: editJobStatusSchema,
    progress: z.int().min(0).max(100),
    errorMessage: z.string().nullable(),
    errorCode: editJobErrorCodeSchema.nullable().describe('실패 분류 코드. status가 failed일 때만 채워진다.'),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'EditJob' });
export type EditJob = z.infer<typeof editJobSchema>;

export const editJobCanceledSchema = z.object({ canceled: z.boolean() });

const jobIdParamsSchema = z.object({
  id: z.string().describe('무비 생성(`POST /movies/{id}/export`)이 반환한 jobId(uuid)'),
});

export const getEditJob = defineRoute({
  method: 'GET',
  path: '/edit-jobs/{id}',
  schema: {
    params: jobIdParamsSchema,
    response: {
      200: apiSuccess(editJobSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const cancelEditJob = defineRoute({
  method: 'DELETE',
  path: '/edit-jobs/{id}',
  schema: {
    params: jobIdParamsSchema,
    response: {
      200: apiSuccess(editJobCanceledSchema),
      404: apiErrorSchema,
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

/**
 * 진행률 WebSocket(`/edit-jobs/{id}/progress`)의 메시지. OpenAPI 로 표현되지 않으므로
 * 이 스키마가 그 계약의 원천이다 (안내는 docs/api-spec.md WebSocket 절).
 *
 * 메시지는 한 형태이고 어느 필드가 채워지는지로 종류를 읽는다:
 * - 진행: `progress`·`step`. 완료(`progress: 100`)에는 `outputUrl` 이 함께 온다
 * - 실패: `status: 'failed'` + 진단용 `error`(사용자 문구가 아니다), 분류 `code`
 * - 취소: `status: 'canceled'`. 서버가 발행하는 취소 이벤트는 `progress`·`step` 도 싣는다
 *
 * 앱은 `status` 를 먼저 보고, 없으면 진행 메시지로 읽는다.
 */
export const editProgressEventSchema = z.object({
  progress: z.number().optional(),
  step: z.string().optional(),
  outputUrl: z.string().optional(),
  status: z.enum(['failed', 'canceled']).optional(),
  error: z.string().optional(),
  code: editJobErrorCodeSchema.optional(),
});
export type EditProgressEvent = z.infer<typeof editProgressEventSchema>;
