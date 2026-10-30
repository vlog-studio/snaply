import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CAPTURE_COACH_MAX_IMAGE_BASE64, ok, readPreviousCut } from '@vlog-studio/shared-types';
import { DEFAULT_CAPTURE_COACH_MODEL, readPreviousCut as readCut } from '../services/capture-coach.service.js';

export async function captureCoachRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // POST /capture-coach/previous-cut — 앞 컷 마지막 장면 해석 (동기)
  routes.post(
    readPreviousCut.fastifyPath,
    {
      preHandler: app.authenticate,
      // base64 장면 한 장 + JSON 껍데기. 전역 기본(1MB)보다 크다.
      bodyLimit: CAPTURE_COACH_MAX_IMAGE_BASE64 + 64 * 1024,
      config: {
        // 앞 컷마다 한 번이라 분당 몇 번이면 충분하다. 버스트만 막는다.
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.headers.authorization ?? req.ip,
        },
      },
      schema: {
        ...readPreviousCut.schema,
        tags: ['capture'],
        summary: '앞 컷 마지막 장면 해석 (촬영 코치)',
        description: [
          '촬영 가이드가 켜져 있을 때 앱이 **앞 컷의 마지막 장면 한 장**을 보내면, AI 가 장면 종류 · 피사체 자리 ·',
          '다음 컷 안내 한 줄을 돌려준다(SNAP-25). 앱은 안내를 그대로 보여 주고 피사체 자리를 점선 상자로 그린다.',
          '',
          `**동기**다 — 응답이 곧 결과이고 보통 1~2초, 길어야 8초다. 모델은 \`CAPTURE_COACH_MODEL\`(기본 \`${DEFAULT_CAPTURE_COACH_MODEL}\`).`,
          '**저장하지 않는다** — 해석은 응답으로만 돌려준다.',
          '',
          '스냅 분석과 같은 스위치 · 같은 동의를 따른다 — 꺼져 있으면 503 `ANALYSIS_DISABLED`, 동의가 없으면',
          '403 `ANALYSIS_CONSENT_REQUIRED`, 서버에 모델 키가 없으면 503 `CAPTURE_COACH_UNAVAILABLE`, 모델이 실패하면',
          '502 `CAPTURE_COACH_FAILED`. 앱은 어느 실패든 모델 없는 안내(SNAP-23)로 돌아간다.',
          '',
          '```json',
          '{ "success": true, "data": { "scene": "food", "subject": { "cx": 0.33, "cy": 0.4, "size": 0.35 },',
          '  "advice": "다음 메뉴도 같은 자리에 두고 찍어 보세요", "model": "gpt-6-luna" } }',
          '```',
        ].join('\n'),
      },
    },
    async (request) =>
      ok(await readCut({ userId: request.user.id, imageBase64: request.body.image })),
  );
}
