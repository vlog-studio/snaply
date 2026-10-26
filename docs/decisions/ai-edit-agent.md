# AI 편집 에이전트 — AI 편집 초안을 LLM 에이전트가 계획하고 기존 디렉터를 툴로 부른다

**작성일**: 2026-10-13
**상태**: 결정 — 구조·과금은 오너가 정했고(2026-10-13), 반복 상한·시간 상한·에이전트 모델·토큰 추정은 잠정값이다
**원천**: AI 편집 초안(MOV-21)을 규칙 파이프라인에서 LLM 에이전트(의도 추론 → 계획 → 툴 호출 → 검토 → 재시도)로 바꾼 이유와
그 구조, 초안 과금(무료 횟수 뒤 크레딧)의 근거. 요구는 [specs/movie.md](../specs/movie.md) MOV-21 · MOV-25 와
[specs/credits-and-payment.md](../specs/credits-and-payment.md) CRD-9, 에이전트가 쓰는 개념과 취향은 [ontology-personalization.md](ontology-personalization.md)
**출처**: 공모전 평가 주제 "Agentic AI, Ontology AI"(2026-10-13 오너와 검토)
**관련 문서**: [backlog.md](../backlog.md) A-12 · A-11 · A-3 · [auto-edit-draft.md](auto-edit-draft.md) · [edit-director.md](edit-director.md) ·
[transition-director.md](transition-director.md) · [snap-content-analysis.md](snap-content-analysis.md) ·
[template-snap-recommendation.md](template-snap-recommendation.md) · [credit-payment-model.md](credit-payment-model.md) ·
착수 계획(보관) [archive/agentic-ontology-rollout.md](../archive/agentic-ontology-rollout.md)

> **정정**(2026-10-16): 구현(`apps/api/src/services/edit-agent/`)이 이 문서와 다른 곳이다.
> ① **툴은 다섯이다** — `select_cuts` · `find_snaps` · `analyze_snaps` · `pick_transitions` · `submit_draft`. §3 그림과 §3.2 표의 `pick_music` · `pick_style` 은
> 없다(backlog A-12). `select_cuts` 가 받는 것은 초점(최대 3) · 컷 수 상한 · 목표 길이(검토에만 쓴다)이고, 장면 흐름의 역할 순서는 넘기지 않는다.
> ② **검토는 규칙뿐이다**(§3.3) — 초점을 정했으면 초점 개념이 보이는 스냅이 컷에 있는가, 목표 길이를 정했으면 길이가 그 1.2배
> (`EDIT_AGENT_LENGTH_TOLERANCE`) 안인가, 컷이 min(2, 쓸 수 있는 스냅 수) 이상인가. LLM 에 따로 묻는 검토와 "첫 컷이 도입 역할인가" 점검은 없다.
> 검토 결과는 `select_cuts` 의 응답(`review`)으로 돌아가고 다시 고를지는 에이전트가 정한다 — 재선택은 2회까지, 모델 왕복은 8회
> (`EDIT_AGENT_MAX_TURNS`)까지이고 넘기면 마지막으로 고른 컷을 쓴다.
> ③ **같은 초안의 재사용은 계획을 다시 실행하지 않는다**(§4) — 재사용 키가 같으면 저장한 결과(`movie_drafts.result`)를 그대로 돌려준다. 계획을 다시
> 실행하면 같은 초안이 나온다는 성질은 `replayDraftPlan` 테스트(`apps/api/test/edit-agent.test.ts`)로 고정돼 있다.
> ④ **재사용 키에는 사용자의 취향 값이 아니라 취향 규칙 버전(`TASTE_POLICY_VERSION`)이 들어간다**(§4, `snapHashOf`) — 재사용 창(24시간) 안에서는
> 취향이 바뀌어도 예전 초안이 돌아올 수 있다([ontology-personalization.md](ontology-personalization.md) 상단 정정).

---

## 1. 배경 — 지금의 "디렉터"는 규칙 코드다

AI 편집 초안은 2026-10-01 에 규칙 파이프라인으로 들어갔다([auto-edit-draft.md](auto-edit-draft.md)). 스테이지 사전
([`stage-vocabulary.json`](../../packages/shared-types/src/stage-vocabulary.json))은 단계를 reader(인식)와 director(결정)로 나누지만, 실제로
모델을 쓰는 것은 인식뿐이다.

