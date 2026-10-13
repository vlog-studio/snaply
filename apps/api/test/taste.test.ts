/**
 * 사용자 취향 프로필 — 신호가 어디서 나고, 어떻게 쌓이고, 언제 지워지는가(specs PRF-1 · PRF-2 · PRF-4).
 *
 * 신호는 응답 뒤로 미뤄 반영하므로(`taste.service.ts`) 요청 뒤에 `settleTasteSignals()` 로 기다린 다음 행을 본다.
 * 숫자는 잠정값이라(`taste-policy.ts`) 기대값은 그 상수로 계산한다.
 *
 * 결정: docs/decisions/ontology-personalization.md §4 · §5
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { createConsentedUser } from './helpers/consent.js';
import { ANALYSIS_VERSION } from '../src/services/video-analysis.service.js';
import {
  applyTasteSignals,
  readTasteProfile,
  settleTasteSignals,
  type TasteEntry,
} from '../src/services/taste/taste.service.js';
import {
  TASTE_HALF_LIFE_MS,
  TASTE_LEARNING_RATE,
  TASTE_PROPAGATION_RATIO,
  TASTE_SIGNAL_STRENGTH,
} from '../src/services/taste/taste-policy.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness({ MOVIE_RECOMMENDATION_ENABLED: 'true' });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

/** 중립에서 신호 하나를 받은 가중치. */
const once = (strength: number) => TASTE_LEARNING_RATE * strength;

interface Content {
  places?: string[];
  objects?: string[];
  actions?: string[];
  topics?: string[];
  moods?: string[];
}

