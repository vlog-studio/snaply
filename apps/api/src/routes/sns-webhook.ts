import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { decodeDeletionCode, encodeDeletionCode } from '../lib/crypto.js';
import {
  forgetInstagramUser,
  instagramWebhookVerifyToken,
  instagramAppSecret,
  parseInstagramSignedRequest,
} from '../services/sns.service.js';

/**
 * 연결 해제 · 데이터 삭제 콜백 본문의 상한. Meta 가 보내는 것은 `signed_request` 하나(수백 바이트)다.
 * 인증 없이 열린 주소라, 서명을 확인하기 전에 본문을 읽는 일이 본문 크기에 묶이지 않게 작게 막는다.
 */
const SIGNED_REQUEST_BODY_LIMIT = 16 * 1024;

interface VerifyQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

/**
 * 인스타그램 웹훅.
 *
 * 릴스 게시(우리가 쓰는 기능)에는 웹훅이 필요 없다. 하지만 Meta 콘솔의
 * "메시지 및 콘텐츠 관리" 사용 사례 설정에서 웹훅 등록을 요구하는 경우가 있고,
 * 등록 시 Meta 가 `hub.challenge` 를 되돌려받아야 통과시킨다. 그 검증만 처리한다.
 *
 * 이벤트(POST)는 서명만 확인하고 200 으로 받아 넘긴다 — 구독한 필드가 없으면 사실상 오지 않는다.
 * 서명 검증에 raw body 가 필요하므로 파서를 이 스코프에만 등록한다.
 */
export async function snsWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });
  // 연결 해제 · 데이터 삭제 요청의 `signed_request`. 데이터 삭제는 urlencoded 폼으로 오지만 연결 해제는 다른
  // 형식으로 와 415 가 났다(2026-10-11 실측) — 본문을 문자열로 받아 `signedRequestFrom` 이 형식과 무관하게 꺼낸다.
  app.addContentTypeParser(
    ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // GET — 등록 시 1회 호출되는 검증 핸드셰이크
  app.get<{ Querystring: VerifyQuery }>(
    '/sns/instagram/webhook',
    { schema: { tags: ['sns'], summary: '인스타그램 웹훅 검증' } },
    async (request, reply) => {
      const expected = instagramWebhookVerifyToken();
      const mode = request.query['hub.mode'];
      const token = request.query['hub.verify_token'];
      const challenge = request.query['hub.challenge'] ?? '';

      if (!expected) {
        request.log.warn('INSTAGRAM_WEBHOOK_VERIFY_TOKEN 미설정 — 웹훅 검증을 거부합니다.');
        return reply.status(403).send();
      }
      if (mode !== 'subscribe' || token !== expected) {
        request.log.warn({ mode }, '인스타그램 웹훅 검증 실패 (mode/token 불일치)');
        return reply.status(403).send();
      }

      // Meta 는 challenge 를 그대로(평문) 되돌려받기를 기대한다.
      return reply.type('text/plain').send(challenge);
    },
  );

  // POST — 이벤트 수신. 서명 확인 후 200. (현재 처리하는 이벤트는 없다)
  app.post(
    '/sns/instagram/webhook',
    { schema: { tags: ['sns'], summary: '인스타그램 웹훅 수신' } },
    async (request, reply) => {
      const secret = instagramAppSecret();
      const header = request.headers['x-hub-signature-256'];
      const signature = Array.isArray(header) ? header[0] : header;
      const rawBody = request.body as Buffer;

      if (secret && signature?.startsWith('sha256=')) {
        const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          request.log.warn('인스타그램 웹훅 서명 검증 실패');
          return reply.status(401).send();
        }
      }

      request.log.info({ bytes: rawBody?.length ?? 0 }, '인스타그램 웹훅 수신(미처리)');
      return reply.status(200).send({ received: true });
    },
  );

  // POST — 사용자가 Instagram 설정에서 Snaply 를 제거했을 때(연결 해제 콜백). 토큰은 이미 쓸 수 없으므로
  // 연동을 지운다(SNS-9). Meta 는 응답 본문을 보지 않는다.
  app.post<{ Body: unknown }>(
    '/sns/instagram/deauthorize',
    {
      bodyLimit: SIGNED_REQUEST_BODY_LIMIT,
      schema: { tags: ['sns'], summary: '인스타그램 연결 해제 콜백' },
    },
    async (request, reply) => {
      const platformUserId = parseInstagramSignedRequest(signedRequestFrom(request.body));
      if (!platformUserId) {
        request.log.warn(
          { contentType: request.headers['content-type'] },
          '인스타그램 연결 해제 콜백 서명 검증 실패',
        );
        return reply.status(400).send();
      }
      const removed = await forgetInstagramUser(platformUserId);
      request.log.info({ platformUserId, removed }, '인스타그램 연결 해제 콜백 처리');
      return reply.status(200).send({ received: true });
    },
  );

  // POST — 사용자가 Instagram 설정에서 데이터 삭제를 요청했을 때. 지우고 상태 확인 주소와 확인 코드를 돌려준다.
  // 지우는 범위는 Meta 에서 받은 데이터뿐이다 — Snaply 계정은 남는다(SNS-9).
  app.post<{ Body: unknown }>(
    '/sns/instagram/data-deletion',
    {
      bodyLimit: SIGNED_REQUEST_BODY_LIMIT,
      schema: { tags: ['sns'], summary: '인스타그램 데이터 삭제 요청' },
    },
    async (request, reply) => {
      const platformUserId = parseInstagramSignedRequest(signedRequestFrom(request.body));
      if (!platformUserId) {
        request.log.warn(
          { contentType: request.headers['content-type'] },
          '인스타그램 데이터 삭제 요청 서명 검증 실패',
        );
        return reply.status(400).send();
      }
      const removed = await forgetInstagramUser(platformUserId);
      request.log.info({ platformUserId, removed }, '인스타그램 데이터 삭제 요청 처리');
      const code = encodeDeletionCode(new Date());
      const url = `${request.protocol}://${request.host}/sns/instagram/data-deletion/status?code=${encodeURIComponent(code)}`;
      return reply.status(200).send({ url, confirmation_code: code });
    },
  );

  // GET — 데이터 삭제 상태 페이지. 사용자가 Meta 에서 받은 링크로 연다.
  app.get<{ Querystring: { code?: string } }>(
    '/sns/instagram/data-deletion/status',
    { schema: { tags: ['sns'], summary: '인스타그램 데이터 삭제 상태' } },
    async (request, reply) => {
      const processedAt = decodeDeletionCode(request.query.code ?? '');
      const body = processedAt
        ? `<p>Instagram에서 받은 정보(연결 정보와 게시 기록의 Instagram 값)를 ${processedAt.toISOString()}에 삭제했어요.</p>
<p>Snaply 계정과 스냅·무비는 그대로예요. 계정까지 지우려면 앱의 나 탭에서 계정 삭제를 해 주세요.</p>`
        : '<p>확인 코드를 찾을 수 없어요. Instagram에서 받은 링크를 그대로 열어 주세요.</p>';
      return reply
        .status(processedAt ? 200 : 404)
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Snaply — 데이터 삭제 상태</title></head><body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6"><h1>데이터 삭제 상태</h1>${body}</body></html>`,
        );
    },
  );
}

