/**
 * 개발 문서(Swagger)의 개발 로그인 — `POST /docs/auth/token` 은 Swagger UI 의 OAuth2 password flow 가
 * 보내는 urlencoded 폼을 받아 Supabase 이메일 로그인으로 넘긴다.
 *
 * 그 폼 파서가 루트에 걸리면 뒤에 등록되는 라우트 스코프가 모두 물려받는다. 자기 폼 파서를 거는 SNS 웹훅
 * 스코프가 `FST_ERR_CTP_ALREADY_PRESENT` 로 서버를 띄우지 못했다(2026-10-18 — 개발 문서가 켜지는 로컬 개발
 * 서버에서만. 다른 테스트는 문서를 끄고 앱을 만든다).
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { disconnectPrisma } from '../src/db/client.js';
import { disconnectRedis } from '../src/lib/redis.js';
import { closeEditQueue } from '../src/queue/edit-queue.js';
import { closeVideoAnalysisQueue } from '../src/queue/video-analysis-queue.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

describe('개발 문서의 개발 로그인', () => {
  let app: FastifyInstance;

  // 로컬 개발 서버와 같은 구성 — 문서와 개발 로그인을 켠다(개발 로그인은 공개 키가 있어야 켜진다). 고치기 전에는
  // 여기서 던졌다. 앱은 한 번만 만든다 — 큐가 모듈 단위라 다시 만들면 앞 앱의 큐 연결이 남는다.
  beforeAll(async () => {
    app = await buildApp(
      { ...loadConfig(), supabasePublishableKey: 'test-publishable-key' },
      { docs: { enabled: true, allowDevLogin: true } },
    );
    await app.ready();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await app?.close();
    await closeEditQueue();
    await closeVideoAnalysisQueue();
    await disconnectRedis();
    await disconnectPrisma();
  });

  it('개발 로그인을 켜도 서버가 뜬다 — SNS 웹훅의 폼 파서와 부딪히지 않는다', () => {
    expect(app.hasRoute({ method: 'POST', url: '/docs/auth/token' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/sns/instagram/deauthorize' })).toBe(true);
  });

  it('password flow 폼을 읽어 Supabase 이메일 로그인으로 넘긴다', async () => {
    const supabase = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ access_token: 'supabase-access-token', token_type: 'bearer', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', supabase);

    const res = await app.inject({
      method: 'POST',
      url: '/docs/auth/token',
      headers: FORM,
      payload: 'grant_type=password&username=dev%40snaply.test&password=pw',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ access_token: 'supabase-access-token', token_type: 'bearer' });
    expect(supabase).toHaveBeenCalledTimes(1);
    const [url, init] = supabase.mock.calls[0]!;
    expect(String(url)).toContain('/auth/v1/token?grant_type=password');
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'dev@snaply.test', password: 'pw' });
  });

  it('SNS 웹훅은 개발 로그인과 함께여도 폼 본문을 자기 파서로 읽는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sns/instagram/deauthorize',
      headers: FORM,
      payload: 'signed_request=not-a-signed-request',
    });

    // 본문을 읽고 서명 검증에서 막혔다 — 이 형식의 파서가 없으면 415 다.
    expect(res.statusCode).toBe(400);
  });
});
