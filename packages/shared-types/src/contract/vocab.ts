import { z } from 'zod';

import { MOVIE_RECIPES } from '../recipe.js';
import { TRANSITION_KINDS } from '../transition.js';

/**
 * 계약에 쓰이는 닫힌 값 집합. 응답 스키마의 enum 이 곧 와이어 계약이므로, 값을 늘릴 때는
 * 여기 하나만 고친다 — 백엔드 직렬화·OpenAPI·앱 타입이 전부 이 파일에서 나온다.
 */

/** 와이어에 나가는 영상 상태. 삭제된 영상은 목록·상세에서 제외되므로 `deleted` 는 여기 없다. */
export const VIDEO_STATUSES = ['pending', 'ready', 'processing', 'done', 'failed'] as const;
export const videoStatusSchema = z.enum(VIDEO_STATUSES);
export type VideoStatus = z.infer<typeof videoStatusSchema>;

export const VIDEO_KINDS = ['source', 'result'] as const;
export const videoKindSchema = z.enum(VIDEO_KINDS);
export type VideoKind = z.infer<typeof videoKindSchema>;

/** 영상이 사라진 이유. 사용자에게 보일 문구가 다르다(SNAP-12) — 직접 지운 것과 기간 만료. */
export const VIDEO_REMOVAL_REASONS = ['user', 'expired'] as const;
export const videoRemovalReasonSchema = z.enum(VIDEO_REMOVAL_REASONS);
export type VideoRemovalReason = z.infer<typeof videoRemovalReasonSchema>;

export const EDIT_JOB_STATUSES = ['queued', 'processing', 'done', 'failed', 'canceled'] as const;
export const editJobStatusSchema = z.enum(EDIT_JOB_STATUSES);
export type EditJobStatus = z.infer<typeof editJobStatusSchema>;

/**
 * 편집 실패의 분류 코드. 앱이 사용자 문구로 매핑하는 키이므로 append-only.
 * - TIMEOUT: 워커 처리 시간 초과
 * - SOURCE_UNAVAILABLE: 원본 클립을 찾을 수 없음 (삭제·소유권 변동 등)
 * - QUEUE_FAILED: 큐 적재 실패 (요청 시점 인프라 문제)
 * - INTERNAL: 그 외 서버 내부 오류
 */
export const EDIT_JOB_ERROR_CODES = ['TIMEOUT', 'SOURCE_UNAVAILABLE', 'QUEUE_FAILED', 'INTERNAL'] as const;
export const editJobErrorCodeSchema = z.enum(EDIT_JOB_ERROR_CODES);
export type EditJobErrorCode = z.infer<typeof editJobErrorCodeSchema>;

export const STYLE_PRESETS = ['감성', '여행', '일상'] as const;
export const stylePresetSchema = z.enum(STYLE_PRESETS);
export type StylePreset = z.infer<typeof stylePresetSchema>;

/**
 * 무비의 편집 스타일 레시피(specs/movie.md MOV-28). 원천은 `recipe-vocabulary.json` 이고 이 enum 은 그 이름 목록
 * (`MOVIE_RECIPES`)을 그대로 쓴다. `classic` 이 지금까지의 무비다.
 */
export const movieRecipeSchema = z.enum(MOVIE_RECIPES);

/**
 * 무비의 꾸밈 — 글자(텍스트 액센트) · 이모지 스티커 · 얼굴 스티커를 각각 켜고 끈다(specs/movie.md MOV-27). 붙일지는 이 값만 정하고
 * 레시피는 양만 정한다. 무비를 만들 때와 레시피를 바꿀 때 레시피 기본값(`recipeDecorations`)으로 채운다.
 */
export const movieDecorationsSchema = z
  .object({
    text: z.boolean().describe('글자 효과(장면에 맞는 의성어 · 느낌 · 감탄).'),
    emoji: z.boolean().describe('이모지 스티커. 글자를 끄고 이것만 켜면 장면이 잘 맞는 컷에 몰리지 않게 붙는다.'),
    face: z.boolean().describe('얼굴을 따라다니는 스티커(왕관 · 하트 · 반짝이).'),
  })
  .describe('무비의 꾸밈(글자 · 이모지 · 얼굴 스티커). 바꾸면 다음 생성부터 적용된다 — 컷 · 순서 · 효과 · 곡은 그대로다.');
export type MovieDecorations = z.infer<typeof movieDecorationsSchema>;

