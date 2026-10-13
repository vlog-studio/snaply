# Agentic · Ontology 착수 계획 — 개념 사전에서 AI 편집 에이전트까지

**작성일**: 2026-10-13
**상태**: 일부 구현 — 1단계(개념 사전 확정) · 2단계(관계) · 4단계(취향 프로필)를 2026-10-13 에 넣었다(progress 2026-10-13). 3 · 5단계부터는 제안이다
**원천**: [decisions/ai-edit-agent.md](../decisions/ai-edit-agent.md)와 [decisions/ontology-personalization.md](../decisions/ontology-personalization.md)를
구현하는 단계와 순서, 단계마다 바뀌는 곳. 미결 작업은 [backlog.md](../backlog.md) A-12 · A-13 · A-9 에만 둔다
**관련 문서**: [content-vocabulary.md](content-vocabulary.md) · [snap-analysis-recommendation-rollout.md](snap-analysis-recommendation-rollout.md) ·
[specs/movie.md](../specs/movie.md) MOV-21 · MOV-25 · [specs/credits-and-payment.md](../specs/credits-and-payment.md) CRD-9 ·
[specs/template-and-recommendation.md](../specs/template-and-recommendation.md) PRF-1~PRF-4 · [specs/account.md](../specs/account.md) ACC-5

---

## 0. 순서의 원칙

- **온톨로지가 먼저다.** 에이전트의 툴(`find_snaps`) · 기억(취향) · 검토 기준이 모두 개념 위에서 돈다. 개념 없이 에이전트부터 만들면
  분석의 자유 문자열을 LLM 에 그대로 넘기게 되고, 토큰이 늘고 검토를 규칙으로 할 수 없다.
- **사용자에게 보이는 변화가 없는 단계부터 한다.** 1 · 2단계는 화면이 바뀌지 않아 앱 릴리스 없이 서버만으로 들어간다.
- **단계마다 LLM 없이도 동작한다.** 에이전트가 실패하면 지금의 규칙 흐름이 남는다(폴백).

## 1. 단계

| 단계 | 내용 | 바뀌는 곳 | 사용자 가시 | 백로그 |
|---|---|---|---|---|
| 1 | **개념 사전 확정** — [content-vocabulary.md](content-vocabulary.md) §6 의 1~4(현행 고정 테스트 → 사전 확정 · `moods` 추가 → 정규화기 · 트리 매칭 · 슬롯 힌트 마이그레이션 · 재사용 키 버전) | `packages/shared-types/src/content-vocabulary.json`(신규) · `score-slots.ts` · 워커 `pipeline/vocabulary.py` | 없음(추천 정확도) | A-13 |
| 2 | **관계 추가** — `typicallyAt` · `evokes` · `suits`, 정합성 테스트 | 같은 사전 · 사전 테스트 | 없음 | A-13 |
| 3 | **관심사** — `topics` 확장, `interests` 를 개념 id 로 검증, 나 탭의 선택 화면 | 계약 `contract/auth.ts` · `apps/mobile` 나 탭 | ACC-5 | A-9 |
| 4 | **취향 프로필** — DB 표 · 신호 수집(초안 · 템플릿 · 무비 생성 · 편집) · 갱신 · 전파 · 감쇠 · 파기(동의 철회 · 계정 삭제) | `schema.prisma` + 마이그레이션(공유 파일 — [team.md](../team.md) §2) · 신호를 내는 서비스들 | 없음(PRF-1 · PRF-2 · PRF-4) | A-13 |
| 5 | **취향 반영(규칙 경로)** — 템플릿 정렬 · 추천 가중 · 전환 · 스타일 기본값 | `movie-template.service.ts` · `score-slots.ts` · `transition-director.ts` | PRF-3 | A-13 |
| 6 | **AI 편집 에이전트** — 디렉터를 툴로 감싸기 · 에이전트 루프 · 규칙 검토 · 계획 저장 · 폴백 · 시간 상한 · 초안의 분석 요청(A-11) | `movie-draft.service.ts` · 새 에이전트 서비스 · 계약 `contract/movie-drafts.ts`(진행 상태 · 과금 정보) | MOV-25 | A-12 |
| 7 | **초안 과금** — 무료 3회 · 20크레딧 예약 → 확정 · 남은 무료 횟수 응답 · 앱 표시 | 크레딧 서비스 · 계약 · 앱 초안 화면 | CRD-9 | A-12 |
| 8 | **발표용 내보내기** — 사전에서 그래프 시각화 · OWL/Turtle 생성 스크립트 | `scripts/` | 없음 | A-13 |

## 2. 단계별 메모

### 2.1 1단계 — 기존 계획 그대로

