/**
 * Phase 7 — 실키 모드(mock=false)에서만 드러나는 경로.
 *
 * 인스타/틱톡 앱 등록·심사가 끝나기 전에도 "키가 있으면 어떤 요청을 보내는지"는 고정해둘 수 있다.
 * 외부 호출은 fetch 스텁으로 가로채고, 우리 쪽 순서/분기만 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createHarness, type Harness } from './helpers/harness.js';
import { encrypt } from '../src/lib/crypto.js';
import * as instagram from '../src/services/sns/instagram.client.js';
import * as tiktok from '../src/services/sns/tiktok.client.js';
import { snsUploadReadiness } from '../src/services/sns.service.js';
import type { SnsProviderConfig } from '../src/config.js';

let h: Harness;

const REAL_KEYS = {
  INSTAGRAM_APP_ID: 'test-ig-app',
  INSTAGRAM_APP_SECRET: 'test-ig-secret',
  INSTAGRAM_REDIRECT_URI: 'https://api.snaply.test/sns/instagram/callback',
  TIKTOK_CLIENT_KEY: 'test-tt-key',
  TIKTOK_CLIENT_SECRET: 'test-tt-secret',
  TIKTOK_REDIRECT_URI: 'https://api.snaply.test/sns/tiktok/callback',
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: 'verify-token-for-test',
};

const igConfig: SnsProviderConfig = {
  clientId: REAL_KEYS.INSTAGRAM_APP_ID,
  clientSecret: REAL_KEYS.INSTAGRAM_APP_SECRET,
  redirectUri: REAL_KEYS.INSTAGRAM_REDIRECT_URI,
  mock: false,
};

const ttConfig: SnsProviderConfig = {
  clientId: REAL_KEYS.TIKTOK_CLIENT_KEY,
  clientSecret: REAL_KEYS.TIKTOK_CLIENT_SECRET,
  redirectUri: REAL_KEYS.TIKTOK_REDIRECT_URI,
  mock: false,
};

const ttUploadParams = {
  accessToken: 'tok',
  videoUrl: 'https://cdn.example.com/v.mp4',
  caption: '테스트',
};

beforeAll(async () => {
  h = await createHarness(REAL_KEYS);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── fetch 스텁 ─────────────────────────────────────────
type Handler = (
  url: string,
  init?: RequestInit,
) => { status?: number; body?: unknown; raw?: string } | undefined;

/** graph/instagram 호출만 가로채고 나머지(JWKS 등)는 실제 fetch로 흘려보낸다. */
function stubFetch(handler: Handler): { calls: string[] } {
  const calls: string[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const matched = handler(url, init);
    if (!matched) {
      return real(input as RequestInfo, init);
    }
    calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`);
    const status = matched.status ?? 200;
    // raw 를 주면 그대로 내려보낸다 — JSON.stringify 를 거치면 큰 정수의 정밀도가 깨져서
    // 정밀도 회귀 테스트를 할 수 없다.
    const payload = matched.raw ?? JSON.stringify(matched.body);
    return new Response(payload, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { calls };
}

describe('authorize URL (실키 모드)', () => {
  it('인스타그램은 Instagram Login 엔드포인트와 게시 스코프를 쓴다', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/instagram/connect',
      headers: user.auth,
    });

    const url = new URL(res.json().data.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_content_publish',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(REAL_KEYS.INSTAGRAM_APP_ID);
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('틱톡은 video.publish 스코프를 요청한다', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/tiktok/connect',
      headers: user.auth,
    });

    const url = new URL(res.json().data.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('scope')).toContain('video.publish');
  });
});

describe('공개 URL 가드', () => {
  async function connectDirectly(userId: string, platform: 'instagram' | 'tiktok') {
    await h.prisma.snsConnection.create({
      data: {
        userId,
        platform,
        platformUserId: 'ig-123',
        platformUsername: 'tester',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async function uploadWith(editedUrl: string) {
    const user = await h.createUser();
    await connectDirectly(user.id, 'instagram');
    const video = await h.prisma.video.create({
      data: { userId: user.id, originalUrls: [], editedUrl, status: 'completed' },
      select: { id: true },
    });
    return h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });
  }

  it('로컬 MinIO 주소면 외부 호출 전에 400 으로 막는다', async () => {
    const res = await uploadWith('http://localhost:9100/snaply-dev/edited/a.mp4');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('접근할 수 없는 주소');
  });

  it('사설 IP도 막는다', async () => {
    const res = await uploadWith('https://192.168.0.10/v.mp4');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('접근할 수 없는 주소');
  });

  it('http 는 거부한다 (플랫폼이 https 를 요구)', async () => {
    const res = await uploadWith('http://cdn.example.com/v.mp4');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('https');
  });

  it('실패도 sns_uploads 에 기록되지 않는다 (호출 전 차단)', async () => {
    await uploadWith('http://localhost:9100/v.mp4');
    expect(await h.prisma.snsUpload.count()).toBe(0);
  });
});

describe('인스타그램 릴스 게시 — 컨테이너 처리 대기', () => {
  it('FINISHED 가 된 뒤에만 media_publish 를 호출한다', async () => {
    let statusCalls = 0;
    const { calls } = stubFetch((url) => {
      if (url.includes('/media_publish')) return { body: { id: 'ig-post-999' } };
      if (url.includes('/media')) return { body: { id: 'container-1' } };
      if (url.includes('container-1')) {
        statusCalls += 1;
        // 앞의 두 번은 아직 처리 중
        return { body: { status_code: statusCalls >= 3 ? 'FINISHED' : 'IN_PROGRESS' } };
      }
      return undefined;
    });

    const result = await instagram.uploadReel(igConfig, {
      accessToken: 'tok',
      videoUrl: 'https://cdn.example.com/v.mp4',
      caption: '테스트',
    });

    expect(result.postId).toBe('ig-post-999');
    expect(statusCalls).toBe(3);
    // 순서: 컨테이너 생성 → 상태조회 3회 → 게시
    expect(calls[0]).toContain('POST');
    expect(calls[0]).toContain('/media');
    expect(calls.at(-1)).toContain('/media_publish');
    expect(calls.filter((c) => c.includes('/media_publish'))).toHaveLength(1);
  });

  it('컨테이너가 ERROR 면 게시하지 않고 실패시킨다', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('/media_publish')) return { body: { id: 'should-not-happen' } };
      if (url.includes('/media')) return { body: { id: 'container-2' } };
      if (url.includes('container-2')) return { body: { status_code: 'ERROR', status: 'bad codec' } };
      return undefined;
    });

    await expect(
      instagram.uploadReel(igConfig, {
        accessToken: 'tok',
        videoUrl: 'https://cdn.example.com/v.mp4',
        caption: '',
      }),
    ).rejects.toThrow(/영상 처리에 실패/);

    expect(calls.some((c) => c.includes('/media_publish'))).toBe(false);
  });

  it('처리 시간이 초과되면 타임아웃으로 실패한다', async () => {
    stubFetch((url) => {
      if (url.includes('/media')) return { body: { id: 'container-3' } };
      if (url.includes('container-3')) return { body: { status_code: 'IN_PROGRESS' } };
      return undefined;
    });

    await expect(
      instagram.uploadReel(igConfig, {
        accessToken: 'tok',
        videoUrl: 'https://cdn.example.com/v.mp4',
        caption: '',
      }),
    ).rejects.toThrow(/시간 내에 끝나지 않았습니다/);
  });
});

describe('틱톡 게시 결과 확인', () => {
  it('PUBLISH_COMPLETE 가 될 때까지 상태를 폴링한다', async () => {
    let statusCalls = 0;
    const { calls } = stubFetch((url) => {
      if (url.includes('/publish/video/init/')) {
        return { body: { data: { publish_id: 'pub-1' } } };
      }
      if (url.includes('/publish/status/fetch/')) {
        statusCalls += 1;
        return {
          body: { data: { status: statusCalls >= 3 ? 'PUBLISH_COMPLETE' : 'PROCESSING_DOWNLOAD' } },
        };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);

    expect(result).toEqual({ postId: 'pub-1', status: 'success' });
    expect(statusCalls).toBe(3);
    expect(calls[0]).toContain('/publish/video/init/');
  });

  it('받은함으로 전달되면(SEND_TO_USER_INBOX) 성공으로 본다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-2' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'SEND_TO_USER_INBOX' } } };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);
    expect(result.status).toBe('success');
  });

  it('FAILED 면 사유를 담아 실패시킨다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-3' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'FAILED', fail_reason: 'video_format_unsupported' } } };
      }
      return undefined;
    });

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(
      /video_format_unsupported/,
    );
  });

  it('시간 내에 안 끝나면 실패가 아니라 pending 이다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-4' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'PROCESSING_DOWNLOAD' } } };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);
    expect(result).toEqual({ postId: 'pub-4', status: 'pending' });
  });

  it('publish_id 가 없으면 실패로 처리한다', async () => {
    stubFetch((url) => (url.includes('/publish/video/init/') ? { body: { data: {} } } : undefined));

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(/publish_id/);
  });

  it('pending 이면 sns_uploads 에 pending 으로 남고 uploadedAt 은 비어 있다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'tiktok',
        platformUserId: 'tt-1',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'pub-5' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { body: { data: { status: 'PROCESSING_UPLOAD' } } };
      }
      return undefined;
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'pending', platformPostId: 'pub-5' });
    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.status).toBe('pending');
    expect(upload.uploadedAt).toBeNull();
  });
});

describe('업로드 실패 사유 기록', () => {
  // 플랫폼 에러는 원인이 응답 본문에만 있다. 저장하지 않으면 사후 추적이 불가능하다.
  it('실패 시 sns_uploads 에 플랫폼이 준 사유를 남긴다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'tiktok',
        platformUserId: 'tt-1',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });
    stubFetch((url) =>
      url.includes('/publish/inbox/video/init/') || url.includes('/publish/video/init/')
        ? {
            status: 403,
            body: { error: { code: 'url_ownership_unverified', message: 'verify your URL prefix' } },
          }
        : undefined,
    );

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(400);
    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.status).toBe('failed');
    expect(upload.errorMessage).toContain('verify your URL prefix');
  });

  it('사유가 아주 길어도 컬럼 길이를 넘기지 않는다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'tiktok',
        platformUserId: 'tt-2',
        accessToken: encrypt('token'),
        tokenExpiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });
    stubFetch((url) =>
      url.includes('/video/init/')
        ? { status: 500, body: { error: { code: 'oops', message: 'x'.repeat(3000) } } }
        : undefined,
    );

    await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.errorMessage!.length).toBeLessThanOrEqual(500);
  });
});

describe('틱톡은 실패를 HTTP 200 + 에러 본문으로 준다', () => {
  // 실측: 만료된 code 로 토큰 교환 시 200 { error: "invalid_grant", ... } 가 온다.
  // res.ok 만 보면 undefined 토큰을 암호화하려다 500(ERR_INVALID_ARG_TYPE)이 났다.
  it('토큰 교환 실패를 400 으로 처리한다 (크래시 아님)', async () => {
    stubFetch((url) =>
      url.includes('/oauth/token/')
        ? {
            status: 200,
            body: { error: 'invalid_grant', error_description: 'Authorization code is expired.' },
          }
        : undefined,
    );

    await expect(tiktok.exchangeCode(ttConfig, 'expired-code')).rejects.toThrow(/invalid_grant/);
  });

  it('토큰 갱신 실패도 같은 방식으로 처리한다', async () => {
    stubFetch((url) =>
      url.includes('/oauth/token/')
        ? { status: 200, body: { error: 'invalid_request', error_description: 'bad refresh' } }
        : undefined,
    );

    await expect(tiktok.refreshAccessToken(ttConfig, 'stale')).rejects.toThrow(/invalid_request/);
  });

  it('access_token 이 없으면 명확한 에러를 낸다', async () => {
    stubFetch((url) => (url.includes('/oauth/token/') ? { status: 200, body: {} } : undefined));

    await expect(tiktok.exchangeCode(ttConfig, 'code')).rejects.toThrow(/access_token/);
  });

  it('Content Posting API 의 error.code 가 ok 가 아니면 실패로 본다', async () => {
    stubFetch((url) =>
      url.includes('/publish/video/init/')
        ? {
            status: 200,
            body: {
              data: {},
              error: { code: 'spam_risk_too_many_posts', message: 'daily limit reached' },
            },
          }
        : undefined,
    );

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(/spam_risk/);
  });

  it('게시 상태 조회의 에러도 잡는다', async () => {
    stubFetch((url) => {
      if (url.includes('/publish/video/init/')) return { body: { data: { publish_id: 'p1' } } };
      if (url.includes('/publish/status/fetch/')) {
        return { status: 200, body: { error: { code: 'access_token_invalid', message: 'expired' } } };
      }
      return undefined;
    });

    await expect(tiktok.uploadVideo(ttConfig, ttUploadParams)).rejects.toThrow(
      /access_token_invalid/,
    );
  });
});

describe('OAuth 콜백은 항상 앱으로 돌려보낸다', () => {
  // 콜백은 사용자 브라우저가 도착하는 지점이라, JSON 에러를 주면 앱으로 복귀할 방법이 없다.
  it('토큰 교환이 실패해도 JSON 이 아니라 에러 딥링크로 302', async () => {
    const user = await h.createUser();
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { status: 400, body: { error_type: 'OAuthException', error_message: 'Invalid code' } };
      }
      return undefined;
    });
    const { encodeState } = await import('../src/lib/crypto.js');

    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/callback?code=bad&state=${encodeURIComponent(encodeState(user.id))}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('snaplyapp://sns/error?platform=instagram&reason=exchange_failed');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });

  it('틱톡 200-에러 응답에서도 딥링크로 302 (500 아님)', async () => {
    const user = await h.createUser();
    stubFetch((url) =>
      url.includes('/oauth/token/')
        ? { status: 200, body: { error: 'invalid_grant', error_description: 'expired' } }
        : undefined,
    );
    const { encodeState } = await import('../src/lib/crypto.js');

    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/tiktok/callback?code=bad&state=${encodeURIComponent(encodeState(user.id))}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('snaplyapp://sns/error?platform=tiktok&reason=exchange_failed');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });
});

describe('user_id 정밀도 (2^53 초과)', () => {
  // 실측: Instagram user_id 는 27899354646370752 처럼 2^53 을 넘고 JSON **숫자**로 온다.
  // JSON.parse 하면 ...750 으로 값이 바뀌고, 그 ID 로 게시를 시도하면 Meta 가
  // "Object with ID ... does not exist" 로 거부한다 (실제로 확인됨).
  const BIG_ID = '27899354646370752';

  // 예전에는 /me 가 실패하면 토큰 응답의 user_id(앱 범위 ID)를 저장했다. 그 연동은 Meta 의 연결 해제 · 데이터 삭제 요청
  // (프로페셔널 계정 ID)과 맞지 않아 지울 수 없었다(backlog E-39) — 이제는 한 번 더 묻고, 그래도 없으면 연동하지 않는다.
  it('/me 가 두 번 실패하면 계정 ID 없이 연동하지 않는다', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        // 따옴표 없는 큰 정수 — 실제 Meta 응답과 동일한 형태
        return { raw: `{"access_token":"short","user_id":${BIG_ID},"permissions":"a,b"}` };
      }
      if (url.includes('graph.instagram.com/access_token')) return { status: 400, body: {} };
      if (url.includes('/me')) return { status: 400, body: {} };
      return undefined;
    });

    await expect(instagram.exchangeCode(igConfig, 'code')).rejects.toBeInstanceOf(
      instagram.InstagramProfileUnavailableError,
    );
    expect(calls.filter((c) => c.includes('/me')).length).toBe(2);
  });

  it('/me 가 한 번 실패해도 다시 물어 프로페셔널 계정 ID 를 쓴다', async () => {
    let profileCalls = 0;
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { raw: `{"access_token":"short","user_id":${BIG_ID}}` };
      }
      if (url.includes('graph.instagram.com/access_token')) return { status: 400, body: {} };
      if (url.includes('/me')) {
        profileCalls += 1;
        return profileCalls === 1
          ? { status: 500, body: {} }
          : { body: { user_id: '17841439086162200', username: 'gagejigi', account_type: 'BUSINESS' } };
      }
      return undefined;
    });

    const result = await instagram.exchangeCode(igConfig, 'code');

    expect(result.platformUserId).toBe('17841439086162200');
  });

  it('/me 가 성공하면 그 프로페셔널 계정 ID(문자열)를 쓴다', async () => {
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { raw: `{"access_token":"short","user_id":${BIG_ID}}` };
      }
      if (url.includes('graph.instagram.com/access_token')) {
        return { body: { access_token: 'long-lived', expires_in: 5_184_000 } };
      }
      if (url.includes('/me')) {
        return {
          body: {
            id: BIG_ID,
            user_id: '17841439086162200',
            username: 'gagejigi',
            account_type: 'BUSINESS',
          },
        };
      }
      return undefined;
    });

    const result = await instagram.exchangeCode(igConfig, 'code');

    // 앱 범위 ID(id)가 아니라 프로페셔널 계정 ID — Meta 의 데이터 삭제 요청이 이 값으로 온다(2026-10-11 실측).
    expect(result.platformUserId).toBe('17841439086162200');
    expect(result.accountType).toBe('BUSINESS');
    expect(result.accessToken).toBe('long-lived');
  });

  it('게시는 계정 ID 대신 /me 경로를 쓴다 (ID 불일치 위험 제거)', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('/media_publish')) return { body: { id: 'post-1' } };
      if (url.includes('/media')) return { body: { id: 'c1' } };
      if (url.includes('c1')) return { body: { status_code: 'FINISHED' } };
      return undefined;
    });

    await instagram.uploadReel(igConfig, {
      accessToken: 'tok',
      videoUrl: 'https://cdn.example.com/v.mp4',
      caption: '',
    });

    expect(calls.some((c) => c.includes('/me/media'))).toBe(true);
    expect(calls.some((c) => c.includes('/me/media_publish'))).toBe(true);
  });
});

describe('틱톡 스코프에 따른 게시 방식 전환', () => {
  // video.publish 는 앱 심사 통과가 필요하다. 심사 전에는 video.upload(받은함)만 쓸 수 있고,
  // 이때는 영상이 사용자 초안함에 들어가 사용자가 앱에서 마무리해야 게시된다.
  const originalScopes = process.env.TIKTOK_SCOPES;
  afterEach(() => {
    if (originalScopes === undefined) delete process.env.TIKTOK_SCOPES;
    else process.env.TIKTOK_SCOPES = originalScopes;
  });

  function stubPublishFlow() {
    return stubFetch((url) => {
      if (url.includes('/video/init/')) return { body: { data: { publish_id: 'p1' } } };
      if (url.includes('/status/fetch/')) {
        return { body: { data: { status: 'PUBLISH_COMPLETE' } } };
      }
      return undefined;
    });
  }

  it('video.publish 면 직접 게시 엔드포인트를 쓰고 post_info 를 보낸다', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,video.publish';
    let sentBody = '';
    stubFetch((url, init) => {
      if (url.includes('/post/publish/video/init/')) {
        sentBody = String(init?.body ?? '');
        return { body: { data: { publish_id: 'p1' } } };
      }
      if (url.includes('/status/fetch/')) return { body: { data: { status: 'PUBLISH_COMPLETE' } } };
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);

    expect(sentBody).toContain('post_info');
    expect(sentBody).toContain('SELF_ONLY');
    expect(result.requiresUserAction).toBeFalsy();
    expect(result.status).toBe('success');
  });

  it('video.upload 면 받은함 엔드포인트를 쓰고 post_info 를 보내지 않는다', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,video.upload';
    let sentUrl = '';
    let sentBody = '';
    stubFetch((url, init) => {
      if (url.includes('/video/init/')) {
        sentUrl = url;
        sentBody = String(init?.body ?? '');
        return { body: { data: { publish_id: 'p2' } } };
      }
      if (url.includes('/status/fetch/')) {
        return { body: { data: { status: 'SEND_TO_USER_INBOX' } } };
      }
      return undefined;
    });

    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);

    expect(sentUrl).toContain('/post/publish/inbox/video/init/');
    // 제목·공개범위는 사용자가 틱톡 앱에서 직접 정한다
    expect(sentBody).not.toContain('post_info');
    expect(sentBody).toContain('PULL_FROM_URL');
    // 우리 전달은 끝났지만 게시는 사용자가 마무리해야 한다
    expect(result.requiresUserAction).toBe(true);
    expect(result.status).toBe('success');
  });

  it('authorize URL 이 설정된 스코프를 그대로 요청한다', async () => {
    process.env.TIKTOK_SCOPES = 'user.info.basic,video.upload';
    const url = new URL(tiktok.authorizeUrl(ttConfig, 'state-x'));
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.upload');
  });

  it('기본값은 직접 게시(video.publish)다', async () => {
    delete process.env.TIKTOK_SCOPES;
    const url = new URL(tiktok.authorizeUrl(ttConfig, 'state-x'));
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
    stubPublishFlow();
    const result = await tiktok.uploadVideo(ttConfig, ttUploadParams);
    expect(result.requiresUserAction).toBeFalsy();
  });
});

describe('인스타그램 웹훅 (콘솔 등록용 검증)', () => {
  const VERIFY_TOKEN = REAL_KEYS.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  it('mode=subscribe + 올바른 인증 토큰이면 challenge 를 평문으로 되돌려준다', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('1158201444');
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('인증 토큰이 다르면 403', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/instagram/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1',
    });
    expect(res.statusCode).toBe(403);
  });

  it('mode 가 subscribe 가 아니면 403', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/webhook?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('이벤트 POST 는 서명이 맞으면 200', async () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] });
    const signature = `sha256=${createHmac('sha256', REAL_KEYS.INSTAGRAM_APP_SECRET)
      .update(body)
      .digest('hex')}`;

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
  });

  it('이벤트 POST 서명이 틀리면 401', async () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('인스타그램 연결 해제 · 데이터 삭제 요청 (SNS-9)', () => {
  const BIG_ID = '27899354646370752';

  /**
   * Meta 와 같은 방식으로 서명한다: base64url(HMAC(payload)).payload — user_id 는 따옴표 없는 큰 정수.
   * `issuedAt` 은 초 단위 발급 시각(기본 지금), `null` 이면 필드를 넣지 않는다.
   */
  function signedRequest(
    userId: string,
    secret = REAL_KEYS.INSTAGRAM_APP_SECRET,
    issuedAt: number | null = Math.floor(Date.now() / 1000),
  ): string {
    const issued = issuedAt === null ? '' : `"issued_at":${issuedAt},`;
    const payload = Buffer.from(
      `{"algorithm":"HMAC-SHA256",${issued}"user_id":${userId}}`,
    ).toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${sig}.${payload}`;
  }

  function post(url: string, signed: string) {
    return h.app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `signed_request=${encodeURIComponent(signed)}`,
    });
  }

  /** 연동 하나와 게시 이력 하나를 가진 사용자. */
  async function connectedUser(platformUserId: string) {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'instagram',
        platformUserId,
        platformUsername: 'creator_user',
        accessToken: encrypt('tok'),
      },
    });
    const video = await h.prisma.video.create({
      data: { userId: user.id, originalUrls: [], status: 'completed' },
      select: { id: true },
    });
    await h.prisma.snsUpload.create({
      data: {
        userId: user.id,
        videoId: video.id,
        platform: 'instagram',
        platformPostId: 'ig-post-1',
        status: 'success',
      },
    });
    return user;
  }

  it('데이터 삭제 요청은 연동과 게시 이력의 Instagram 값을 지우고 계정은 남긴다', async () => {
    const user = await connectedUser(BIG_ID);
    const other = await connectedUser('111');

    const res = await post('/sns/instagram/data-deletion', signedRequest(BIG_ID));

    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string; confirmation_code: string };
    expect(body.url).toContain('/sns/instagram/data-deletion/status?code=');
    expect(body.confirmation_code).toBeTruthy();
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);
    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.platformPostId).toBeNull();
    expect(upload.status).toBe('success');
    expect(await h.prisma.user.count({ where: { id: user.id } })).toBe(1);
    // 다른 계정의 연동은 그대로다.
    expect(await h.prisma.snsConnection.count({ where: { userId: other.id } })).toBe(1);

    const status = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/data-deletion/status?code=${encodeURIComponent(body.confirmation_code)}`,
    });
    expect(status.statusCode).toBe(200);
    expect(status.body).toContain('삭제했어요');
  });

  it('연결 해제 콜백은 연동을 지운다', async () => {
    const user = await connectedUser(BIG_ID);

    const res = await post('/sns/instagram/deauthorize', signedRequest(BIG_ID));

    expect(res.statusCode).toBe(200);
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);
  });

  // 실측: Meta 의 연결 해제 콜백이 urlencoded 가 아닌 형식으로 와 415 가 났다.
  it('multipart 로 온 연결 해제 콜백도 처리한다', async () => {
    const user = await connectedUser(BIG_ID);
    const boundary = '----meta';
    const payload =
      `--${boundary}\r\nContent-Disposition: form-data; name="signed_request"\r\n\r\n` +
      `${signedRequest(BIG_ID)}\r\n--${boundary}--\r\n`;

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/deauthorize',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);
  });

  /** 게시 이력 하나를 더 가진다 — 다른 플랫폼 값이 같이 지워지지 않는지 보려고. */
  async function addUpload(userId: string, platform: 'instagram' | 'tiktok', platformPostId: string) {
    const video = await h.prisma.video.create({
      data: { userId, originalUrls: [], status: 'completed' },
      select: { id: true },
    });
    await h.prisma.snsUpload.create({
      data: { userId, videoId: video.id, platform, platformPostId, status: 'success', errorMessage: 'note' },
    });
  }

  async function postIds(userId: string, platform: 'instagram' | 'tiktok') {
    const rows = await h.prisma.snsUpload.findMany({ where: { userId, platform }, select: { platformPostId: true } });
    return rows.map((row) => row.platformPostId);
  }

  // 앱에서 먼저 해제한 사용자의 값은 연동이 없어 Meta 의 삭제 요청으로 찾을 수 없었다(backlog E-39) — 해제할 때 지운다.
  it('앱에서 연동을 해제하면 그 플랫폼의 게시 이력 값도 지우고 다른 플랫폼은 남긴다', async () => {
    const user = await connectedUser(BIG_ID);
    await addUpload(user.id, 'tiktok', 'tt-post-1');

    const res = await h.app.inject({ method: 'DELETE', url: '/sns/instagram/disconnect', headers: user.auth });

    expect(res.statusCode).toBe(200);
    expect(await postIds(user.id, 'instagram')).toEqual([null]);
    expect(await postIds(user.id, 'tiktok')).toEqual(['tt-post-1']);
    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id, platform: 'instagram' } });
    expect(upload).toMatchObject({ errorMessage: null, status: 'success' });
  });

  it('해제한 뒤에 온 데이터 삭제 요청에는 지울 값이 남아 있지 않다', async () => {
    const user = await connectedUser(BIG_ID);
    await h.app.inject({ method: 'DELETE', url: '/sns/instagram/disconnect', headers: user.auth });

    const res = await post('/sns/instagram/data-deletion', signedRequest(BIG_ID));

    expect(res.statusCode).toBe(200);
    expect(await postIds(user.id, 'instagram')).toEqual([null]);
  });

  // 다른 계정으로 다시 연결하면 이전 계정의 값이 남아, 새 계정의 삭제 요청이 이전 계정 값까지 지우고 이전 계정의 요청은
  // 아무것도 못 지웠다(backlog E-39).
  it('다른 Instagram 계정으로 다시 연결하면 이전 계정의 값을 지우고, 같은 계정이면 남긴다', async () => {
    const user = await connectedUser(BIG_ID);
    const { encodeState } = await import('../src/lib/crypto.js');
    const connectAs = async (accountId: string) => {
      stubFetch((url) => {
        if (url.includes('api.instagram.com/oauth/access_token')) return { body: { access_token: 'short', user_id: 1 } };
        if (url.includes('graph.instagram.com/access_token')) return { body: { access_token: 'long', expires_in: 5_184_000 } };
        if (url.includes('/me')) return { body: { user_id: accountId, username: 'creator_user', account_type: 'BUSINESS' } };
        return undefined;
      });
      const res = await h.app.inject({
        method: 'GET',
        url: `/sns/instagram/callback?code=c&state=${encodeURIComponent(encodeState(user.id))}`,
      });
      vi.unstubAllGlobals();
      return res;
    };

    const same = await connectAs(BIG_ID);
    expect(same.headers.location).toContain('sns/connected');
    expect(await postIds(user.id, 'instagram')).toEqual(['ig-post-1']);

    const other = await connectAs('17841400000000001');
    expect(other.headers.location).toContain('sns/connected');
    expect(await postIds(user.id, 'instagram')).toEqual([null]);
    const connection = await h.prisma.snsConnection.findFirstOrThrow({ where: { userId: user.id } });
    expect(connection.platformUserId).toBe('17841400000000001');
  });

  it('계정 ID 를 얻지 못하면 profile_unavailable 로 돌려보내고 연동을 만들지 않는다', async () => {
    const user = await h.createUser();
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) return { body: { access_token: 'short', user_id: 1 } };
      if (url.includes('graph.instagram.com/access_token')) return { body: { access_token: 'long', expires_in: 5_184_000 } };
      if (url.includes('/me')) return { status: 400, body: {} };
      return undefined;
    });
    const { encodeState } = await import('../src/lib/crypto.js');

    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/callback?code=c&state=${encodeURIComponent(encodeState(user.id))}`,
    });

    expect(res.headers.location).toContain('reason=profile_unavailable');
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);
  });

  it('데이터 마이그레이션은 연동이 없는 사용자의 값만 지운다', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const sql = readFileSync(
      fileURLToPath(
        new URL('../prisma/migrations/20261014000000_forget_sns_values_without_connection/migration.sql', import.meta.url),
      ),
      'utf8',
    );
    const kept = await connectedUser(BIG_ID);
    const left = await connectedUser('111');
    await h.prisma.snsConnection.deleteMany({ where: { userId: left.id } });

    await h.prisma.$executeRawUnsafe(sql);

    expect(await postIds(kept.id, 'instagram')).toEqual(['ig-post-1']);
    expect(await postIds(left.id, 'instagram')).toEqual([null]);
  });

  it('multipart 파트 머리에 줄이 더 있어도 값을 꺼낸다', async () => {
    const user = await connectedUser(BIG_ID);
    const boundary = '----meta';
    const payload =
      `--${boundary}\r\nContent-Disposition: form-data; name="signed_request"\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      `${signedRequest(BIG_ID)}\r\n--${boundary}--\r\n`;

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/deauthorize',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);
  });

  // 인증 없는 주소라 서명을 확인하기 전에 본문을 읽는다. `name="signed_request"` 를 되풀이한 본문에서 옛 정규식은
  // 본문 크기의 제곱만큼 걸려 1MB 한 건에 서버가 약 50초 멈췄다(2026-10-13 리뷰). 큰 본문은 읽기 전에 막는다.
  it('큰 본문은 서명을 보기 전에 413 으로 막고 아무것도 지우지 않는다', async () => {
    const user = await connectedUser(BIG_ID);
    const payload = 'name="signed_request"\n'.repeat(3000); // 약 66KB

    for (const url of ['/sns/instagram/deauthorize', '/sns/instagram/data-deletion']) {
      const res = await h.app.inject({
        method: 'POST',
        url,
        headers: { 'content-type': 'text/plain' },
        payload,
      });
      expect(res.statusCode).toBe(413);
    }
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(1);
  });

  it('한도 안에서 필드 이름만 되풀이한 본문은 400 이다', async () => {
    const payload = 'name="signed_request"\n'.repeat(600); // 약 13KB

    const started = performance.now();
    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/deauthorize',
      headers: { 'content-type': 'text/plain' },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('모르는 사용자여도 확인 코드를 돌려준다(이미 지운 경우)', async () => {
    const res = await post('/sns/instagram/data-deletion', signedRequest('999'));

    expect(res.statusCode).toBe(200);
    expect((res.json() as { confirmation_code: string }).confirmation_code).toBeTruthy();
  });

  it('서명이 틀리면 400 이고 아무것도 지우지 않는다', async () => {
    const user = await connectedUser(BIG_ID);

    const deauth = await post('/sns/instagram/deauthorize', signedRequest(BIG_ID, 'wrong-secret'));
    const deletion = await post('/sns/instagram/data-deletion', signedRequest(BIG_ID, 'wrong-secret'));

    expect(deauth.statusCode).toBe(400);
    expect(deletion.statusCode).toBe(400);
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(1);
  });

  // 서명만 보면 한 번 받은 요청이 영구히 유효했다 — 같은 계정으로 다시 연결한 뒤 옛 요청이 오면 새 연결이
  // 끊긴다(2026-10-14 리뷰, backlog E-47).
  it('발급된 지 하루가 넘은 요청은 400 이고 아무것도 지우지 않는다', async () => {
    const user = await connectedUser(BIG_ID);
    const dayAndAMinuteAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60 - 60;

    const deauth = await post(
      '/sns/instagram/deauthorize',
      signedRequest(BIG_ID, undefined, dayAndAMinuteAgo),
    );
    const deletion = await post(
      '/sns/instagram/data-deletion',
      signedRequest(BIG_ID, undefined, dayAndAMinuteAgo),
    );

    expect(deauth.statusCode).toBe(400);
    expect(deletion.statusCode).toBe(400);
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(1);
  });

  it.each([
    ['하루 안에 다시 보낸 요청', Math.floor(Date.now() / 1000) - 23 * 60 * 60],
    ['발급 시각이 없는 요청', null],
  ])('%s은 받는다', async (_name, issuedAt) => {
    const user = await connectedUser(BIG_ID);

    const res = await post('/sns/instagram/deauthorize', signedRequest(BIG_ID, undefined, issuedAt));

    expect(res.statusCode).toBe(200);
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);
  });

  it('위조한 확인 코드는 상태 페이지가 404', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/instagram/data-deletion/status?code=eyJ0IjoxfQ.forged',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('인스타그램 토큰 교환', () => {
  it('단기 → 장기 토큰 교환 후 프로필에서 account_type 을 실제로 읽는다', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { body: { access_token: 'short-lived', user_id: 12345 } };
      }
      if (url.includes('graph.instagram.com/access_token')) {
        return { body: { access_token: 'long-lived', expires_in: 5_184_000 } };
      }
      if (url.includes('/me')) {
        return { body: { user_id: '12345', username: 'real_user', account_type: 'CREATOR' } };
      }
      return undefined;
    });

    const result = await instagram.exchangeCode(igConfig, 'auth-code');

    expect(result.accessToken).toBe('long-lived');
    expect(result.platformUsername).toBe('real_user');
    expect(result.accountType).toBe('CREATOR');
    // 60일 뒤 만료
    const days = (result.expiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(59);
    expect(calls).toHaveLength(3);
  });

  it.each(['MEDIA_CREATOR', 'Media_Creator', 'BUSINESS'])(
    '프로페셔널 계정(%s)은 연동을 저장한다',
    async (accountType) => {
      const user = await h.createUser();
      stubFetch((url) => {
        if (url.includes('api.instagram.com/oauth/access_token')) {
          return { body: { access_token: 'short', user_id: 1 } };
        }
        if (url.includes('graph.instagram.com/access_token')) {
          return { body: { access_token: 'long', expires_in: 5_184_000 } };
        }
        if (url.includes('/me')) {
          return { body: { user_id: '1', username: 'creator_user', account_type: accountType } };
        }
        return undefined;
      });

      const { encodeState } = await import('../src/lib/crypto.js');
      const res = await h.app.inject({
        method: 'GET',
        url: `/sns/instagram/callback?code=c&state=${encodeURIComponent(encodeState(user.id))}`,
      });

      expect(res.headers.location).toBe('snaplyapp://sns/connected?platform=instagram');
      expect(await h.prisma.snsConnection.count()).toBe(1);
    },
  );

  it('PERSONAL 계정은 콜백에서 걸러진다', async () => {
    const user = await h.createUser();
    stubFetch((url) => {
      if (url.includes('api.instagram.com/oauth/access_token')) {
        return { body: { access_token: 'short', user_id: 1 } };
      }
      if (url.includes('graph.instagram.com/access_token')) {
        return { body: { access_token: 'long', expires_in: 5_184_000 } };
      }
      if (url.includes('/me')) {
        return { body: { user_id: '1', username: 'personal_user', account_type: 'PERSONAL' } };
      }
      return undefined;
    });

    const { encodeState } = await import('../src/lib/crypto.js');
    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/callback?code=c&state=${encodeURIComponent(encodeState(user.id))}`,
    });

    expect(res.headers.location).toContain('reason=account_type');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });
});