/**
 * 무비의 편집 선택 — 말소리 살리기 · 장면 단위 순서(specs/movie.md MOV-29). 레시피와 무관하게 기본은 둘 다 꺼짐이고, 레시피를 바꿔도 그대로다.
 * 앱은 꾸밈과 같은 시트에서 켜고 끈다.
 */
export const movieEditingSchema = z
  .object({
    speech: z.boolean().describe('사람이 말하는 구간은 원본 목소리를 살리고 그동안 음원을 낮춘다.'),
    sceneOrder: z
      .boolean()
      .describe('순서의 주인이 AI 인 무비에서 촬영 장면(10분 간격) 단위로 순서를 두고, 가장 강한 순간을 첫 컷으로 앞당긴다.'),
  })
  .describe('무비의 편집 선택(말소리 · 장면 순서). 바꾸면 다음 생성부터 적용된다.');
export type MovieEditing = z.infer<typeof movieEditingSchema>;

/** 무비의 생애. `generating` 은 진행 중인 편집 작업이 있는 상태다. */
export const MOVIE_STATUSES = ['draft', 'generating', 'ready', 'failed'] as const;
export const movieStatusSchema = z.enum(MOVIE_STATUSES);
export type MovieStatus = z.infer<typeof movieStatusSchema>;

/**
 * 컷 순서를 누가 정했는가. `user` 면 서버가 다시 정렬하지 않는다 —
 * 촬영 시각 정렬은 `ai` 일 때만 적용된다(decisions/movie-export-policy.md ①).
 */
export const MOVIE_ARRANGERS = ['user', 'ai'] as const;
export const movieArrangerSchema = z.enum(MOVIE_ARRANGERS);
export type MovieArranger = z.infer<typeof movieArrangerSchema>;

/**
 * 컷 사이 전환의 종류(specs/movie.md MOV-22). 원천은 `transition-vocabulary.json` 이고 이 enum 은
 * 그 이름 목록(`TRANSITION_KINDS`)을 그대로 쓴다 — 길이 범위·폴백도 그 사전에 있다.
 */
export const transitionKindSchema = z.enum(TRANSITION_KINDS);

/**
 * 무비 하나가 담을 수 있는 컷 수 (specs/movie.md MOV-5). 편집 워커의 `MAX_CLIPS`(`apps/ai-worker/src/pipeline/edit_spec.py`)와
 * 앱의 `MovieSnapLimit` 이 같은 값을 따로 둔다 — 둘 다 `apps/api/test/movies.test.ts` 가 맞춰 본다.
 */
export const MOVIE_CLIP_MIN = 1;
export const MOVIE_CLIP_MAX = 20;

export const OUTPUT_PROFILES = [
  'short_vertical',
  'youtube_landscape',
  'instagram_portrait',
  'square',
] as const;
export const outputProfileSchema = z.enum(OUTPUT_PROFILES);
export type OutputProfile = z.infer<typeof outputProfileSchema>;

/**
 * 비율이 다른 원본을 출력 화면에 맞추는 방식. `blur_background` 는 남는 자리를 흐린 원본으로, `pad_black` · `pad_white` 는
 * 단색 띠로 채운다(셋 다 원본을 화면 폭이나 높이까지 키운다 — specs/movie.md MOV-8). `contain` 은 작은 원본을 키우지 않고 검정
 * 띠를 두는 예전 작업의 기본, `cover` 는 잘라서 꽉 채운다.
 */
export const FIT_MODES = ['contain', 'cover', 'blur_background', 'pad_black', 'pad_white'] as const;
export const fitModeSchema = z.enum(FIT_MODES);
export type FitMode = z.infer<typeof fitModeSchema>;

export const OUTPUT_PROFILE_CONFIGS: Record<
  OutputProfile,
  Readonly<{ width: number; height: number; fps: number }>
> = {
  short_vertical: { width: 1080, height: 1920, fps: 30 },
  youtube_landscape: { width: 1920, height: 1080, fps: 30 },
  instagram_portrait: { width: 1080, height: 1350, fps: 30 },
  square: { width: 1080, height: 1080, fps: 30 },
};

export const DEFAULT_OUTPUT_PROFILE: OutputProfile = 'short_vertical';
export const DEFAULT_FIT_MODE: FitMode = 'blur_background';

export const VIDEO_ANALYSIS_STATUSES = ['queued', 'processing', 'done', 'failed'] as const;
export const videoAnalysisStatusSchema = z.enum(VIDEO_ANALYSIS_STATUSES);
export type VideoAnalysisStatus = z.infer<typeof videoAnalysisStatusSchema>;

