/**
 * 편집 작업 조회 (GET /edit-jobs/:id) — 컷 상한(`MOVIE_CLIP_MAX`)까지의 작업이 읽힌다.
 *
 * 앱은 생성이 끝난 것을 이 조회로 안다. 컷 상한을 20 으로 올릴 때 응답 스키마만 10 에 남아 11컷 이상 작업이
 * 매번 500 이었고, 앱의 생성 화면이 95% 에서 멈췄다(backlog E-61). 무비 · 워커의 상한은 movies.test.ts 가 맞춰 본다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { MOVIE_CLIP_MAX } from '@vlog-studio/shared-types';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { createRedisConnection } from '../src/lib/redis.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function createSnap(user: TestUser): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
    },
  });
  return video.id;
}

function getJob(user: TestUser, jobId: string) {
  return h.app.inject({ method: 'GET', url: `/edit-jobs/${jobId}`, headers: user.auth });
}

describe('GET /edit-jobs/:id — 컷 상한까지', () => {
  it(`${MOVIE_CLIP_MAX}컷 무비의 생성 작업(v3)을 대기 중에도, 끝난 뒤에도 읽는다`, async () => {
    const user = await h.createUser();
    await h.prisma.creditLedger.create({ data: { userId: user.id, delta: 100, reason: 'promo' } });
    const snaps = await Promise.all(Array.from({ length: MOVIE_CLIP_MAX }, () => createSnap(user)));
    const movie = await h.app.inject({
      method: 'POST',
      url: '/movies',
      headers: user.auth,
      payload: { clips: snaps.map((videoId) => ({ videoId })) },
    });
    expect(movie.statusCode).toBe(201);

    const exported = await h.app.inject({
      method: 'POST',
      url: `/movies/${movie.json().data.id}/export`,
      headers: user.auth,
    });
    expect(exported.statusCode).toBe(202);
    const jobId = exported.json().data.jobId as string;

    const queued = await getJob(user, jobId);
    expect(queued.statusCode).toBe(200);
    expect(queued.json().data.editSpec.timeline.cuts).toHaveLength(MOVIE_CLIP_MAX);

    // 워커가 끝낸 뒤 — 앱이 완료를 아는 조회다.
    await h.prisma.editJob.update({
      where: { id: jobId },
      data: { status: 'done', progress: 100, completedAt: new Date() },
    });
    const done = await getJob(user, jobId);
    expect(done.statusCode).toBe(200);
    expect(done.json().data.status).toBe('done');

    const v3 = new Queue(process.env.EDIT_V3_QUEUE_NAME ?? '', { connection: createRedisConnection() });
    try {
      await (await v3.getJob(jobId))?.remove();
    } finally {
      await v3.close();
    }
  });

  it(`옛 작업(v2)의 clips 도 ${MOVIE_CLIP_MAX}개까지 읽는다`, async () => {
    const user = await h.createUser();
    const snapId = await createSnap(user);
    const result = await h.prisma.video.create({ data: { userId: user.id, kind: 'result', status: 'ready' } });
    const job = await h.prisma.editJob.create({
      data: {
        userId: user.id,
        videoId: result.id,
        status: 'done',
        progress: 100,
        editSpec: {
          version: 2,
          stylePreset: '일상',
          clips: Array.from({ length: MOVIE_CLIP_MAX }, (_, index) => ({ videoId: snapId, startMs: index * 100 })),
        },
      },
    });

    const res = await getJob(user, job.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.editSpec.clips).toHaveLength(MOVIE_CLIP_MAX);
  });
});