| 단계 | 실제 기술 | 모델 |
|---|---|---|
| 로컬 신호(밝기 · 선명도 · 프레임 해시 · 움직임) | FFmpeg + numpy | 없음 |
| 발화 구간 | silero VAD(`faster_whisper.vad`) | 작은 신경망 |
| 내용 분석(semantic reader) | OpenAI vision(`OPENAI_VISION_MODEL`, 구조화 출력) | LLM |
| 자막 | faster-whisper | 음성 인식 |
| edit-director · transition-director | `apps/api/src/services/edit-director.ts` · `transition-director.ts` 의 규칙 + 시드 | 없음 |

"모델은 인식에만 쓰고 선택은 규칙과 시드로 한다"([edit-director.md](edit-director.md) §0)는 재현성과 설명 가능성을 위한
선택이었다. 그러나 이 구조에는 목표를 해석하고, 계획하고, 도구를 골라 부르고, 결과를 보고 다시 판단하는 주체가 없다 —
단계가 항상 같은 순서로 한 번 돌고 끝난다. 공모전이 평가하는 Agentic AI 로 주장하기에 약하다.

## 2. 무엇을 정했나

| 항목 | 결정 |
|---|---|
| 적용 범위 | **AI 편집 초안만.** 스냅 골라 새 무비는 그대로, 템플릿은 흐름을 유지하고 추천 매칭만 온톨로지로 바꾼다(LLM 없음 — [ontology-personalization.md](ontology-personalization.md)) |
| 실행 | AI 편집 초안은 **항상** 에이전트로 만든다. 화면에 자연어 입력은 두지 않는다 — 에이전트가 의도를 추론한다(§3.1) |
| 구조 | LLM 편집 에이전트가 계획하고, 기존 디렉터를 **툴**로 부르고, 검토 단계가 결과를 점검해 다시 시도한다(§3) |
| 결정의 경계 | **판단은 에이전트, 실행은 규칙.** 컷 · 구간 · 전환의 실제 값은 지금처럼 디렉터가 시드로 정한다 |
| 과금 | **하루 무료 3회, 그 뒤 1회 20크레딧.** 24시간 상한 10회는 그대로(§5) |
| 분석 미동의 | 에이전트는 돌고 **분석 툴만 뺀다**(§3.4) |
| 실패 | 에이전트가 실패하면 지금의 규칙 흐름으로 초안을 만든다(폴백). 폴백 초안은 무료다 |

## 3. 구조

```
입력: 넘긴 스냅 · 스타일 프리셋 · (동의 시) 분석 개념 · 로컬 신호 · 촬영 시각 · 취향 프로필
  │
  ▼
LLM 편집 에이전트
  1) 의도 추론   — 개념과 촬영 흐름으로 "무슨 날인가"를 정한다 (예: 카페 투어 하루, 잔잔함, 초점 cafe · dessert)
  2) 계획       — 장면 흐름(도입 · 본론 · 마무리)과 부를 툴의 순서
  3) 툴 호출    — analyze_snaps · find_snaps(concept) · select_cuts · pick_transitions · pick_music · pick_style
  4) 검토       — 의도와 장면 흐름을 만족하는가. 아니면 파라미터를 바꿔 3) 으로 (최대 2회, 잠정)
  5) 확정       — 초안 제안 + 계획 기록(§4)
  │
  ▼
초안 제안 (지금의 `POST /movie-drafts` 응답과 같은 모양) → 앱이 무비를 만든다
```

### 3.1 의도는 화면 입력이 아니라 추론이다

화면에는 자연어 입력이 없다. 에이전트는 스냅의 개념(장소 · 사물 · 행동 · 주제 — [ontology-personalization.md](ontology-personalization.md) §3),
촬영 간격과 순서, 고른 스타일, 사용자 취향으로 의도를 정한다. 나중에 분위기 · 길이 같은 가벼운 입력이 생기면 같은 에이전트가 그
값을 추가 입력으로 받는다.

