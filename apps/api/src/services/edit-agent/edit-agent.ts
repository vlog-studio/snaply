/**
 * AI 편집 에이전트(specs MOV-25, decisions/ai-edit-agent.md) — 넘긴 스냅으로 "무슨 날인가"를 추론하고, 기존 디렉터를 툴로
 * 부르고, 결과를 규칙으로 검토해 다시 시도한 뒤 초안을 확정한다.
 *
 * **판단은 에이전트, 실행은 규칙.** 에이전트가 정하는 것은 디렉터의 조절값(초점 · 컷 수)뿐이고, 컷 · 구간의 실제 값은 디렉터가
 * 시드로 정한다(§3.2). 그래서 계획(`AgentPlan.direction`)을 다시 실행하면 같은 초안이 나온다(§4 — `replayDraftPlan`).
 *
 * **에이전트에 보내는 것은 개념 id · 신호 요약 · 촬영 간격 · 취향 상위 개념뿐이다**(착수 계획 §2.3). 프레임 · 분석 원문 · 스냅 id 는
 * 보내지 않는다 — 스냅은 `s1` 같은 별칭으로 부른다. 분석에 동의하지 않은 사용자는 개념이 없고 개념 툴도 없다(§3.4).
 *
 * 이 모듈은 DB 를 읽지 않는다. 입력은 `movie-draft.service.ts` 가 읽어 넘기고, 분석 요청만 콜백으로 받는다.
 */
import {
  MOVIE_CLIP_MAX,
  contentConcept,
  contentMatchScore,
  isContentField,
  type ContentField,
  type StylePreset,
} from '@vlog-studio/shared-types';
import {
  CUT_LENGTHS,
  directDraft,
  type DirectionParams,
  type DraftCandidate,
  type DraftResult,
} from '../edit-director.js';
import type { AgentModel, AgentToolCall, AgentToolSpec } from './agent-model.js';
import {
  EDIT_AGENT_ANALYSIS_LIMIT,
  EDIT_AGENT_LENGTH_TOLERANCE,
  EDIT_AGENT_MAX_RETRIES,
  EDIT_AGENT_MAX_TURNS,
  EDIT_AGENT_PROMPT_VERSION,
} from './agent-policy.js';

export interface SnapConcepts {
  concepts: Array<{ field: ContentField; concept: string }>;
  moods: string[];
}

export interface AgentInput {
  model: AgentModel;
  seedRoot: string;
  stylePreset: StylePreset;
  candidates: DraftCandidate[];
  /** 스냅 key → 보이는 개념. 분석에 동의하지 않았으면 `null` — 개념도 개념 툴도 없다. */
  content: ReadonlyMap<string, SnapConcepts> | null;
  /** 취향 상위 개념(크기 순, 이미 잘라서). */
  taste: ReadonlyArray<{ field: string; concept: string; weight: number }>;
  /** 분석 요청. 없으면 `analyze_snaps` 툴이 없다(동의 · 서버 스위치). 요청한 videoId 를 돌려준다. */
  analyze: ((videoIds: string[]) => Promise<string[]>) | null;
  /** 이 시각이 지나면 멈춘다. */
  deadline: number;
  now?: () => number;
}

/** 저장하는 계획 — 다시 실행하면 같은 초안이 나온다(§4). */
export interface AgentPlan {
  promptVersion: number;
  model: string;
  intent: string | null;
  flow: string[];
  mood: string | null;
  /** 디렉터에 넘긴 최종 조절값. 초점은 개념과, 그때 그 개념이 보이던 스냅 key 를 함께 둔다(분석이 나중에 늘어도 같게). */
  direction: { focus: string[]; focusKeys: string[]; maxCuts: number | null };
  steps: Array<{ tool: string; args: unknown; outcome: unknown }>;
  usage: { turns: number; inputTokens: number; outputTokens: number; ms: number };
}

export class EditAgentError extends Error {
  constructor(
    readonly reason: 'timeout' | 'model' | 'no-result',
    message: string,
    readonly usage?: AgentPlan['usage'],
  ) {
    super(message);
  }
}

