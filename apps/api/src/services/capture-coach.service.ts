/**
 * 촬영 코치의 앞 컷 해석(SNAP-25) — 앞 컷의 마지막 장면 한 장을 모델이 읽어 장면 · 피사체 자리 · 다음 컷 안내 한 줄을 돌려준다.
 *
 * 스냅 분석과 같은 스위치 · 같은 동의를 따르고(snap-content-analysis §6.1), 결과는 저장하지 않는다 — 응답으로만 돌려주고
 * OpenAI 에도 `store: false` 로 보낸다. 실시간이 아니다: 앞 컷마다 한 번이고, 화면을 따라가는 일은 기기 안의 모델이 한다
 * (decisions/capture-coach.md §6).
 */
import OpenAI from 'openai';
import { z } from 'zod';
import { captureCoachSceneSchema, type PreviousCutRead } from '@vlog-studio/shared-types';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { requireAnalysisAccess } from './analysis-consent.service.js';

/** 잠정 — 지연 · 단가 실측 뒤 고정한다(backlog A-23). */
export const DEFAULT_CAPTURE_COACH_MODEL = 'gpt-6-luna';

/** 사용자가 뷰파인더 앞에서 기다리는 시간이다. 넘으면 앱은 모델 없는 안내로 돌아간다. */
const READ_TIMEOUT_MS = 8_000;

const INSTRUCTIONS = [
  '너는 짧은 영상을 이어 찍는 사람을 돕는 촬영 코치다. 받은 사진은 방금 찍은 컷의 마지막 장면이다.',
  '다음 컷이 이 컷과 자연스럽게 이어지도록(같은 자리 · 같은 크기의 피사체로 매치컷) 찍는 법을 알려 준다.',
  '- scene: 장면 종류. 사람이 주인공이고 바다 · 산 같은 풍경이 크게 보이면 person_landscape.',
  '- subject: 가장 눈에 띄는 피사체(사람이면 얼굴)의 중심과 크기. 위치는 장면 너비 · 높이의 몫(0~1, 왼쪽 위가 0),',
  '  크기는 장면 너비의 몫. 뚜렷한 피사체가 없으면 null.',
  '- advice: 다음 컷 안내 한 줄. 해요체, 40자 안. 무엇을 어디에 둘지 구체적으로(예: "다음 메뉴도 같은 자리에 두고 찍어 보세요").',
  '  사진 속 사람을 평가하거나 신원을 짐작하지 않는다.',
].join('\n');

/** 모델이 지켜야 하는 출력 형태(strict JSON Schema). 계약의 스키마와 같은 필드다. */
const OUTPUT_FORMAT = {
  type: 'json_schema' as const,
  name: 'previous_cut_read',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scene', 'subject', 'advice'],
    properties: {
      scene: { type: 'string', enum: captureCoachSceneSchema.options },
      subject: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['cx', 'cy', 'size'],
            properties: { cx: { type: 'number' }, cy: { type: 'number' }, size: { type: 'number' } },
          },
          { type: 'null' },
        ],
      },
      advice: { type: 'string' },
    },
  },
};

const fraction = z.number().transform((value) => Math.min(1, Math.max(0, value)));

/** 모델의 답을 믿지 않고 다시 본다 — 범위를 벗어난 좌표는 자르고, 너무 긴 안내는 실패로 본다. */
const modelOutputSchema = z.object({
  scene: captureCoachSceneSchema,
  subject: z.object({ cx: fraction, cy: fraction, size: fraction }).nullable(),
  advice: z.string().trim().min(1).max(60),
});

/** 장면 한 장을 읽는 모델. 테스트는 각본 모델을 끼운다. */
export interface CaptureCoachModel {
  readonly name: string;
  read(imageBase64: string, signal: AbortSignal): Promise<string>;
}

function openAiCoachModel(params: { apiKey: string; model: string }): CaptureCoachModel {
  const client = new OpenAI({ apiKey: params.apiKey, maxRetries: 0 });
  return {
    name: params.model,
    async read(imageBase64, signal) {
      const response = await client.responses.create(
        {
          model: params.model,
          instructions: INSTRUCTIONS,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  image_url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'low',
                },
              ],
            },
          ],
          text: { format: OUTPUT_FORMAT },
          store: false,
        },
        { signal },
      );
      return response.output_text;
    },
  };
}

let override: (() => CaptureCoachModel | null) | null = null;

/** 호출 시점에 환경을 읽는다 — 키를 넣고 빼는 데 재배포가 필요 없다(`resolveEditAgentModel` 과 같다). */
function resolveCaptureCoachModel(): CaptureCoachModel | null {
  if (override) return override();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return openAiCoachModel({
    apiKey,
    model: process.env.CAPTURE_COACH_MODEL?.trim() || DEFAULT_CAPTURE_COACH_MODEL,
  });
}

/** 테스트가 각본 모델을 끼운다. `null` 이면 환경으로 돌아간다. */
export function setCaptureCoachModelForTests(factory: (() => CaptureCoachModel | null) | null): void {
  override = factory;
}

function coachFailed(): AppError {
  return new AppError(502, 'CAPTURE_COACH_FAILED', '장면을 읽지 못했습니다.');
}

async function askModel(model: CaptureCoachModel, imageBase64: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    return await model.read(imageBase64, controller.signal);
  } catch (error) {
    // 응답의 502 는 원인을 싣지 않는다 — 원인(시간 초과 · API 오류)은 여기서 보고한다.
    captureException(error, { stage: 'capture-coach.read', model: model.name });
    throw coachFailed();
  } finally {
    clearTimeout(timer);
  }
}

function parseOutput(raw: string): z.infer<typeof modelOutputSchema> {
  try {
    return modelOutputSchema.parse(JSON.parse(raw));
  } catch (error) {
    captureException(error, { stage: 'capture-coach.parse' });
    throw coachFailed();
  }
}

/** 앞 컷의 마지막 장면을 읽는다. 스위치가 꺼졌거나 키가 없으면 503, 동의가 없으면 403, 모델이 실패하면 502. */
export async function readPreviousCut(params: { userId: string; imageBase64: string }): Promise<PreviousCutRead> {
  await requireAnalysisAccess(params.userId);
  const model = resolveCaptureCoachModel();
  if (!model) {
    throw new AppError(503, 'CAPTURE_COACH_UNAVAILABLE', '촬영 코치가 아직 활성화되지 않았습니다.');
  }
  const output = parseOutput(await askModel(model, params.imageBase64));
  return { ...output, model: model.name };
}
