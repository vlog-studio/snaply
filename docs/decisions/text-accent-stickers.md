# 텍스트 액센트와 이모지 스티커 — BGM 컷편집 무비의 글과 꾸밈

**작성일**: 2026-10-20
**상태**: 결정(잠정) — 방향(§1 · §2)은 yoojinhee03 가 2026-10-20 데모를 보고 정했다. 미디어/편집 트랙 담당(youngtaek_hong)
검토 전이고, 사전의 글 · 색 · 크기 · 세이프 에어리어 값은 v1 잠정이다
**원천**: BGM 컷편집 무비에 붙는 글(텍스트 액센트)과 이모지 스티커를 무엇으로 고르고 어떻게 놓는지, 말소리 자막과의 관계,
고르는 세 층(사전 · 에이전트 · 생성)의 관계와 생성 글의 문턱, 렌더 방식. 값의 원천은
[`accent-vocabulary.json`](../../packages/shared-types/src/accent-vocabulary.json), 코드는 워커의
[`text_accent.py`](../../apps/ai-worker/src/pipeline/text_accent.py) · [`accent_render.py`](../../apps/ai-worker/src/pipeline/accent_render.py) ·
[`sticker.py`](../../apps/ai-worker/src/pipeline/sticker.py) · [`sticker_render.py`](../../apps/ai-worker/src/pipeline/sticker_render.py) ·
[`ass.py`](../../apps/ai-worker/src/pipeline/ass.py)
**관련 문서**: [specs/movie.md](../specs/movie.md) MOV-27 · MOV-9 · MOV-14 · [plans/trend-editing-pipeline.md](../plans/trend-editing-pipeline.md) §5 ·
[plans/edit-spec-v3.md](../plans/edit-spec-v3.md) §10 · [edit-spec-v3.md](edit-spec-v3.md) §5 · [subtitle-rendering.md](subtitle-rendering.md) ·
[sticker-asset-sourcing.md](sticker-asset-sourcing.md) · [ontology-personalization.md](ontology-personalization.md) · 미결은 [backlog.md](../backlog.md) A-19

---

## 1. 무엇을 왜 — 받아쓰기가 아니라 꾸밈

틱톡 · 릴스형 BGM 컷편집 영상의 글은 사람이 한 말이 아니다. 컷마다 화면에 보이는 것에 맞춰 "꿀꺽", "철썩~", "신난다!!" 같은 의성어 ·
느낌 · 감탄이 박자에 맞춰 튀어나오고, 그 둘레에 이모지 스티커가 붙는다. 말소리 자막(MOV-9, [`ass_caption.py`](../../apps/ai-worker/src/pipeline/ass_caption.py))
과는 출처도 목적도 다르므로 **별개 층**으로 둔다.

| | 말소리 자막 | 텍스트 액센트 + 스티커 |
|---|---|---|
| 내용의 출처 | 말한 것(whisper) | 화면에 보이는 것(스냅 분석의 내용 개념) |
| 목적 | 말을 읽게 한다 | 꾸미고 리듬을 준다 |
| 나오는 방식 | 말하는 동안 계속, 하단 고정 | 컷 · 박자마다 짧게, 자리 · 색 · 글꼴 · 각도가 매번 다르다 |
| 어울리는 영상 | 말하는 브이로그 | BGM 컷편집(말 없음) |

둘은 같은 렌더 부품([`ass.py`](../../apps/ai-worker/src/pipeline/ass.py))을 쓴다. BGM 컷편집 무비에서는 말소리 자막을 기본으로 끈다.
둘이 함께 켜지면 액센트가 자막 띠를 피한다(세이프 에어리어의 하단이 이미 그 띠를 덮는다).

## 2. 고르는 세 층 — 아래 층이 위 층의 폴백