**에이전트에 보내는 것은 개념 id · 신호 요약 · 촬영 간격 · 취향 상위 개념뿐이다**(2026-10-16 보관한 착수 계획
[archive/agentic-ontology-rollout.md](../archive/agentic-ontology-rollout.md) §2.3 에서 옮김). 프레임 · 분석 원문 · 스냅 id 는 보내지 않는다 — 스냅은
`s1` 같은 별칭으로 부른다. 취향은 크기가 큰 것부터 8개(`EDIT_AGENT_TASTE_TOP`)다. 이미지를 보지 않으므로 에이전트 모델은 분석 모델과 따로 두고
(`EDIT_AGENT_MODEL`, 기본 `gpt-5.6-luna`) 저가 모델부터 잰다. 제공자는 분석과 같은 OpenAI(툴 호출 · 구조화 출력)이고, 키가 없으면 초안은 규칙만으로
만든다(mode `rules`).

### 3.2 툴은 기존 디렉터를 감싼 것이다

| 툴 | 감싸는 것 | 에이전트가 넘기는 것 |
|---|---|---|
| `analyze_snaps` | 내용 분석 요청(`requestAnalysis`) — 이미 있으면 캐시 | 스냅 id 목록(초안 1회 최대 12, MOV-21) |
| `find_snaps` | 온톨로지 검색 — 개념과 그 하위 개념이 보이는 스냅 | 개념 id |
| `select_cuts` | edit-director | 초점 개념 · 목표 길이 · 장면 흐름의 역할 순서 |
| `pick_transitions` | transition-director | 분위기 |
| `pick_music` · `pick_style` | music · style director | 분위기 · 스타일. BGM 음원 조달(A-7) 전에는 프리셋만 |

디렉터 내부의 규칙(거르기 · 중복 · 절반 한도 · 컷은 하나 이상 · 여분 프레임 · 폴백)은 바꾸지 않는다. 에이전트는 그 규칙 **안에서**
고를 수 있는 파라미터만 넘긴다.

**구현(2026-10-13) — `pick_transitions` 는 분위기만 정한다.** 초안 응답에는 전환이 없고 무비는 앱이 만든다(MOV-21). 그래서 에이전트가 경계별
전환을 응답에 실어 앱이 `user`/`ai` 주인으로 보내게 하는 대신(계약 · 앱 변경), 에이전트가 정한 분위기를 계획(`plan.mood`)에 두고, `arranger: ai`
무비가 만들어질 때 서버가 그 무비의 초안(재사용 창 안의 가장 최근 초안 중 무비의 컷을 모두 담은 것 — 취향 신호와 같은 짝짓기)을 찾아 `movies.mood`
로 옮긴다. transition-director 는 AI 경계에서 그 분위기에 어울리는 전환(개념 사전 `suits.transitions`)의 비중을 `EDIT_AGENT_MOOD_BOOST`(잠정 2)배
하고, 스타일의 후보 밖으로는 나가지 않는다. 전환은 계속 AI 몫이라 컷 · 스타일을 바꿔 다시 골라도 같은 분위기를 따른다. 기각한 것: 응답에 경계별
전환을 싣기 — 앱이 컷을 고치면 경계가 바뀌어 다시 골라야 하고, 그때 쓸 근거가 결국 분위기다. 분위기 id 는 툴 정의에 목록(`enum`)으로 두고 한 번만
받는다 — 목록 없이 낸 첫 버전에서 분석에 동의하지 않은 계정의 에이전트가 id 를 지어내 세 번 거절당했다(progress 2026-10-13). 프롬프트 버전 3.

### 3.3 검토

검토는 **규칙 점검을 먼저** 하고, 규칙으로 판단할 수 없을 때만 LLM 에 묻는다. 규칙 점검의 예: 첫 컷이 도입 역할인가, 초점 개념이
컷에 하나 이상 있는가, 목표 길이를 넘지 않는가. 재시도는 최대 2회(잠정)이고, 넘으면 마지막 결과를 쓴다.

### 3.4 분석에 동의하지 않은 사용자

`analyze_snaps` · `find_snaps` 를 빼고 돈다. 에이전트는 촬영 시각 · 로컬 신호 · 스타일 · 분석과 무관한 취향(관심사 · 편집 취향)으로만
추론한다. 분석 동의(ANA-5)는 그대로 서버가 집행한다.

