/**
 * 관심사(specs ACC-5 · PRF-1 · PRF-4) — 고를 수 있는 주제, 고른 값의 검증, 취향 프로필의 관심사 행.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { contentConceptIds } from '@vlog-studio/shared-types';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { readTasteProfile } from '../src/services/taste/taste.service.js';
import { TASTE_INTEREST_WEIGHT } from '../src/services/taste/taste-policy.js';

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

function setInterests(user: TestUser, interests: unknown) {
  return h.app.inject({ method: 'PATCH', url: '/auth/me', headers: user.auth, payload: { interests } });
}

async function explicitTopics(user: TestUser): Promise<string[]> {
  const rows = await h.prisma.userTaste.findMany({ where: { userId: user.id, source: 'explicit' }, orderBy: { concept: 'asc' } });
  return rows.map((row) => `${row.field}.${row.concept}`);
}

describe('GET /interest-topics', () => {
  it('lists the vocabulary’s topics in order, with their labels', async () => {
    const user = await h.createUser();

    const res = await h.app.inject({ method: 'GET', url: '/interest-topics', headers: user.auth });

    expect(res.statusCode).toBe(200);
    const topics = res.json().data.topics as Array<{ id: string; label: string }>;
    expect(topics.map((topic) => topic.id)).toEqual(contentConceptIds('topics'));
    expect(topics).toContainEqual({ id: 'cafe', label: '카페' });
  });

  it('needs a signed-in user', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/interest-topics' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /auth/me interests', () => {
  it('saves topic ids and makes each an explicit taste', async () => {
    const user = await h.createUser();

    const res = await setInterests(user, ['cafe', 'travel', 'cafe']);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.interests).toEqual(['cafe', 'travel']);
    expect(await explicitTopics(user)).toEqual(['topics.cafe', 'topics.travel']);
  });

  it('drops the taste of an interest the user unpicks, and keeps what was learned from behavior', async () => {
    const user = await h.createUser();
    await setInterests(user, ['cafe', 'travel']);
    await h.prisma.userTaste.create({
      data: { userId: user.id, field: 'topics', concept: 'travel', source: 'derived', weight: 0.3, evidence: 2, updatedAt: new Date() },
    });

    await setInterests(user, ['cafe']);

    expect(await explicitTopics(user)).toEqual(['topics.cafe']);
    expect(await h.prisma.userTaste.count({ where: { userId: user.id, source: 'derived' } })).toBe(1);
  });

  it('clears every interest with an empty list', async () => {
    const user = await h.createUser();
    await setInterests(user, ['cafe']);

    const res = await setInterests(user, []);

    expect(res.json().data.interests).toEqual([]);
    expect(await explicitTopics(user)).toEqual([]);
  });

  it('refuses a value outside the vocabulary and changes nothing', async () => {
    const user = await h.createUser();
    await setInterests(user, ['cafe']);

    const res = await setInterests(user, ['cafe', '여행']);

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'UNKNOWN_INTEREST', unknown: ['여행'] });
    expect(await explicitTopics(user)).toEqual(['topics.cafe']);
  });

  it('hides free-text interests an earlier build saved', async () => {
    const user = await h.createUser();
    await h.prisma.user.update({ where: { id: user.id }, data: { interests: ['여행', 'cafe'] } });

    const res = await h.app.inject({ method: 'GET', url: '/auth/me', headers: user.auth });

    expect(res.json().data.interests).toEqual(['cafe']);
  });
});

describe('interests in the taste profile', () => {
  it('never fades — the user chose it', async () => {
    const user = await h.createUser();
    await setInterests(user, ['pet']);

    const later = await readTasteProfile(user.id, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    expect(later).toContainEqual(expect.objectContaining({ field: 'topics', concept: 'pet', source: 'explicit', weight: TASTE_INTEREST_WEIGHT }));
  });

  it('stays when analysis consent is withdrawn — it does not come from analysis', async () => {
    const user = await h.createUser();
    await setInterests(user, ['cafe']);

    await h.app.inject({ method: 'DELETE', url: '/auth/me/analysis-consent', headers: user.auth });

    expect(await explicitTopics(user)).toEqual(['topics.cafe']);
  });

  it('brings the matching template forward (PRF-3)', async () => {
    const user = await h.createUser();
    const order = async () =>
      ((await h.app.inject({ method: 'GET', url: '/movie-templates', headers: user.auth })).json().data.templates as Array<{
        id: string;
      }>).map((template) => template.id);
    expect((await order())[0]).toBe('walk');

    await setInterests(user, ['cafe']);

    expect((await order())[0]).toBe('cafe');
  });
});
