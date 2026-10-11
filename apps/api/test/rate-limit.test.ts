/**
 * Phase 9 — 라우트별 rate limit (Dev B 트랙).
 * 인증이 필요한 라우트라 전역 제한은 넉넉히 두고, 라우트 override 만 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

describe('라우트별 rate limit', () => {
  it('/notifications/geofence-enter 는 토큰당 분당 10회, 11번째는 429', async () => {
    const user = await h.createUser();
    const location = await h.prisma.location.create({
      data: { name: 'rl', lat: 37.5, lng: 127.0 },
      select: { id: true },
    });

    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/notifications/geofence-enter',
        headers: user.auth,
        payload: { locationId: location.id },
      });
      codes.push(res.statusCode);
    }

    expect(codes[10]).toBe(429);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
  });

  it('제한은 토큰 단위라 다른 유저는 영향받지 않는다', async () => {
    const heavy = await h.createUser();
    const other = await h.createUser();
    const location = await h.prisma.location.create({
      data: { name: 'rl2', lat: 37.5, lng: 127.0 },
      select: { id: true },
    });

    for (let i = 0; i < 11; i += 1) {
      await h.app.inject({
        method: 'POST',
        url: '/notifications/geofence-enter',
        headers: heavy.auth,
        payload: { locationId: location.id },
      });
    }
    const res = await h.app.inject({
      method: 'POST',
      url: '/notifications/geofence-enter',
      headers: other.auth,
      payload: { locationId: location.id },
    });

    expect(res.statusCode).toBe(200);
  });
});