describe('토큰 만료 처리', () => {
  it('이미 만료된 연동으로 업로드하면 재연동을 안내한다', async () => {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'instagram',
        platformUserId: 'ig-1',
        accessToken: encrypt('expired-token'),
        tokenExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('다시 연동');
  });

  it('만료가 7일 이내로 다가오면 업로드 전에 장기 토큰을 갱신한다', async () => {
    const user = await h.createUser();
    const conn = await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'instagram',
        platformUserId: 'ig-1',
        accessToken: encrypt('old-long-lived'),
        tokenExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3일 뒤
      },
      select: { id: true, accessToken: true },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });

    stubFetch((url) => {
      if (url.includes('refresh_access_token')) {
        return { body: { access_token: 'refreshed-token', expires_in: 5_184_000 } };
      }
      if (url.includes('/media_publish')) return { body: { id: 'ig-post-1' } };
      if (url.includes('/media')) return { body: { id: 'c1' } };
      if (url.includes('c1')) return { body: { status_code: 'FINISHED' } };
      return undefined;
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(200);
    const after = await h.prisma.snsConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(after.accessToken).not.toBe(conn.accessToken);
    const daysLeft = (after.tokenExpiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(59);
  });
});

/**
 * 기동 시점 준비 상태 점검 (backlog E-2).
 *
 * 실키 모드에서만 의미가 있다 — mock 은 우리가 준 URL 을 실제로 내려받지 않으므로 도달
 * 가능성이 상관없다. 업로드 때 쓰는 것과 **같은 기준**으로 판정해야 기동 로그가 거짓말을
 * 하지 않으므로, 미설정뿐 아니라 "값은 있지만 도달 불가" 도 걸러야 한다.
 */