### 3.5 확장 후보 — 스티커(제안, 미결정, backlog A-7)

(2026-10-16 보관한 착수 계획 [archive/agentic-ontology-rollout.md](../archive/agentic-ontology-rollout.md) §2.4 에서 옮김.) 스티커는 트렌드 편집
파이프라인([plans/trend-editing-pipeline.md](../plans/trend-editing-pipeline.md))의 일이고, 에셋 조달([sticker-asset-sourcing.md](sticker-asset-sourcing.md))이
결정 대기라 막혀 있다. 얼굴 · 손 인식(MediaPipe — 스테이지 사전의 `visual-reader`, [`anchor-vocabulary.json`](../../packages/shared-types/src/anchor-vocabulary.json))은
설계만 있고 렌더에 쓰이지 않는다. 붙인다면 그 파이프라인의 "어디에는 MediaPipe, 무엇을은 LLM" 분담이 이 구조와 그대로 맞는다.

- **툴** — `place_sticker` 를 §3.2 에 더한다. 위치(앵커)는 MediaPipe 가, 어느 컷에 어떤 스티커를 붙일지는 에이전트가 정하고, 실제 배치 값은 다른 툴처럼
  규칙과 시드가 정한다.
- **온톨로지 관계** — 스티커(또는 팩)를 내용 개념 · 분위기에 잇는 관계를 사전에 더한다(예: `dessert` → 하트, 청량 → 물방울).
- **취향** — 사용자가 지우거나 바꾼 스티커를 편집 취향 신호로 받는다([ontology-personalization.md](ontology-personalization.md) §4.2 의 전환 · 스타일과
  같은 방식).

## 4. 재현성 — 계획을 저장한다

LLM 출력은 같은 입력에도 달라질 수 있다. 그래서 **에이전트의 계획(의도 · 툴 호출과 파라미터)을 초안 결과와 함께 저장**하고, 같은
초안을 다시 렌더할 때는 저장한 계획을 다시 실행한다. 툴 실행은 지금처럼 시드로 결정적이므로, 계획이 같으면 결과도 같다. 분석 결과를
`video_analyses` 에 버전과 함께 핀하는 것과 같은 원리다([edit-spec-v3.md](edit-spec-v3.md) §1 V3-A5).

재사용 키(지금 `EDIT_DIRECTOR_VERSION` · `SIGNALS_VERSION` 을 넣는 초안 해시)에 에이전트 프롬프트 버전 · 모델 · 개념 사전 버전 ·
취향 프로필 버전을 더한다. 키가 같으면 저장된 결과를 돌려주고 크레딧을 쓰지 않는다(§5).

## 5. 과금

| 항목 | 값 |
|---|---|
| 무료 | 하루 3회 |
| 유료 | 1회 20크레딧 |
| 24시간 상한 | 10회(유료 포함, 변동 없음 — [auto-edit-draft.md](auto-edit-draft.md) §5) |
| 차감 대상 | 에이전트가 끝까지 돌아 만든 초안만. 폴백 초안 · 재사용 결과는 차감하지 않는다 |
| 방식 | 무비 생성과 같은 예약 → 확정(MOV-10) |

- **20크레딧**은 보상형 광고 1회(ADR-1)와 같다. 광고 한 번이 초안 한 번이라는 관계가 단순하고, 무비 생성(100)보다 충분히 싸서
  초안을 여러 번 받아 보는 일을 막지 않는다.
- **하루 무료 3회**는 처음 쓰는 사용자가 결제 없이 기능을 체험하게 하는 몫이다. 단위를 하루로 둔 것은 기존 상한(24시간)과 같은 창이라
  집행과 안내가 하나로 끝나서다.
- 이 결정이 [auto-edit-draft.md](auto-edit-draft.md) §1 의 "초안을 받는 데는 크레딧을 쓰지 않는다"를 대체한다.
- **구현(2026-10-13)**: 무료 횟수는 `movie_drafts` 에서 `mode = agent` 이고 `charged_credits = 0` 인 최근 24시간 행을 센다. 예약은 무비 생성의
  잔액 확인(유저 행 잠금)을 그대로 쓰고, 원장 행에 `movie_draft_id` 를 남겨 한 초안의 비용 · 환급이 한 번씩뿐이게 한다(unique). 무료 횟수는 잠그지
  않고 세서 동시 요청 두 개가 같은 마지막 무료를 함께 쓸 수 있다 — 하루 상한이 범위를 묶고 크레딧을 잘못 빼는 쪽으로는 틀리지 않아 받아들였다.
  분석 동의를 철회하면 초안 기록이 지워져 그날의 무료 횟수 · 상한도 다시 센다(원장은 남는다).

