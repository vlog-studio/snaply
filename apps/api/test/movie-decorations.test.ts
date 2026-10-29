/**
 * 무비마다 켜고 끄는 꾸밈 — 글자 · 이모지 · 얼굴 스티커(specs/movie.md MOV-27, decisions/text-accent-stickers.md §9).
 *
 * 고정하는 계약:
 *   ① 만들 때 레시피의 기본값으로 채우고, 보낸 키는 그 위에 얹힌다
 *   ② PATCH 는 보낸 키만 바꾸고, 레시피를 바꾸면 새 레시피의 기본값으로 돌아간다(같은 요청의 꾸밈이 위에 얹힌다)
 *   ③ 불린이 아닌 값은 400
 *   ④ 생성(export)은 무비의 꾸밈을 editSpec 에 싣고, 큐의 작업도 같은 값이다 — 다시 만들기도 생성 1회(크레딧 100)
 *   ⑤ 기존 무비를 채우는 마이그레이션의 레시피 목록이 사전의 기본값과 같다
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue } from 'bullmq';
import { MOVIE_RECIPES, recipeDecorations } from '@vlog-studio/shared-types';
import { createRedisConnection } from '../src/lib/redis.js';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const ALL_OFF = { text: false, emoji: false, face: false };
const ALL_ON = { text: true, emoji: true, face: true };

async function createSnap(user: TestUser): Promise<string> {
  const video = await h.prisma.video.create({
    data: { userId: user.id, kind: 'source', status: 'ready', s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4` },
  });
  return video.id;
}

function createMovie(user: TestUser, body: Record<string, unknown>) {
  return h.app.inject({ method: 'POST', url: '/movies', headers: user.auth, payload: body });
}

function patchMovie(user: TestUser, id: string, body: Record<string, unknown>) {
  return h.app.inject({ method: 'PATCH', url: `/movies/${id}`, headers: user.auth, payload: body });
}

async function exportEditSpec(user: TestUser, movieId: string): Promise<Record<string, unknown>> {
  await h.prisma.creditLedger.create({ data: { userId: user.id, delta: 100, reason: 'promo' } });
  const res = await h.app.inject({ method: 'POST', url: `/movies/${movieId}/export`, headers: user.auth });
  expect(res.statusCode).toBe(202);
  const jobId = res.json().data.jobId as string;
  const stored = (await h.prisma.editJob.findUnique({ where: { id: jobId } }))?.editSpec as Record<string, unknown>;
  const v3 = new Queue(process.env.EDIT_V3_QUEUE_NAME ?? '', { connection: createRedisConnection() });
  try {
    const queued = await v3.getJob(jobId);
    expect(queued?.data.editSpec).toEqual(stored);
    await queued?.remove();
  } finally {
    await v3.close();
  }
  return stored;
}

describe('꾸밈 저장', () => {
  it('만들 때 레시피의 기본값 — 기본 무비는 셋 다 꺼짐, 시네마틱은 셋 다 켜짐, 보낸 키는 위에 얹힌다', async () => {
    const user = await h.createUser();
    expect((await createMovie(user, {})).json().data.decorations).toEqual(ALL_OFF);
    expect((await createMovie(user, { recipe: 'cinematic' })).json().data.decorations).toEqual(ALL_ON);
    expect((await createMovie(user, { recipe: 'speed-ramp' })).json().data.decorations).toEqual({
      text: true,
      emoji: true,
      face: false,
    });
    const chosen = await createMovie(user, { recipe: 'cinematic', decorations: { text: false } });
    expect(chosen.statusCode).toBe(201);
    expect(chosen.json().data.decorations).toEqual({ text: false, emoji: true, face: true });
    const id = chosen.json().data.id as string;
    const read = await h.app.inject({ method: 'GET', url: `/movies/${id}`, headers: user.auth });
    expect(read.json().data.decorations).toEqual({ text: false, emoji: true, face: true });
  });

  it('PATCH 는 보낸 키만 바꾸고, 다른 필드를 바꿔도 꾸밈은 그대로다', async () => {
    const user = await h.createUser();
    const id = (await createMovie(user, { recipe: 'cinematic' })).json().data.id as string;
    const patched = await patchMovie(user, id, { decorations: { emoji: false } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.decorations).toEqual({ text: true, emoji: false, face: true });
    const titled = await patchMovie(user, id, { title: '한강', recipe: 'cinematic' });
    expect(titled.json().data.decorations).toEqual({ text: true, emoji: false, face: true }); // 같은 레시피는 바꾼 게 아니다
  });

  it('레시피를 바꾸면 새 레시피의 기본값으로 돌아가고, 같은 요청의 꾸밈이 위에 얹힌다', async () => {
    const user = await h.createUser();
    const id = (await createMovie(user, { recipe: 'cinematic', decorations: { text: false } })).json().data.id as string;
    expect((await patchMovie(user, id, { recipe: 'before-after' })).json().data.decorations).toEqual({
      text: true,
      emoji: false,
      face: false,
    });
    expect(
      (await patchMovie(user, id, { recipe: 'classic', decorations: { emoji: true } })).json().data.decorations,
    ).toEqual({ text: false, emoji: true, face: false });
  });

  it('불린이 아닌 값은 400', async () => {
    const user = await h.createUser();
    expect((await createMovie(user, { decorations: { text: 'yes' } })).statusCode).toBe(400);
  });
});

describe('생성은 무비의 꾸밈을 스펙에 싣는다', () => {
  it('고른 꾸밈이 editSpec 에, 다시 만들어도 바꾼 값이 실린다', async () => {
    const user = await h.createUser();
    const id = (
      await createMovie(user, { recipe: 'cinematic', clips: [{ videoId: await createSnap(user) }] })
    ).json().data.id as string;
    expect(await exportEditSpec(user, id)).toMatchObject({ version: 3, recipe: 'cinematic', decorations: ALL_ON });

    // 생성 중이 아니게 만든 뒤 글자만 끄고 다시 만든다 — 다시 만들기도 크레딧 100 을 예약한다(MOV-10)
    await h.prisma.editJob.updateMany({ where: { userId: user.id }, data: { status: 'failed' } });
    await h.prisma.movie.update({ where: { id }, data: { status: 'failed' } });
    expect((await patchMovie(user, id, { decorations: { text: false } })).statusCode).toBe(200);
    expect(await exportEditSpec(user, id)).toMatchObject({ decorations: { text: false, emoji: true, face: true } });
  });

  it('기본 무비도 꾸밈을 싣는다(셋 다 꺼짐)', async () => {
    const user = await h.createUser();
    const id = (await createMovie(user, { clips: [{ videoId: await createSnap(user) }] })).json().data.id as string;
    const spec = await exportEditSpec(user, id);
    expect(spec.recipe).toBeUndefined();
    expect(spec.decorations).toEqual(ALL_OFF);
  });
});

describe('기존 무비 채우기', () => {
  it('마이그레이션이 켜는 레시피 목록이 사전의 기본값과 같다', () => {
    const sql = readFileSync(
      new URL('../prisma/migrations/20261029010000_movie_decorations/migration.sql', import.meta.url),
      'utf8',
    );
    for (const [column, key] of [
      ['decor_text', 'text'],
      ['decor_emoji', 'emoji'],
      ['decor_face', 'face'],
    ] as const) {
      const match = new RegExp(`SET "${column}" = true\\s+WHERE "recipe" IN \\(([^)]*)\\)`).exec(sql);
      const listed = (match?.[1] ?? '').split(',').map((name) => name.trim().replace(/'/g, '')).filter(Boolean);
      expect(listed.sort(), column).toEqual(MOVIE_RECIPES.filter((name) => recipeDecorations(name)[key]).sort());
    }
  });
});
