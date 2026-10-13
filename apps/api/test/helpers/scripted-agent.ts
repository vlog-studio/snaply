/**
 * 각본 에이전트 모델 — 턴마다 각본 함수가 (지금까지 받은 툴 결과로) 다음 툴 호출을 정한다. 받은 것을 모두 기록한다.
 * 실제 모델의 판단이 아니라 에이전트 루프와 그 둘레(초안 서비스)를 검사하려고 쓴다.
 */
import type { AgentModel, AgentToolCall, AgentTurn } from '../../src/services/edit-agent/agent-model.js';

export type ScriptStep = (results: unknown[]) => Array<{ name: string; args: unknown }> | 'text' | Promise<never>;

export function scripted(
  turns: ScriptStep[],
): AgentModel & { seen: { message: string; tools: string[][]; results: unknown[] } } {
  const seen = { message: '', tools: [] as string[][], results: [] as unknown[] };
  let index = 0;
  let id = 0;
  return {
    name: 'scripted',
    seen,
    start(message) {
      seen.message = message;
      return [];
    },
    async next({ tools }): Promise<AgentTurn> {
      seen.tools.push(tools.map((tool) => tool.name));
      const step = turns[index++];
      const planned = step ? await step(seen.results) : 'text';
      if (planned === 'text') return { calls: [], text: '끝', usage: { inputTokens: 10, outputTokens: 1 } };
      return {
        calls: planned.map(({ name, args }): AgentToolCall => ({
          id: `c${id++}`,
          name,
          arguments: typeof args === 'string' ? args : JSON.stringify(args),
        })),
        text: null,
        usage: { inputTokens: 100, outputTokens: 20 },
      };
    },
    addResult(_transcript, _call, output) {
      seen.results.push(JSON.parse(output));
    },
  };
}