### 5.1 비용 근거(추정)

2026-10-13 기준 제3자 가격표의 `gpt-5.6-luna` 단가(100만 토큰당 입력 $0.20 · 출력 $1.20 — 2026-10-26 OpenAI 공식 가격표에서 같은 값을 확인했다,
Standard · 입력 272K 이하, 캐시 입력 $0.02)와
분석 실측 4건([progress.md](../progress.md) 2026-09-29, 스냅당 입력 약 790 · 출력 약 245 토큰)으로 잡았다.

| 항목 | 토큰 | 1회 비용 |
|---|---|---|
| 스냅 분석 1개 | 실측 | 약 $0.00045 |
| 초안의 분석(새 스냅 12개) | 실측 × 12 | 약 $0.0054 |
| 에이전트 + 검토 | 입력 15~30k · 출력 1~2k(추정, 실측 아님) | 약 $0.004~0.008 |
| **초안 1회 합계** | | **약 $0.01~0.014** |

사용자 한 명이 상한을 모두 쓰는 최악의 날에도 초안 비용은 약 $0.14 다. 에이전트 토큰은 구현 뒤 실측으로 다시 잡는다(A-12).

## 6. 표시 시점이 바뀐다

[auto-edit-draft.md](auto-edit-draft.md) §5 는 초안을 **바로** 보이게 했다. 에이전트는 LLM 왕복이 여러 번이라 수 초가 걸린다. 그래서:

- 초안은 **에이전트가 끝날 때** 나온다. 앱은 그동안 진행 중임을 보인다.
- **분석은 기다리지 않는다**는 원칙은 그대로다. 에이전트는 이미 있는 분석만 쓰고, 이번에 요청한 분석이 늦게 끝나면 **다음 초안**에
  쓴다(분석은 스냅마다 캐시된다).
- 에이전트가 시간 상한(잠정 20초)을 넘기면 폴백 초안을 낸다.

## 7. 그대로 두는 것

- 디렉터의 규칙 · 시드 · 값마다의 주인([auto-edit-draft.md](auto-edit-draft.md) §2.2). 에이전트는 `ai` 주인 값만 정하고, 사용자가 고친 값은
  덮지 않는다(MOV-22).
- 추천 경로에 모델 호출을 더하지 않는다([template-snap-recommendation.md](template-snap-recommendation.md) §7). 에이전트는 초안 경로에만 붙는다.
- 분석의 요청 시점(ANA-1)과 동의(ANA-5) — 업로드 직후 분석은 하지 않는다([ontology-personalization.md](ontology-personalization.md) §6).
- 초안 API 가 무비를 만들지 않고 앱이 `POST /movies` 로 만드는 구조.

## 8. 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| 지금의 규칙 파이프라인으로 Agentic 을 주장한다 | 목표 해석 · 계획 · 툴 선택 · 관찰과 재시도가 없다. "역할을 나눈 자동화"로 읽힌다 |
| 자연어 요청이 있을 때만 에이전트를 돌린다 | 화면에 자연어 입력이 없다. 입력을 새로 만들면 기능이 "요청하는 사람만 쓰는" 부가 기능이 된다 |
| 에이전트가 컷 · 구간 · 전환 값을 직접 낸다 | 재현성과 디렉터 규칙(절반 한도 · 여분 프레임 · 폴백)을 다시 구현해야 하고, 값이 불투명해 회귀를 잡을 수 없다 |
| 초안은 무료 유지 + 상한으로만 막는다 | 에이전트로 초안 원가가 약 2~4배가 된다. 상한만으로는 반복 사용자의 비용을 회수할 길이 없다 |
| 초안마다 크레딧(무료 없음) | 처음 쓰는 사용자가 기능을 체험할 수 없다 |