describe('snsUploadReadiness (실키 모드)', () => {
  it('공개 https 주소면 경고하지 않는다', () => {
    expect(snsUploadReadiness('https://cdn.snaply.test/snaply')).toBeNull();
  });

  it('localhost 는 값이 있어도 경고한다 — 플랫폼이 우리 머신에 닿을 수 없다', () => {
    const warning = snsUploadReadiness('http://localhost:9100/snaply');
    expect(warning).toContain('localhost');
    expect(warning).toContain('S3_PUBLIC_ENDPOINT');
  });

  it('사설 IP 도 경고한다', () => {
    expect(snsUploadReadiness('http://192.168.0.10:9000/snaply')).toContain('192.168.0.10');
  });

  it('공개 주소여도 http 면 경고한다 — 인스타·틱톡은 https 로만 내려받는다', () => {
    expect(snsUploadReadiness('http://cdn.snaply.test/snaply')).toContain('https');
  });

  it('URL 형식이 아니면 경고한다', () => {
    expect(snsUploadReadiness('')).toContain('미설정');
  });
});

/**
 * 만료 시각을 모르는 연동의 게시 실패 (backlog E-1).
 *
 * 이 연동은 조용히 만료됐을 수 있고, 그러면 플랫폼은 그냥 거절한다. 우리는 이유를 모르므로
 * **단정하지 않되 다음에 할 일은 가리킨다.** mock 은 항상 성공해서 이 분기를 탈 수 없다.
 */
