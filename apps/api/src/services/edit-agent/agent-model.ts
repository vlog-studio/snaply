/**
 * 에이전트가 말하는 모델 — 대화 한 턴을 받아 다음 툴 호출(또는 끝)을 돌려준다. 테스트는 이 인터페이스로 각본 모델을 끼운다.
 *
 * 실제 구현은 OpenAI Responses API 의 함수 툴이다(분석 워커와 같은 API — apps/ai-worker/src/pipeline/video_analysis/openai_client.py).
 * `store: false` 로 보내고 대화는 매 턴 다시 보낸다 — 응답을 사업자에 저장하지 않는다(분석과 같은 취급). 추론 모델의 추론 항목은
 * 암호화된 채로 받아 다음 턴에 되돌린다.
 */
import OpenAI from 'openai';

export interface AgentToolSpec {
  name: string;
  description: string;
  /** JSON Schema(strict). */
  parameters: Record<string, unknown>;
}

export interface AgentToolCall {
  id: string;
  name: string;
  /** JSON 문자열 그대로 — 고장 난 인자도 툴이 받아 오류로 돌려준다. */
  arguments: string;
}

export interface AgentTurn {
  calls: AgentToolCall[];
  /** 툴 없이 끝낸 경우의 말. */
  text: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

/** 대화의 항목 — 모델 구현이 자기 형식을 그대로 쌓을 수 있게 불투명하다. */
export type AgentTranscript = unknown[];

export interface AgentModel {
  readonly name: string;
  /** 첫 사용자 메시지로 대화를 시작한다. */
  start(userMessage: string): AgentTranscript;
  /** 한 턴. 모델의 출력은 `transcript` 에 덧붙는다. */
  next(params: {
    instructions: string;
    transcript: AgentTranscript;
    tools: readonly AgentToolSpec[];
    signal: AbortSignal;
  }): Promise<AgentTurn>;
  /** 툴 결과를 대화에 덧붙인다. */
  addResult(transcript: AgentTranscript, call: AgentToolCall, output: string): void;
}

/** OpenAI Responses API 로 말하는 모델. 키가 없으면 만들지 않는다(호출하는 쪽이 규칙만의 초안으로 간다). */
export function openAiAgentModel(params: { apiKey: string; model: string }): AgentModel {
  const client = new OpenAI({ apiKey: params.apiKey, maxRetries: 0 });
  return {
    name: params.model,
    start: (userMessage) => [{ role: 'user', content: userMessage }],
    async next({ instructions, transcript, tools, signal }) {
      const response = await client.responses.create(
        {
          model: params.model,
          instructions,
          input: transcript as OpenAI.Responses.ResponseInput,
          tools: tools.map((tool) => ({
            type: 'function' as const,
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: true,
          })),
          store: false,
          include: ['reasoning.encrypted_content'],
        },
        { signal },
      );
      transcript.push(...(response.output as unknown[]));
      const calls = response.output
        .filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call')
        .map((item) => ({ id: item.call_id, name: item.name, arguments: item.arguments }));
      return {
        calls,
        text: calls.length === 0 ? response.output_text || null : null,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    },
    addResult(transcript, call, output) {
      transcript.push({ type: 'function_call_output', call_id: call.id, output });
    },
  };
}