/** 업로드가 끝난 스냅. 내용을 주면 분석이 끝난 상태로 만든다. */
async function createSnap(user: TestUser, content?: Content, capturedAt?: Date): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${Math.random().toString(36).slice(2)}.mp4`,
      ...(capturedAt ? { capturedAt } : {}),
    },
  });
  if (content) {
    await h.prisma.videoAnalysis.create({
      data: {
        videoId: video.id,
        userId: user.id,
        analysisVersion: ANALYSIS_VERSION,
        status: 'done',
        places: content.places ?? [],
        objects: content.objects ?? [],
        actions: content.actions ?? [],
        topics: content.topics ?? [],
        moods: content.moods ?? [],
        usableForEdit: true,
        visualQualityScore: 0.8,
        confidence: 0.9,
        completedAt: new Date(),
      },
    });
  }
  return video.id;
}

async function profile(user: TestUser): Promise<TasteEntry[]> {
  await settleTasteSignals();
  return readTasteProfile(user.id);
}

function weightOf(entries: TasteEntry[], field: string, concept: string): number | undefined {
  return entries.find((entry) => entry.field === field && entry.concept === concept)?.weight;
}

describe('applyTasteSignals', () => {
  it('stores derived weights and passes content signals up the tree', async () => {
    const user = await createConsentedUser(h);

    await applyTasteSignals(user.id, [{ field: 'objects', concept: 'cake', strength: 1 }]);

    const entries = await readTasteProfile(user.id);
    expect(weightOf(entries, 'objects', 'cake')).toBeCloseTo(once(1), 6);
    expect(weightOf(entries, 'objects', 'dessert')).toBeCloseTo(once(TASTE_PROPAGATION_RATIO), 6);
    expect(weightOf(entries, 'objects', 'food')).toBeCloseTo(once(TASTE_PROPAGATION_RATIO ** 2), 6);
    expect(entries.every((entry) => entry.source === 'derived' && entry.evidence === 1)).toBe(true);
  });

  it('accumulates repeated signals and counts the evidence', async () => {
    const user = await createConsentedUser(h);
    const signal = { field: 'transition' as const, concept: 'crossfade', strength: 1 };

    await applyTasteSignals(user.id, [signal]);
    await applyTasteSignals(user.id, [signal, signal]);

    const [entry] = await readTasteProfile(user.id);
    expect(entry).toMatchObject({ field: 'transition', concept: 'crossfade', evidence: 3 });
    // 0 → 0.2 → 0.36 → 0.488 — 같은 선택이 반복될수록 굳지만 한 번에 크게 움직이지 않는다.
    let expected = 0;
    for (let i = 0; i < 3; i += 1) expected += TASTE_LEARNING_RATE * (1 - Math.abs(expected));
    expect(entry!.weight).toBeCloseTo(expected, 6);
  });

  it('learns content only under analysis consent, edit choices always', async () => {
    const user = await h.createUser();

    await applyTasteSignals(user.id, [
      { field: 'places', concept: 'cafe', strength: 1 },
      { field: 'style', concept: '감성', strength: 1 },
    ]);

    const entries = await readTasteProfile(user.id);
    expect(entries.map((entry) => `${entry.field}.${entry.concept}`)).toEqual(['style.감성']);
  });

  it('fades back toward neutral without signals', async () => {
    const user = await createConsentedUser(h);
    const at = new Date('2026-10-13T00:00:00Z');
    await applyTasteSignals(user.id, [{ field: 'style', concept: '여행', strength: 1 }], at);

    const later = await readTasteProfile(user.id, new Date(at.getTime() + TASTE_HALF_LIFE_MS));

    expect(weightOf(later, 'style', '여행')).toBeCloseTo(once(1) / 2, 6);
  });
});

describe('signals from recommendations and drafts', () => {
  it('a finished recommendation counts its analysed candidates once', async () => {
    const user = await createConsentedUser(h);
    const cafe = await createSnap(user, { places: ['커피숍'] });
    const sea = await createSnap(user, { places: ['해변'] });
    const create = await h.app.inject({
      method: 'POST',
      url: '/movie-recommendations',
      headers: user.auth,
      payload: { templateId: 'cafe', candidates: [cafe, sea] },
    });
    const id = create.json().data.id;

    await h.app.inject({ method: 'GET', url: `/movie-recommendations/${id}`, headers: user.auth });
    await h.app.inject({ method: 'GET', url: `/movie-recommendations/${id}`, headers: user.auth });

    const entries = await profile(user);
    expect(weightOf(entries, 'places', 'cafe')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.candidate), 6);
    expect(weightOf(entries, 'places', 'sea')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.candidate), 6);
  });

  it('a new draft counts its analysed snaps, a reused one does not', async () => {
    const user = await createConsentedUser(h);
    const a = await createSnap(user, { objects: ['라떼'] });
    const b = await createSnap(user);
    const body = { snaps: [{ videoId: a }, { videoId: b }] };

    await h.app.inject({ method: 'POST', url: '/movie-drafts', headers: user.auth, payload: body });

    const entries = await profile(user);
    expect(weightOf(entries, 'objects', 'coffee')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.candidate), 6);
  });
});

/** 컷 하나의 입력. */
function cut(videoId: string, extra: Record<string, unknown> = {}) {
  return { videoId, ...extra };
}

async function postMovie(user: TestUser, payload: Record<string, unknown>) {
  const res = await h.app.inject({ method: 'POST', url: '/movies', headers: user.auth, payload });
  expect(res.statusCode).toBe(201);
  return res.json().data.id as string;
}

async function patchMovie(user: TestUser, movieId: string, payload: Record<string, unknown>) {
  const res = await h.app.inject({ method: 'PATCH', url: `/movies/${movieId}`, headers: user.auth, payload });
  expect(res.statusCode).toBe(200);
  return res.json().data;
}

describe('signals from movies', () => {
  it('compares a movie made from an AI draft with that draft — kept and re-added +, dropped −', async () => {
    const user = await createConsentedUser(h);
    const kept = await createSnap(user, { places: ['카페'] }, new Date('2026-10-01T00:00:00Z'));
    const dropped = await createSnap(user, { places: ['바다'] }, new Date('2026-10-01T00:01:00Z'));
    const readded = await createSnap(user, { places: ['공원'] }, new Date('2026-10-01T00:02:00Z'));
    await h.prisma.movieDraft.create({
      data: {
        userId: user.id,
        stylePreset: '일상',
        snapHash: 'draft',
        complete: true,
        result: { stylePreset: '일상', cuts: [{ videoId: kept }, { videoId: dropped }], excluded: [{ videoId: readded }] },
      },
    });

    await postMovie(user, { arranger: 'ai', clips: [cut(kept, { trimOwner: 'ai' }), cut(readded)] });

    const entries = await profile(user);
    expect(weightOf(entries, 'places', 'cafe')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.picked), 6);
    expect(weightOf(entries, 'places', 'park')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.picked), 6);
    expect(weightOf(entries, 'places', 'sea')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.unwanted), 6);
  });

  it('gives no draft signals when no recent draft covers the movie', async () => {
    const user = await createConsentedUser(h);
    const snap = await createSnap(user, { places: ['카페'] });

    await postMovie(user, { arranger: 'ai', clips: [cut(snap)] });

    expect(await profile(user)).toEqual([]);
  });

  it('learns from an edit — added snaps, dropped AI cuts, a changed transition and style', async () => {
    const user = await createConsentedUser(h);
    const a = await createSnap(user, { places: ['카페'] });
    const b = await createSnap(user, { places: ['바다'] });
    const c = await createSnap(user, { objects: ['케이크'] });
    const movieId = await postMovie(user, {
      stylePreset: '일상',
      clips: [cut(a, { trimOwner: 'ai' }), cut(b, { trimOwner: 'ai' })],
    });
    const before = await h.prisma.movieClip.findFirstOrThrow({ where: { movieId, order: 0 } });
    expect(before.transitionOwner).toBe('ai');
    const replacedKind = before.transitionKind!;
    const chosenKind = replacedKind === 'zoompunch' ? 'flash' : 'zoompunch';
    await settleTasteSignals();

    // b 를 빼고 c 를 넣는다 — 그러면 a → c 는 새 경계라 전환 신호가 없다. 먼저 전환만 바꿔 본다.
    await patchMovie(user, movieId, {
      clips: [cut(a, { trimOwner: 'ai', transition: { kind: chosenKind } }), cut(b, { trimOwner: 'ai' })],
    });
    await patchMovie(user, movieId, { stylePreset: '감성' });
    await patchMovie(user, movieId, { clips: [cut(a, { trimOwner: 'ai' }), cut(c)] });

    const entries = await profile(user);
    expect(weightOf(entries, 'transition', chosenKind)).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.editChosen), 6);
    expect(weightOf(entries, 'transition', replacedKind)).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.editReplaced), 6);
    expect(weightOf(entries, 'style', '감성')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.editChosen), 6);
    expect(weightOf(entries, 'style', '일상')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.editReplaced), 6);
    expect(weightOf(entries, 'places', 'sea')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.unwanted), 6);
    expect(weightOf(entries, 'objects', 'cake')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.picked), 6);
    // 그대로 둔 컷(a)은 근거가 늘지 않는다.
    expect(weightOf(entries, 'places', 'cafe')).toBeUndefined();
  });

  it('does not take a user-added cut being dropped as dislike', async () => {
    const user = await createConsentedUser(h);
    const a = await createSnap(user);
    const b = await createSnap(user, { places: ['바다'] });
    const movieId = await postMovie(user, { clips: [cut(a), cut(b)] });

    await patchMovie(user, movieId, { clips: [cut(a)] });

    expect(weightOf(await profile(user), 'places', 'sea')).toBeUndefined();
  });

  it('a finished movie is the strongest evidence, counted once however often it is read', async () => {
    const user = await createConsentedUser(h);
    const a = await createSnap(user, { places: ['카페'] });
    const b = await createSnap(user);
    const movieId = await postMovie(user, { stylePreset: '여행', clips: [cut(a), cut(b)] });
    const kind = (await h.prisma.movieClip.findFirstOrThrow({ where: { movieId, order: 0 } })).transitionKind!;
    // 생성이 끝난 상태를 흉내낸다 — 워커는 무비를 모르고, 무비 상태는 조회 때 작업을 보고 맞춘다.
    const result = await h.prisma.video.create({ data: { userId: user.id, kind: 'result', status: 'done' } });
    await h.prisma.editJob.create({ data: { userId: user.id, videoId: result.id, status: 'done' } });
    await h.prisma.movie.update({ where: { id: movieId }, data: { status: 'generating', resultVideoId: result.id } });

    const read = () => h.app.inject({ method: 'GET', url: `/movies/${movieId}`, headers: user.auth });
    const [first, second] = await Promise.all([read(), read()]);
    expect(first.json().data.status).toBe('ready');
    expect(second.json().data.status).toBe('ready');

    const entries = await profile(user);
    expect(weightOf(entries, 'places', 'cafe')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.final), 6);
    expect(weightOf(entries, 'style', '여행')).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.final), 6);
    expect(weightOf(entries, 'transition', kind)).toBeCloseTo(once(TASTE_SIGNAL_STRENGTH.final), 6);
  });
});

describe('forgetting (PRF-4)', () => {
  it('withdrawing analysis consent drops content tastes and keeps edit tastes', async () => {
    const user = await createConsentedUser(h);
    await applyTasteSignals(user.id, [
      { field: 'places', concept: 'cafe', strength: 1 },
      { field: 'moods', concept: 'calm', strength: 1 },
      { field: 'transition', concept: 'dip', strength: 1 },
      { field: 'style', concept: '감성', strength: 1 },
    ]);

    const res = await h.app.inject({ method: 'DELETE', url: '/auth/me/analysis-consent', headers: user.auth });
    expect(res.statusCode).toBe(200);

    const entries = await readTasteProfile(user.id);
    expect(entries.map((entry) => entry.field).sort()).toEqual(['style', 'transition']);
  });

  it('deleting the user drops every taste with it', async () => {
    const user = await createConsentedUser(h);
    await applyTasteSignals(user.id, [{ field: 'style', concept: '감성', strength: 1 }]);

    await h.prisma.user.delete({ where: { id: user.id } });

    expect(await h.prisma.userTaste.count()).toBe(0);
  });

  it('keeps what a deleted snap taught — tastes hold no snap content', async () => {
    const user = await createConsentedUser(h);
    const snap = await createSnap(user, { places: ['카페'] });
    await applyTasteSignals(user.id, [{ field: 'places', concept: 'cafe', strength: 1 }]);

    await h.prisma.video.delete({ where: { id: snap } });

    expect(weightOf(await readTasteProfile(user.id), 'places', 'cafe')).toBeCloseTo(once(1), 6);
  });
});