[content-vocabulary.md](content-vocabulary.md) §5 · §6 의 순서와 테스트를 그대로 따른다. 여기서 더하는 것은 `moods` 필드 하나다 — 분석은
`moods` 를 이미 낸다(`apps/ai-worker/src/pipeline/video_analysis/schema.py` `LIST_FIELDS`). 그러나 템플릿 채점(`score-slots.ts`)은 쓰지 않고,
사전 초안의 `fields` 에도 없다. `moods` 는 슬롯 매칭이 아니라 분위기 추론(`evokes` · `suits`)에만 쓴다.

### 2.2 4단계 — 신호를 내는 곳

| 신호 | 내는 곳 |
|---|---|
| 후보로 넘김 | 추천 요청(`movie-recommendation.service.ts`) · 초안 요청(`movie-draft.service.ts`) |
| 남김 · 다시 넣음 · 지움 · 전환 · 스타일 변경 | 무비 저장(`movie.service.ts`) — 초안 제안과 저장된 무비를 비교해 낸다. 앱은 따로 보내지 않는다 |
| 최종 선택 | 무비 생성 완료(편집 워커의 완료 처리) |

신호는 요청 경로를 늦추지 않게 응답 뒤에 갱신한다. 내용 개념의 신호는 분석이 있는 스냅에서만 생긴다.

> **구현(2026-10-13)**: 큐 대신 **같은 프로세스에서 응답 뒤에** 반영한다(`emitTasteSignals`). 새 큐는 워커 프로세스와 배포 구성을 늘리는데,
> 취향은 근사값이라 프로세스가 죽을 때 사라지는 신호 몇 개는 감수했다(종료 때는 남은 반영을 끝낸다). 신호를 내는 곳도 위 표와 조금 다르다 —
> 무비는 초안을 가리키지 않아, "남김 · 다시 넣음 · 지움"은 **AI 정렬 무비가 처음 올라올 때** 재사용 창 안의 초안 중 무비의 컷을 모두 담은
> 것과 비교해 내고(맞는 초안이 없으면 내지 않는다), 편집은 **무비 저장 전후**를 비교해 낸다. 추천의 "후보로 넘김"은 분석이 끝나야 개념을 알
> 수 있어 요청이 아니라 **채점이 끝날 때** 낸다. 최종 선택은 편집 워커가 아니라 무비 상태가 `ready` 로 옮겨지는 때(조회 시점 보정)다.

### 2.3 6단계 — 에이전트

- 제공자는 이미 쓰는 OpenAI(`openai` SDK)다. 툴 호출(function calling)과 구조화 출력을 쓴다.
- 에이전트 모델은 분석 모델과 따로 둔다(환경변수 — `apps/api/src/env-spec.ts` 에 먼저 선언). 이미지를 보지 않으므로 저가 모델부터 잰다.
- 에이전트에 보내는 것은 개념 id · 신호 요약 · 촬영 간격 · 취향 상위 개념뿐이다 — 프레임 · 분석 원문 요약은 보내지 않는다.
- 실측할 것: 초안 1회의 호출 수 · 토큰 · 지연 · 폴백 비율. 결정 문서 §5.1 의 추정을 이 값으로 바꾼다.

### 2.4 나중에 붙는 것 — 스티커(얼굴 · 손 앵커)

이 계획의 단계가 아니다. 스티커는 트렌드 편집 파이프라인([trend-editing-pipeline.md](trend-editing-pipeline.md))의 일이고, 남은 일과 막힌 이유
(스티커 에셋 조달 — [decisions/sticker-asset-sourcing.md](../decisions/sticker-asset-sourcing.md) 결정 대기)는 [backlog.md](../backlog.md) A-7 에 있다.
얼굴 · 손 인식(MediaPipe — `stage-vocabulary.json` 의 `visual-reader`, [`anchor-vocabulary.json`](../../packages/shared-types/src/anchor-vocabulary.json))은
설계만 있고 **구현되지 않았다**.

붙일 때의 연결점만 적어 둔다. 그 파이프라인의 "어디에는 MediaPipe, 무엇을은 LLM" 분담이 이 계획의 구조와 그대로 맞는다.

- **에이전트 툴** — `place_sticker` 를 툴 목록([decisions/ai-edit-agent.md](../decisions/ai-edit-agent.md) §3.2)에 더한다. 위치(앵커)는 MediaPipe 가,
  어느 컷에 어떤 스티커를 붙일지는 에이전트가 정한다. 실제 배치 값은 다른 툴처럼 규칙과 시드가 정한다.
- **온톨로지 관계** — 스티커(또는 스티커 팩)를 내용 개념 · 분위기에 잇는 관계를 사전에 더한다(예: `dessert` → 하트, 청량 → 물방울).
- **취향** — 사용자가 지우거나 바꾼 스티커를 편집 취향 신호로 받는다([decisions/ontology-personalization.md](../decisions/ontology-personalization.md) §4.2 의 전환 · 스타일과 같은 방식).

## 3. 공모전 시연 범위

마감 일정이 정해지면 이 표에서 자른다. 에이전트(6)를 보이려면 1 · 4 · 6 이 최소이고, 온톨로지를 보이려면 1 · 2 · 8 이 최소다.