/**
 * 분석 실패 분류. `retryable` 이 true 인 코드만 재요청에 의미가 있다.
 * 워커의 `pipeline/video_analysis/errors.py` 와 같은 목록을 유지한다.
 *
 * 와이어에서는 `string` 으로 열어 둔다 — 워커가 새 코드를 내기 시작했을 때 조회가 500 으로
 * 죽는 것보다 앱이 모르는 코드를 `INTERNAL` 로 읽는 쪽이 낫다. 이 목록은 알려진 값의 사전이다.
 */
export const VIDEO_ANALYSIS_ERROR_CODES = [
  'TIMEOUT',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'NETWORK',
  'SCHEMA_INVALID',
  'AUTH_FAILED',
  'BAD_REQUEST',
  'MODEL_NOT_FOUND',
  'SAFETY_REFUSED',
  'EMPTY_OUTPUT',
  'SOURCE_UNAVAILABLE',
  'FRAME_EXTRACTION_FAILED',
  'INTERNAL',
] as const;
export type VideoAnalysisErrorCode = (typeof VIDEO_ANALYSIS_ERROR_CODES)[number];

export const SNS_PLATFORMS = ['instagram', 'tiktok'] as const;
export const snsPlatformSchema = z.enum(SNS_PLATFORMS);
export type SnsPlatform = z.infer<typeof snsPlatformSchema>;

export const SNS_UPLOAD_STATUSES = ['pending', 'success', 'failed'] as const;
export const snsUploadStatusSchema = z.enum(SNS_UPLOAD_STATUSES);
export type SnsUploadStatus = z.infer<typeof snsUploadStatusSchema>;

export const LOCATION_CATEGORIES = ['관광지', '카페', '여행지'] as const;
export const locationCategorySchema = z.enum(LOCATION_CATEGORIES);
export type LocationCategory = z.infer<typeof locationCategorySchema>;

export const GEOFENCE_SKIP_REASONS = [
  'notifications_disabled',
  'quiet_hours',
  'cooldown',
  'no_token',
  'send_failed',
] as const;
export const geofenceSkipReasonSchema = z.enum(GEOFENCE_SKIP_REASONS);
export type GeofenceSkipReason = z.infer<typeof geofenceSkipReasonSchema>;

/** 크레딧 원장 `reason`. 앱이 내역 화면 문구를 매핑하는 값이라 닫힌 집합이다(VARCHAR(30) 안). */
export const CREDIT_REASON = {
  purchase: 'purchase',
  signupBonus: 'signup_bonus',
  exportReserve: 'export_reserve',
  exportRefund: 'export_refund',
  storeRefundRevoke: 'store_refund_revoke',
  promo: 'promo',
  adReward: 'ad_reward',
  /** AI 편집 초안 1번(CRD-9) — 무료 횟수를 넘긴 초안. */
  draftCharge: 'draft_charge',
  /** 에이전트가 끝까지 만들지 못해 돌려준 초안 비용. */
  draftRefund: 'draft_refund',
} as const;
export const CREDIT_REASONS = Object.values(CREDIT_REASON) as [CreditReason, ...CreditReason[]];
export type CreditReason = (typeof CREDIT_REASON)[keyof typeof CREDIT_REASON];
export const creditReasonSchema = z.enum(CREDIT_REASONS);

export const AD_REWARD_STATUSES = ['pending', 'abandoned', 'granted', 'expired', 'rejected'] as const;
export const adRewardStatusSchema = z.enum(AD_REWARD_STATUSES);
export type AdRewardStatus = z.infer<typeof adRewardStatusSchema>;

export const MOVIE_RECOMMENDATION_STATUSES = ['processing', 'done', 'failed'] as const;
export const movieRecommendationStatusSchema = z.enum(MOVIE_RECOMMENDATION_STATUSES);
export type MovieRecommendationStatus = z.infer<typeof movieRecommendationStatusSchema>;

/**
 * 배정에서 빠진 후보의 사유.
 * - `unusable` — 분석이 편집에 못 쓴다고 판단(흔들림·어두움·초점)
 * - `analysis_failed` — 분석이 실패했거나 제시간에 끝나지 않음
 * - `no_match` — 쓸 수는 있지만 슬롯보다 후보가 많아 자리가 없었음
 */
export const RECOMMENDATION_EXCLUSION_REASONS = ['unusable', 'analysis_failed', 'no_match'] as const;
export const recommendationExclusionReasonSchema = z.enum(RECOMMENDATION_EXCLUSION_REASONS);
export type RecommendationExclusionReason = z.infer<typeof recommendationExclusionReasonSchema>;