| 층 | 무엇을 하나 | 실패하면 |
|---|---|---|
| **a 사전** | 컷의 내용 개념(content-vocabulary 의 id)을 액센트 사전과 맞춘다. 하위 개념은 상위의 액센트를 물려받는다(커피 → 음료 → 꿀꺽). 아무것도 맞지 않으면 장소 이름으로 키워드(#카페) | 항상 답을 낸다 — 장소도 없으면 그 컷은 쉰다 |
| **b 에이전트** | 무비 전체를 본 AI 편집 에이전트([ai-edit-agent.md](ai-edit-agent.md))가 **사전의 액센트 id** 중에서 고른다 — "앞에서 쾅을 썼으니 여기는 쉬자", "클라이맥스는 크게" | 사전에 없는 id 는 거절(오류), 고르지 않은 컷은 a |
| **c 생성** | 사전에 맞는 것이 없거나 장면이 특별할 때 LLM 이 새 글을 만든다 | 문턱을 못 지나면 버리고 a |

**생성 글의 문턱**(사전 `generated`): 한글 · 공백 · 허용 문장부호(`!?~.`)만, 8자 이하, 금칙어(부분 문자열) 없음. 글꼴에 없는 기호가
끼면 빈 네모로 구워지므로 사전의 글도 같은 문턱을 지난다(테스트). 생성 글은 키워드 종류를 쓸 수 없다.

**생성 글은 스펙에 그대로 고정한다** — 다시 만들 때 LLM 을 다시 부르면 MOV-14(같은 구성이면 같은 결과)가 깨진다. 자주 쓰이고 지워지지
않는 생성 글은 검토를 거쳐 사전에 올린다(트렌드 루프 — [plans/trend-editing-pipeline.md](../plans/trend-editing-pipeline.md) §8.6).
이렇게 사전이 트렌드를 따라가고, 생성은 사전의 빈자리만 메운다.

지금 구현은 **a 전부, b 를 받는 입구(`Override.accent_id`), c 의 생성 코드**까지다(2026-10-20). c 는
[`accent_writer.py`](../../apps/ai-worker/src/pipeline/accent_writer.py)가 **무비 하나에 호출 한 번**으로 컷마다 글 · 종류 · 이모지를 받는다 —
입력은 스냅 분석의 summary · 개념 이름 · 컷 에너지 · 사전이 고른 후보, 모델은 AI 편집 에이전트와 같은 `EDIT_AGENT_MODEL`. 응답은 믿지 않는다:
글은 문턱, 종류는 `generated.categories`, 이모지는 `stickers.generatedPool`(102개)을 지나야 하고, 못 지난 것은 `rejected` 에 남기고 그 컷은 사전으로
돌아간다. 사전 글보다 긴 생성 글이 자리에 들어가지 않으면 글을 80% · 65% 로 줄여 본다(그래도 안 되면 drop). 실제 호출로 품질 · 비용을 잰 적은 아직
없다(로컬에 키가 없었다 — `scripts/try-accent-writer.py`). 에이전트 툴(b)과 렌더 경로 연결은 backlog A-19.

## 3. 모양 — 종류 · 색 · 자리 · 박자 · 모션

**종류 넷**(사전 `categories`)이 글꼴 · 크기 · 자리의 성격을 정한다.

| 종류 | 예 | 글꼴 | 자리의 성격 |
|---|---|---|---|
| 의성어 `sound` | 꿀꺽 · 철썩~ · 찰칵! | Black Han Sans 170px, 굵은 외곽선 | 피사체 위 → 옆 → 빈 모서리 |
| 느낌 `feeling` | 여유~ · 두근두근 · 몽글몽글 | Jua 130px | 피사체 위 → 옆 → 빈 모서리 |
| 감탄 `exclaim` | 신난다!! · 레전드 · 맛집 인정 | Do Hyeon 120px, 라벨 상자 | 빈 모서리에서 외친다 → 피사체 둘레 |
| 키워드 `keyword` | #카페 | Pretendard GOV 64px, 작은 라벨 | 위쪽 띠 → 빈 모서리 |

- **색은 분위기에서** 정한다(사전 `palettes`) — 컷의 첫 분위기 개념, 없으면 음식 · 음료가 보일 때 노랑, 그것도 아니면 흰 글자 검은 테두리.
- **자리**: 종류의 자리 무리를 선호 순으로 보고, 세이프 에어리어 안이면서 피사체 · 아직 화면에 남은 앞 액센트와 겹치지 않는 첫 무리 안에서
  시드로 고른다. 어느 무리에도 없으면 **drop** — 얼굴을 가린 글은 없는 것보다 나쁘다([plans/trend-editing-pipeline.md](../plans/trend-editing-pipeline.md) §5.2).
  자리 이름은 [`anchor-vocabulary.json`](../../packages/shared-types/src/anchor-vocabulary.json)의 `kind.ref` 다. 피사체 상자가 없으면 `object.*` 를 건너뛴다.
- **박자**: 컷 안의 첫 박자에 등장해 종류의 `holdBeats` 만큼 머물고(컷 끝 + 반 박자를 넘지 않음), 다음 박자마다 살짝 튄다. 박자는 **무비에 깔린
  BGM 의 실제 비트**다([`beat_grid.py`](../../apps/ai-worker/src/pipeline/beat_grid.py), 2026-10-21) — 곡마다 한 번 분석해 곡 옆 `<곡>.beats.json` 에 두고, 곡이 무비보다
  짧아 되풀이되면 박자도 되풀이한다. 곡이 없거나 박자를 못 찾으면 120 BPM 고정 간격.
- **모션** 여섯(stamp · shake · pop · pulse · wave · slide)은 전부 ASS 오버라이드 태그라 렌더 의존성이 없다.
- **영상에 맞추기**([`accent_fit.py`](../../apps/ai-worker/src/pipeline/accent_fit.py), 사전 `energy` · `contrast`, 2026-10-20) — 모델을 부르지 않고
  이미 잰 값만 쓴다. ① **에너지**: 컷 구간의 움직임 곡선(`video_signals.motion`) 평균을 무비 안의 다른 컷과 견줘 high · mid · low 로 나누고
  (edit-director 처럼 상대 기준 — 휴대폰 · 장면마다 절대 크기가 달라서), 빠른 컷의 잔잔한 사전 모션은 센 모션으로, 잔잔한 컷의 센 모션은
  잔잔한 모션으로 바꾼다. 스티커 모션도 에너지를 따른다(빠르면 회전 · 흔들림, 잔잔하면 떠오름 · 통통). ② **정점**: 컷 안에서 움직임이
  뚜렷이 치솟으면(평균의 1.6배 이상, 절대 floor 초과) 첫 박자가 아니라 그 순간에 가장 가까운 박자에 등장한다. ③ **대비**: 글자가 놓일 자리의
  배경 휘도(컷 가운데 프레임을 6x10 격자로 줄인 값)와 채움색의 휘도 차가 0.3 미만이면 채움 · 외곽선을 맞바꾼다 — 밝은 하늘에 흰 글자가 묻히지
  않게. 상자 종류는 상자가 대비를 만들므로 그대로. 입력(`accent_inputs.py`)이 없으면 사전 값 그대로다. 바뀐 것은 액센트의 `notes` 에 남는다.

**이모지 스티커**(사전 `stickers`): 같은 내용 개념에서 이모지를 골라(분위기가 활기 · 감성이면 반짝이를 더함) 컷마다 1~3개를 반 박자씩
늦게 차례로 붙인다. 피사체 가장자리에 반쯤 걸치게(흰 칼선 스티커 모양) 붙이고, 같은 컷의 액센트와 서로를 피한다. 바로 앞 컷에
붙인 이모지는 뒤로 미룬다 — 같은 장소가 이어져도 스티커가 똑같이 되풀이되지 않게(글의 cooldown 과 같은 이유).

## 4. 렌더 — 글은 ASS, 스티커는 투명 트랙 한 장

- **글**: ASS 문서를 ffmpeg `ass` 필터(libass)로 굽는다. 글꼴은 워커 이미지에 넣은 [`assets/fonts/`](../../apps/ai-worker/assets/fonts/README.md)만
  쓰고(`fontsdir` 를 항상 넘김), 스타일의 글꼴 이름은 그 파일의 **패밀리 이름**과 같아야 한다 — 말소리 자막이 `Pretendard` 를 요청했는데
  파일이 `Pretendard GOV` 라 libass 가 DejaVu 로 대체해 한글이 전부 빈 네모로 구워진 것을 2026-10-20 데모에서 찾았다. 이제
  `tests/test_ass.py` 가 패밀리 이름을 묶고, ffmpeg 계약 테스트가 libass 의 "Glyph not found" 를 실패로 본다.
- **스티커**: libass 는 컬러 이모지를 못 그린다(FreeType 가 COLR/CBDT 를 렌더하지 않음). 그래서 Pillow 로 프레임마다 그려 **길이 전체의
  RGBA 트랙 한 장**(qtrle .mov)으로 굽고 overlay 한 번으로 합성한다 — 스티커가 늘어도 필터그래프가 평평하다.
- **겹치는 순서**: 영상 → 스티커 → 글.

## 5. 결정론

모든 선택(동점 · 자리 · 기울기 · 스티커 수 · 모션)은 `sha256("{stage_seed}:{cut_id}:{축}")` 으로만 갈린다. `stage_seed` 는
`seed.derive_stage_seed(root, "style-director", attempt)` 다([edit-spec-v3.md](edit-spec-v3.md) §5) — "스티커만 다시"는 이 스테이지의 attempt 만
올려 컷 · 전환을 건드리지 않는다. 사전을 바꾸면 같은 구성의 결과가 바뀌므로 `accentVocabularyVersion` 을 올린다.

## 6. 기각한 대안

- **`drawtext` + 컬러 이모지 글꼴** — libfreetype 경로가 컬러 글리프를 못 그려 흑백 · 빈 상자가 된다.
- **c 만(LLM 이 매번 자유 생성)** — 이상한 글이 그대로 영상에 구워지고, 다시 만들 때마다 결과가 바뀐다. 사전이 기반이어야 한다.
- **a 만(사전만)** — 일관되지만 트렌드를 못 따라간다. 생성 글을 검토해 사전에 올리는 길이 있어야 한다.
- **스티커마다 overlay 필터를 잇기** — 다섯 개를 넘으면 필터그래프가 지저분해지고 프레임마다의 모션(통통 · 흔들림)을 시간 표현식으로 쓰기 어렵다.
- **매 프레임 LLM 으로 자리 찾기** — 비용 · 지연이 감당되지 않는다. 자리는 피사체 상자와 규칙으로, 무엇을은 사전 · 에이전트로 나눈다.

## 7. 결과물에 붙이기(2026-10-21)

편집 워커가 BGM 을 입힌 뒤 굽는다([`accent_stage.py`](../../apps/ai-worker/src/pipeline/accent_stage.py), `worker.py` 3-1 단계). **`TEXT_ACCENTS_ENABLED=true` 일 때만,
컷이 timeline 에 있는 v3 무비만** — 기본 꺼짐이라 운영 결과물은 켜기 전까지 그대로다. (2026-10-22 덧붙임: 이 플래그는 classic 무비만 켜고 끈다.
레시피 무비(MOV-28)는 레시피의 글 · 스티커 · 고정 타이틀이 이 단계에 있어 플래그와 상관없이 굽는다 — backlog H-19 (a))

- 입력: 컷의 원본 구간(결과물 경계는 컷 길이의 누적 — 겹침 전환은 경계 양쪽에 반씩 걸친다), 스냅의 최신 완료 분석(동의한 스냅만 있다 — 워커가
  [`content.py`](../../apps/ai-worker/src/pipeline/content.py)로 개념 id 로 바꾼다, TS 와 공유 사례 `fixtures/content-normalization.json` 으로 묶음), `video_signals.motion`,
  원본 대표 프레임, 무비에 고른 BGM 의 비트
- 층 a + 영상 맞춤만 쓴다 — 생성(층 c)은 렌더 때 부르지 않는다. 시드는 무비 id 에서 만든다(editSpec v3 에 seed 가 들어오면 그 root)
- 실패하면 이 단계 없이 간다(BGM · 자막과 같은 원칙). 붙일 것이 없으면 다시 인코딩하지 않는다
- 아직: 고른 결과를 구성에 핀으로 남기지 않는다 — 같은 무비는 입력(분석 · 신호 · 곡 · 사전 버전)이 같으면 같은 결과지만, 분석을 다시 하거나 사전을 바꾸면
  다시 만든 결과가 바뀐다(MOV-14). 피사체 상자가 없어 빈 모서리 · 위쪽 띠에만 놓인다

## 8. 아직 아닌 것

미결과 완료 조건은 [backlog.md](../backlog.md) A-19 에만 둔다 — 고른 결과를 구성에 핀으로(editSpec v3 `overlays`), 운영에서 켜기, 스냅 분석의 피사체 상자,
에이전트 툴(b) · 생성 호출(c), 내용 개념 사전에 없는 장면(점프 · 강아지 · 달리기 등), 실제 BGM 의 비트(A-7), 에셋 라이선스 확인,
앱 미리보기.
