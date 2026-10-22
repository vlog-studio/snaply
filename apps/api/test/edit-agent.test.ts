/**
 * AI 편집 에이전트의 루프(specs MOV-25, docs/decisions/ai-edit-agent.md §3 · §4). DB · 네트워크 없는 순수 테스트다 — 모델은
 * 각본대로 툴을 부르는 가짜다. 실제 모델의 판단이 아니라 **루프가 보장하는 것**을 고정한다: 툴 · 검토 · 재시도 상한 · 시간 상한 ·
 * 동의에 따른 툴 제한 · 계획을 다시 실행하면 같은 초안.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { MOVIE_CLIP_MAX } from '@vlog-studio/shared-types';
import type { AgentModel } from '../src/services/edit-agent/agent-model.js';
import { scripted } from './helpers/scripted-agent.js';
import { EditAgentError, replayDraftPlan, runEditAgent, type AgentInput } from '../src/services/edit-agent/edit-agent.js';
import { EDIT_AGENT_ANALYSIS_LIMIT, EDIT_AGENT_MAX_RETRIES } from '../src/services/edit-agent/agent-policy.js';
import { draftSeedRoot, type DraftCandidate } from '../src/services/edit-director.js';
import { conceptsOfAnalysis } from '../src/services/taste/taste-affinity.js';

const T0 = Date.parse('2026-10-01T09:00:00Z');

function snap(key: string, minute: number, uploaded = true): DraftCandidate {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return {
    key,
    uploaded,
    capturedAt: T0 + minute * 60_000,
    signals: uploaded
      ? {
          durationMs: 3000,
          stepMs: 100,
          brightness: 0.5,
          sharpness: 300,
          frameHashes: [hash, hash, hash],
          motion: Array.from({ length: 29 }, () => 0.01),
          speech: [],
        }
      : null,
    analysis: null,
  };
}

const select = (focus: string[], maxCuts: number | null, targetSeconds: number | null = null) => ({
  name: 'select_cuts',
  args: { focus, maxCuts, targetSeconds },
});
const submit = { name: 'submit_draft', args: { intent: '카페 투어', flow: ['도입', '카페', '마무리'], mood: 'calm' } };

/** 12개 스냅 — s3 에만 카페가 보인다. */
function setup(overrides: Partial<AgentInput> = {}) {
  const candidates = Array.from({ length: 12 }, (_, i) => snap(`v${i}`, i * 5));
  const content = new Map(
    candidates.map((c) => [
      c.key,
      {
        concepts: conceptsOfAnalysis(c.key === 'v3' ? { places: ['커피숍'] } : { places: ['거리'] }),
        moods: [],
      },
    ]),
  );
  const input = (model: AgentModel): AgentInput => ({
    model,
    seedRoot: draftSeedRoot('user-1', candidates.map((c) => c.key)),
    stylePreset: '일상',
    candidates,
    content,
    taste: [{ field: 'places', concept: 'cafe', weight: 0.6 }],
    analyze: null,
    deadline: Date.now() + 20_000,
    ...overrides,
  });
  return { candidates, input };
}

