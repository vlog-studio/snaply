/**
 * AI 편집 에이전트의 숫자 — **전부 잠정값이다**(decisions/ai-edit-agent.md §3.3 · §6, backlog A-12 "잠정값 실측").
 * 실측(호출 수 · 토큰 · 지연 · 폴백 비율)은 초안 기록의 `plan.usage` 에 남는다.
 */

/**
 * 프롬프트 · 툴 정의의 버전. 바꾸면 올린다 — 초안 재사용 키에 들어가, 바뀐 에이전트가 하루 동안 예전 초안에 가려지지 않는다.
 */
export const EDIT_AGENT_PROMPT_VERSION = 1;

/** 에이전트 모델의 기본값. `EDIT_AGENT_MODEL` 로 바꾼다. 이미지를 보지 않으므로 저가 모델부터 잰다(착수 계획 §2.3). */
export const DEFAULT_EDIT_AGENT_MODEL = 'gpt-5.6-luna';

/** 에이전트 전체의 시간 상한. 넘기면 규칙만의 초안을 낸다(§6). */
export const EDIT_AGENT_TIME_LIMIT_MS = 20_000;

/** 검토를 통과하지 못했을 때 `select_cuts` 를 다시 부를 수 있는 횟수(§3.3). 첫 호출은 세지 않는다. */
export const EDIT_AGENT_MAX_RETRIES = 2;

/** 모델 왕복의 상한 — 툴을 끝없이 부르는 일을 막는다. 넘기면 마지막으로 고른 컷을 쓴다. */
export const EDIT_AGENT_MAX_TURNS = 8;

/** 초안 1회가 분석을 요청하는 스냅 수 상한(specs MOV-21). */
export const EDIT_AGENT_ANALYSIS_LIMIT = 12;

/** 에이전트에 넘기는 취향 개념 수 — 크기가 큰 것부터. 토큰을 아끼고 판단에 쓸 만큼만. */
export const EDIT_AGENT_TASTE_TOP = 8;

/** 검토가 허용하는 목표 길이 초과 비율 — 목표의 이만큼까지는 통과다. */
export const EDIT_AGENT_LENGTH_TOLERANCE = 1.2;