/** 저장한 계획으로 초안을 다시 만든다 — 같은 입력이면 같은 초안이다. */
export function replayDraftPlan(params: {
  seedRoot: string;
  stylePreset: StylePreset;
  candidates: DraftCandidate[];
  plan: Pick<AgentPlan, 'direction'>;
}): DraftResult {
  return directDraft({
    seedRoot: params.seedRoot,
    stylePreset: params.stylePreset,
    candidates: params.candidates,
    direction: toDirection(params.plan.direction),
  });
}

function toDirection(direction: AgentPlan['direction']): DirectionParams {
  return {
    ...(direction.focusKeys.length > 0 ? { focusKeys: new Set(direction.focusKeys) } : {}),
    ...(direction.maxCuts !== null ? { maxCuts: direction.maxCuts } : {}),
  };
}

const INSTRUCTIONS = `당신은 짧은 세로 브이로그 앱 Snaply 의 편집 에이전트다. 사용자가 넘긴 3초 안팎의 스냅들로 무비 초안을 만든다.

할 일:
1. 의도 추론 — 스냅의 개념(장소 · 사물 · 행동 · 주제 · 분위기), 촬영 간격, 고른 스타일, 사용자 취향으로 "어떤 날인가"를 정한다.
2. 계획 — 장면 흐름(도입 · 본론 · 마무리)과 초점 개념, 알맞은 컷 수를 정한다.
3. select_cuts 로 컷을 고른다. 컷 · 구간의 실제 값은 규칙 디렉터가 정하고, 당신은 초점(focus)과 컷 수(maxCuts) · 목표 길이(targetSeconds)만 정한다.
4. 결과의 review 가 통과하지 않으면 파라미터를 바꿔 다시 부른다(재시도는 정해진 횟수까지).
5. submit_draft 로 의도와 장면 흐름을 남기고 끝낸다. 반드시 submit_draft 로 끝낸다.

규칙:
- 사용자에게 보이는 문장을 쓰지 않는다. 의도와 흐름은 짧은 한국어 명사구로 적는다.
- 개념은 "필드:id" 형식이다(예: places:cafe). 주어진 개념과 find_snaps 의 결과만 쓰고 지어내지 않는다.
- 개념이 주어지지 않았으면 촬영 간격 · 신호 · 스타일 · 취향으로만 판단한다.
- 초점은 많아야 3개다. 모든 스냅을 쓸 필요는 없지만, 넘긴 스냅이 적으면(4개 이하) 다 쓰는 쪽이 낫다.
- 툴은 꼭 필요한 만큼만 부른다.`;

const TOOL_SELECT: AgentToolSpec = {
  name: 'select_cuts',
  description:
    '규칙 디렉터로 컷을 고른다. focus 개념이 보이는 스냅이 촬영 흐름의 같은 구간 안에서 앞선다. maxCuts 는 컷 수 상한, targetSeconds 는 검토가 보는 목표 길이. 결과와 검토(review)를 돌려준다.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['focus', 'maxCuts', 'targetSeconds'],
    properties: {
      focus: { type: 'array', items: { type: 'string' }, description: '초점 개념("필드:id"), 없으면 빈 배열' },
      maxCuts: { type: ['integer', 'null'], description: `컷 수 상한(1~${MOVIE_CLIP_MAX}), 정하지 않으면 null` },
      targetSeconds: { type: ['integer', 'null'], description: '목표 길이(초), 정하지 않으면 null' },
    },
  },
};

const TOOL_FIND: AgentToolSpec = {
  name: 'find_snaps',
  description: '개념(또는 그 하위 개념)이 보이는 스냅을 찾는다. 예: places:shop 은 카페 · 식당이 보이는 스냅도 찾는다.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['concept'],
    properties: { concept: { type: 'string', description: '"필드:id"' } },
  },
};

const TOOL_ANALYZE: AgentToolSpec = {
  name: 'analyze_snaps',
  description:
    '아직 개념이 없는 업로드된 스냅의 내용 분석을 요청한다. 결과는 기다리지 않고 다음 초안부터 쓰인다. 개념 없이도 초안은 만들 수 있으니 필요할 때만 부른다.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['snaps'],
    properties: { snaps: { type: 'array', items: { type: 'string' }, description: '스냅 별칭(s1 …)' } },
  },
};