/**
 * 본문에서 `signed_request` 를 꺼낸다 — urlencoded(`signed_request=...`), multipart(`name="signed_request"` 파트),
 * JSON 버퍼(`{"signed_request": ...}`) 어느 것이든. 없으면 빈 문자열.
 */
function signedRequestFrom(body: unknown): string {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : typeof body === 'string' ? body : '';
  const multipart = multipartField(text, 'signed_request');
  if (multipart) {
    return multipart;
  }
  const json = /"signed_request"\s*:\s*"([^"]+)"/.exec(text);
  if (json?.[1]) {
    return json[1];
  }
  return new URLSearchParams(text).get('signed_request') ?? '';
}

/**
 * multipart 본문에서 `name` 파트의 값(첫 줄). 파트 머리는 빈 줄에서 끝나고 그 다음 줄이 값이다.
 *
 * 정규식으로 머리 줄을 건너뛰면 `name="..."` 이 되풀이된 본문에서 시간이 본문 크기의 제곱으로 늘어
 * 서명을 확인하기도 전에 서버가 멈췄다(2026-10-13 리뷰 — 88KB 에 0.4초, 1MB 면 약 50초). 그래서 앞에서부터
 * 한 번만 훑는다.
 */
function multipartField(text: string, name: string): string | undefined {
  const marker = `name="${name}"`;
  const at = text.indexOf(marker);
  if (at < 0) return undefined;
  const valueStart = afterBlankLine(text, at + marker.length);
  if (valueStart < 0) return undefined;
  const lineEnd = text.indexOf('\n', valueStart);
  const value = (lineEnd < 0 ? text.slice(valueStart) : text.slice(valueStart, lineEnd)).trim();
  return value || undefined;
}

/** `from` 뒤 첫 빈 줄(`\n\n` 또는 `\n\r\n`)이 끝나는 위치. 없으면 -1. */
function afterBlankLine(text: string, from: number): number {
  const lf = text.indexOf('\n\n', from);
  const crlf = text.indexOf('\n\r\n', from);
  if (lf < 0 && crlf < 0) return -1;
  if (crlf < 0 || (lf >= 0 && lf < crlf)) return lf + 2;
  return crlf + 3;
}