describe('만료 시각을 모르는 연동의 실패 안내 (실키 모드)', () => {
  async function setup(tokenExpiresAt: Date | null) {
    const user = await h.createUser();
    await h.prisma.snsConnection.create({
      data: {
        userId: user.id,
        platform: 'tiktok',
        platformUserId: 'tt-1',
        accessToken: encrypt('token'),
        refreshToken: encrypt('refresh'),
        tokenExpiresAt,
      },
    });
    const video = await h.prisma.video.create({
      data: {
        userId: user.id,
        originalUrls: [],
        editedUrl: 'https://cdn.example.com/v.mp4',
        status: 'completed',
      },
      select: { id: true },
    });
    return { user, video };
  }

  async function uploadExpectingFailure(user: { auth: Record<string, string> }, videoId: string) {
    // 만료 시각 학습(갱신)도, 게시도 전부 거절당하는 상태.
    stubFetch((url) => {
      if (url.includes('open.tiktokapis.com')) return { status: 401, body: { error: { message: 'invalid token' } } };
      return undefined;
    });
    return h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId },
    });
  }

  it('만료 시각을 모르면 재연동을 안내한다', async () => {
    const { user, video } = await setup(null);

    const res = await uploadExpectingFailure(user, video.id);

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('다시 연동');
  });

  it('만료 시각을 아는 연동의 실패에는 재연동을 끌어들이지 않는다 — 다른 이유다', async () => {
    const { user, video } = await setup(new Date(Date.now() + 20 * 60 * 60 * 1000));

    const res = await uploadExpectingFailure(user, video.id);

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).not.toContain('다시 연동');
  });
});
