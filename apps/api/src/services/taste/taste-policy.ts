/**
 * 취향 프로필의 숫자들. **전부 잠정값이다** — 시연 데이터로 다시 본다(backlog A-13 "잠정값").
 * 숫자를 바꿀 때는 이 파일만 고친다. 근거: docs/decisions/ontology-personalization.md §4.2 · §4.3 · §4.4.
 */

/** 신호의 강도. 부호가 방향(선호 · 비선호)이다. */
export const TASTE_SIGNAL_STRENGTH = {
  /** 추천 · 초안에 후보로 넘긴 스냅. */
  candidate: 0.3,
  /** 초안에서 남기거나, 빠진 스냅을 다시 넣거나, 편집에서 넣은 스냅. */
  picked: 0.5,
  /** 생성까지 끝난 무비의 컷 · 전환 · 스타일 — 가장 강한 근거다. */
  final: 1.0,
  /** AI 가 넣은 컷을 지움. */
  unwanted: -0.5,
  /** AI 가 고른 전환 · 스타일을 바꿈 — 바꾼 값. */
  editChosen: 0.5,
  /** AI 가 고른 전환 · 스타일을 바꿈 — 원래 값. */
  editReplaced: -0.5,
} as const;

/** 학습률. 한 번의 신호로 크게 움직이지 않는다 — 반복될 때만 취향이 된다(PRF-2). */
export const TASTE_LEARNING_RATE = 0.2;

/** 신호가 없을 때 가중치가 절반으로 옅어지는 기간. */
export const TASTE_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** 하위 개념의 신호를 상위로 올릴 때 한 단계마다 곱하는 비율(디저트 +0.8 → 음식 +0.4). */
export const TASTE_PROPAGATION_RATIO = 0.5;