const TOOL_SUBMIT: AgentToolSpec = {
  name: 'submit_draft',
  description: '마지막 select_cuts 결과로 초안을 확정한다. 의도 · 장면 흐름 · 분위기를 남긴다.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'flow', 'mood'],
    properties: {
      intent: { type: 'string', description: '어떤 날인가(짧은 명사구)' },
      flow: { type: 'array', items: { type: 'string' }, description: '장면 흐름(도입 · 본론 · 마무리 순)' },
      mood: { type: ['string', 'null'], description: '분위기 개념 id(moods:…) 또는 null' },
    },
  },
};

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function parseConcept(value: unknown): { field: ContentField; concept: string } | null {
  if (typeof value !== 'string') return null;
  const [field, concept] = value.split(':');
  if (!field || !concept || !isContentField(field) || !contentConcept(field, concept)) return null;
  return { field, concept };
}

/** 에이전트를 돌린다. 끝까지 돌면 초안과 계획을, 실패하면 `EditAgentError` 를 던진다(호출하는 쪽이 규칙만의 초안으로 간다). */
export async function runEditAgent(input: AgentInput): Promise<{ result: DraftResult; plan: AgentPlan }> {
  const now = input.now ?? Date.now;
  const started = now();
  const usage = { turns: 0, inputTokens: 0, outputTokens: 0, ms: 0 };

  // 촬영순 별칭 — 에이전트는 스냅 id 를 보지 않는다.
  const ordered = input.candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => a.candidate.capturedAt - b.candidate.capturedAt || a.index - b.index)
    .map(({ candidate }) => candidate);
  const aliasOf = new Map(ordered.map((candidate, i) => [candidate.key, `s${i + 1}`]));
  const keyOf = new Map(ordered.map((candidate, i) => [`s${i + 1}`, candidate.key]));
  const conceptsOf = (key: string) => input.content?.get(key)?.concepts ?? [];

  const firstAt = ordered[0]?.capturedAt ?? 0;
  const sharp = ordered.map((c) => (c.signals ? Math.log1p(c.signals.sharpness) : null));
  const known = sharp.filter((v): v is number => v !== null);
  const [lo, hi] = [Math.min(...known), Math.max(...known)];
  const snaps = ordered.map((candidate, i) => ({
    id: aliasOf.get(candidate.key),
    minute: round((candidate.capturedAt - firstAt) / 60_000, 1),
    uploaded: candidate.uploaded,
    seconds: candidate.signals ? round(candidate.signals.durationMs / 1000, 1) : null,
    quality: sharp[i] === null ? null : hi > lo ? round((sharp[i]! - lo) / (hi - lo)) : 0.5,
    motion: candidate.signals
      ? round(candidate.signals.motion.reduce((s, v) => s + v, 0) / Math.max(1, candidate.signals.motion.length))
      : null,
    speech: candidate.signals ? candidate.signals.speech.length > 0 : null,
    ...(input.content
      ? {
          concepts: conceptsOf(candidate.key).map(({ field, concept }) => `${field}:${concept}`),
          moods: input.content.get(candidate.key)?.moods ?? [],
        }
      : {}),
  }));
  const context = {
    style: input.stylePreset,
    cutSecondsForStyle: CUT_LENGTHS[input.stylePreset].base / 1000,
    maxCuts: MOVIE_CLIP_MAX,
    conceptsAvailable: input.content !== null,
    snaps,
    taste: input.taste.map((entry) => ({ concept: `${entry.field}:${entry.concept}`, weight: round(entry.weight) })),
  };

  const tools = [TOOL_SELECT, ...(input.content ? [TOOL_FIND] : []), ...(input.analyze ? [TOOL_ANALYZE] : []), TOOL_SUBMIT];
  const transcript = input.model.start(JSON.stringify(context));
  const steps: AgentPlan['steps'] = [];
  // 툴이 바꾸는 상태 — 루프와 툴이 함께 본다.
  const state: {
    selections: number;
    analyzed: number;
    last: { result: DraftResult; direction: AgentPlan['direction'] } | null;
    submitted: { intent: string; flow: string[]; mood: string | null } | null;
  } = { selections: 0, analyzed: 0, last: null, submitted: null };

  const select = (args: Record<string, unknown>) => {
    if (state.selections > EDIT_AGENT_MAX_RETRIES) {
      return { error: '더 고를 수 없다. 마지막 결과로 submit_draft 하라.' };
    }
    state.selections += 1;
    const focus = (Array.isArray(args.focus) ? args.focus : []).map(parseConcept).filter((c) => c !== null).slice(0, 3);
    const focusKeys = ordered
      .filter((candidate) =>
        conceptsOf(candidate.key).some((snap) =>
          focus.some((f) => f.field === snap.field && contentMatchScore(f.field, f.concept, snap.concept) === 1),
        ),
      )
      .map((candidate) => candidate.key);
    const maxCuts = typeof args.maxCuts === 'number' ? Math.min(MOVIE_CLIP_MAX, Math.max(1, Math.floor(args.maxCuts))) : null;
    const target = typeof args.targetSeconds === 'number' && args.targetSeconds > 0 ? args.targetSeconds : null;
    const direction = { focus: focus.map((f) => `${f.field}:${f.concept}`), focusKeys, maxCuts };
    const result = directDraft({
      seedRoot: input.seedRoot,
      stylePreset: input.stylePreset,
      candidates: input.candidates,
      direction: toDirection(direction),
    });
    state.last = { result, direction };

    const seconds = (key: string, cut: DraftResult['cuts'][number]) => {
      if (cut.startMs !== undefined && cut.endMs !== undefined) return (cut.endMs - cut.startMs) / 1000;
      const signals = input.candidates.find((c) => c.key === key)?.signals;
      return signals ? signals.durationMs / 1000 : CUT_LENGTHS[input.stylePreset].base / 1000;
    };
    const total = result.cuts.reduce((sum, cut) => sum + seconds(cut.key, cut), 0);
    // §3.3 규칙 검토 — 규칙으로 판단할 수 있는 것만 본다.
    const problems: string[] = [];
    if (focusKeys.length > 0 && !result.cuts.some((cut) => focusKeys.includes(cut.key))) {
      problems.push('초점 개념이 보이는 스냅이 컷에 없다');
    }
    if (target !== null && total > target * EDIT_AGENT_LENGTH_TOLERANCE) {
      problems.push(`목표 길이(${target}초)를 넘는다(${round(total, 1)}초) — maxCuts 를 줄여라`);
    }
    const usable = input.candidates.length - result.excluded.length;
    if (result.cuts.length < Math.min(2, usable)) problems.push('컷이 너무 적다');
    return {
      cuts: result.cuts.map((cut) => ({
        snap: aliasOf.get(cut.key),
        role: cut.role,
        seconds: round(seconds(cut.key, cut), 1),
        concepts: conceptsOf(cut.key).map(({ field, concept }) => `${field}:${concept}`),
      })),
      excluded: result.excluded.map((key) => aliasOf.get(key)),
      totalSeconds: round(total, 1),
      review: { passed: problems.length === 0, problems },
      retriesLeft: EDIT_AGENT_MAX_RETRIES + 1 - state.selections,
    };
  };

  const find = (args: Record<string, unknown>) => {
    const target = parseConcept(args.concept);
    if (!target) return { error: '사전에 없는 개념이다. "필드:id" 로 다시.' };
    const found = ordered.filter((candidate) =>
      conceptsOf(candidate.key).some(
        (snap) => snap.field === target.field && contentMatchScore(target.field, target.concept, snap.concept) === 1,
      ),
    );
    return { concept: `${target.field}:${target.concept}`, snaps: found.map((c) => aliasOf.get(c.key)) };
  };

  const analyze = async (args: Record<string, unknown>) => {
    const wanted = (Array.isArray(args.snaps) ? args.snaps : [])
      .map((alias) => (typeof alias === 'string' ? keyOf.get(alias) : undefined))
      .filter((key): key is string => key !== undefined)
      .filter((key) => input.candidates.find((c) => c.key === key)?.uploaded && conceptsOf(key).length === 0);
    const room = EDIT_AGENT_ANALYSIS_LIMIT - state.analyzed;
    const requested = await input.analyze!([...new Set(wanted)].slice(0, Math.max(0, room)));
    state.analyzed += requested.length;
    return { requested: requested.map((key) => aliasOf.get(key)), note: '결과는 다음 초안부터 쓰인다. 이번 초안은 지금 있는 개념으로 만든다.' };
  };

  const run = async (call: AgentToolCall): Promise<unknown> => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.arguments) as Record<string, unknown>;
    } catch {
      return { error: '인자가 JSON 이 아니다.' };
    }
    switch (call.name) {
      case 'select_cuts':
        return select(args);
      case 'find_snaps':
        return input.content ? find(args) : { error: '쓸 수 없는 툴이다.' };
      case 'analyze_snaps':
        return input.analyze ? analyze(args) : { error: '쓸 수 없는 툴이다.' };
      case 'submit_draft':
        state.submitted = {
          intent: typeof args.intent === 'string' ? args.intent.slice(0, 200) : '',
          flow: (Array.isArray(args.flow) ? args.flow : []).filter((v): v is string => typeof v === 'string').slice(0, 8),
          mood: typeof args.mood === 'string' ? args.mood.slice(0, 40) : null,
        };
        return { ok: true };
      default:
        return { error: `모르는 툴 ${call.name}` };
    }
  };

  const remaining = () => input.deadline - now();
  while (state.submitted === null && usage.turns < EDIT_AGENT_MAX_TURNS) {
    if (remaining() <= 0) throw new EditAgentError('timeout', '시간 상한을 넘겼다', { ...usage, ms: now() - started });
    const signal = AbortSignal.timeout(Math.max(1, remaining()));
    let turn;
    try {
      turn = await input.model.next({ instructions: INSTRUCTIONS, transcript, tools, signal });
    } catch (err) {
      const timedOut = signal.aborted || remaining() <= 0;
      throw new EditAgentError(timedOut ? 'timeout' : 'model', String(err), { ...usage, ms: now() - started });
    }
    usage.turns += 1;
    usage.inputTokens += turn.usage.inputTokens;
    usage.outputTokens += turn.usage.outputTokens;
    if (turn.calls.length === 0) break;
    for (const call of turn.calls) {
      const outcome = await run(call);
      steps.push({ tool: call.name, args: safeParse(call.arguments), outcome: summarize(call.name, outcome) });
      input.model.addResult(transcript, call, JSON.stringify(outcome));
    }
  }
  usage.ms = now() - started;

  // submit 없이 끝났으면 마지막으로 고른 결과를 쓴다. 한 번도 고르지 않았으면 규칙 기본값으로 — 에이전트가 바꿀 것이 없다고 본 것이다.
  const chosen = state.last;
  if (chosen === null && state.submitted === null) {
    throw new EditAgentError('no-result', '고른 결과 없이 끝났다', usage);
  }
  const direction = chosen?.direction ?? { focus: [], focusKeys: [], maxCuts: null };
  const result =
    chosen?.result ??
    directDraft({ seedRoot: input.seedRoot, stylePreset: input.stylePreset, candidates: input.candidates });
  const final = state.submitted;
  return {
    result,
    plan: {
      promptVersion: EDIT_AGENT_PROMPT_VERSION,
      model: input.model.name,
      intent: final?.intent ?? null,
      flow: final?.flow ?? [],
      mood: final?.mood ?? null,
      direction,
      steps,
      usage,
    },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 200);
  }
}

/** 계획에는 결과를 요약해 남긴다 — 컷 목록 전체가 아니라 검토와 개수. */
function summarize(tool: string, outcome: unknown): unknown {
  if (tool !== 'select_cuts' || typeof outcome !== 'object' || outcome === null || !('cuts' in outcome)) return outcome;
  const o = outcome as { cuts: unknown[]; totalSeconds: number; review: unknown };
  return { cuts: o.cuts.length, totalSeconds: o.totalSeconds, review: o.review };
}