describe('runEditAgent', () => {
  it('chooses cuts with the director, records the plan and replays it to the same draft', async () => {
    const { candidates, input } = setup();
    const model = scripted([() => [select(['places:cafe'], 4)], () => [submit]]);

    const { result, plan } = await runEditAgent(input(model));

    expect(result.cuts).toHaveLength(4);
    expect(result.cuts.map((cut) => cut.key)).toContain('v3');
    expect(plan).toMatchObject({
      intent: '카페 투어',
      flow: ['도입', '카페', '마무리'],
      mood: 'calm',
      direction: { focus: ['places:cafe'], focusKeys: ['v3'], maxCuts: 4 },
      usage: { turns: 2, inputTokens: 200, outputTokens: 40 },
    });
    expect(plan.steps.map((step) => step.tool)).toEqual(['select_cuts', 'submit_draft']);
    // §4 — 계획을 다시 실행하면 같은 초안이다.
    expect(replayDraftPlan({ seedRoot: input(model).seedRoot, stylePreset: '일상', candidates, plan })).toEqual(result);
  });

  it('sends concept ids and aliases, never snap ids', async () => {
    const { input } = setup();
    const model = scripted([() => [submit]]);

    await runEditAgent(input(model));

    expect(model.seen.message).not.toContain('v3');
    const context = JSON.parse(model.seen.message);
    expect(context.snaps[3]).toMatchObject({ id: 's4', concepts: ['places:cafe'] });
    expect(context.taste).toEqual([{ concept: 'places:cafe', weight: 0.6 }]);
  });

  it('reports a failed review so the agent can retry, and stops retries at the cap', async () => {
    const { input } = setup();
    const model = scripted([
      () => [select([], 10, 6)],
      () => [select([], 2, 6)],
      () => [select([], 2, 6), select([], 2, 6)],
      () => [submit],
    ]);

    const { result } = await runEditAgent(input(model));

    const [tooLong, fine, third, beyond] = model.seen.results as Array<{
      review?: { passed: boolean; problems: string[] };
      error?: string;
    }>;
    expect(tooLong!.review!.passed).toBe(false);
    expect(tooLong!.review!.problems[0]).toContain('목표 길이');
    expect(fine!.review!.passed).toBe(true);
    expect(third!.review).toBeDefined();
    expect(beyond!.error).toBeDefined();
    expect(model.seen.results.filter((r) => (r as { review?: unknown }).review).length).toBe(EDIT_AGENT_MAX_RETRIES + 1);
    expect(result.cuts).toHaveLength(2);
  });

  it('finds snaps through narrower concepts', async () => {
    const { input } = setup();
    const model = scripted([() => [{ name: 'find_snaps', args: { concept: 'places:shop' } }], () => [submit]]);

    await runEditAgent(input(model));

    expect(model.seen.results[0]).toEqual({ concept: 'places:shop', snaps: ['s4'] });
  });

  it('gives a user without analysis consent no concepts and no concept tools', async () => {
    const { input } = setup({ content: null, analyze: async () => [] });
    const model = scripted([() => [{ name: 'find_snaps', args: { concept: 'places:cafe' } }], () => [submit]]);

    await runEditAgent({ ...input(model), analyze: null });

    expect(model.seen.tools[0]).toEqual(['select_cuts', 'pick_transitions', 'submit_draft']);
    expect(JSON.parse(model.seen.message).snaps[0].concepts).toBeUndefined();
    expect(model.seen.results[0]).toEqual({ error: '쓸 수 없는 툴이다.' });
  });

  it('asks analysis only for uploaded snaps without concepts, at most the per-draft limit', async () => {
    const candidates = Array.from({ length: 20 }, (_, i) => snap(`v${i}`, i, i !== 0));
    const requested: string[][] = [];
    const model = scripted([
      () => [{ name: 'analyze_snaps', args: { snaps: candidates.map((_, i) => `s${i + 1}`) } }],
      () => [submit],
    ]);

    await runEditAgent({
      model,
      seedRoot: 'seed',
      stylePreset: '일상',
      candidates,
      content: new Map([['v1', { concepts: conceptsOfAnalysis({ places: ['카페'] }), moods: [] }]]),
      taste: [],
      analyze: async (ids) => {
        requested.push(ids);
        return ids;
      },
      deadline: Date.now() + 20_000,
    });

    expect(requested[0]).toHaveLength(EDIT_AGENT_ANALYSIS_LIMIT);
    expect(requested[0]).not.toContain('v0'); // 업로드되지 않았다
    expect(requested[0]).not.toContain('v1'); // 이미 개념이 있다
  });

  it('answers broken arguments with an error and keeps going', async () => {
    const { input } = setup();
    const model = scripted([() => [{ name: 'select_cuts', args: '{not json' }], () => [select([], 3)], () => [submit]]);

    const { result } = await runEditAgent(input(model));

    expect(model.seen.results[0]).toEqual({ error: '인자가 JSON 이 아니다.' });
    expect(result.cuts).toHaveLength(3);
  });

  it('picks the movie mood for the transitions, only after choosing cuts and only from the vocabulary', async () => {
    const { input } = setup({ stylePreset: '감성' });
    const pick = (mood: string) => ({ name: 'pick_transitions', args: { mood } });
    const model = scripted([
      () => [pick('moods:nostalgic')],
      () => [select([], 4)],
      () => [pick('moods:gloomy'), pick('moods:nostalgic'), pick('moods:calm')],
      () => [submit],
    ]);

    const { plan } = await runEditAgent(input(model));

    const [early, , unknown, picked, again] = model.seen.results as Array<{ error?: string }>;
    expect(early).toEqual({ error: '먼저 select_cuts 로 컷을 골라라.' });
    // 틀리면 고를 수 있는 id 를 알려 준다 — 툴 정의에도 같은 목록이 있다.
    expect(unknown!.error).toContain('moods:cozy');
    // 한 번 정하면 다시 고르지 않는다 — 왕복을 늘리지 않게.
    expect(again!.error).toContain('이미 moods:nostalgic');
    // 감성의 후보(crossfade · dip) 중 그리움에 어울리는 것.
    expect(picked).toMatchObject({ mood: 'moods:nostalgic', favored: ['crossfade', 'dip'] });
    // 정한 분위기가 submit 의 값보다 앞선다.
    expect(plan.mood).toBe('nostalgic');
  });

  it('keeps a submitted mood only when the vocabulary knows it', async () => {
    const { input } = setup();
    const withMood = (mood: string) => ({ name: 'submit_draft', args: { intent: '하루', flow: [], mood } });
    expect((await runEditAgent(input(scripted([() => [withMood('moods:잔잔한')]])))).plan.mood).toBe('calm');
    expect((await runEditAgent(input(scripted([() => [withMood('gloomy')]])))).plan.mood).toBeNull();
  });

  it('uses the plain rules when the agent submits without choosing', async () => {
    const { input, candidates } = setup();
    const { result, plan } = await runEditAgent(input(scripted([() => [submit]])));
    expect(result.cuts).toHaveLength(Math.min(candidates.length, MOVIE_CLIP_MAX));
    expect(plan.direction).toEqual({ focus: [], focusKeys: [], maxCuts: null });
  });

  it('fails when the agent ends without choosing or submitting', async () => {
    const { input } = setup();
    await expect(runEditAgent(input(scripted([() => 'text'])))).rejects.toMatchObject({ reason: 'no-result' });
  });

  it('fails on a model error and on the time limit', async () => {
    const { input } = setup();
    const broken = scripted([() => Promise.reject(new Error('500'))]);
    await expect(runEditAgent(input(broken))).rejects.toMatchObject({ reason: 'model' });

    const slow: AgentModel = {
      ...scripted([]),
      next: ({ signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    };
    const error = await runEditAgent({ ...input(slow), deadline: Date.now() + 50 }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(EditAgentError);
    expect((error as EditAgentError).reason).toBe('timeout');
  });
});
