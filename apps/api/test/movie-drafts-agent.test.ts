/**
 * AI 편집 초안을 에이전트로 만든다(specs MOV-25, POST /movie-drafts). 모델은 각본 모델로 끼운다(`setEditAgentModelForTests`).
 *
 * 여기서 고정하는 것: 응답 모양은 그대로다 · 누가 만들었는지(`mode`)와 계획이 초안 기록에 남는다 · 에이전트가 실패하면 규칙으로
 * 초안이 나오고 그 초안은 재사용하지 않는다 · 동의하지 않은 사용자는 개념을 받지 않는다 · 키가 없으면 지금처럼 규칙만이다.
 * 에이전트 루프 자체는 edit-agent.test.ts 가 본다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { createConsentedUser } from './helpers/consent.js';
import { scripted } from './helpers/scripted-agent.js';
import { SIGNALS_VERSION } from '../src/services/edit-director.js';
import { ANALYSIS_VERSION } from '../src/services/video-analysis.service.js';
import { setEditAgentModelForTests } from '../src/services/edit-agent/agent-runtime.js';

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
afterEach(() => {
  setEditAgentModelForTests(null);
});

const T0 = Date.parse('2026-10-01T09:00:00Z');
let hashSeed = 1000;

async function createSnap(user: TestUser, minute: number, places?: string[]): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${crypto.randomUUID()}.mp4`,
      capturedAt: new Date(T0 + minute * 60_000),
    },
  });
  hashSeed += 1;
  const hash = BigInt.asUintN(64, BigInt(hashSeed) * 0x9e3779b97f4a7c15n).toString(16).padStart(16, '0');
  await h.prisma.videoSignals.create({
    data: {
      videoId: video.id,
      signalsVersion: SIGNALS_VERSION,
      durationMs: 3000,
      stepMs: 100,
      brightness: 0.5,
      sharpness: 300,
      frameHashes: [hash, hash, hash],
      motion: Array.from({ length: 29 }, () => 0.01),
      hasAudio: false,
      speech: [],
    },
  });
  if (places) {
    await h.prisma.videoAnalysis.create({
      data: {
        videoId: video.id,
        userId: user.id,
        analysisVersion: ANALYSIS_VERSION,
        status: 'done',
        places,
        usableForEdit: true,
        visualQualityScore: 0.8,
        confidence: 0.9,
        completedAt: new Date(),
      },
    });
  }
  return video.id;
}

function requestDraft(user: TestUser, videoIds: string[]) {
  return h.app.inject({
    method: 'POST',
    url: '/movie-drafts',
    headers: user.auth,
    payload: { stylePreset: '일상', snaps: videoIds.map((videoId) => ({ videoId })) },
  });
}

const select = (focus: string[], maxCuts: number | null) => ({ name: 'select_cuts', args: { focus, maxCuts, targetSeconds: null } });
const submit = { name: 'submit_draft', args: { intent: '카페에 들른 하루', flow: ['도입', '카페', '마무리'], mood: null } };

describe('POST /movie-drafts — agent', () => {
  it('makes the draft with the agent, in the same response shape, and keeps the plan', async () => {
    const user = await createConsentedUser(h);
    const ids = [
      await createSnap(user, 0, ['거리']),
      await createSnap(user, 5, ['커피숍']),
      await createSnap(user, 10, ['거리']),
      await createSnap(user, 15, ['거리']),
    ];
    const model = scripted([() => [select(['places:cafe'], 3)], () => [submit]]);
    setEditAgentModelForTests(() => model);

    const res = await requestDraft(user, ids);

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Object.keys(data).sort()).toEqual(['cuts', 'excluded', 'stylePreset', 'unavailable']);
    expect(data.cuts).toHaveLength(3);
    expect(data.cuts.map((cut: { videoId: string }) => cut.videoId)).toContain(ids[1]);
    const row = await h.prisma.movieDraft.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.mode).toBe('agent');
    expect(row.plan).toMatchObject({ intent: '카페에 들른 하루', direction: { focus: ['places:cafe'], maxCuts: 3 } });
    expect(JSON.parse(model.seen.message).snaps[1].concepts).toEqual(['places:cafe']);
  });

  it('reuses an agent draft without calling the agent again', async () => {
    const user = await createConsentedUser(h);
    const ids = [await createSnap(user, 0), await createSnap(user, 5)];
    let calls = 0;
    setEditAgentModelForTests(() => {
      calls += 1;
      return scripted([() => [submit]]);
    });

    const first = (await requestDraft(user, ids)).json().data;
    const again = (await requestDraft(user, ids)).json().data;

    expect(again).toEqual(first);
    expect(await h.prisma.movieDraft.count()).toBe(1);
    // 모델은 매 요청 해시를 위해 만들어지지만, 재사용이면 대화를 시작하지 않는다.
    expect(calls).toBe(2);
  });

  it('falls back to the rules when the agent fails, and does not reuse that draft', async () => {
    const user = await createConsentedUser(h);
    const ids = [await createSnap(user, 0), await createSnap(user, 5), await createSnap(user, 10)];
    setEditAgentModelForTests(() => scripted([() => Promise.reject(new Error('model down'))]));

    const res = await requestDraft(user, ids);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.cuts).toHaveLength(3);
    const row = await h.prisma.movieDraft.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.mode).toBe('fallback');
    expect(row.plan).toMatchObject({ model: 'scripted', error: 'model' });

    // 다음 요청은 다시 에이전트에게 간다 — 일시적 실패가 하루 동안 남지 않는다.
    setEditAgentModelForTests(() => scripted([() => [submit]]));
    await requestDraft(user, ids);
    expect(await h.prisma.movieDraft.count({ where: { userId: user.id } })).toBe(2);
  });

  it('gives a user without analysis consent no concepts', async () => {
    const user = await h.createUser();
    const ids = [await createSnap(user, 0, ['커피숍']), await createSnap(user, 5)];
    const model = scripted([() => [submit]]);
    setEditAgentModelForTests(() => model);

    await requestDraft(user, ids);

    expect(model.seen.tools[0]).toEqual(['select_cuts', 'submit_draft']);
    expect(model.seen.message).not.toContain('places:');
  });

  it('keeps today’s rules-only draft without a model', async () => {
    const user = await h.createUser();
    const ids = [await createSnap(user, 0), await createSnap(user, 5)];
    setEditAgentModelForTests(() => null);

    const res = await requestDraft(user, ids);

    expect(res.statusCode).toBe(200);
    const row = await h.prisma.movieDraft.findFirstOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ mode: 'rules', plan: null });
  });
});
