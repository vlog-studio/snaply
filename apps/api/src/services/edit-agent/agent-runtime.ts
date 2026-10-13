/**
 * 에이전트 모델을 어디서 얻는가. 호출 시점에 환경을 읽는다 — 키를 넣고 빼는 데 재배포가 필요 없다(`isSnapAnalysisEnabled` 와 같다).
 * 키가 없으면 `null` 이고 초안은 규칙만으로 만든다(mode `rules`).
 */
import { openAiAgentModel, type AgentModel } from './agent-model.js';
import { DEFAULT_EDIT_AGENT_MODEL } from './agent-policy.js';

let override: (() => AgentModel | null) | null = null;

export function resolveEditAgentModel(): AgentModel | null {
  if (override) return override();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return openAiAgentModel({ apiKey, model: process.env.EDIT_AGENT_MODEL?.trim() || DEFAULT_EDIT_AGENT_MODEL });
}

/** 테스트가 각본 모델을 끼운다. `null` 이면 환경으로 돌아간다. */
export function setEditAgentModelForTests(factory: (() => AgentModel | null) | null): void {
  override = factory;
}
