/**
 * 무비의 편집 스타일 레시피(specs/movie.md MOV-28).
 *
 * 고정하는 계약:
 *   ① 보내지 않으면 `classic` 이고, 고른 레시피는 저장 · 응답 · 수정에서 그대로다
 *   ② 사전에 없는 이름은 400
 *   ③ 생성(export)은 classic 이 아닐 때만 editSpec v3 에 `recipe` 를 싣는다 — classic 무비의 스펙은 지금까지와 같다
 *   ④ `autoCuts` 는 컷 구간 · 순서를 전부 AI 가 정했을 때만 true — 사용자가 고친 무비는 레시피가 구간 · 순서를 다시 고르지 않는다
 *   ⑤ 계약의 이름 목록은 `recipe-vocabulary.json` 의 레시피와 같다
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { MOVIE_RECIPES, RECIPE_VOCABULARY_NAMES } from '@vlog-studio/shared-types';
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

async function exportSpec(user: TestUser, movieId: string): Promise<Record<string, unknown>> {
  await h.prisma.creditLedger.create({ data: { userId: user.id, delta: 100, reason: 'promo' } });
  const res = await h.app.inject({ method: 'POST', url: `/movies/${movieId}/export`, headers: user.auth });
  expect(res.statusCode).toBe(202);
  const jobId = res.json().data.jobId as string;
  const spec = (await h.prisma.editJob.findUnique({ where: { id: jobId } }))?.editSpec as Record<string, unknown>;
  const v3 = new Queue(process.env.EDIT_V3_QUEUE_NAME ?? '', { connection: createRedisConnection() });
  try {
    const queued = await v3.getJob(jobId);
    expect(queued?.data.editSpec).toEqual(spec);
    await queued?.remove();
  } finally {
    await v3.close();
  }
  return spec;
}

describe('레시피 저장', () => {
  it('보내지 않으면 classic, 고르면 그대로 저장 · 응답되고 PATCH 로 바꿀 수 있다', async () => {
    const user = await h.createUser();
    const plain = await createMovie(user, {});
    expect(plain.statusCode).toBe(201);
    expect(plain.json().data.recipe).toBe('classic');

    const created = await createMovie(user, { recipe: 'cinematic' });
    expect(created.json().data.recipe).toBe('cinematic');
    const id = created.json().data.id as string;
    const read = await h.app.inject({ method: 'GET', url: `/movies/${id}`, headers: user.auth });
    expect(read.json().data.recipe).toBe('cinematic');

    const patched = await h.app.inject({ method: 'PATCH', url: `/movies/${id}`, headers: user.auth, payload: { recipe: 'daylog' } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.recipe).toBe('daylog');
  });

  it('사전에 없는 레시피는 400', async () => {
    const user = await h.createUser();
    const res = await createMovie(user, { recipe: 'tiktok-max' });
    expect(res.statusCode).toBe(400);
  });
});

describe('생성은 레시피를 editSpec 에 싣는다', () => {
  it('classic 무비의 스펙에는 recipe · autoCuts 가 없다(지금까지와 같다)', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const id = (await createMovie(user, { clips: [{ videoId: a }, { videoId: b }] })).json().data.id as string;
    const spec = await exportSpec(user, id);
    expect(spec).not.toHaveProperty('recipe');
    expect(spec).not.toHaveProperty('autoCuts');
  });

  it('AI 가 컷 구간 · 순서를 전부 정한 무비는 autoCuts: true', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const id = (
      await createMovie(user, {
        recipe: 'cinematic',
        arranger: 'ai',
        clips: [
          { videoId: a, startMs: 0, endMs: 2000, trimOwner: 'ai' },
          { videoId: b, startMs: 500, endMs: 2500, trimOwner: 'ai' },
        ],
      })
    ).json().data.id as string;
    const spec = await exportSpec(user, id);
    expect(spec).toMatchObject({ version: 3, recipe: 'cinematic', autoCuts: true });
  });

  it('사용자가 구간을 고친 컷이 하나라도 있으면 autoCuts: false', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const id = (
      await createMovie(user, {
        recipe: 'trend-routine',
        arranger: 'ai',
        clips: [
          { videoId: a, startMs: 0, endMs: 2000, trimOwner: 'ai' },
          { videoId: b, startMs: 300, endMs: 1200 },
        ],
      })
    ).json().data.id as string;
    expect(await exportSpec(user, id)).toMatchObject({ recipe: 'trend-routine', autoCuts: false });
  });

  it('사용자가 순서를 정한 무비(arranger: user)도 autoCuts: false', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const id = (
      await createMovie(user, {
        recipe: 'trend-montage',
        clips: [
          { videoId: a, trimOwner: 'ai' },
          { videoId: b, trimOwner: 'ai' },
        ],
      })
    ).json().data.id as string;
    expect(await exportSpec(user, id)).toMatchObject({ recipe: 'trend-montage', autoCuts: false });
  });
});

describe('레시피 사전', () => {
  it('계약의 이름 목록은 recipe-vocabulary.json 의 레시피와 같다(순서까지)', () => {
    expect([...MOVIE_RECIPES]).toEqual([...RECIPE_VOCABULARY_NAMES]);
  });
});
