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

/**
 * 취향을 읽는 규칙의 버전 — 아래 반영 숫자나 규칙을 바꾸면 올린다. 추천 재사용 키에 들어간다(결정 §7).
 * 사용자 취향 자체(가중치)는 넣지 않는다 — 신호 하나마다 재사용이 깨지면 같은 화면을 다시 열 때마다 새 추천이 되어
 * 하루 한도(REC-3)를 쓴다. 취향은 하루 안에 크게 바뀌지 않는다(학습률 · 감쇠).
 */
export const TASTE_POLICY_VERSION = 1;

/** 사물 · 행동의 취향을 셀 때, 흔히 보이는 장소(`typicallyAt`)의 취향을 더하는 비율(카페를 좋아하면 커피 스냅도). */
export const TASTE_RELATION_RATIO = 0.5;

/** 템플릿 추천 점수에 더하는 취향 항의 가중치. 취향이 없으면 0 이라 지금의 점수와 같다. */
export const TASTE_RECOMMENDATION_WEIGHT = 0.1;

/** 전환을 뽑을 때 취향 가중치 w 에 대한 배율의 밑 — 배율은 밑^w(w = 1 이면 2배, −1 이면 절반). 0 이 되지 않는다(PRF-2). */
export const TASTE_TRANSITION_BASE = 2;

/** 경계의 분위기(`suits`)에 어울리는 전환의 배율. */
export const TASTE_MOOD_BOOST = 1.5;

/** 템플릿 순서를 바꾸는 취향 차이의 최소값 — 이보다 작으면 카탈로그 순서를 지킨다. */
export const TASTE_TEMPLATE_EPSILON = 0.01;

/**
 * 관심사(`explicit` 행)의 가중치. 사용자가 고른 것이라 시간이 지나도 옅어지지 않고, 해제하면 행을 지운다(결정 §4.2 · §5).
 * 행동에서 배운 값(`derived`)과 더해 읽는다 — 행동이 반대로 쌓이면 관심사의 무게를 넘을 수 있다.
 */
export const TASTE_INTEREST_WEIGHT = 0.5;
