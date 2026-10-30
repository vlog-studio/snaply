/**
 * 무비마다 켜고 끄는 편집 선택 — 말소리 살리기 · 장면 순서(specs/movie.md MOV-29, decisions/trend-recipes.md §25).
 *
 * 고정하는 계약:
 *   ① 기본은 둘 다 꺼짐(레시피와 무관), 만들 때 보낸 키는 그대로 저장된다
 *   ② PATCH 는 보낸 키만 바꾸고, 레시피를 바꿔도 그대로다
 *   ③ 생성(export)은 켜진 것이 있을 때만 editSpec 에 `editing` 을 싣는다 — 장면 순서는 순서의 주인이 AI 인 무비만
 *   ④ 생성은 AI 가 자른 컷에만 `trimOwner: ai` 를 싣는다(워커가 그 컷만 박자 · 흔들림에 맞춰 옮긴다)
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

const OFF = { speech: false, sceneOrder: false };

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

describe('편집 선택 저장', () => {
  it('기본은 둘 다 꺼짐 — 레시피와 무관하고, 보낸 키는 그대로 저장된다', async () => {
    const user = await h.createUser();
    expect((await createMovie(user, {})).json().data.editing).toEqual(OFF);
    expect((await createMovie(user, { recipe: 'cinematic' })).json().data.editing).toEqual(OFF);
    const chosen = await createMovie(user, { editing: { speech: true } });
    expect(chosen.statusCode).toBe(201);
    expect(chosen.json().data.editing).toEqual({ speech: true, sceneOrder: false });
    const read = await h.app.inject({ method: 'GET', url: `/movies/${chosen.json().data.id}`, headers: user.auth });
    expect(read.json().data.editing).toEqual({ speech: true, sceneOrder: false });
  });

  it('PATCH 는 보낸 키만 바꾸고, 레시피를 바꿔도 그대로다', async () => {
    const user = await h.createUser();
    const id = (await createMovie(user, { recipe: 'cinematic' })).json().data.id as string;
    expect((await patchMovie(user, id, { editing: { sceneOrder: true } })).json().data.editing).toEqual({
      speech: false,
      sceneOrder: true,
    });
    const swapped = await patchMovie(user, id, { recipe: 'beat-sync' });
    expect(swapped.json().data.editing).toEqual({ speech: false, sceneOrder: true });
    expect((await patchMovie(user, id, { editing: { speech: 'yes' } })).statusCode).toBe(400);
  });
});

describe('생성 작업에 싣기', () => {
  // 사용자당 생성은 한 번에 하나라(MOV-11) 무비마다 다른 사용자로 만든다
  async function specOf(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const user = await h.createUser();
    const snap = await createSnap(user);
    const id = (await createMovie(user, { clips: [{ videoId: snap, startMs: 0, endMs: 1000 }], ...body })).json().data.id as string;
    return exportEditSpec(user, id);
  }

  it('꺼진 무비는 editing 을 싣지 않고, 켜면 싣는다 — 장면 순서는 순서의 주인이 AI 인 무비만', async () => {
    expect(await specOf({})).not.toHaveProperty('editing');
    expect((await specOf({ editing: { speech: true, sceneOrder: true } })).editing).toEqual({ speech: true, sceneOrder: false }); // 사용자 순서
    expect((await specOf({ arranger: 'ai', editing: { sceneOrder: true } })).editing).toEqual({ speech: false, sceneOrder: true });
  });

  it('AI 가 자른 컷에만 trimOwner: ai 를 싣는다', async () => {
    const user = await h.createUser();
    const [a, b] = [await createSnap(user), await createSnap(user)];
    const id = (
      await createMovie(user, {
        clips: [
          { videoId: a, startMs: 0, endMs: 1000, trimOwner: 'ai' },
          { videoId: b, startMs: 0, endMs: 1000 },
        ],
      })
    ).json().data.id as string;
    const cuts = ((await exportEditSpec(user, id)).timeline as { cuts: Record<string, unknown>[] }).cuts;
    expect(cuts[0]?.trimOwner).toBe('ai');
    expect(cuts[1]).not.toHaveProperty('trimOwner');
  });
});
