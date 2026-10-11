import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { cancelEditJob, getEditJob, ok } from '@vlog-studio/shared-types';
import { createRedisConnection, editProgressChannel } from '../lib/redis.js';
import {
  cancelEditJob as cancelEditJobForOwner,
  getEditJob as getEditJobForUser,
  getEditJobForOwner,
  getEditJobOutputUrl,
} from '../services/edit-job.service.js';

// 진행률 WebSocket 의 프로토콜 ping 간격. 운영의 공용 ALB 는 180초 동안 오가는 데이터가 없으면 연결을
// 끊는데(인프라 문서 §2), 편집은 단계 사이가 그보다 길 수 있다. 여유를 두고 그 1/6 로 잡는다.
const WS_KEEPALIVE_INTERVAL_MS = 30_000;

export async function editJobRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // GET /edit-jobs/:id — 편집 작업 상태 조회
  routes.get(
    getEditJob.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getEditJob.schema,
        tags: ['edit-jobs'],
        summary: '편집 작업 상태 조회',
        description: [
          '무비 생성(`POST /movies/{id}/export`)이 만든 작업의 진행 상태. WebSocket 대신 **폴링으로 확인할 때 쓰는 엔드포인트**라 Swagger에서 편집 전 과정을 추적할 수 있다.',
          '',
          '- `status`: `queued`(워커 대기) → `processing` → `done` | `failed` | `canceled`(사용자 취소). 일시적 실패 뒤 워커가 다시 시도하면 `processing` → `queued` 로 돌아간다(최대 3회 시도, `failed` 는 마지막 시도에서만)',
          '- `progress`: 0~100. 워커가 단계별로 갱신한다',
          '- `videoId`: **결과물** 영상 id (원본 클립이 아니다). 완료 후 `GET /videos/{videoId}`로 `editedUrl`을 얻는다',
          '- `errorMessage`: `failed`일 때만 채워진다 (서버 진단용 원문 — 사용자 노출 문구가 아니다)',
          '- `errorCode`: `failed`일 때의 분류 코드. `TIMEOUT` | `SOURCE_UNAVAILABLE` | `QUEUE_FAILED` | `INTERNAL`. 앱은 이 코드로 사용자 문구를 분기한다',
          '- `pipelineVersion`/`editSpec`/`renderSpec`: 재현 가능한 작업 스냅샷',
          '',
          '남의 작업은 404.',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await getEditJobForUser({ userId: request.user.id, jobId: request.params.id });
      return ok(data);
    },
  );

  // DELETE /edit-jobs/:id — 진행 중 편집 작업 취소
  routes.delete(
    cancelEditJob.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...cancelEditJob.schema,
        tags: ['edit-jobs'],
        summary: '편집 작업 취소',
        description: [
          '`queued` 또는 `processing` 상태의 편집 작업을 취소한다. 최종 상태는 `canceled`.',
          '',
          '- 대기 중(queued) 작업은 큐에서 제거되어 처리되지 않는다.',
          '- 처리 중(processing) 작업은 워커가 다음 진행률 갱신 시점에 취소를 감지하고 중단한다. 이미 업로드 직전 단계라면 완료될 수 있으나, `canceled`로 확정된 작업이 `done`으로 되살아나지는 않는다.',
          '- 결과물 영상 레코드는 삭제 처리되어 목록에 나타나지 않는다.',
          '- 열려 있는 진행률 WebSocket에는 `{"status":"canceled"}` 메시지 후 연결이 종료된다.',
          '- 이미 취소된 작업의 재취소는 200(멱등). `done`/`failed`로 끝난 작업은 409.',
          '- 예약된 크레딧은 전액 환급된다. 재취소해도 환급은 한 번만 기록된다.',
        ].join('\n'),
      },
    },
    async (request) => {
      await cancelEditJobForOwner({ userId: request.user.id, jobId: request.params.id });
      return ok({ canceled: true });
    },
  );

  // WebSocket GET /edit-jobs/:id/progress — 실시간 진행률 스트리밍
  // 메시지 계약은 shared-types 의 `editProgressEventSchema` 가 원천이다.
  app.get<{ Params: { id: string } }>(
    '/edit-jobs/:id/progress',
    // WebSocket은 OpenAPI로 표현되지 않으므로 문서에서 숨김 (api-spec.md 참고)
    { websocket: true, preHandler: app.authenticate, schema: { hide: true } },
    async (ws, request) => {
      const jobId = request.params.id;

      const job = await getEditJobForOwner({ userId: request.user.id, jobId });
      if (!job) {
        ws.send(JSON.stringify({ status: 'failed', error: '편집 작업을 찾을 수 없습니다.' }));
        ws.close();
        return;
      }

      // 이미 종료된 작업이면 최종 상태만 보내고 종료
      if (job.status === 'done') {
        // 실시간 완료 메시지와 같은 계약 — outputUrl 포함 (api-spec.md)
        const outputUrl = await getEditJobOutputUrl(job.videoId);
        ws.send(
          JSON.stringify({ progress: 100, step: '완료', ...(outputUrl ? { outputUrl } : {}) }),
        );
        ws.close();
        return;
      }
      if (job.status === 'failed') {
        ws.send(
          JSON.stringify({
            status: 'failed',
            error: job.errorMessage ?? '편집 실패',
            ...(job.errorCode ? { code: job.errorCode } : {}),
          }),
        );
        ws.close();
        return;
      }
      if (job.status === 'canceled') {
        ws.send(JSON.stringify({ status: 'canceled' }));
        ws.close();
        return;
      }

      // 현재 진행률 스냅샷 전송
      ws.send(JSON.stringify({ progress: job.progress, step: '연결됨' }));

      // Redis Pub/Sub 구독 (전용 연결)
      const sub = createRedisConnection();
      const channel = editProgressChannel(jobId);

      const cleanup = async (): Promise<void> => {
        try {
          await sub.unsubscribe(channel);
        } catch {
          /* noop */
        }
        await sub.quit().catch(() => undefined);
      };

      sub.on('message', (_ch, message) => {
        if (ws.readyState !== ws.OPEN) {
          return;
        }
        ws.send(message);
        try {
          const parsed = JSON.parse(message) as { progress?: number; status?: string };
          if (parsed.progress === 100 || parsed.status === 'failed' || parsed.status === 'canceled') {
            ws.close();
          }
        } catch {
          /* 원본 메시지는 이미 전달됨 */
        }
      });

      await sub.subscribe(channel);

      // 운영의 ALB 는 180초 동안 오가는 데이터가 없으면 연결을 끊는다. 편집은 단계 사이가 그보다 길 수
      // 있으므로 프로토콜 ping 을 주기적으로 보낸다 — 앱 쪽 메시지 계약에는 보이지 않는다.
      const keepalive = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        }
      }, WS_KEEPALIVE_INTERVAL_MS);

      ws.on('close', () => {
        clearInterval(keepalive);
        void cleanup();
      });
      ws.on('error', () => {
        clearInterval(keepalive);
        void cleanup();
      });
    },
  );
}
