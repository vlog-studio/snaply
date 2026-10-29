/**
 * 무비마다 고르는 맞춤 방식(specs/movie.md MOV-8).
 *
 * 고정하는 계약:
 *   ① 보내지 않으면 `blur_background` 이고, 고른 값은 저장 · 응답 · 수정에서 그대로다
 *   ② 목록에 없는 값은 400
 *   ③ 생성(export)은 무비의 값을 작업의 renderSpec 에 싣고, 큐의 작업도 같은 값이다
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { createRedisConnection } from '../src/lib/redis.js';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function createSnap(user: TestUser): Promise<string> {
  const video = await h.prisma.video.create({
    data: { userId: user.id, kind: 'source', status: 'ready', s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4` },
  });
  return video.id;
}

function createMovie(user: TestUser, body: Record<string, unknown>) {
  return h.app.inject({ method: 'POST', url: '/movies', headers: user.auth, payload: body });
}

async function exportRenderSpec(user: TestUser, movieId: string): Promise<Record<string, unknown>> {
  await h.prisma.creditLedger.create({ data: { userId: user.id, delta: 100, reason: 'promo' } });
  const res = await h.app.inject({ method: 'POST', url: `/movies/${movieId}/export`, headers: user.auth });
  expect(res.statusCode).toBe(202);
  const jobId = res.json().data.jobId as string;
  const stored = (await h.prisma.editJob.findUnique({ where: { id: jobId } }))?.renderSpec as Record<string, unknown>;
  const v3 = new Queue(process.env.EDIT_V3_QUEUE_NAME ?? '', { connection: createRedisConnection() });
  try {
    const queued = await v3.getJob(jobId);
    expect(queued?.data.renderSpec).toEqual(stored);
    await queued?.remove();
  } finally {
    await v3.close();
  }
  return stored;
}

describe('맞춤 방식 저장', () => {
  it('보내지 않으면 blur_background, 고르면 그대로 저장 · 응답되고 PATCH 로 바꿀 수 있다', async () => {
    const user = await h.createUser();
    const plain = await createMovie(user, {});
    expect(plain.statusCode).toBe(201);
    expect(plain.json().data.fitMode).toBe('blur_background');

    const created = await createMovie(user, { fitMode: 'pad_white' });
    expect(created.json().data.fitMode).toBe('pad_white');
    const id = created.json().data.id as string;
    const read = await h.app.inject({ method: 'GET', url: `/movies/${id}`, headers: user.auth });
    expect(read.json().data.fitMode).toBe('pad_white');

    const patched = await h.app.inject({
      method: 'PATCH',
      url: `/movies/${id}`,
      headers: user.auth,
      payload: { fitMode: 'pad_black' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.fitMode).toBe('pad_black');
  });

  it('목록에 없는 값은 400', async () => {
    const user = await h.createUser();
    const res = await createMovie(user, { fitMode: 'pad_red' });
    expect(res.statusCode).toBe(400);
  });
});

describe('생성은 무비의 맞춤 방식으로 렌더한다', () => {
  it('기본 무비는 지금까지와 같은 blur_background', async () => {
    const user = await h.createUser();
    const id = (await createMovie(user, { clips: [{ videoId: await createSnap(user) }] })).json().data.id as string;
    expect(await exportRenderSpec(user, id)).toMatchObject({
      outputProfile: 'short_vertical',
      width: 1080,
      height: 1920,
      fitMode: 'blur_background',
    });
  });

  it('고른 값이 작업의 renderSpec 에 실린다', async () => {
    const user = await h.createUser();
    const id = (
      await createMovie(user, { fitMode: 'pad_white', clips: [{ videoId: await createSnap(user) }] })
    ).json().data.id as string;
    expect(await exportRenderSpec(user, id)).toMatchObject({ outputProfile: 'short_vertical', fitMode: 'pad_white' });
  });
});
