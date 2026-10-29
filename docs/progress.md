# Snaply 모노레포 개발 진행 기록

**작성일**: 2026-07-22
**상태**: 현행 — 이번 달의 끝난 구현·검증만 담는다. 지난달은 archive 로 옮기고, 닫히지 않은 작업은 [backlog.md](./backlog.md)에 있다
**원천**: 완료된 구현·검증 결과와 그때 찾은 결함의 기록. 각 항목은 그 시점 기준이라 현재 구조·명령은
[README.md](../README.md)·[ONBOARDING.md](../ONBOARDING.md), 현재 스키마·계약은 `apps/api/prisma/schema.prisma`와
[`packages/shared-types/src/contract/`](../packages/shared-types/src/contract/)(Zod 계약, Swagger 의 원천)가 우선한다
**관련 문서**: [backlog.md](./backlog.md) · [archive/progress-2026-09.md](./archive/progress-2026-09.md) ·
[archive/progress-2026-08.md](./archive/progress-2026-08.md) · [archive/progress-integrations-2026-08.md](./archive/progress-integrations-2026-08.md) ·
[archive/progress-phase-1-9.md](./archive/progress-phase-1-9.md)

항목 제목은 `## YYYY-MM-DD — 제목`, 같은 날 이어지면 `## YYYY-MM-DD (이어서) — 제목`이다
([doc-conventions.md](./doc-conventions.md) §본문). 날짜로 찾고, 새 항목은 문서 끝에 붙인다. 이미 쓴 항목은
그 시점의 기록이라 본문을 현재에 맞게 고치지 않는다.

**이번 달만 둔다**(2026-10-16 오너 결정). 달이 바뀌면 지난달 항목을 `archive/progress-YYYY-MM.md` 로 옮기고(상단 보관 배너를 붙이고
상대 링크 경로만 고친다) 아래 목록에 한 줄을 더한다. 옮긴 기록도 **완료 기록**이라 무엇을 언제 어떻게 검증했는지의 근거로 인용할 수
있다 — 지금의 동작은 코드와 [specs/](./specs/README.md)가 원천이다. 지난 기록:

- 2026-09 — [archive/progress-2026-09.md](./archive/progress-2026-09.md)
- 2026-08(08-04 ~ 08-20) — [archive/progress-2026-08.md](./archive/progress-2026-08.md)
- 연동/수익화 트랙 하드닝(2026-08-03 ~ 08-10, 이후 제거된 Stripe 실키 검증 포함) —
  [archive/progress-integrations-2026-08.md](./archive/progress-integrations-2026-08.md)
- Phase 1~9(초기 개발, ~2026-08-03) — [archive/progress-phase-1-9.md](./archive/progress-phase-1-9.md)

뒤의 둘은 이 규칙 전에 나눈 것이고 이후 뒤집힌 내용이 있다(Stripe 구독·월 3편 제한은 제거됨). 다른 문서가 `progress 2026-09-09 "제목"`
처럼 날짜로 가리키는 항목은 이 문서와 archive 를 함께 찾는다:
`grep -n '^## 2026-09-09' docs/progress.md docs/archive/progress-*.md`. 착수 전 계획서는
[archive/snapvlog-backend-guide.md](./archive/snapvlog-backend-guide.md), Dev B → Dev A 인수인계 기록은
[archive/integrations-handover.md](./archive/integrations-handover.md)(확인 완료).

---

## 2026-10-01 — Android 실기기에서 영상 두 개를 겹친 `crossfade`(backlog A-11 ①)

2026-09-28 에 Android 에뮬레이터에서만 실패한 `crossfade` 를 오너의 Galaxy S22 Ultra(dev 빌드)에서 다시 돌렸다. 같은
구조의 임시 화면(`expo-video` 플레이어 둘 · `surfaceType="textureView"` · 감싼 `Animated.View` 의 불투명도)을 만들어
돌린 뒤 지웠다(커밋하지 않음). 클립은 720×1280 H.264 High 세 개 — 처음에는 단색, 마지막에는 시간에 따라 초록 성분이
늘어나는 색(전환 중에도 영상이 움직이는지 보려고). 각 클립의 0.5~2.5초를 쓰고 앞뒤 0.5초를 여분 프레임으로 남겼다.
`screenrecord` 를 30fps 로 풀어 무대 색을 프레임마다 읽었고, 각 경우를 두 번씩 돌렸다.

| 경우 | 결과 |
|---|---|
| `hardcut` · `dip` · `flash` | ✅ |
| `crossfade` — 들어오는 컷을 위에, 또는 나가는 컷을 위에(쌓는 순서를 바꿈) | ❌ 에뮬레이터와 같다. 위 영상이 반투명인 동안 아래 영상이 검다 |
| `crossfade` — 쌓는 순서 고정 | ❌ 같다. 순서 변경이 원인이 아니다 |
| `crossfade` — 감싼 뷰에 `needsOffscreenAlphaCompositing` 만 | ❌ 같다 |
| `crossfade` — 감싼 뷰에 `renderToHardwareTextureAndroid` | ✅ 두 색이 고르게 섞이고(중간 프레임 R≈B), 섞이는 동안 두 영상 모두 계속 움직인다 |
| `crossfade` — `renderToHardwareTextureAndroid` 를 페이드 0.8초 동안만 켬 | ✅ 켜고 끄는 순간 깜빡임이 없다 |
| `crossfade` — 나가는 컷의 프레임을 이미지로 올려 사라지게 | ✅ 섞이지만, 이미지 소스를 바꿀 때 이전 이미지가 한 프레임 보였다 |

- **영상 두 개를 겹친 `crossfade` 는 Android 실기기에서 된다** — 페이드하는 플레이어를 감싼 뷰에 그 동안만
  `renderToHardwareTextureAndroid` 를 켠다. 정지 프레임 방식(계획 §2.1의 대안)은 필요 없다.
- 전환 시작 오차(플레이어 시계 기준)는 -1~21ms 였다. `timeUpdate` 를 50ms 간격으로 받고 남은 시간을 타이머로 보정했다.
- `zoompunch` 는 단색 클립이라 배율 변화를 색으로 읽지 못해 이번에 확인하지 않았다(에뮬레이터 확인은 2026-09-28).

## 2026-10-01 (이어서) — 전환 어휘와 사용자 수정의 무효화 액션(backlog A-7 · A-11)

경계별 전환(MOV-22)의 첫 단계로 전환 `kind` 를 닫힌 집합으로 만들고, 사용자가 구간·전환을 고칠 때의
무효화 판단을 사전에 넣었다. 아직 무비 계약·렌더·앱이 쓰지 않는 어휘다.

- **`transition-vocabulary.json`(신규)** — v1 5종 `hardcut` · `crossfade` · `dip` · `flash` · `zoompunch`.
  종류마다 timing(경계형/겹침형) · 길이 범위(정수 ms, 범위 밖은 거부) · 경계형의 걸침 비율 · easing · 폴백
  (`hardcut`)을 담는다. `crossfade` 상한은 지금 `감성` 프리셋의 0.8초를 표현하도록 800ms 로 잡았다(계획의
  툴 카드는 600 이었다). TS `transition.ts`, 워커 `pipeline/transition.py` 가 같은 파일을 읽고, 워커는 기동 시
  검증 목록(`vocabulary.REQUIRED`)에 넣었다.
- **해석 규칙 `resolveTransition` / `resolve_transition`** — 고른 전환을 경계 양쪽 컷의 길이·여분 프레임에 맞춰
  줄이고, 사전의 최소 길이보다 짧아지면 `hardcut` 으로 바꾼다. 겹침형은 양쪽 여분 프레임의 두 배와 양쪽 컷
  길이를, 경계형은 걸치는 몫이 컷 절반을 넘지 않게 상한을 잡는다. 앱 미리보기와 렌더가 같은 답을 내야 하므로
  두 구현을 공용 픽스처 `packages/shared-types/fixtures/transition-resolution.json`(15건, 정확히 최소 길이 ·
  여분 0 · 컷 절반 같은 경계값 포함)으로 함께 검사한다.
- **무효화 사전에 `cut-trim` · `transition-edit`** — 둘 다 `attempt` 를 올리지 않는다. 트림은 컷 쌍이 그대로라
  전환을 다시 고르지 않고 길이만 다시 해석한다(`timeline.transitions: retimed`). 전환 하나를 바꾸면 겹침형도
  여분 프레임을 써서 무비 길이가 컷 길이의 합이라 컷이 움직이지 않는다(`timeline.cuts: preserved`) — 전환과
  효과음만 무효화한다. 셀별 근거는 사전의 `note`.
- **자동 검증**: API 테스트 473개(전환 어휘 신규 · 무효화 규칙 2개 추가) · 워커 155개(Docker 이미지, ffmpeg 포함) ·
  모바일 `npm run verify:mobile` 152 suites / 1211 tests · shared-types·API lint·typecheck 통과.

## 2026-10-01 (이어서) — 무비 계약에 경계별 전환과 그 주인(MOV-22, backlog A-11)

모든 무비의 컷이 다음 컷으로의 전환을 갖고, 그 전환을 누가 골랐는지 남는다. 앱 화면과 렌더는 아직 이 값을
쓰지 않는다(생성은 지금도 `stylePreset` 하나로 전환을 정한다).

- **스펙**: MOV-22 에 규칙을 구체화했다 — 모든 무비에 적용 · 경계마다 `ai`/`user` · 사용자 전환은 두 컷이
  이어진 동안만 · 들어가지 않으면 짧아지거나 바로 넘기지만 고른 값은 남음 · 무비 길이는 컷 길이의 합.
- **DB**: `movie_clips` 에 `transition_kind`(varchar — 새 종류가 마이그레이션을 요구하지 않게) · `transition_ms` ·
  `transition_owner`(`MovieArranger`, 기본 `ai`). 마이그레이션 `20261001000000_add_movie_clip_transitions` 가 기존
  무비를 지금 렌더되는 값으로 채운다(`감성` = `crossfade` 800ms, 나머지 `hardcut`, 마지막 컷 NULL). 별도 DB 에
  감성·여행·컷 없는 무비를 넣고 적용해 그대로 채워지는 것을 확인했다.
- **계약**: 응답 컷의 `transition`(`kind` · `durationMs?` · `owner`, 마지막 컷 `null`)과 입력 컷의 선택 `transition`.
  보낸 경계만 `user` 이고 나머지는 서버가 고른다. 범위 밖 길이 · `hardcut` 의 길이 · 마지막 컷의 전환은 400.
  `arranger: ai` 정렬로 두 컷이 떨어지면 그 사용자 전환은 버리고 AI 가 고른다. 스타일만 바꾸면 `ai` 경계만
  다시 고른다. `openapi.json` 재생성 · [api-spec.md](./api-spec.md) 갱신.
- **AI 의 선택**: `services/transition-director.ts` — 지금은 스타일 기본값이라 경계별 저장으로 바뀐 뒤에도 사용자가
  보는 결과가 그대로다. 규칙은 다음 단계(backlog A-11).
- **자동 검증**: API 테스트 486개(경계 전환 13개 신규) · 모바일 `npm run verify:mobile` 152 suites / 1211 tests ·
  shared-types·API lint·typecheck. 앱은 자체 DTO 스키마가 모르는 필드를 걸러 내 영향이 없다.
- **사고**: 백필 검증 중 URL 치환(`sed`)이 macOS 에서 동작하지 않아 이 마이그레이션이 **개발 DB(`snaply`)에 먼저
  적용됐다.** 추가 전용 변경이고 기존 일상 무비 4개의 컷 4개가 의도대로 채워졌다(main 코드는 새 열을 모르고
  기본값이 있어 그대로 동작한다). 검증은 치환 결과를 확인한 뒤 별도 DB 에서 다시 했다.

## 2026-10-01 (이어서) — 경계별 전환의 렌더(editSpec v3 · `edit-v3` 큐, backlog A-11)

무비를 생성하면 경계마다 고른 전환이 결과물에 들어간다. 편집 화면의 선택·미리보기(MOV-22 의 나머지)는 아직이다.

- **editSpec v3** — v3 초안의 `timeline` 부분만 먼저 쓴다: `timeline.cuts`(`cutId`·`videoId`·`sourceInMs`·
  `sourceOutMs?`)와 이어진 두 컷마다의 `timeline.transitions`(`fromCutId`·`toCutId`·`kind`·`durationMs?`). 색보정·
  음악은 아직 `stylePreset` 이 정한다. 무비 생성만 v3 를 쓰고 `POST /edit-jobs` 는 v2 그대로다. 최상위 `clips` 는
  v3 작업에 싣지 않는다.
- **큐 분리** — v3 는 `EDIT_V3_QUEUE_NAME`(기본 `edit-v3`)으로만 간다. 구버전 워커는 이 큐를 모르므로 전환을 버리고
  v2 로 "성공"하는 일이 없다(edit-spec-v3.md §4). 워커는 두 큐를 같은 처리기로 소비하고 스펙 버전이 경로를 가른다.
  `env-spec.ts` · `.env.example` · `docker-compose.yml` 에 넣었다(기본값이 있어 운영 주입은 필요 없다).
- **워커 렌더(`editor.edit_timeline`)** — 원본 길이를 재서 경계마다 `resolve_transition` 으로 해석한다(앱과 같은
  규칙·픽스처). `crossfade` 는 양쪽 컷을 여분 프레임으로 절반씩 늘려 정규화한 뒤 `xfade`·`acrossfade` 로 겹쳐 무비 길이가
  컷 길이의 합이 된다. `dip`·`flash` 는 각 컷 끝·앞의 `fade`(검정·흰색), `zoompunch` 는 들어오는 컷의 `zoompan`
  (1.08 → 1.0, easeOutCubic)이다. 빠진 경계를 hardcut 으로 채우지 않고 실패시킨다.
- **ffmpeg 함정 두 가지** — `xfade` 는 두 입력의 타임베이스가 같아야 해서 구간마다 마지막에 `settb=AVTB` 를 둔다(`fps` 가
  타임베이스를 다시 바꾸므로 그 뒤에). `zoompan` 은 출력 타임베이스를 1/fps 로 선언하면서 입력 pts 를 그대로 써서, 2초 컷이
  17분짜리가 되고 뒤의 `fps` 가 프레임을 복제하느라 메모리가 바닥났다 — 앞에서 `fps,settb=1/fps,setpts=N` 으로 맞춘다.
- **자동 검증**: API 487개(생성이 v3 스펙으로 `edit-v3` 큐에만 들어가고 작업 API 가 같은 스펙을 돌려주는 것 포함) · 워커
  164개(Docker 이미지, `REQUIRE_FFMPEG=1`) — 실제 ffmpeg 로 길이가 컷 합인지, 경계 프레임이 섞이고(crossfade) 어두워지고
  (dip) 확대에서 제자리로 오는지(zoompunch), 여분이 없으면 바로 넘기는지를 색으로 읽는다 · 모바일 `verify:mobile` 1211개.
- **로컬 끝-끝 확인** — 이 브랜치 코드를 마운트한 임시 편집 워커를 개발 인프라에 붙이고, 개발 계정의 실제 스냅 3개
  (0.5~2.5초씩, 경계에 사용자 `crossfade` 500ms · `dip` 400ms)로 무비를 만들어 서비스 함수로 생성했다. 워커가 `edit-v3` 에서
  받아 렌더·업로드까지 마쳤고(`done`), 결과는 1080×1920 · 6.04초, 경계 프레임이 각각 반씩 섞이고 어두워졌다. 확인 뒤 무비 ·
  작업 · 결과 영상 · 크레딧 예약 기록 · MinIO 파일 · 큐 항목을 지웠다(잔액 200 그대로).

## 2026-10-01 (이어서) — AI 가 경계마다 전환을 고르는 규칙 · `crossfade` 폴백을 `dip` 으로

사용자가 고르지 않은 경계에 서버가 넣는 전환을 스타일 기본값에서 규칙으로 바꿨다. 근거·기각한 대안은
[decisions/transition-director.md](./decisions/transition-director.md).

- **폴백(오너 결정)** — 앱은 컷을 기본으로 잘라 두지 않아 트림하지 않은 컷에는 여분 프레임이 없다(개발 DB 의 컷이
  전부 그랬다). 그대로면 감성의 `crossfade` 가 대부분 `hardcut` 이 되므로, `crossfade` 가 최소 길이보다 짧아지면
  `dip`(400ms)으로 다시 해석한다. 사전 `fallback` 한 값의 변경이라 앱 미리보기·API·워커가 같이 따른다. 공용 픽스처를
  17건으로 늘렸다(→ `dip`, `dip` 마저 안 들어가면 `hardcut`, 짧은 컷에 맞춰 줄어드는 `dip`). 워커 계약 테스트는 여분이
  없는 경계가 섞이지 않고 어두워지는 것을 색으로 본다.
- **규칙(`services/transition-director.ts`)** — 장면 전환(촬영 시각 30분 이상: 일상 `dip` 400 · 감성 `dip` 600 · 여행
  `flash` 200) → 여행의 첫 경계 `zoompunch` 300 → 같은 장면은 시드로(일상 `hardcut` · 감성 `crossfade` 800 80%/`dip`
  500 20% · 여행 `hardcut` 70%/`zoompunch` 20%/`flash` 10%). 시드는 경계 위치가 아니라 두 컷이 키라 다른 곳의 순서를
  바꿔도 이어진 두 컷의 전환은 그대로다. 컷 길이는 입력이 아니다(트림은 다시 고르지 않는다). 무비 id 가 시드에 들어가므로
  `POST /movies` 에 id 가 없으면 서버가 저장 전에 정한다.
- **스펙**: MOV-6 을 "프리셋이 AI 가 고르는 전환의 경향을 정한다"로, MOV-22 의 폴백 문장을 고쳤다.
- **자동 검증**: API 테스트 501개(규칙 10개 신규 · 경계 전환 테스트는 기대값을 규칙 함수로 계산해 시드 운에 기대지 않게) ·
  워커 164개(Docker 이미지, `REQUIRE_FFMPEG=1`) · 모바일 `npm run verify:mobile` 152 suites / 1211 tests · lint·typecheck.

## 2026-10-01 (이어서) — 앱: 경계별 전환 고르기와 미리보기(MOV-22, backlog A-11)

스튜디오에서 컷 사이 전환을 경계마다 보고 고를 수 있다. 기능 문서는
[apps/mobile/docs/features/movie.md](../apps/mobile/docs/features/movie.md) "Transitions between cuts".

- **데이터** — `SnapRef.transition`(종류 · 길이 · 주인 · 이끌던 다음 컷 `toSnapId`). 읽을 때 서버의 선택을 그대로 담고,
  보낼 때는 사용자 선택 중 아직 그 다음 컷으로 이어지는 것만 싣는다 — 순서를 바꿔 떨어진 경계는 서버가 다시 고른다.
  편집 기록은 컷 구성만 비교해 서버가 채워 준 선택을 바깥 편집으로 오인하지 않고, 렌더 이후 변경 감지와 되돌리기는
  전환까지 비교한다. 전환 사전과 해석 규칙은 앱에 사본을 두고(계약 패키지는 아직 앱 번들에 넣지 않는다 — B-5) 테스트가
  서버 사전과 공용 픽스처로 대조한다.
- **미리보기** — 무대가 경계를 렌더와 같은 규칙으로 맞춰 재생한다. `crossfade` 는 두 플레이어를 여분 프레임으로 겹치고
  위 슬롯만 페이드하며 그 동안 `renderToHardwareTextureAndroid` 를 켠다. `dip`·`flash` 는 색 오버레이, `zoompunch` 는
  들어오는 슬롯의 확대. 경계 직전 보고에서 남은 시간을 타이머로 채워 시작이 늦지 않게 했다. 멈추거나 건너뛰면 전환을
  치우고 시계가 가리키는 컷에 선다.
- **고르기** — 컷 줄 아래 경계마다 칩(자동은 청록, 직접 고름은 주홍, 고르는 중은 `…`). 누르면 `자동으로 고르기` + 다섯 전환
  시트. 고르면 시트가 닫히고 그 경계를 1초 전부터 재생한다. 들어가지 않는 선택은 `검게 넘기기로 보여요` 처럼 보일 모습을
  적는다. UX 용어표에 `전환`·`자동으로 고르기` 를 넣었다(화면에 "AI" 라는 말을 쓰지 않는다).
- **자동 검증**: 모바일 `npm run verify:mobile` 156 suites / 1262 tests(전환 사본 대조 31 · DTO · 편집 훅 · 재생 목록의 경계 계획 ·
  시트 행).
- **Android 에뮬레이터(API 35, dev 빌드, 로컬 API)** — 스냅 3개로 새 무비 → 서버가 고른 경계가 칩으로 읽혀 옴(일상 · 같은
  장면 → `바로 넘기기 · 자동`) → 칩 → 시트(`자동으로 고르기 · 지금 바로 넘기기`) → `겹쳐 녹이기` → `PATCH` 후 DB 에
  `crossfade 500 user`, 다른 경계는 `hardcut ai` → 칩이 `직접 고름` → 미리보기에서 트림하지 않은 컷의 `crossfade` 가
  어두워졌다 밝아지는 `dip` 으로 재생. 에뮬레이터는 평소에도 0.5초마다 무대가 검게 깜빡여 전환 그림의 판정은 실기기로 미뤘다
  (backlog A-11).

## 2026-10-01 (이어서) — 경계별 전환 실기기 확인(MOV-22 `구현됨`, backlog A-11)

오너의 Galaxy S22 Ultra(dev 빌드, 로컬 API, 이 브랜치 코드를 마운트한 임시 편집 워커)에서 확인했다.

| 확인 | 결과 |
|---|---|
| 서버 값 읽기 | 각 컷을 0.5~2.5초로 트림하고 경계를 사용자 `crossfade` 600 · `flash` 200 으로 바꾼 서버 값이 앱에 그대로 읽혀 왔다 — 눈금 6초, 칩 `겹쳐 녹이기 · 직접 고름` · `번쩍 넘기기 · 직접 고름` ✅ |
| `crossfade` 미리보기 | 두 영상이 움직이는 채로 겹쳐 섞인다. 검게 나오지 않는다 ✅ |
| `flash` 미리보기 | 흰 프레임을 지나 다음 컷 ✅ |
| 미리보기 = 결과물 | 앱의 `무비 만들기` 로 실제 생성(editSpec v3 · `edit-v3` 큐 · `crossfade:600`, `flash:200`) — 결과물 6.015초. flash 정점으로 두 영상을 맞추자(렌더 4.0초) crossfade 구간은 15fps 로 한 프레임 이내, flash 는 30fps 로 한 프레임 이내로 같은 흐름이었다 ✅ |
| 폰에서 고르기 | 칩 → 시트 → `확대하며 넘기기` → 시트가 닫히고 경계 1초 전부터 자동 재생, DB `zoompunch 300 user`, 칩이 확대 아이콘으로 ✅ |
| `zoompunch` 미리보기 | 경계 직후 첫 프레임이 확대돼 들어와 제자리로 돌아온다 ✅ |

- 정리: 테스트 무비 · 편집 작업 · 결과 영상 · 크레딧 예약 기록(잔액 200 그대로) · MinIO 파일 · 큐 항목을 지웠고, 폰과
  에뮬레이터 모두 다시 읽은 뒤 그 무비가 사라졌다. 임시 워커와 API 는 내렸다.
- 기록용 화면 녹화는 확인 뒤 지웠다(가족 영상이 담겨 있다).

## 2026-10-01 (이어서) — 컷 역할 사전(MOV-21 1단계, backlog A-11·A-7)

AI 편집 초안(MOV-21)을 시작했다. 상한·표시 시점·미업로드·빠진 스냅은 오너가 정했다([결정 §5](./decisions/auto-edit-draft.md)).

- **사전** — [`cut-role-vocabulary.json`](../packages/shared-types/src/cut-role-vocabulary.json): 역할 v1 일곱(계획 §3)과
  자리(`first`·`last`·`any`), 판단에 쓰는 신호와 그 출처(`capture`·`local`·`analysis`). 사용자에게 보이지 않는 값이라
  `label` 이 없고 앱 사본도 두지 않는다. 첫·마지막 자리는 `hook`·`closer` 로만 채우고, 컷이 하나면 `hook` 이다.
  분석이 꺼지면 분석 신호만 쓰는 `establish`·`detail` 은 판단할 수 없어 기본값 `body` 로 남는다.
- **TS** `cut-role.ts`(`cutRolesAllowedAt`·`isCutRoleJudgeable`) · **워커** `pipeline/cut_role.py`(`validate_role`) 와
  기동 검증 목록 `REQUIRED`. editSpec v3 의 `cuts[].role` 에 싣는 일은 초안 제안 API 와 함께 한다.
- **자동 검증**: API 514개(사전 대조·자리 규칙 13 신규) · 워커 173개(Docker 이미지, `REQUIRE_FFMPEG=1`, 9 신규) · 모바일
  `npm run verify:mobile` 156 suites / 1262 tests. `REQUIRED` 에서 새 사전을 빼면 `test_vocabulary` 가 실패하는 것을 확인했다.

## 2026-10-01 (이어서) — 무비 계약: 컷 구간의 주인(MOV-21 3단계, backlog A-11)

- **스펙** — MOV-22 에 "구간도 AI 가 자른 것이거나 사용자가 자른 것이고 무비에 남는다"를 넣었다. AI 가 자르는 것은 초안뿐이라
  직접 고른 무비와 이전 무비의 구간(스냅 전체 포함)은 사용자 것이다.
- **마이그레이션** `20261001010000_add_movie_clip_trim_owner` — `movie_clips.trim_owner`(`MovieArranger`, 기본 `user`). 전환의
  기본값 `ai` 와 반대인 이유는 지금까지의 구간이 모두 사용자가 정한 것이라서다.
- **계약** — 응답 컷에 `trimOwner` 를 항상 싣고, 입력은 선택(생략하면 `user`). 주인은 컷을 따라간다 — `arranger: ai` 정렬로 사용자
  전환이 떨어지는 컷도, 스타일만 바꿔 다시 저장하는 컷도 주인을 잃지 않는다. `openapi.json` · [api-spec.md](./api-spec.md) 갱신.
- **자동 검증**: API 520개(주인 계약 6 신규 — 정렬로 전환이 떨어지는 경로에서 주인을 빼면 실패하는 것을 확인) · 워커 173개(Docker,
  `REQUIRE_FFMPEG=1`) · 모바일 `npm run verify:mobile` 156 suites / 1262 tests. 앱은 아직 `trimOwner` 를 보내지 않으므로 앱의
  저장은 모두 `user` 다 — 초안 흐름(5단계)에서 붙인다.

## 2026-10-01 (이어서) — 스냅 로컬 신호(MOV-21 4단계, backlog A-11)

- **워커** [`pipeline/snap_signals.py`](../apps/ai-worker/src/pipeline/snap_signals.py) — 밝기 · 흐림(라플라시안 분산) · 대표 프레임
  셋의 8×8 평균 해시 · 100ms 마다의 움직임 · silero VAD 발화 구간. 모델을 부르지 않고 새 의존성도 없다(numpy · VAD 는
  faster-whisper 에 이미 있다). 합성 3초 클립 하나에 0.35초.
- **렌디션 워커** — 렌디션을 반영한 뒤 받아 둔 원본으로 신호를 계산해 `video_signals` 에 upsert 한다. 신호가 실패해도
  렌디션은 성공이다. `only: "signals"` 작업은 렌디션 없이 신호만 계산한다(예전 스냅용, 적재는 초안 API 에서).
- **DB** `20261001020000_add_video_signals` — 스냅당 한 행, `signals_version`. 지운 스냅에는 쓰지 않고, 스냅 파일 purge
  (만료·회수 배치) 때 함께 지운다. 분석 동의와 무관하다.
- **자동 검증**: 워커 196개(Docker, `REQUIRE_FFMPEG=1`, 23 신규 — 검은 화면은 어둡고, 흐린 사본은 선명도가 1/10 아래로
  떨어지되 해시는 같고, 정지 화면은 움직임이 0, 가로 스냅도 같은 짧은 변으로 읽고, 무음은 발화가 없다) · API 522개(purge 2
  신규) · 모바일 1262 tests. `save_signals` 의 SQL 은 `snaply_test` 에 실제로 써서 삽입 · 덮어쓰기 · 지운 스냅 거부를 확인했다.
  두 마이그레이션은 `prisma migrate diff` 로 스키마와 어긋나지 않음을 확인했다(남은 차이는 이전 테이블의 기본값·인덱스
  이름뿐이다).
- 문턱값은 아직이다 — 실제 스냅의 분포로 정한다(backlog A-11).

## 2026-10-01 (이어서) — 편집 초안 제안 API(MOV-21 5단계, backlog A-11)

- **선택 단계** [`edit-director.ts`](../apps/api/src/services/edit-director.ts) — 거르기(절반 한도) · 중복(연쇄) · 10컷을 넘으면 촬영
  흐름을 묶음으로 나눠 고르기 · 촬영순 · 역할 · 스타일별 길이와 여분 · 발화를 자르지 않고 움직임이 큰 창. 규칙과 시드만 쓰는 순수
  함수다. 문턱값은 잠정값(`DRAFT_THRESHOLDS`).
- **규칙을 고친 곳**([edit-director.md](./decisions/edit-director.md)): 검사 없는 스냅(업로드 전 · 신호 없음)은 자리를 먼저 차지하고 남은 자리를
  고른다 — "그 스냅이 든 묶음은 그것을 고른다"는 한 묶음에 둘이 들면 하나가 빠졌다. `action` 은 움직임이 중앙값보다 커야 한다.
  구간 창은 걸친 만큼만 움직임을 세고, 발화 끝점에 맞춘 창도 후보에 넣는다.
- **API** `POST /movie-drafts` — 동기. 업로드된 스냅 `{ videoId }` 와 업로드 전 스냅 `{ localId, capturedAt }`. 상한 30개
  (`TOO_MANY_SNAPS`+`max`) · 24시간 10번(`DRAFT_LIMIT`) · 같은 요청 재사용(신호가 다 있었던 제안만). 신호가 없는 스냅은 렌디션 큐에
  `only: "signals"` 로 적재한다. vision 은 부르지 않고 이미 있는 분석만 얹는다. 분석 동의 철회 때 초안 기록도 지운다.
- **DB** `20261001030000_add_movie_drafts`. 계약 `contract/movie-drafts.ts` · `openapi.json` · [api-spec.md](./api-spec.md).
- **자동 검증**: API 556개(규칙 25 · API 9 신규 — 제안 그대로 `POST /movies` 가 `trimOwner: ai` 로 받는 것 포함) · 모바일 1262 tests.
  세 마이그레이션 모두 `prisma migrate diff` 로 스키마와 어긋나지 않는다.

## 2026-10-01 (이어서) — 앱: 자동 편집(MOV-21 6단계, backlog A-11)

화면 흐름은 오너와 정했다 — 스튜디오 블록 하나, 스타일은 마지막 무비의 것, 실패는 안내 + 다시 시도.

- **컷 구간의 주인** — `SnapRef.trimOwner`(`ai` 일 때만 있고 없으면 사용자 것). 구간을 끌거나 `전체 사용` 을 누르면 사용자 것이
  된다(`withTrim`·`withoutTrim`). 보낼 때 `ai` 만 싣고, 읽어 올 때 서버 값을 따른다.
- **제안으로 무비 만들기** — `entities/movie` 의 `requestMovieDraft`(목업 모드 포함) · `compose-movie` 의 `startMovieFromDraft`: 촬영순으로
  업로드된 스냅은 `videoId`, 업로드 중인 스냅은 `localId`+촬영 시각으로 보내고, 답의 컷으로 `arranger: ai` 무비를 만든다. 넣지 않은
  스냅은 무비에 기기 전용(`Movie.leftOut`)으로 남긴다.
- **화면** — 스튜디오 `스냅 골라 자동 편집` → `/snaps?select=draft`(상한 30, `자동 편집 · 최대 30개`) → `자동으로 편집하기`(요청 중
  `편집하는 중…`, 고르기·해제·삭제·취소·뒤로가기 잠금) → 편집 화면. 실패는 선택 바에 `자동 편집을 하지 못했어요.` + `다시 시도`, 하루 한도는
  `오늘은 자동 편집을 다 썼어요.` + `이 스냅으로 새 무비`(10개 이하일 때). 편집 화면 위에 `스냅 N개는 넣지 않았어요 · 다시 넣기 · ✕`,
  `다시 넣기` 는 컷 추가 화면의 `?only=left-out`.
- **문서**: 모바일 기능 문서 `studio.md`·`movie.md`·`snaps.md`·`app-shell-and-navigation.md`·`README.md`, UX 용어표에 `자동 편집`.
- **자동 검증**: 모바일 `npm run verify:mobile` 160 suites / 1296 tests(신규 — 구간 주인 왕복 · 제안 매핑 · `startMovieFromDraft` 8 ·
  선택 바 확정 상태 9 · 선택 바 대기 2 · 넣지 않은 스냅 4 등). **기기·에뮬레이터에서는 아직 보지 않았다**(backlog A-11 실기기 확인).

## 2026-10-01 (이어서) — 자동 편집 에뮬레이터 확인(MOV-21, backlog A-11)

개발 DB 에 이 브랜치의 마이그레이션 셋(`trim_owner` · `video_signals` · `movie_drafts`)을 `migrate deploy` 로 적용했다(대상이 `snaply` 인 것을
먼저 확인). 로컬 API 와 이 브랜치 코드를 넣은 편집·렌디션 워커 컨테이너, Android 에뮬레이터(`snaply_api35`, dev 빌드)로 확인했다.

| 확인 | 결과 |
|---|---|
| 렌디션 뒤 신호 | 대기 중이던 렌디션이 신호를 저장했다. 신호가 없던 업로드 스냅은 초안 요청이 `only: "signals"` 로 적재해 렌디션 워커가 계산했다 ✅ |
| 진입 | 스튜디오 `스냅 골라 자동 편집` → `자동 편집 · 최대 30개` → `자동으로 편집하기` → `POST /movie-drafts` 200 → `POST /movies` 201 → 편집 화면(`찍은 시각 순`) ✅ |
| 초안 내용 | 신호가 있는 스냅은 규칙대로 잘렸다(일상 `closer` 2.5초 · `hook` 1.5초), 신호가 없던 스냅은 스냅 전체(`complete=false` 라 재사용 안 함). 서버 컷 전부 `trim_owner=ai`, 전환은 서버가 골랐다(9/29→9/30 장면 전환에 `dip 400`) ✅ |
| 구간을 고치면 | 4번 컷 왼쪽 핸들을 끌자 `사용 2.5초`, `PATCH` 후 그 컷만 `300–2800 user`, 나머지는 `ai` ✅ |
| 넣지 않은 스냅 | 한 스냅의 밝기 신호를 잠시 0.01 로 바꿔 초안 → `스냅 1개는 넣지 않았어요 · 다시 넣기` → `넣지 않은 스냅` 화면에 그 스냅만 → 넣자 6컷, 안내 사라짐, 서버에 `user` 스냅 전체 ✅ (신호는 되돌렸다) |
| 실패 | API 를 내린 채 요청 → 선택 유지, `자동 편집을 하지 못했어요.` · `다시 시도` ✅ |
| 하루 한도 | 시험 기록 6행을 넣어 10회에 맞춤 → `오늘은 자동 편집을 다 썼어요.` · `이 스냅으로 새 무비` → `user` 무비 ✅ (시험 기록은 지웠다) |

- **고친 버그**: 스튜디오의 같은 줄을 두 번째 누르면(무비를 하나 만든 뒤) 스냅 탭이 고르기가 아니라 보기로 열렸다. 탭이 마운트된 채 같은
  `?select=` 가 오면 내비게이션이 같은 중첩 params 를 다시 적용하지 않아 prop 이 바뀌지 않는다. 기존 `스냅 골라 새 무비`(`?select=1`)도
  같았다. 요청마다 `?at=` 토큰을 붙여 고쳤다 — 토큰을 빼면 다시 보기로 열리는 것까지 에뮬레이터에서 확인했다.
- 정리: 시험 무비 6편은 앱의 무비 탭에서 지웠다(서버도 삭제됨). 시험용 `movie_drafts` 행은 모두 지웠다. 계산된 `video_signals` 는 실제 스냅의
  값이라 남겼다.
- 휴대폰에서 초안 → 구간·전환 수정 → 생성 → 결과물이 편집 화면과 같은지는 에뮬레이터로 판정할 수 없어(서버 사본을 검게 그린다)
  다음 절에서 실기기로 확인했다.

## 2026-10-01 (이어서) — 자동 편집 실기기 확인(MOV-21, backlog A-11)

오너의 Galaxy S22 Ultra(dev 빌드, 이 브랜치의 Metro, 로컬 API, 이 브랜치 코드를 넣은 편집·렌디션 워커)에서 확인했다.

| 확인 | 결과 |
|---|---|
| 초안 | 스냅 6개 → `자동으로 편집하기` → 6컷, 모든 컷 `ai` 구간(신호가 다 있어 전부 잘렸다) ✅ |
| 고치기 | 경계 1→2 를 `겹쳐 녹이기`(500ms, `user`), 6번 컷 왼쪽 핸들을 끌어 `사용 2.2초`(`user`) ✅ |
| 생성 | `무비 만들기` → editSpec v3 의 컷 구간·전환이 편집한 무비와 하나하나 같았다(`600–2800`, `crossfade 500`, 서버가 고른 `dip 400`) ✅ |
| 결과물 | 11.77초(컷 합 11.7초). 컷마다 가운데 프레임이 **자기 구간의 가운데**와 맞았다(오차 1.6–12.8, 다른 스냅 ≥60, 같은 스냅 다른 위치 15–79). 1.5초의 경계 프레임은 두 컷의 50:50 섞임에 가장 가까웠고(5.9, 한쪽만 ≈27) — 초안이 남긴 여분 프레임으로 실제로 겹쳤다 — 5.5초의 `dip` 은 밝기 0 ✅ |
| 미리보기 = 결과물 | 편집 화면 무대를 녹화해 결과물 프레임열과 맞추자 오프셋이 맞을 때만 오차가 낮았다(0.34, ±0.2–0.5초 어긋나면 0.52–0.76). 컷1 → 겹쳐 녹이기 → 컷2 → 컷3 내내 0.23–0.37(녹화의 색·축소·압축 차이). `dip` 근처는 거의 검은 프레임이라 정규화 비교가 크게 나온다(0.60) ✅ |

- **고친 것 두 가지**:
  - 서버가 고른 구간이 50ms 격자(예: 250·2750)라, 앱(100ms 격자)에서 한쪽 핸들을 끌자 건드리지 않은 끝이 2750 → 2800 으로 움직였다.
    창을 앱의 트림 격자 위에 놓게 고쳤고(`ac183b2`), 폰에서 왼쪽 핸들을 끌어도 끝이 2700 그대로인 것을 확인했다.
  - 같은 요청 24시간 재사용이 규칙을 고친 뒤에도 예전 제안을 돌려줄 수 있었다. 재사용 키에 규칙 버전(`EDIT_DIRECTOR_VERSION`)과 신호 버전을
    넣었다(`886f527`).
- 측정 방법: 결과물과 원본은 워커 이미지의 ffmpeg 로 72×128 회색 프레임을 뽑아 평균 절대 오차로 비교했고, 미리보기는 `adb shell screenrecord`
  를 무대 영역만 잘라 같은 방식으로 정규화해 비교했다.
- 시험 무비 두 편(생성한 `무비 10-01` · 초안 `무비 10-01 (2)`)과 생성에 쓴 크레딧 100 은 남아 있다 — 정리는 오너 확인 뒤.
- 거르기·중복 문턱값 실측(시험 스냅 촬영 뒤)은 backlog A-11 에 있다.

## 2026-10-02 — 자동 편집 리뷰 후속: 발화 구간 · 신호 시간 제한(MOV-21, backlog A-11)

머지된 자동 편집을 다시 읽다가 찾은 결함 셋을 고쳤다. 규칙은 [edit-director.md](./decisions/edit-director.md) §7 · §8.1 에 반영했다.

- **발화가 격자 밖이면 잘렸다** — 창이 발화를 담는지를 발화 길이(`up(끝 − 시작)`)로 따져, 끝점이 100ms 격자 밖이면(VAD 구간은
  대개 그렇다) 담는 창이 하나도 없었다. 그때는 "시작이라도 담기"로도 가지 않고 움직임만으로 골랐다. 3초 일상 스냅의 발화
  `350–2350` 이 `700–2700` 으로 잘렸다. 발화를 덮는 격자 구간 `[down(시작), up(끝)]` 으로 따지게 고쳤다.
- **앞 여분 안에서 시작한 발화는 보지 않았다** — 찍자마자 말한 스냅(발화 `0–1500`)이 `700–2700` 으로 잘렸다. 그 컷만 앞 여분을
  발화 시작까지 줄인다. 뒤 여분은 그대로다(끝이 잘리는 것은 받아들인다).
- 규칙이 바뀌어 `EDIT_DIRECTOR_VERSION` 을 3 으로 올렸다 — 24시간 재사용 창이 예전 제안을 돌려주지 않는다.
- **늦은 신호 계산이 렌디션을 `failed` 로 덮었다** — 렌디션 작업의 시간 제한 안에서 신호까지 돌아, 신호가 늦으면 반영한
  렌디션이 `failed` 가 되고 작업이 재시도됐다. 신호는 렌디션 뒤 따로 제한을 받는다(`_render` 를 제한 안에, `_record_signals`
  는 따로).
- **자동 검증**: API 567개(5 신규) · typecheck · lint · 워커 198개(Docker 이미지 `snaply-ai-worker:local` 에 소스를 마운트, `REQUIRE_FFMPEG=1`, 2 신규) ·
  새 테스트는 고치기 전 코드에서 실패하는 것을 확인했다(API 4개 · 워커 1개 — 나머지 2개는 지켜야 할 기존 동작의 고정).

## 2026-10-02 (이어서) — 대표 프레임 해시의 자리(backlog E-16)

워커가 대표 프레임(25·50·75%) 중 뽑지 못한 위치를 건너뛰어 `frame_hashes` 에 둘만 남길 수 있었고, 편집 초안의 중복 판정은 두 스냅의
해시를 인덱스끼리 비교해 다른 위치의 프레임끼리 거리를 쟀다. 2초 클립을 3초로 읽게 하면 75%(2.25초) seek 가 끝을 넘는데, ffmpeg 는
종료 코드 0 으로 끝나고 파일만 쓰지 않는 것을 워커 이미지에서 확인했다.

- **워커** — 뽑지 못한 위치를 `None` 으로 남기고(`_detail_frames`), 하나라도 비면 해시를 비운다(`representative_hashes`). 선명도는
  뽑은 프레임으로 잰다.
- **API** — 대표 프레임 셋(`FRAME_HASH_COUNT = 3`, 워커의 `HASH_POSITIONS` 와 대조하는 테스트)을 다 가진 스냅끼리만 중복을 잰다.
  이 규칙 전에 저장한 둘짜리 목록도 빈 목록처럼 중복 검사에서 빠지므로 `SIGNALS_VERSION` 은 올리지 않았다
  ([edit-director.md](./decisions/edit-director.md) §2.2 · §8.1). `EDIT_DIRECTOR_VERSION` 은 같은 PR 에서 이미 3 으로 올렸다.
- **자동 검증**: API 569개(2 신규 — 둘짜리 목록 테스트는 고치기 전 비교에서 실패) · typecheck · lint · 워커 201개(Docker,
  `REQUIRE_FFMPEG=1`, 3 신규 — 비우기 두 개는 고치기 전 동작에서 실패, 순서 하나는 기존 동작의 고정).

## 2026-10-03 — 편집 초안의 스냅 상한을 서버에서 배운다(backlog E-15)

앱이 편집 초안의 스냅 상한을 30 으로 박아 두고, 서버의 `400 TOO_MANY_SNAPS` 를 다른 실패처럼 받아 `다시 시도` 를 보여 줬다 — 서버
상한(잠정값)을 낮추면 그 사이 개수를 고른 사용자는 다시 시도해도 계속 거절됐다. 계약은 상한을 스키마에 걸지 않고 `max` 로 답해
앱이 하드코딩하지 않게 해 두었는데 앱이 그 값을 읽지 않았다.

- **`features/compose-movie`** — `TOO_MANY_SNAPS` 를 `too-many` 거절로 받고 `max` 를 싣는다(`readDraftSnapLimit`, 크레딧 부족분의
  `readCreditShortfall` 과 같은 방식 — 전송층은 `details` 를 그대로 나르고 이 슬라이스가 좁힌다).
- **`pages/snaps`** — `useEditDraft` 가 서버가 말한 상한을 기억하고(스냅 탭이 살아 있는 동안), 고르기 상한 · 거절 문구 · 확인 버튼이
  그 값을 따른다. 상한을 넘은 고르기는 `자동 편집에는 스냅 N개까지 넣을 수 있어요. M개를 빼 주세요.` 와 함께 버튼이 꺼진다 —
  `다시 시도` 는 보이지 않는다. `useEditDraft` 의 `start` 는 만든 무비를 돌려주고 화면이 연다(고르기 상한을 정하기 전에 훅이 있어야 해서).
- 앱 기능 문서 [studio.md](../apps/mobile/docs/features/studio.md) · [snaps.md](../apps/mobile/docs/features/snaps.md) 갱신.
- **자동 검증**: `npm run verify:mobile` 162 suites / 1309 tests(format · lint · typecheck 포함) · 새 테스트 중 `TOO_MANY_SNAPS` 두 경우는 고치기 전 코드에서 `unreachable` 로 실패하는
  것을 확인했다. 실기기 확인은 하지 않았다 — 서버 상한이 30 이라 지금 앱에서는 이 거절이 나지 않는다.

## 2026-10-03 (이어서) — 서버가 쓸 수 없는 스냅을 따로 알린다(backlog E-14)

`POST /movie-drafts` 는 넘긴 업로드 스냅 중 하나라도 `ready` · 삭제되지 않은 자기 스냅이 아니면 요청 전체를 403 으로 거절했다. 다른
기기에서 지웠거나 보관 기간이 끝났는데 이 기기는 아직 `uploaded` 로 아는 스냅이 섞이면, 앱은 `다시 시도` 를 보여 줬지만 다시 물어도
같은 거절이었다.

- **API** — 남의 id · 없는 id 는 그대로 요청 전체가 403(어느 것인지 알리지 않는다). 자기 스냅이지만 지워졌거나 준비되지 않은 것은
  빼고 응답의 새 필드 `unavailable` 로 알린다 — `excluded` 가 아니다, 앱이 다시 넣으라고 권하기 때문이다. 나머지로 초안을 만들고
  재사용 키와 시드도 나머지만으로 따져, 스냅이 사라진 뒤에는 그 스냅을 담은 예전 제안이 재사용되지 않는다. 모두 쓸 수 없으면 컷
  없이 돌려주고 기록하지 않는다(횟수에 세지 않는다). 계약 · `openapi.json` · [api-spec.md](./api-spec.md) · 스펙 MOV-21 ·
  [edit-director.md](./decisions/edit-director.md) §8.2 갱신.
- **앱** — `unavailable` 을 읽고(없는 예전 서버는 빈 목록), 넘긴 스냅을 서버가 하나도 쓸 수 없으면 `unavailable` 거절로
  `고른 스냅을 자동 편집에 쓸 수 없어요. 다른 스냅을 골라 주세요.` 를 보이고 고르기가 바뀔 때까지 버튼을 끈다. 일부만 그렇다면
  나머지로 무비를 만들고 그 스냅은 다시 넣기로 권하지 않는다. [studio.md](../apps/mobile/docs/features/studio.md) 갱신.
- **자동 검증**: API 574개(5 신규) · typecheck · lint · `npm run verify:mobile` 162 suites / 1314 tests(5 신규). 새 API 테스트는 고치기 전
  서비스에서 실패하고(403 · 계약의 `unavailable` 없음), 앱의 "모두 쓸 수 없음" 테스트는 고치기 전 코드에서 `unreachable` 로 실패했다.
  실기기 확인은 하지 않았다.

## 2026-10-03 (이어서) — 끝난 신호 작업을 다시 적재한다(backlog E-13)

편집 초안은 신호가 없는 스냅의 신호 계산을 `signals-<videoId>` 로 적재하는데, 렌디션 큐는 끝난 작업을 남겨 두고 같은 job id 의 적재를
무시한다. 그래서 그 작업이 한 번 끝나면 — 재시도를 소진했든, 읽을 수 없는 파일이었든 — 그 스냅은 다시 계산되지 않았고, 그 스냅이 든
초안은 매번 `complete: false` 로 새 행을 만들어 같은 요청마다 하루 한도를 썼다.

- **워커** — 읽을 수 없는 파일(`SignalsError`)로 끝난 신호 작업이 결과에 신호 버전을 남긴다(`{ status: 'failed', signalsVersion }`).
- **API** — `enqueueSignals` 가 남아 있는 작업의 상태를 본다. 기다리거나 도는 중이면 그대로 두고, 끝났으면(재시도 소진 · 신호를
  남기지 못하고 끝남 · 다른 버전이나 버전 없이 읽지 못함) 지우고 다시 넣는다. 이 신호 버전으로 읽을 수 없다고 끝난 스냅은 다시
  돌리지 않고 "검사 없음"으로 확정한다 — 초안은 신호를 **기다리는** 스냅이 없으면 `complete` 라 재사용되고 한도를 쓰지 않는다.
  적재는 스냅마다 순서대로 기다리지 않고 함께 보낸다. 실패의 기록은 큐의 끝난 작업에 둔다(마이그레이션 없음 — 큐가 오래된 작업을
  지우면 한 번 더 계산할 뿐이다). [edit-director.md](./decisions/edit-director.md) §8.2 · [api-spec.md](./api-spec.md) 갱신.
- **자동 검증**: API 579개(5 신규 — 테스트가 워커처럼 작업을 끝내 두고 요청한다. 다섯 모두 고치기 전 코드에서 실패) · typecheck ·
  lint · 워커 201개(Docker, `REQUIRE_FFMPEG=1`, 읽지 못한 결과에 신호 버전이 실리는지 단언 추가).

## 2026-10-03 (이어서) — 자동 편집 리뷰의 나머지(MOV-21, backlog A-11)

2026-10-02 리뷰에서 backlog 로 옮기지 않았던 나머지 항목이다.

- **하루 한도가 동시 요청에 뚫렸다** — 한도를 계산 전에 세고 계산 뒤에 기록해, 동시에 온 요청들이 같은 남은 횟수를 보고 모두
  기록됐다. 기록할 때 사용자별 잠금(`pg_advisory_xact_lock`, 쿨다운 슬롯과 같은 방식) 안에서 다시 세어 집행한다. 앞의 확인은
  계산을 아끼는 빠른 거절로 남겼다. 템플릿 추천의 하루 한도도 같은 모양(세고 나서 만들기)이라 같은 경합이 있다 — 이번 범위 밖이다.
- **막 올린 스냅의 신호를 두 번 계산했다** — 렌디션이 아직 돌지 않은 스냅에도 신호 전용 작업을 넣어, 원본을 두 번 받아 두 번
  계산했다. 렌디션 작업이 기다리거나 도는 중이면 넣지 않는다(렌디션이 신호도 계산한다).
- **문서** — 점수·거르기의 `quality` 는 선명도이고 밝기는 어둠 문턱값에만 쓴다고 [edit-director.md](./decisions/edit-director.md)
  §2.1 · §4 를 구현에 맞췄다(밝기를 점수에 넣을지는 A-11 실측과 함께). 선택 단계가 정한 가운데 컷의 역할이 어디에도 실리지 않는
  것은 코드를 걷어 내지 않고 A-11 의 후속으로 적었다 — 결정 §6 의 규칙이고, editSpec 의 `cuts[].role` 로 싣기로 했던 일이 빠진
  것이다. 진행 기록의 두 "남은 것" 줄을 사실에 맞게 고쳤다(하나는 이미 실기기로 확인했고, 하나는 backlog 에 있다).
- **자동 검증**: API 581개 · typecheck · lint · 새 테스트 2개(동시 요청 · 렌디션 대기)는 고치기 전 코드에서 세 번 모두 실패했다.

## 2026-10-03 (이어서) — 무비 생성의 402 가 부족분 숫자를 싣는다(backlog E-9)

무비 생성 `POST /movies/{id}/export` 의 402 응답이 계약에서 `apiErrorSchema` 로 선언돼, 서버가 `INSUFFICIENT_CREDITS` 에 싣는
`required`·`balance` 가 응답 직렬화에서 지워졌다(선언되지 않은 키는 지워진다). 앱은 그 두 숫자로
`크레딧이 부족해요 · {balance}/{required}.` 를 그리게 돼 있었지만 이 경로에서는 숫자 없는 문구만 나왔다.

- **계약** — export 의 402 를 `POST /edit-jobs` 와 같은 `paymentRequiredErrorSchema` 로 선언했다. `openapi.json` · [api-spec.md](./api-spec.md) 갱신.
- **앱** — 코드는 바꾸지 않았다(`readCreditShortfall` 가 이미 읽는다). 기능 문서
  [credits-and-rewarded-ads.md](../apps/mobile/docs/features/credits-and-rewarded-ads.md) · [movie.md](../apps/mobile/docs/features/movie.md) 를
  고치고 `Partial` 을 풀었다 — 이 경로로는 아직 실기기에서 숫자를 보지 않았다는 단서를 달았다.
- **자동 검증**: API 582개 · typecheck · lint · `npm run verify:mobile` 162 suites / 1314 tests · 새 테스트(크레딧 하나 모자란 export → 402 + `required`·`balance`)는 고치기 전 계약에서 실패했다.

## 2026-10-06 — 운영 compose 호출이 시크릿 파일을 넘긴다(backlog B-1)

사내 서버 배포(B-1)는 아직 켜지 않았다(`DEPLOY_ENABLED` 없음 — 서버 배포 잡은 매번 건너뛰었다). 켜기 전에 배포 경로를 다시 읽다가,
켜는 순간 배포 · 배치 · 백업이 모두 멈출 결함 넷을 찾았다.

- **`--env-file` 이 없었다** — `docker-compose.prod.yml` 의 `${POSTGRES_PASSWORD:?}` 같은 치환은 셸 환경과 `--env-file` 만 읽고,
  서비스의 `env_file` 은 컨테이너 안의 값만 정한다. 배포 워크플로와 `deploy/run-batch.sh` · `deploy/backup-db.sh` 가 compose 를
  `--env-file` 없이 불러, 시크릿 파일이 있어도 `required variable … is missing a value` 로 멈췄다. 모든 호출에 넘긴다.
- **배치가 이미지 태그를 compose 에 넘기지 못했다** — `run-batch.sh` 가 `deploy/.current-images` 를 `.` 로 읽기만 하고 내보내지
  않아 자식 프로세스인 compose 가 태그를 보지 못했다. `set -a` 로 읽는다. `backup-db.sh` 는 태그를 아예 읽지 않았는데, postgres 에
  exec 만 해도 compose 는 파일 전체(`API_IMAGE:?` 포함)를 해석하므로 같은 방식으로 읽는다.
- **태그 기록이 cron 이 읽는 곳에 없었다** — 워크플로가 `.current-images` 를 runner 의 작업 폴더에 써, cron 이 도는 `/opt/snaply`
  에서는 찾을 수 없었다. `/opt/snaply/deploy/.current-images` 에 쓴다.
- **시크릿 파일 권한** — 절차가 `600 root:root` 로 만들게 했는데 runner · cron 은 `snaply` 로 돌고 compose 는 이 파일을 부른 쪽에서
  읽는다. `640 root:snaply` 로 바꿨다(`snaply` 는 `docker` 그룹이라 root 전용으로 둬도 막아 주는 것이 없다). 워크플로는 compose 를
  부르기 전에 파일을 읽을 수 있는지 먼저 확인한다.
- [archive/deployment-on-prem.md](./archive/deployment-on-prem.md) §1-2 · §2 · §4 · §5 와 backlog B-1 의 서버 작업 항목을 함께 고쳤다. 배포는 `/opt/snaply`
  체크아웃을 갱신하지 않으므로 `deploy/` 를 고친 커밋이 들어오면 거기서 `git pull` 한다는 절차도 적었다.
- **검증**: 더미 시크릿 파일로 `docker compose config` 를 돌려 `--env-file` 없이는 치환에서 멈추고 있으면 통과하는 것을 확인했다.
  두 스크립트를 `docker` 대역(인자 · 환경을 기록하고 같은 인자로 `compose config` 를 돌린다)으로 실행해, main 의 스크립트는 태그 없이
  치환에서 멈추고 고친 스크립트는 `--env-file` 과 태그를 넘겨 통과하는 것을 확인했다. `bash -n` · shellcheck 통과, actionlint 는
  main 과 같은 기존 경고만 남는다. 실제 서버에서는 아직 돌려 보지 않았다(서버 준비 전).

## 2026-10-07 — 템플릿 추천의 하루 한도가 동시 요청에 뚫리지 않는다(REC-3, backlog A-6)

2026-10-03 편집 초안의 하루 한도를 고칠 때 "같은 모양이라 같은 경합이 있다 — 이번 범위 밖"으로 남겼던 것이다. backlog 에 올라가
있지 않았다.

- **결함** — `POST /movie-recommendations` 가 하루 횟수를 센 뒤 잠금 없이 추천을 만들어, 남은 한 번을 동시에 다툰 요청 다섯이 모두
  202 를 받았다(한도 20 을 넘겨 24). 같은 후보 집합을 동시에 보내면 재사용 대신 추천이 여러 개 생겼다.
- **고침** — 기록할 때 사용자별 잠금(`pg_advisory_xact_lock`, 편집 초안과 같은 방식) 안에서 재사용할 추천을 다시 찾고 횟수를 다시
  센다. 앞의 확인은 분석을 적재하기 전의 빠른 거절로 남겼다. 잠금 안에서 거절된 요청도 후보 분석은 이미 적재했다 — 빠른 확인을 함께
  지난 요청에서만 생기고, 분석은 스냅마다 한 번이라 다음 추천이 그 결과를 쓴다.
- **자동 검증**: API 584개 · typecheck · lint. 새 테스트 2개(동시 요청 다섯 → 202 하나 · 429 넷, 같은 후보 동시 세 번 → 추천 하나)는
  고치기 전 코드에서 둘 다 실패했고 고친 뒤 세 번 연속 통과했다.

## 2026-10-07 (이어서) — Python 워커가 Node 에서 보인다(backlog E-11 닫음)

Node BullMQ 의 `Queue.getWorkers()` 는 `CLIENT LIST` 에서 `bull:<base64 큐 이름>`(또는 `…:w:<이름>`)으로 이름 붙은 연결을 워커로
센다. Python bullmq 2.14 는 연결에 이름을 붙이지 않아, 떠 있는 분석 워커가 `scripts/analysis-run.mjs` 에 늘 0개로 보였다.

- **워커** — 세 워커(편집 · 렌디션 · 분석)가 `queue_connection.worker_connection()` 으로 Redis URL 에 `client_name=bull:<base64>:w:<호스트>-<pid>`
  를 얹는다. redis-py 가 연결을 열 때마다 `CLIENT SETNAME` 을 보내므로 다시 접속한 연결도 같은 이름이다. 다른 쿼리 인자는 그대로 둔다.
- **스크립트** — 워커 하나가 연결을 여럿 연다(일반 · 블로킹 · 동시 처리만큼). `getWorkers()` 의 길이가 아니라 연결 이름을 중복 없이 세어
  프로세스 수를 낸다.
- **검증**: 워커 이미지에서 Python 206 테스트(새 5개, CI 와 같은 `REQUIRE_FFMPEG=1 python -m unittest discover -s tests`). 개발 Redis 에
  시험용 큐(`e11-probe`)로 Python 워커(동시 처리 3)를 띄우고 Node `getWorkers()` 가 연결 3개 · 프로세스 1개로 세는 것을 확인한 뒤 큐 키를
  지웠다. 실제 분석을 적재하는 스크립트 경로는 키 비용이 들어 돌리지 않았다.

## 2026-10-07 (이어서) — 배포본이 촬영 시각을 싣는다(backlog E-12 닫음)

ffmpeg 은 원본의 전역 메타데이터를 출력에 옮기면서 `creation_time` 만은 일부러 지운다. 그래서 배포본에 촬영 시각이 없었고, 서버 사본을
앨범에 저장하면(SNAP-17) 갤러리가 저장한 날 자리에 놓았다.

- **고침** — 렌디션 변환이 `-metadata creation_time=…` 을 적는다. 원본의 태그가 먼저고, 없으면 앱이 보낸 촬영 시각(`videos.captured_at`,
  UTC)이다. 이미 만든 배포본은 다시 만들지 않으므로 그대로다.
- **찾은 것** — 같은 확인에서 원본의 위치 태그(`location`)는 배포본과 편집본에 **그대로 따라간다**는 것을 봤다. 정할 것이 있어 고치지 않고
  backlog E-17 로 올렸다.
- **검증**: 산출물 계약 테스트 2개(태그가 있는 원본 → 그 값, 태그가 없는 원본 → KST 로 준 촬영 시각이 UTC 로)와 워커 흐름 테스트 1개
  (변환이 행의 `captured_at` 을 받는다). 고치기 전 코드로 같은 원본을 변환해 `creation_time` 이 사라지는 것을 먼저 확인했다. Python 209 통과.
  실제 휴대폰 갤러리에서 저장 위치를 보는 것은 backlog A-4 앨범 저장 실기기 확인 ③ 에 남는다.

## 2026-10-07 (이어서) — 재생 화면은 테마와 상관없이 어둡다(backlog E-10 닫음)

전체 화면 재생(`shared/ui/video-player-modal`)의 바탕은 늘 검정인데, 하단 길이 표시만 테마 글자색을 따라 라이트 테마에서 거의 검은 글자가
됐다. 닫기 · 앨범에 저장 · 캡션은 흰색을 직접 적어 괜찮았다. 화면 전체를 `ThemeScope scheme="dark"`(촬영 · 스냅 추출 화면과 같은 방식)로 감쌌다.

- **검증**: `npm run verify:mobile` 163 suites / 1324 tests(이 변경 전부터 있던 lint 경고 1개). 색 값은 Jest 로 고정하지 않는다는 앱 규칙대로
  Android 에뮬레이터에서 봤다 — 라이트 테마에서 고치기 전 번들은 `3초` 가 검은 바탕에 거의 보이지 않았고 고친 번들은 흰 글자로 읽혔다.
  에뮬레이터의 테마는 원래대로 다크로 돌려 놓았다.

## 2026-10-07 (이어서) — 무비 컷이 사라진 사유를 싣는다(SNAP-12 `구현됨`, backlog A-4)

서버는 사라진 스냅을 쓰는 컷을 `unavailable` 로만 표시해, 다른 기기에서 지운 스냅의 컷이 그 기기의 무비 수정이 서버에 닿기 전 "보관 기간이
끝났어요"로 보였다. 사유는 서버가 이미 안다(`videos.removal_reason`).

- **계약** — 무비 컷에 `unavailableReason`(`user` · `expired` · `null`). `openapi.json` · [api-spec.md](./api-spec.md) 갱신. 사유 컬럼이
  생기기 전에 지워진 행은 `user` 다(`POST /videos/lookup` 과 같은 규칙).
- **앱** — 컷이 왜 쓸 수 없는지를 한 함수(`pages/movie/model/cut-gone.ts`)가 정하고 편집 화면 · 시청 화면이 그것으로 문구를 고른다.
  사유가 없는 `unavailable`(이 필드보다 오래된 서버, 그 전에 캐시한 무비)은 지금처럼 만료로 읽는다. 기능 문서
  [movie.md](../apps/mobile/docs/features/movie.md) 갱신.
- **자동 검증**: API 584개(사용자 삭제 → `user`, 만료 정리 → `expired`) · `npm run verify:mobile`(새 테스트: 판정 표 7가지, DTO 가 사유를 읽고
  모르는 사유는 버린다). 다른 기기에서 지운 스냅의 컷을 실기기에서 보지는 않았다 — 기기의 원본을 지워야 해서 개발 데이터로 하지 않았다.

## 2026-10-07 (이어서) — 무비 결과물이 찍은 곳을 싣고 나가지 않는다(backlog E-17 닫음)

ffmpeg 은 첫 입력의 전역 메타데이터를 출력에 옮긴다. 휴대폰 원본에는 찍은 곳(`location`) · 기기 · 소프트웨어 태그가 있어, 무비 결과물이
공유 · SNS 게시로 첫 컷을 찍은 좌표를 싣고 나갔다. 오너가 권장안대로 결과물에서 지우기로 했다.

- **고침** — 원본이 편집 파이프라인에 들어오는 유일한 자리인 컷 정규화(`editor.normalize_clip`, 예전 편집과 경계별 전환 편집이 함께 쓴다)에
  `-map_metadata -1` 을 붙였다. 이어 붙이기 · BGM · 자막 단계는 이 파일에서 시작하므로 끝까지 깨끗하다. 결과물에는 원래 촬영 시각 태그가 없어
  (ffmpeg 이 옮기지 않는다) 날짜가 달라지는 것은 없다.
- **배포본은 그대로** — 같은 계정의 기기만 받으므로 위치를 서버에 둘지(A-4)와 함께 본다. backlog A-4 위치 항목에 적었다.
- **검증**: 산출물 계약 테스트 1개 — 위치 · 기기 태그를 넣은 원본을 컷 편집 · 경계별 전환 편집 · BGM · 자막까지 돌려 세 산출물 모두 태그가 없다. 고치기
  전 코드로는 실패했다(2026-10-07 에 "최종 결과물로는 확인하지 않았다"고 적었던 것이 이 테스트로 확인됐다). 워커 이미지에서 Python 210 통과.

## 2026-10-07 (이어서) — 알림 설정은 계정에 있다(NTF-7 `구현됨`, backlog B-6 닫음)

앱의 무비 완성 · 위치 알림 스위치와 조용한 시간이 기기에만 저장돼, 사용자가 끈 알림을 서버가 계속 보냈다(서버는 2026-09-15 에 종류별
스위치를 받기 시작했다). 앱이 서버에 쓰기로 하면서 기본값도 어긋나 있었다 — 서버는 켜짐, 앱은 꺼짐에서 시작해 켤 때 권한을 묻는다. 오너가
"서버가 원천, 기본은 꺼짐"을 골랐다([decisions/notification-preferences.md](./decisions/notification-preferences.md) 같은 이름의 절,
기각한 대안 포함).

- **서버** — 위치 · 무비 알림의 기본값을 꺼짐으로 바꿨다(마이그레이션 `20261007000000_notification_kinds_default_off`). 앱이 쓴 적이 없어
  누가 고른 값이 아니었으므로 이미 있는 행도 꺼짐으로 되돌린다. 발송 테스트는 사용자를 명시적으로 켜고, 기본 꺼짐 테스트 둘을 더했다.
  스펙 NTF-6 · NTF-7, [api-spec.md](./api-spec.md), 계약 설명과 `openapi.json` 갱신.
- **앱** — 설정을 `GET /auth/me` 로 읽고 `PATCH /auth/me` 로 쓴다(`features/notification-settings` 의 `api/`). 바꾸면 곧바로 보이고 서버의 답이
  덮으며, 거절되면 되돌리고 "알림 설정을 바꾸지 못했어요. 다시 시도해 주세요." 를 띄운다. 늦게 온 이전 답은 더 새로운 변경을 덮지 않는다.
  읽기 전에는 화면의 조작을 막고, 위치 감시는 그대로 둔다(오프라인 시작에 OS 의 감시 영역을 지우지 않게). 계정에서 켜져 있는데 이 기기에 권한이
  없으면 지금 쓰는 "기기 설정에서 … 받을 수 있어요" 와 `설정에서 권한 켜기` 를 띄우고, 앱으로 돌아올 때마다 권한을 다시 읽는다.
- **기기에 남은 선택** — 저장소 persist v2 가 이전 빌드의 스위치 · 조용한 시간 중 기본값과 다른 것만 `legacyChoices` 로 옮기고, 앱이 계정에
  한 번 올린 뒤 지운다(`LegacyChoicesUploadGate`). 고르지 않은 기본값까지 올리면 다른 기기에서 고른 값을 덮는다.
- 기능 문서 [me.md](../apps/mobile/docs/features/me.md) · [location-and-push-notifications.md](../apps/mobile/docs/features/location-and-push-notifications.md) ·
  [movie.md](../apps/mobile/docs/features/movie.md) · [app-shell-and-navigation.md](../apps/mobile/docs/features/app-shell-and-navigation.md) 갱신.
- **자동 검증**: API 584개(기본 꺼짐 2개 포함) · typecheck · lint · `npm run verify:mobile` 164 suites / 1340 tests(이 변경 전부터 있던 lint 경고 1개).
  새 앱 테스트: 읽기 · 쓰기(즉시 반영 · 거절 시 되돌림 · 늦은 답 · 읽기 전), 두 스위치의 권한 규칙과 "켜졌는데 이 기기에 권한 없음", persist v2 이전
  표, 한 번 올리기(실패하면 남김), 위치 감시가 모르는 값에 손대지 않음, 설정 화면(읽기 전 막힘 · 거절 안내).
- **Android 에뮬레이터**(실제 로컬 API, 이 브랜치의 마이그레이션은 개발 DB 에 적용하지 않음): 시작하자마자 `GET /auth/me` 다음 기기에 남은 선택의
  `PATCH /auth/me` 가 한 번 갔고, 다시 실행하면 조회만 했다. 설정 화면이 계정 값을 보였고 무비 스위치 끄기 · 켜기와 조용한 시작 시각 22→23→22 가
  매번 DB 에 닿았다. API 를 내린 채 시각을 바꾸면 22:00 으로 돌아가고 거절 안내가 떴다. DB 값은 처음과 같게 끝났다.
- **남은 것**: 휴대폰에서 권한이 없는 새 기기로 "켜졌는데 권한 없음" 안내를 본 적은 없다(에뮬레이터는 권한이 이미 있었다,
  [backlog.md](./backlog.md) F). OS 설정에서 권한을 준
  뒤의 푸시 토큰 등록은 다음 실행이나 무비 스위치를 바꿀 때 일어난다 — 기능 문서 me.md 의 한계에 적었다.

## 2026-10-07 (이어서) — 지운 스냅을 보관 기간이 끝날 때까지 되살린다(SNAP-20, backlog A-4 휴지통 닫음)

"모든 기기에서 삭제"가 서버 파일과 모든 기기의 원본을 즉시 지워, 실수 한 번을 되돌릴 수 없었다. 결정 요청
[decisions/snap-trash.md](./decisions/snap-trash.md)의 권장안(① C · ② A · ③ A · ④ A · ⑤ C)을 오너가 채택했다 — 서버에 사본이 있던 스냅만,
원래 보관 기간(업로드 후 15일)이 끝날 때까지, 스냅만 되살린다. 스펙 SNAP-16 을 고치고 SNAP-20 을 새로 적었다.

- **서버** — `DELETE /videos/{id}` 가 업로드가 끝났고 보관 기간 안인 스냅은 파일을 남기고 `kept_for_restore` 로 표시한다(마이그레이션
  `20261007010000_add_video_kept_for_restore`). 이 변경 전에 지운 행은 파일을 그 자리에서 지웠으므로 표시가 없고 되살리지 않는다 — 표시가 없으면
  "삭제 · 정리 전" 행과 구분할 수 없었다. 남은 객체를 회수하는 밤 배치(E-3)는 표시된 행을 보관 기간이 끝날 때까지 건너뛴다(그대로 두면 그날 밤 지웠다).
  `GET /videos/trash`(최근 삭제, 최대 200개) · `POST /videos/{id}/restore`(멱등, 보관 기간이 끝났거나 표시 없는 행은 409 `NOT_RESTORABLE`)를 더했고,
  되살릴 때 지운 동안 건너뛴 렌디션을 다시 적재한다(같은 job id 의 끝난 작업을 지우고 넣는다 — 그대로는 무시된다). 다른 기기가 보는 `lookup` 은
  그대로 `removed`(`user`)다 — 새 상태를 만들면 예전 앱이 스냅을 잘못 다룬다. 계약 · `openapi.json` · [api-spec.md](./api-spec.md) 갱신.
- **앱** — 확인 시트가 되살릴 수 있는지와 언제까지인지를 말한다. 모든 기기에서 삭제 직후 `스냅 N개를 삭제했어요 · 되돌리기` 토스트(6초,
  새 `shared/ui/toast`). 스냅 탭 끝의 `최근 삭제` → `/recently-deleted` 에서 행마다 `되살리기`. 아직 서버에 가지 않은 삭제(묘비)는 먼저 거둬 오프라인에서도
  되살리고, 그 밖에는 서버에 되살리기를 요청한 뒤 동기화를 바로 한 번 돌린다(`requestSnapReconcile`) — 되살린 스냅은 다른 기기에서 온 스냅처럼 들어온다.
  촬영 화면의 삭제 알림 문구도 고쳤다. 새 용어 `최근 삭제` · `되살리기` · `되돌리기` 를 UX 용어표에 올렸다. 기능 문서 snaps.md · README · app-shell 갱신.
- **자동 검증**: API 597개(새 `video-trash.test.ts` 14개 — 렌디션 재적재 테스트는 그냥 add 로 바꾸면 실패하는 것을 확인) · typecheck · lint ·
  `npm run verify:mobile` 169 suites / 1342 tests(이 변경 전부터 있던 lint 경고 1개).
- **Android 에뮬레이터**: 개발 DB 의 복사본(`snaply_trash_check`, 마이그레이션은 그 복사본에만 적용, 확인 뒤 지움)에 API 를 붙였다. 무비에 쓰이지
  않은 다른 기기의 스냅으로: 확인 시트가 `모든 기기에서 삭제돼요. 2026년 10월 15일까지는 최근 삭제에서 되살릴 수 있어요.` 를 보였고, 지우자 서버 행이
  `kept_for_restore` 로 남았다. 최근 삭제에 `3초 · 9일 남음` 으로 나타났고 되살리자 `스냅을 되살렸어요` · 목록이 비고 스냅 탭이 6개로 돌아왔다.
  다른 스냅을 지운 직후 되돌리기를 누르자 `스냅 1개를 되돌렸어요` 로 돌아왔다. 개발 DB 에는 아무 변화가 없었다.
- **남은 것**: 휴대폰 두 대 사이의 전파와 되살림은 보지 않았다 — backlog A-4 "최근 삭제의 실기기 확인". 법률 문서의 보관 · 파기에 적을 일은 D-2 에 더했다.

## 2026-10-08 — AWS 공모전 서버에 올릴 준비: 키 없는 S3 · ALB 뒤 클라이언트 IP · 단독 compose(backlog B-8)

인프라팀이 공모전 테스트용 AWS 서버를 만들었다(backlog B-8). 저장소 그대로는 거기서 뜨지 않거나 뜨더라도 막혀서 세 가지를 고쳤고,
확인하다 사내 서버와 같이 쓰는 배치 결함을 하나 찾았다.

- **키 없이 인스턴스 역할로 S3** — API 는 `AWS_ACCESS_KEY_ID` 를 필수로 요구했고, 워커는 빈 키를 빈 문자열로 넘겨 boto3 가 기본 체인을
  타지 않고 빈 키로 서명했다. 이제 둘 다 키가 비면 SDK 기본 체인(→ 인스턴스 메타데이터)을 쓴다. API 는 키가 한쪽만 있거나, MinIO
  (`S3_ENDPOINT`)인데 키가 없으면 기동을 거부한다. 워커의 S3 클라이언트는 리전 호스트(`버킷.s3.ap-northeast-2.amazonaws.com`)로
  고정했다 — 기본값은 presigned URL 을 전역 호스트로 만들어 새 버킷에서 307 을 받을 수 있고 API 가 만드는 URL 과 호스트가 갈렸다.
  env-spec 에서 두 키를 선택 · `local` 로 바꿨다.
- **ALB 뒤 클라이언트 IP** — Fastify 가 프록시를 믿지 않아 모든 요청이 ALB 주소로 보였다. 전역 rate limit(IP당 분당 60)을 사용자 전체가
  나눠 쓰고, `/health` 도 그 한도에 걸려 ALB 가 대상을 빼면 도메인 전체가 502 가 된다. 새 변수 `TRUST_PROXY`(믿을 프록시의 IP · CIDR ·
  프리셋)를 두었다. 홉 수(`1`)와 `true` 는 기동을 거부한다 — Fastify 5.12 는 홉 수만으로는 직접 접속한 클라이언트의 위조를 막을 수
  없어 숫자를 주면 아무것도 믿지 않는다(처음 홉 수로 만든 구현이 새 테스트에서 실패해 드러났다). `true` 는 누구의 헤더든 믿는다.
- **`docker-compose.aws.yml`** — base 에 겹치지 않는 단독 파일이다. 같은 방식인 사내 서버 오버레이를 `docker compose config` 로 풀어 보니
  postgres · redis 포트가 `127.0.0.1` 과 모든 주소에 둘 다 잡히고 base 의 `SENTRY_DSN: ""` 가 시크릿을 덮었다(backlog B-1 에 적었다).
  MinIO 없음, S3 키와 MinIO 주소는 ""로 덮어 인스턴스 역할만, `TRUST_PROXY: uniquelocal`, DB 는 `127.0.0.1:5433`(담당자 포트 포워딩)만,
  Redis 볼륨, 컨테이너 로그 상한(20MB × 5), SHA 태그라 `pull_policy` 기본값.
- **배치가 하나도 돌지 않던 결함(사내 서버 공통)** — `deploy/run-batch.sh` 가 API 이미지 안에서 `npm run <배치> -w apps/api` 를 불렀는데
  이미지의 작업 디렉터리가 이미 `apps/api` 라 `No workspaces found` 로 끝났다. `-w` 를 뺐다. 2026-10-06 검증은 docker 대역으로 인자만
  봐서 드러나지 않았다.
- **자동 검증**: API 612개(새 `config.test.ts` · `trust-proxy.test.ts`) · tsc · lint · `storage.service.test.mjs`(키 없이 기본 체인으로
  서명 · 리전 호스트 · 세션 토큰). 워커 212개(새 `test_storage.py` — 깨끗한 하위 프로세스에서 compose 처럼 키를 빈 값으로 주고 기본
  체인으로 서명하는지 본다. 같은 프로세스에서는 다른 테스트가 boto3 를 MagicMock 으로 바꿔 끼운다).
- **로컬 실행**: 작업 트리로 이미지를 빌드해 `docker-compose.aws.yml` 을 띄웠다(분석 워커는 OpenAI 키가 없어 뺐다). migrate 뒤 api healthy ·
  `/health` 가 `db=connected`. 시크릿 파일에 넣은 키와 MinIO 주소가 네 컨테이너 모두에서 ""로 덮였다. Docker 포트 매핑을 거친 요청에서
  X-Forwarded-For 별로 한도가 갈리고 앞쪽에 끼운 위조 주소는 무시됐다. 배치 4종 dry-run 과 `--yes`, `pg_dump` 가 돌았다. 확인 뒤
  스택 · 볼륨 · 이미지를 지웠다.
- **남은 것**: 실제 인스턴스 역할로 S3 에 붙는 것은 AWS 서버에서만 볼 수 있다. 배포 잡 · 설치 스크립트 · 배포 방식 확인은 backlog B-8.

## 2026-10-08 (이어서) — AWS 공모전 서버의 배포 잡과 설치 스크립트(backlog B-8)

인프라 담당이 배포 방식(GitHub self-hosted runner + GHCR)을 그대로 가도 된다고 답했고, 그 전에 인스턴스에서 직접 확인했다 —
Session Manager 셸에서 GitHub · GHCR · Docker Hub · 외부 API 로 나가는 연결이 모두 열려 있고, 인스턴스 역할로 S3 에 붙고, 컨테이너에서
메타데이터에 닿고(IMDS 홉 2), Compose 가 v2.32.4, `/data` 가 별도 볼륨이다. 결정과 기각한 대안은
[decisions/aws-contest-server.md](./decisions/aws-contest-server.md), 절차는 [deployment-aws.md](./deployment-aws.md).

- **배포 잡** — `deploy.yml` 에 `deploy-aws` 를 더했다(`runs-on: [self-hosted, snaply-aws]`, `DEPLOY_AWS_ENABLED` 일 때만). 배포 파일을
  `/data/compose` 로 덮어쓰고 → Secrets Manager 를 env 파일로 → GHCR 로그인(패키지가 비공개라 필요하다) → pull → 마이그레이션 → up →
  태그 기록 → `/health` 의 `db=connected` → 72시간 넘은 이미지 정리. GitHub 에 AWS 키를 두지 않는다. 사내 서버 잡은 그대로다.
- **`deploy/aws/`** — `install.sh`(인스턴스마다 한 번, 멱등: cron 패키지 — Amazon Linux 2023 에 기본으로 없다 —, `snaply` 계정, Docker
  data-root 를 `/data/docker` 로 옮기고 `/data` 마운트 대기, runner 2.338.0 해시 검증 · 등록 · 서비스, cron) · `runner-job-started.sh`(작업 전
  검사 — main 의 `deploy.yml` push 만 받는다. 저장소가 public 이고 GitHub Free 플랜에는 runner 를 워크플로로 묶는 설정이 없다) ·
  `write-env.sh`(빈 값은 빼고 값은 작은따옴표로 — compose 가 글자 그대로 읽는다. 작은따옴표 · 줄바꿈이 든 값은 거부) · `render-cron.sh`
  (`batches.cron` 에서 경로만 바꾼다 — 배치 시각의 원천은 하나다).
- **배치 · 백업 스크립트가 compose 파일을 고른다** — `run-batch.sh` · `backup-db.sh` 가 `-f` 대신 `COMPOSE_FILE`(기본값은 사내 서버의 두 파일)을
  쓴다. AWS cron 이 `docker-compose.aws.yml` 을 준다.
- **만료 예고 배치의 안내 문구** — FCM 이 꺼져 멈출 때 `FIREBASE_SERVICE_ACCOUNT_JSON` 미설정이라고 했는데 그런 변수는 없다.
  `FIREBASE_SERVICE_ACCOUNT_KEY` 로 고쳤다.
- **검증**: shellcheck 통과. actionlint 는 새 잡에서도 사용자 정의 라벨(`snaply-aws`) 경고만 — main 의 `snaply` 와 같은 종류다.
  Amazon Linux 2023 컨테이너에서 스크립트 동작 29건(작업 전 검사가 브랜치 · 다른 워크플로 · PR · 수동 실행 · 포크 · 변수 없음을 거부, cron
  시각이 `batches.cron` 과 같음, env 변환이 빈 값 · null 을 빼고 숫자 · 불리언을 문자열로, `$` · `#` · 공백을 보존, 한 줄 JSON 키가 PEM 으로
  풀림, 권한 600, 작은따옴표 · 줄바꿈 · 잘못된 키 이름 · 빈 `POSTGRES_PASSWORD` · 객체가 아닌 시크릿 거부). 같은 컨테이너에 서버와 같은
  Compose v2.32.4 를 깔고 `deploy-aws` 단계를 그대로 두 번 돌렸다(인프라처럼 빈 키 9개를 섞은 시크릿, 로컬 빌드 이미지): 마이그레이션 →
  일곱 서비스 기동 → `db=connected`, 두 번째도 같고 태그 기록이 남았다. 빈 키는 빠져 `/health` 가 429 없이 200 이었다. 이어서 cron 환경 그대로
  배치 4종과 백업이 돌았다(만료 예고는 FCM 키가 없어 의도대로 멈췄고, 그 안내 문구가 위 결함이었다). 확인 뒤 스택 · 볼륨 · 이미지를 지웠다.
- **남은 것**: runner 설치 · 시크릿 · `DEPLOY_AWS_ENABLED` 는 서버에서 하는 일이다 — backlog B-8. 실제 runner 위의 첫 배포는 아직이다.

## 2026-10-08 (이어서) — AWS 공모전 서버 첫 배포(backlog B-8)

인스턴스에서 `deploy/aws/install.sh` 로 runner(`dweax-snaply`, 라벨 `snaply-aws`)를 등록하고, 시크릿을 채우고(필수 10개 — 외부 연동 키는
비워 둠), 저장소 Variables 에 `DEPLOY_AWS_ENABLED=true`, 포크 PR 워크플로 승인을 "모든 외부 협업자"로 올렸다. `97e7f7c` 의 Deploy 를
다시 돌려 첫 배포가 끝까지 갔다 — 작업 전 검사 통과 → 시크릿 10개 키(빈 값 15개 제외) → GHCR 로그인 → 마이그레이션 30개 → 일곱
서비스 기동 → `db=connected`. 공개 도메인 `https://snaply-api.dweaxai.com/health` 가 ALB 를 거쳐 200 · `db=connected` 를 돌려줬다.

- **알게 된 것** — snaply 역할에 `DescribeSecret` · `ListSecrets` 가 없어 콘솔의 Secrets Manager 화면이 열리지 않고 CloudShell 도 막혀 있다.
  CLI 프로필로는 읽기 · 쓰기가 되고 인스턴스 역할로도 읽힌다. 절차를 [deployment-aws.md](./deployment-aws.md) §2 에 적었다. 첫 배포
  전에는 `/data/compose/deploy` 가 비어 있어 시크릿 형식 확인은 체크아웃의 스크립트로 한다(같은 절).
- **남은 것**: 테스터 앱 빌드로 폰에서 업로드 → 편집 → 재생 확인, 외부 연동 켜기 — backlog B-8.

## 2026-10-09 — 편집 진행률 WebSocket 이 ALB 유휴 제한을 넘기지 않는다(backlog B-8)

인프라 문서("snaply — AWS 구성 · 인프라 접속")를 요청서·저장소와 대조했다. 보안그룹 · 포트 · 인스턴스 역할 · 시크릿의 빈 값 ·
`/health` 200 · `/data` 배치는 이미 `main` 이 맞춰 두었고, 남은 불일치는 하나였다 — **공용 ALB 의 유휴 제한이 180초**인데
진행률 WebSocket 은 ping 이 없어 편집 단계 사이가 길면 끊겼다.

- **고침** — `/edit-jobs/{id}/progress` 가 열려 있는 동안 서버가 30초마다 프로토콜 ping 을 보낸다(`edit-jobs.ts`). 제어 프레임이라
  메시지 계약은 그대로다. [api-spec.md](./api-spec.md) WebSocket 절 · [deployment-aws.md](./deployment-aws.md) §6 갱신.
- **검증**: `npm test -w apps/api` 612 통과 · `typecheck` · `lint` 통과. ALB 뒤에서 180초 넘게 열어 두는 실측은 하지 않았다
  (테스터 앱 빌드 뒤 긴 편집으로 확인 — backlog B-8).

## 2026-10-09 (이어서) — 사내 서버를 접고 배포 대상을 AWS 하나로

**결정**: 사내 물리 서버에는 올리지 않는다. 사내망 전용이라 실사용자를 받을 수 없었고, 바깥에서
닿는 AWS 공모전 서버(backlog B-8)가 뜨면서 두 서버를 함께 둘 이유가 사라졌다. 배포 대상은
[decisions/aws-contest-server.md](./decisions/aws-contest-server.md) 하나다.

지운 것 — **쓰이지 않는 배포 경로를 남겨 두면 다음 사람이 어느 쪽이 현행인지 묻게 된다.**

- `docker-compose.prod.yml`(사내 서버 전용 오버레이)
- `deploy.yml` 의 `deploy` 잡(`runs-on: [self-hosted, snaply]`). 남은 배포 잡은 `deploy-aws` 하나다
- `docs/deployment.md` → [archive/deployment-on-prem.md](./archive/deployment-on-prem.md),
  `docs/decisions/on-prem-deployment.md` → [archive/on-prem-deployment.md](./archive/on-prem-deployment.md)
  (둘 다 상단 배너로 뒤집힌 사실을 적었다)

남긴 것 — **배치 cron · 배치 실행 · DB 백업 스크립트는 AWS 와 공유**다(`deploy/aws/render-cron.sh` 가
`deploy/batches.cron` 에서 경로와 compose 파일만 바꿔 깐다). 다만 `run-batch.sh` · `backup-db.sh` 의
`COMPOSE_FILE` 기본값이 지워진 오버레이를 가리키고 있어 `docker-compose.aws.yml` 로 바꿨다 — 그대로
뒀으면 `COMPOSE_FILE` 없이 손으로 돌릴 때 없는 파일을 찾았다.

[deployment-aws.md](./deployment-aws.md) §4 가 배치 시각표를 **직접** 담는다. 전에는 사내 서버 문서에
맡겨 두었는데 그 문서가 archive 로 가면서 현행 문서가 보관 문서를 가리키게 되기 때문이다.

함께 닫힌 것: 사내 서버 운영 오버레이의 포트·`SENTRY_DSN` 결함(파일이 사라졌다), B-8 의
"사내 서버와의 관계" 항목.

**뒤이어 놓친 전제 다섯 군데**(같은 날 점검표 대조에서 찾았다). 파일을 지우는 것만으로는 사내 서버
전제가 사라지지 않는다 — 문장과 기본값에 남아 있었다.

- `deploy/batches.cron` 이 "(사내 서버)" 제목과 수동 설치 안내를 달고 있었다. 실제로는
  `render-cron.sh` 가 `SNAPLY_DIR` 줄을 바꿔 깔므로, 손으로 깔라는 안내는 사본을 만들게 한다.
  백업 주석의 "영상 파일은 MinIO 에 있지만" 도 AWS 에서는 S3 다
- `render-cron.sh` 와 `minio-image.yml` 의 주석이 사라진 문서·서버를 가리켰다
- **D-1(고정 도메인)** — AWS 서버가 `https://snaply-api.dweaxai.com` 으로 그 조건을 채웠지만,
  **공모전이 끝나면 내려간다.** 콘솔에 등록한 리디렉션 URI 는 주소가 바뀌면 다시 등록해야 하므로
  항목을 닫지 않고 "계속 쓸 도메인을 그 전에 정한다" 로 바꿨다
- **E-7(MinIO 수명)** — 사내 서버가 MinIO 를 운영 스토리지로 **노출**하던 것이 이 결정의 핵심 위험이었다.
  그 자리가 없어져 남은 쓰임은 로컬 · CI 뿐이므로 ⚠️ 를 뗐다
- **`OPENAI_API_KEY` 운영 키 분리** — C-7 에서 B-1 로 옮겨 둔 항목이라 B-1 을 닫으면서 함께 사라질 뻔했다.
  B-8 로 옮겼다

`decisions/aws-contest-server.md` 의 "이 결정이 정하지 않는 것"(사내 서버와의 관계)도 결정된 사실로 바꿨다 —
현행 결정 문서가 이미 답이 난 질문을 열린 것으로 두면 다음 사람이 다시 묻는다.

**푸시 전 최종 검토(같은 날)** — 독립 리뷰를 한 번 더 받아 **같은 유형을 네 번째로** 찾았다.
파일을 지우고 나서 "지운 전제" 를 세 라운드에 걸쳐 하나씩 찾은 것이 이 작업의 교훈이다 —
처음에 `deploy/` 의 **모든 기본값과 모든 절대 경로를 한 번에 전수 조사**했어야 했다(이번에 그렇게 했다).

- `deploy/backup-db.sh` 헤더가 "영상 파일은 MinIO 에" 라고 적고 있었다. 같은 커밋이 `batches.cron` 의
  **똑같은 문장**은 S3 로 고치면서 옆 파일을 빠뜨렸다. 닫힌 B-1 참조도 함께 있었다
- **승계 누락** — B-1 의 `DB 백업의 외부 보관` 이 어디에도 옮겨지지 않았다. D-1 · E-7 ·
  `OPENAI_API_KEY` 는 챙겼는데 이것만 빠졌다. `/data` 를 인프라가 매일 스냅샷해 DB 쪽 위험은
  해소됐지만 **S3 영상은 버전 관리가 꺼져 있어 지우면 복구 불가**다 — 그 사실이 런북에만 있고
  백로그에 없었다(AGENTS "미결은 backlog 에만"). B-8 에 사각을 좁혀 다시 적었다
- `apps/api/src/routes/legal.ts` 가 국외 이전 판단 근거로 **"운영 배포가 없어서 로컬은 MinIO 로 돈다"**
  를 들고 있었다. 서버가 떴으므로 이제 실제 값을 확인할 수 있다 — 법적 판단은 D-2 에 남겼다
- 현행 결정 문서 네 곳이 닫힌 B-1 을 가리켰다: `env-management.md` 헤더 두 줄(같은 커밋이 본문
  §후속 연계만 고쳤다) · `decisions/README.md` 착수 순서 · `sns-webhook-scope.md` 관련 문서 줄과
  권장안(도메인 현황 파악이 끝난 사실을 반영하지 못했다) · `aws-contest-server.md` 의 기각 근거

검증: 저장소 전체 마크다운 상대 링크 **깨짐 0건**, API 612 · Python 212 · typecheck · lint 통과,
`render-cron.sh` 실행 확인. `README.md` 문서 지도에 현행 배포 런북 행을 추가했다 — 전에는 배포
문서가 지도에 아예 없었다.

## 2026-10-09 (이어서) — 지운 스냅의 분석 결과를 지운다(ANA-3 `구현됨`, backlog E-18 닫음)

개인정보처리방침은 "영상을 삭제하면 그 영상의 분석 결과도 함께 삭제됩니다"라고 고지하는데, 서버는 지운 스냅(최근 삭제)과 만료된
스냅의 `videos` 행을 툼스톤으로 남기고 `video_analyses` 는 행이 실제로 지워질 때만 Cascade 로 사라져서 분석 결과가 계정 삭제 때까지
남았다(2026-10-09 문서 감사에서 발견). 고지에 코드를 맞췄다(오너 결정).

- **지우는 순간 파기한다** — `deleteVideo`(`apps/api/src/services/video.service.ts`)가 휴지통에 보내는 경우와 파일을 바로 지우는 경우
  모두 같은 트랜잭션에서 그 영상의 분석 결과를 지운다. 되살린 스냅은 분석이 필요해질 때 다시 분석된다(분석은 요청 시점에만 돈다,
  ANA-1). 진행 중이던 분석은 워커가 결과를 쓸 행이 없어 버린다(`apps/ai-worker/src/analysis_db.py` `save_result`).
- **정리 배치도 거둔다** — 만료 정리(`purgeVideoAssets`)와 남은 객체 회수(`purgeOrphanedObjects`, `apps/api/src/services/retention.service.ts`)가
  로컬 신호와 함께 분석 결과를 지운다. 지우는 순간과 겹친 분석 요청이 남긴 행을 회수 배치가 거둔다.
- **API 설명** — `DELETE /videos/{id}` 의 description 이 "무비에서 곧바로 사라진다"고 했는데 무비의 컷은 `unavailable` 로 남는다.
  함께 고치고 분석 결과 파기를 적었다(`openapi.json` 재생성, [api-spec.md](./api-spec.md)).
- **검증**: `video-trash.test.ts` 3건(휴지통으로 가도 · 되돌릴 수 없는 삭제도 · 되살려도 결과가 돌아오지 않는다)과 `retention.test.ts` 2건
  (만료 정리 · 회수 배치)을 더했다. 수정을 빼면 다섯 건 모두 실패하는 것을 확인했다. `npm test -w apps/api` 41개 파일 624건 통과.

## 2026-10-09 (이어서) — 문서 전수 정리 · constitution 확정 · 팀 분담(backlog B-7 닫음)

저장소 문서 약 130개를 영역 10개로 나눠 코드와 대조했다(2026-09-27 정리 이후 두 번째).

- **공통 규격** — [doc-conventions.md](./doc-conventions.md)에 §헤더(라벨 다섯 개 · 상태어 · 상태 줄에 구현 진척을 쓰지 않는다 · 정정과
  후속 결정은 배너)와 §본문(미결은 백로그에만, ID · 절 링크로 가리킨다, 절대 날짜, 줄 번호 대신 경로 + 심볼)을 정했다. 규격 위반
  33개 문서를 0으로, progress 항목 제목 87개를 `## YYYY-MM-DD — 제목` 으로 맞췄다. 계획 인덱스 [plans/README.md](./plans/README.md)를 새로 만들었다.
- **코드와의 정합성** — 새로 clone 하면 API 가 뜨지 않던 ONBOARDING 의 빠진 단계(`shared-types` 빌드), 없는 함수명 · 낡은 UI 문구 ·
  빠진 라우트 6개(모바일 기능 문서), 실제와 달랐던 스펙 라벨(MOV-8 · MOV-9 · MOV-11 · ANA-3 · CRD-4 → `부분`), 터널 업로드에 필요한
  `S3_PUBLIC_ENDPOINT`(sns-setup · local-tunnel) 등을 고쳤다. 이미 구현된 요구를 역으로 뽑아 MOV-23 · MOV-24 를 붙였다.
- **빠진 것** — AGENTS.md 문서 갱신 의무 표에 명령 · 인프라 → ONBOARDING, 배포 구성 → 배포 문서, 새 모듈 → team.md §1, 백로그 항목을
  끝냄 → 닫은 항목 + progress 행을 더했다. 스펙 · 계획에만 있던 미결을 백로그로 옮겼다(A-7 · A-10 · A-11 · C-1 · E-18~E-23 · G · 새 절 H).
- **constitution 확정** — 2026-09-02 부터 `초안` 이던 [constitution.md](./constitution.md)를 오너가 확정했다(상태 `현행`). 조항은 바꾸지 않았다.
- **팀 분담** — [team.md](./team.md) §1 을 커밋 이력(2026-10-09, `main` 429개 — 머지 · 대량 이동 커밋 제외)에 맞췄다. 트랙(미디어/편집 ·
  플랫폼/수익화)은 그대로 두고 담당을 실제로 고쳐 온 사람으로 적었으며, 표에 없던 모듈(backlog B-7)을 모두 배정했다. 근거 표는
  team.md 의 "담당 배정의 근거"에 있다.
- **검증**: 깨진 상대 링크 · 앵커 0, 헤더 규격 위반 0(스크립트), 문서에 적힌 `npm run` 스크립트가 모두 실재. 코드 · 설정에서 발견해
  고치지 않은 것은 백로그 E-19~E-23 · G 에 있다.

## 2026-10-09 (이어서) — 무비는 한 번에 하나씩 만든다(MOV-11 `구현됨(실기기 미검증)`, backlog A-10)

MOV-11 은 사용자당 진행 중 생성을 한 번에 하나로 요구하는데, 앱은 한 무비의 중복 생성만 막고 서버도 무비당 하나만 막아 서로 다른
무비는 동시에 생성됐다(2026-10-09 문서 감사에서 발견). 요구를 유지하고 구현했다(오너 결정).

- **서버가 강제한다** — `createEditJob`(`apps/api/src/services/edit-job.service.ts`)이 크레딧 확인과 같은 유저 행 잠금 안에서 같은 사용자의
  `queued` · `processing` 작업을 찾아, 있으면 `409 GENERATION_IN_PROGRESS` 와 그 작업의 무비 id(`error.movieId`, 무비 없는 작업이면 `null`)를
  돌려준다. 무비 생성과 `POST /edit-jobs` 가 같은 길을 지나므로 둘 다 막힌다. 크레딧 부족(402)이 먼저다. 갇힌 작업은 그 무비에서 취소하면
  풀린다. 계약: `packages/shared-types/src/contract/common.ts` 의 `generationConflictErrorSchema` 를 두 라우트의 409 에 선언했다(`openapi.json` 재생성).
- **앱이 미리 막고 안내한다** — `startGeneration`(`apps/mobile/src/features/compose-movie/model/use-compose-movie.ts`)이 이 기기가 아는 다른
  `generating` 무비가 있으면 아무것도 보내지 않고 `busy` 로 거절하고, 다른 기기에서 시작한 생성은 서버의 409 를 같은 사유로 읽는다
  (`lib/read-generating-movie.ts`). 무비 화면은 "다른 무비를 만드는 중이에요. 다 만들어지거나 취소하면 만들 수 있어요."와
  `만드는 중인 무비 보기` 를 보인다(`pages/movie/ui/refusal-notice.tsx`). 기능 문서 [movie.md](../apps/mobile/docs/features/movie.md) · studio.md.
- **검증**: API — `movies.test.ts` 에 다른 무비가 생성 중이면 409 · 동시에 두 무비를 보내도 하나 · 앞선 작업이 `done` · `failed` · `canceled`
  면 다음을 만든다 · 다른 사용자는 막지 않는다 · 무비 없는 작업이면 `movieId: null` 을 더했다. 검사를 빼면 셋이 실패한다.
  `npm test -w apps/api` 41개 파일 624건 통과. 앱 — 거절 사유 · 409 매핑 · 문구 테스트를 더했고 `npm run verify:mobile` 통과
  (173개 스위트 1390건, lint 경고 1건은 원래 있던 `notification-settings-store.ts` 의 것). 실기기는 확인하지 않았다 — backlog F.
- **남은 것**: 보드 · 그리드의 `다시 시도` 는 거절 이유를 말하지 않는다(원래 있던 한계, 이제 더 자주 보인다) — backlog E-24.

## 2026-10-09 (이어서) — 실패한 무비 카드가 다시 시도의 거절을 말한다(MOV-12, backlog E-24 닫음)

스튜디오 보드와 무비 탭의 실패 카드에서 `다시 시도` 가 거절되면(다른 무비를 만드는 중 · 올라가는 중 · 크레딧 부족 등) 아무것도 바뀌지
않았다 — 거절 문구는 무비 화면에만 있었다. 한 번에 하나씩 만들게 된 뒤(MOV-11) 이 거절이 흔해져서 카드에서 답하게 했다.

- **스펙** — MOV-12 에 "재시도가 시작되지 못하면 누른 자리에서 그 이유를 알린다"를 더했다([specs/movie.md](./specs/movie.md)).
- **카드에 짧게 답한다** — `MovieFailureNotice`(`apps/mobile/src/widgets/movie-shelf/ui/movie-failure-notice.tsx`)가 거절되면 실패 사유 줄
  자리에 거절의 첫 문장을 띄운다("다른 무비를 만드는 중이에요.", "크레딧이 부족해요 · 40/100." 등). 그리드에서는 사유처럼 한 줄로 잘라
  타일 높이가 그대로다. 다음 누름의 답이 올 때까지 남고, 시작 요청이 진행 중이면 버튼을 막아 두 번째 누름이 첫 요청 때문에 거절되지 않게 했다.
  무비 화면으로 보내는 안은 누른 자리와 다른 곳에 떨어뜨리는 이동이라(UX `Unpredictable Jump`) 고르지 않았다.
- **문구 원천을 하나로** — 생성 거절 문구를 `pages/movie/ui/refusal-notice.tsx` 에서 `features/compose-movie/lib/generation-refusal-copy.ts` 로
  옮겼다. 무비 화면(`generationRefusalMessage`, 전체 문장)과 카드(`generationRefusalHeadline`, 첫 문장)가 한 표에서 읽는다 — 페이지와 위젯은
  서로 import 할 수 없다. 기능 문서 [movie.md](../apps/mobile/docs/features/movie.md) · [studio.md](../apps/mobile/docs/features/studio.md).
- **검증**: 카드 테스트(거절 이유 표시 · 누를 때마다 그 답 · 진행 중 중복 시작 없음)와 문구 테스트를 더했다. 카드의 수정을 빼면 카드 테스트
  네 건이 모두 실패한다. `npm run verify:mobile` 통과
  (175개 스위트 1397건, lint 경고는 원래 있던 것). 실기기 · 에뮬레이터에서는 보지 않았다 — backlog F 의 MOV-11 실기기 확인에 합쳤다.

## 2026-10-09 (이어서) — 서버와 로컬의 OpenAI 키를 나눠 둔다(backlog B-8 항목 닫음)

C-7 에서 받은 회사 OpenAI 키를 로컬 개발과 AWS 서버가 함께 쓰면 한쪽이 새거나 폐기될 때 둘 다 멈춘다. 서버 시크릿과 로컬 `apps/api/.env`
가 서로 다른 키인 것을 오너가 해시 비교로 확인했다(`DIFFERENT` — 값은 꺼내지 않는다). 새 키를 어느 쪽에 줄지는 고정하지 않는다 —
한쪽이 새면 그쪽만 바꾸고, 로컬을 바꿔도 된다(오너). 규칙과 비교 명령은 [deployment-aws.md](./deployment-aws.md) §2.

- **재배포** — `146d618` 의 `Deploy to the AWS server` 잡을 다시 돌렸다(성공, `/health` → `db=connected`). env 파일의 키 수(10개, 빈 값 15개)가
  앞 실행과 같고 다시 만들어진 컨테이너가 없어, 서버가 쓰는 값은 그대로다.
- **확인하지 않은 것**: 서버의 `OPENAI_API_KEY` 가 비어 있지 않은지는 보지 않았다 — 비어 있어도 비교는 `DIFFERENT` 다. 비어 있으면
  `analysis-worker` 가 기동 단계에서 종료한다(같은 문서 §6).

## 2026-10-09 (이어서) — AWS 서버로 휴대폰에서 업로드 → 편집 → 재생(backlog B-8 테스터 앱 빌드 닫음)

오너의 Galaxy S22 Ultra 에 이 서버를 보는 release 빌드를 깔아 도메인(`https://snaply-api.dweaxai.com`)으로 한 바퀴 돌았다. 테스터 앱을 만들고
까는 법과 주의는 [deployment-aws.md](./deployment-aws.md) §8.

- **빌드** — `f6be057`(main `146d618` 에 E-24 수정을 얹은 PR #57 의 브랜치)을 `EXPO_PUBLIC_API_BASE_URL` 로 release 빌드했다. 번들에 그 주소와
  E-24 의 문구 형태가 들어간 것을 확인했다. 이 빌드가 release 출력 폴더를 비워 먼저 있던 `snaply-tester-395cbde.apk` 가 지워졌다.
- **설치** — 개발용 앱 위에 `install -r` 로 깔려 로그인과 기기의 라이브러리가 남았다. 라이브러리는 계정으로만 나뉘므로 별도 계정
  (테스트 계정)으로 진행했다. 처음 뜬 약 20초는 이미 로그인돼 있던 계정으로 이 서버에 붙었는데, 로그아웃 뒤 테스트 계정의 화면이
  똑같아 처음부터 테스트 계정이었던 것으로 본다.
- **크레딧** — 새 계정은 0 이다. 오너가 서버 셸에서 `credit_ledger` 에 `promo` 500 을 넣었고 나 탭이 500 을 읽었다.
- **확인한 것** — 새로 찍은 스냅을 넣은 무비의 생성이 `uploading` 으로 거절되지 않았다(업로드가 서버에 닿았다) → 스타일을 일상에서 감성으로
  바꿨다 → 생성이 1분 안에 끝났다(19:59:45 시작, 20:00 완성) → 감상 화면이 "감성"으로 읽고, 재생 중 세 번 찍은 화면에 세 컷이 순서대로 나왔다.
- **MOV-11(이 기기 쪽)** — 한 무비를 다시 만드는 동안(20:02:23 시작) 다른 무비의 `무비 만들기` 를 누르니 "다른 무비를 만드는 중이에요. 다 만들어지거나
  취소하면 만들 수 있어요."와 `만드는 중인 무비 보기` 가 떴다. 링크는 그 무비를 열었고(그사이 완성), ← 는 거절된 무비로 돌아와 링크 없이 문구만 남았다.
- **확인하지 않은 것** — 다른 기기에서 시작한 생성의 409(같은 서버를 보는 기기가 둘 필요하다), 실패 카드의 거절 안내(E-24 — 실패한 무비가 없었다),
  완성 푸시(무비 알림은 기본 꺼짐), 배치(cron)의 실행. MOV-11 의 `(실기기 미검증)` 은 남은 409 확인 뒤에 지운다(backlog F).

## 2026-10-09 (이어서) — 휴대폰 실기기 확인 — 알림 · 정리 · 앨범(SNAP-18 `구현됨`, backlog A-1 · A-4 · F)

이 서버를 보는 테스터 앱(Galaxy S22 Ultra, 테스트 계정)으로 실기기 미검증 항목을 이어서 확인했다. 기기는 하나였다.

- **알림 권한(NTF-7)** — 무비 완성 알림을 켜자 OS 가 물었고, 거절하니 스위치는 꺼진 채 "기기 설정에서 Snaply 알림을 켜야 받을 수 있어요."와
  `설정에서 권한 켜기` 가 떴다. 그 줄은 OS 설정의 앱 화면을 열었다. 켠 뒤 `pm revoke` 로 권한을 회수하고 다시 여니 스위치는 켜진 채 같은 안내가
  떴다(권한이 없는 기기로 로그인한 것과 같은 상태). 위치 알림의 같은 안내는 보지 않았다 — backlog F.
- **완성 푸시(A-1 ③)** — 앱이 뒤에 있을 때와 프로세스가 없을 때 각각 알림이 한 건 왔고, 탭하니 그 무비가 한 번 열렸다(종료 상태에서도 스튜디오가
  아니라 그 무비). **앱을 연 채로는 두 건이 떴다** — 앱 시작 때 계정 설정이 첫 푸시 등록 도중에 도착해 등록이 두 번 돌고, 첫 실행이 정리된 뒤에
  포그라운드 리스너를 남겼다. `fix(mobile): show a foreground push once`([#59](https://github.com/vlog-studio/snaply-backend/pull/59))로 고쳤고,
  고친 빌드에서 한 건이 뜨고 그 알림의 탭도 그 무비를 열었다.
- **정리하기(A-1 ④)** — `저장했어요, 정리하기` 뒤 감상 화면과 결과물이 사라지고 무비가 초안으로 돌아왔다(보드 `초안 · 컷 1`).
- **앨범(A-4 ① ② ④)** — 재생 화면의 `앨범에 저장` 은 권한 질문 없이 `Pictures/Snaply/` 에 찍은 시각(`datetaken`)으로 저장됐다. 자동 앨범 저장을
  켜고 찍은 스냅은 찍는 순간 같은 곳에 쌓였다. 이 기기에서만 삭제한 스냅은 목록에 남고 재생됐으며(3초 파일이라 받아 오는 화면은 보지 못했다)
  그 스냅이 든 무비가 만들어졌다. 갤러리에 테스트 사본 두 개가 남아 있다.
- **찾은 것** — 어떤 알림도 앱이 만든 `default` 채널로 가지 않는다: 뒤에서 받은 푸시는 FCM 기본 채널, 앱을 연 채로 띄운 알림은 expo 기본 채널이다.
  backlog E-25 로 올렸다.
- **남은 것** — A-1 ①(찍자마자 담은 초안이 서버에 생기는지) · ⑥(계정 전환), 다른 기기에서 온 스냅의 앨범 저장(SNAP-17), 이 기기에서만 삭제한 스냅의
  만료(SNAP-19), 위치 알림의 권한 안내(NTF-7), 다른 기기에서 시작한 생성의 409(MOV-11). ⑥ · SNAP-17 · MOV-11 은 같은 서버를 보는 기기가 하나 더 필요하다.

## 2026-10-09 (이어서) — 휴대폰과 에뮬레이터로 — 다른 기기 · 삭제 · 업로드 전 무비(MOV-11 · SNAP-17 `구현됨`, backlog A-1 · A-4 · F)

에뮬레이터(`snaply_api35`)에도 테스터 앱을 깔아(이미 같은 테스트 계정으로 이전 테스터 빌드가 있었다) 휴대폰과 두 기기로 같은 AWS 서버를 봤다.

- **다른 기기의 스냅 앨범 저장(SNAP-17 ③)** — 에뮬레이터에서 찍은 스냅을 휴대폰에서 저장하니 보관 사본(서버 영상 id 이름)이 찍은 시각 자리에
  놓였다(`datetaken` 20:42:17). 먼저 고른 표본은 영상에서 가져온 스냅이었는데, 앱은 가져온 순간을 촬영 시각으로 써서 "오늘"에 묶는 반면
  앨범 사본은 파일에 든 원본 영상의 날짜(10/1) 자리에 놓였다 — 가져온 스냅에서만 둘이 갈린다.
- **다른 기기에서 시작한 생성(MOV-11)** — 휴대폰이 생성을 시작하고 1.6초 뒤 에뮬레이터에서 다른 무비를 다시 만들기 하니, 서버의 409 로
  "다른 무비를 만드는 중이에요…"가 링크 없이 떴다(에뮬레이터는 그 무비가 만드는 중인 줄 몰랐다). 이 기기 쪽은 앞서 확인했으므로 MOV-11 은 `구현됨`.
- **다른 기기에서 지운 스냅의 컷(SNAP-12)** — 에뮬레이터가 스냅 X 로 무비를 만들고, 그 무비를 아직 모르는 휴대폰이 X 를 모든 기기에서 지웠다.
  에뮬레이터를 다시 여니 그 컷이 "컷 1 · 스냅 삭제됨", 무대가 "이 무비가 쓰던 스냅이 모두 삭제됐어요."였다. X 를 되살리자 컷이 다시 쓰였다.
- **최근 삭제(SNAP-20)** — 휴대폰에서 지운 X 가 에뮬레이터에서도 사라졌고, 휴대폰의 최근 삭제에서 되살리자 두 기기에 돌아왔다. 에뮬레이터에서
  지운 9월 30일 스냅도 최근 삭제에서 되살리자 휴대폰에 돌아왔고, 지울 때 빠진 `무비 10-09 (2)` 의 컷은 돌아오지 않았다(컷 2). 토스트의
  `되돌리기` 는 지운 기기에서 스냅을 돌려놓았지만 다른 기기가 그사이 동기화하지 않아 그쪽 반영은 보지 못했다 — backlog A-4. 토스트는
  UI 자동화 트리에 잡히지 않고 몇 초 만에 사라져 한 번은 누르기 전에 사라졌다.
- **업로드 전에 만든 무비(A-1 ①)** — 에뮬레이터를 비행기 모드로 두고 찍은 스냅("올리지 못함")으로 무비를 만들고 네트워크를 돌리자, 업로드가
  끝난 뒤 무비가 서버에 갔고 휴대폰에 나타났다. 이때 앱이 다시 열린 편집 화면의 `무비 만들기` 자리를 스냅 탭으로 가려던 탭이 눌러 생성이 한 번
  더 돌았다(크레딧 100, 테스트 계정 잔액 600).
- **찾은 것** — 이어받은 작업의 완성 시각이 그 기기가 알게 된 시각으로 보인다(8:20 에 끝난 무비가 에뮬레이터에서 "오후 8:37 완성") — backlog E-26.
  완성 푸시는 나중에 켠 기기 하나에만 간다 — 서버가 계정당 FCM 토큰 하나만 둔다(backlog B-2, 알려진 것).
- **남은 것** — A-1 ⑥(계정 전환), 실패 카드의 거절 안내(E-24 — 실패한 무비가 없었다), 되돌리기의 다른 기기 반영(SNAP-20), 이 기기에서만 지운 스냅의
  만료(SNAP-19, 2026-10-24), 위치 알림의 권한 안내(NTF-7), 촬영 스냅 치수(A-4).

## 2026-10-09 (이어서) — 테스터 앱을 EAS 로도 만든다

로컬 Gradle release 빌드(앞의 "AWS 서버로 휴대폰에서 업로드 → 편집 → 재생")와 따로, Android SDK 가 없는 컴퓨터에서 같은 서버를 보는
앱을 EAS 클라우드 빌드로 만들었다. 결과가 설치 링크라 테스터에게 그대로 보낼 수 있다. 절차는 [deployment-aws.md](./deployment-aws.md)
§8 "EAS 로 빌드해 링크로 나눠 주기".

- **빌드** — [`apps/mobile/eas.json`](../apps/mobile/eas.json) 에 `tester` 프로필(내부 배포 APK, API 주소)을 두고 Expo 계정 `dayomi` 의
  `snaply-app` 에 연결했다(`app.json` 의 `owner` · `extra.eas.projectId`). Supabase 클라이언트 값은 EAS 환경변수(`preview`)에 두었다 —
  서버 시크릿에는 anon 키가 없다(서버는 JWKS 로 검증해 필요 없다). 이 Mac 에 Android SDK 가 없어 EAS 를 골랐다.
- **`eas init` 이 `app.json` 을 풀어 썼다** — 플러그인이 계산한 위치 · 저장소 권한과 `extra` 까지 박아 넣었고,
  `READ_MEDIA_VISUAL_USER_SELECTED` 가 `permissions` 와 `blockedPermissions` 양쪽에 들어갔다. 되돌리고 `owner` · `projectId` 만 남겼다.
- **검증** — 실기기가 없어 Android 35(Play Store 이미지) 에뮬레이터에 APK 를 깔았다. 로그인 → 합성 세로 클립(3초 × 3)을 `가져오기` →
  무비 생성 → 서버 렌더 완성("10월 9일 오후 9:25 완성 · 2.6초") → 재생까지 됐다. 실기기 확인은 앞 항목의 Galaxy S22 Ultra 가 했다.
- **찾은 것** — 새 계정은 크레딧이 0 이라(가입 보너스 0 · 광고 보상 꺼짐 · 결제 mock) 무비를 만들 수 없다. 이번에는 서버 셸에서
  `credit_ledger` 에 `promo` 1000 을 넣었다(처음에 Supabase UID 를 `users.id` 자리에 넣어 FK 오류가 났다 — 둘은 다른 값이다).
  공모전 동안의 지급 방식은 바로 아래 항목, iOS 는 backlog B-8.

## 2026-10-09 (이어서) — 공모전 서버의 가입 보너스(CRD-8) · 중복 지급 경합 수정

테스터 앱 확인에서 새 계정이 크레딧 0 이라 무비를 만들 수 없음을 찾았다(바로 위 항목). 공모전 서버만 가입 보너스 **500**(무비 5편)을
주기로 했다 — 광고 보상을 켜는 안은 AdMob 콘솔 · SSV · 앱 재빌드가 필요해 늦고, 손으로 주는 안은 테스터마다 서버 셸이 필요하다.

- **스펙** — CRD-8 에 공모전 서버의 값과 "계정마다 한 번 · 켜기 전 계정도 다음 요청에서 받는다"를 적었다
  ([specs/credits-and-payment.md](./specs/credits-and-payment.md)). 기본값 0 은 그대로라 코드 기본값은 바꾸지 않았다.
- **켜기 전에 고친 결함** — `grantSignupBonus`(`apps/api/src/services/credit.service.ts`)는 인증된 요청마다 "없으면 넣는다"를 해서,
  앱이 시작할 때 보내는 동시 요청에서 두 번 들어갈 수 있었다. 값이 0 이라 드러나지 않았다. 부분 유니크 인덱스는 Prisma 스키마로
  선언할 수 없어(다음 마이그레이션이 지운다) 예약처럼 유저 행 `FOR UPDATE` 로 직렬화하고 잠금 안에서 다시 확인한다. 이미 받은 계정은
  잠그기 전에 돌아간다.
- **검증** — `billing.test.ts` 에 "동시 요청 20개에도 한 번만" · "켜기 전에 가입한 계정도 다음 요청에서 한 번"을 더했다. 수정을 빼면
  첫 테스트가 `expected 2 to be 1` 로 실패한다. `npm test -w apps/api` 41개 파일 626건 통과.
- **남은 것** — 서버 시크릿에 값을 넣는 일(backlog B-8).

## 2026-10-09 (이어서) — 가입 보너스를 서버에서 켰다(backlog B-8 테스터 크레딧 닫음)

- **반영** — 경합 수정이 든 `d4f40bc` 를 배포하고, 시크릿 `dweax/service/snaply/env` 에 `CREDIT_SIGNUP_BONUS=500` 을 더했다(키 25 → 26개,
  나머지 값은 그대로). 배포가 시크릿을 고친 뒤에 env 파일을 만들어 `/data/compose/.env` 에 `CREDIT_SIGNUP_BONUS='500'` 이 들어갔다 —
  `write-env.sh` 가 값을 작은따옴표로 감싸므로 `grep '=500'` 으로는 찾지 못한다.
- **확인** — 배포 직후 `signup_bonus` 행은 0 이었고(요청이 아직 없었다), 에뮬레이터에서 테스트 계정으로 앱을 다시 열자 그 계정에
  `signup_bonus` 가 **1행** 들어왔다. 앱은 시작할 때 요청을 여러 개 동시에 보내므로 중복 없이 한 번이다.

## 2026-10-09 (이어서) — 촬영 화면의 권한 버튼 라벨을 맞춘다(backlog E-23 닫음)

권한이 거절된 뒤 OS 설정으로 보내는 버튼이 앨범 · 알림 화면은 `설정에서 권한 켜기` 인데 촬영 화면만 `설정에서 권한 열기` 였다(UX `Inconsistent Twin`).
촬영 화면(`apps/mobile/src/pages/capture-record/ui/capture-record-page.tsx`)을 `설정에서 권한 켜기` 로 맞추고, 두 라벨이 언제 나오는지를
[capture-flow.md](../apps/mobile/docs/features/capture-flow.md)에 적었다. 이 화면에는 테스트가 없고 문구 하나만 바뀌어 새로 더하지 않았다.

- **검증**: `npm run verify:mobile` 통과(175개 스위트 1398건, lint 경고 1건은 원래 있던 것). 기기에서는 보지 않았다.

## 2026-10-09 (이어서) — `API_HOST_PORT` 를 환경변수 원천에 선언한다(backlog E-22 닫음)

컨테이너 스택(`docker-compose.yml`)의 api 호스트 포트 `API_HOST_PORT` 가 [`env-spec.ts`](../apps/api/src/env-spec.ts)에 없었다(AGENTS.md: 새 변수는
env-spec 부터). `POSTGRES_HOST_PORT` 처럼 `origin: 'local'` 로 선언하고 [`.env.example`](../.env.example)에 빈 예시와 설명을 넣었다. 지금 이 값을
읽는 곳은 `docker-compose.yml` 과, 값을 스스로 정해 넘기는 `scripts/smoke-images.sh` 다 — 백로그가 들던 배포 잡의 헬스체크는 AWS 로 옮기며 고정
3000 을 쓰게 되어 더는 읽지 않는다.

- **검증**: `npm test -w apps/api` 41개 파일 624건 통과(`env-spec.test.ts` 포함).

## 2026-10-09 (이어서) — 낡은 코드 주석 · 설명을 고친다(backlog G 항목 닫음)

동작은 맞고 글만 낡았던 곳을 한 번에 고쳤다(2026-10-09 문서 감사에서 모은 목록).

- `.github/workflows/deploy.yml` 머리 주석 — 배포 대상은 AWS 서버의 self-hosted runner, 시크릿은 Secrets Manager 에서 배포 때 만든 env 파일이다.
  주석만 바뀌었지만 이 파일은 `deploy.yml` 의 `paths` 에 들어 있어 머지하면 같은 코드로 배포가 한 번 돈다.
- `DELETE /auth/me/analysis-consent` 설명 — 파기 대상에 편집 초안 기록을 더했다(`withdrawAnalysisConsent` 가 `movieDraft` 도 지운다).
  `openapi.json` 은 그 한 줄만 바뀌었고, [api-spec.md](./api-spec.md)는 이미 맞게 적혀 있었다.
- `schema.prisma` `AdReward.status` 주석에 `abandoned` 를 더했다(`npm run db:generate` 로 클라이언트를 다시 만들었다, 마이그레이션 없음).
- `.env.example` Redis 머리말의 "운영: Upstash" 를 걷었다 — AWS 서버도 compose 의 redis 컨테이너다.
- `scripts/media-cleanup.mjs` 머리 주석 — 정리 대상은 `media:e2e` 가 공유 DB 에 만든 데이터이고, 통합 테스트는 `snaply_test` 만 쓴다.
- `retention-policy.ts` `EXPIRY_NOTICE_HOUR_KST` — 배치 로그용 표시값이고 실제 시각은 `deploy/batches.cron` 이 정한다고 적었다.
- 앱의 "(global) deep-link handler" 주석 9곳 — 인증 메일의 링크는 Expo Router 가 `pages/auth-callback` 화면으로 보내 그 화면이 코드를 교환한다.
  백로그 목록의 7개 파일에 같은 표현을 쓰던 `use-sign-up-flow.ts` · `sign-up-provider.ts` 를 더했다.
- `apps/mobile/.prettierignore` — 없는 대상(`src/shared/api/schema.d.ts` · `docs/api/openapi.json` · `docs/guides/**/*.html`)과 없는 스크립트를 가리키던 줄을 지웠다.
- **검증**: `npm test -w apps/api` 41개 파일 624건 · API typecheck · `npm run verify:mobile`(175개 스위트 1398건, lint 경고 1건은 원래 있던 것) 통과.

## 2026-10-09 (이어서) — 무비의 완성 시각은 서버가 기록한 작업 종료 시각이다(backlog E-26 닫음)

다른 기기에서 8:20 에 끝난 무비가 늦게 켠 에뮬레이터에서 "오후 8:37 완성"으로 보였다 — 진행 중이던 작업을 이어받은 기기가 끝을 확인한 순간의
`Date.now()` 를 `render.renderedAt` 으로 썼기 때문이다(`apps/mobile/src/features/compose-movie/model/use-generation-runner.ts` `finish`).
백로그는 무비 계약에 시각을 더해야 한다고 적었지만, 앱이 끝을 확인하는 `GET /edit-jobs/{id}` 가 이미 `completedAt` 을 싣고 있어 계약은 그대로 두었다.

- **고친 것** — `getEditJob` 이 `completedAt` 을 epoch ms 로 읽고(`api/get-edit-job.ts`, 없거나 읽을 수 없으면 뺀다), 러너가 그 값을 `renderedAt` 으로
  쓴다. 서버가 시각을 주지 않았을 때만 지금 시각으로 떨어진다. 받아 온 `ready` 무비 중 작업 id 가 없는 것은 그대로 무비의 `updatedAt` 을 쓴다
  (`entities/movie/lib/movie-sync.ts`). 기능 문서 [movie.md](../apps/mobile/docs/features/movie.md) Watch mode.
- **검증**: 러너 테스트(서버의 종료 시각으로 날짜를 매긴다 — 수정 전 실패)와 `get-edit-job` 테스트(읽기 · 없을 때 빼기)를 더했다. `npm run verify:mobile` 통과
  (175개 스위트 1403건, lint 경고 1건은 원래 있던 것). 기기에서는 보지 않았다 — 테스터 앱을 다시 빌드해 두 기기로 보면 된다.

## 2026-10-09 (이어서) — 모든 알림을 앱의 채널 하나로 보낸다(backlog E-25 닫음)

휴대폰 확인에서 어떤 알림도 앱이 만든 Android 채널(`default`)로 가지 않는 것이 드러났다 — 서버 푸시는 채널을 지정하지 않아 FCM 기본 채널로,
앱이 띄우는 알림은 채널을 넘기지 않아 expo 기본 채널로 들어갔다. 오너 결정으로 채널은 **하나**로 둔다(종류별 끄기는 계정의 알림 설정이 맡고,
만료 예고는 기기에서 따로 끌 수 없게 둔다). 결정은 [notification-preferences.md](./decisions/notification-preferences.md) §Android 알림 채널은 하나.

- **서버** — `sendToUser`(`apps/api/src/services/fcm.service.ts`)가 FCM 메시지에 `android.notification.channelId: 'default'` 를 싣는다.
- **앱** — `presentLocalNotification` 이 Android 에서 같은 채널을 지정하고, 채널 이름을 "기본 알림"에서 "알림"으로 바꿨다
  (`apps/mobile/src/shared/lib/notifications/local.ts` — 같은 id 라 이미 있는 채널은 이름만 바뀐다). 기능 문서
  [location-and-push-notifications.md](../apps/mobile/docs/features/location-and-push-notifications.md).
- **검증**: `fcm.test.ts` 의 발송 형태에 채널을 더했고(수정 전 실패), 앱에 `local.test.ts` 를 새로 두어 Android 의 채널 지정 · iOS 의 즉시 표시 ·
  같은 채널 생성을 본다(수정 전 Android 사례 실패). 기기에서는 아직 보지 않았다 — 테스터 앱을 다시 빌드한 뒤 `dumpsys notification` 으로
  세 경로(꺼짐 · 뒤 · 연 채로)의 채널을 본다. 서버 쪽은 배포된 뒤에야 휴대폰에서 효과가 보인다.

## 2026-10-09 (이어서) — 알림 채널과 완성 시각을 두 기기에서 확인한다(E-25 · E-26)

`main` `f356f81`(E-25 · E-26 머지 뒤)로 테스터 앱을 다시 빌드해 휴대폰과 에뮬레이터에 깔고, 같은 커밋이 AWS 서버에 배포된 뒤(22:12 KST) 확인했다.

- **알림 채널(E-25)** — 두 기기 모두 Snaply 의 `default` 채널 이름이 "알림"으로 바뀌었다. 앱을 연 채로 받은 완성 알림(앱이 띄움)과
  프로세스를 없앤 뒤 받은 완성 푸시(시스템이 띄움, 서버가 채널을 지정) 모두 `channel=default` 였다(`dumpsys notification`). 앱이 뒤에 있을 때는
  프로세스가 없을 때와 같은 시스템 표시 경로라 따로 돌리지 않았다. 이전 빌드를 썼던 기기에는 그 빌드가 만든 두 기본 채널(Miscellaneous)이 남아
  있다 — 출시 전이라 테스트 기기에만 있고 이제 아무것도 보내지 않는다.
- **완성 시각(E-26)** — 휴대폰이 22:14 · 22:16 · 22:17 에 만든 세 무비를, 그동안 동기화하지 않은 에뮬레이터가 22:18 에 받아 오니 "오후 10:14 ·
  10:16 · 10:17 완성"이었다(고치기 전이면 모두 10:18).
- **확인 중 바꾼 것** — 22시가 넘어 테스트 계정의 조용한 시간(22-08시)에 걸려 서버가 완성 푸시를 보내지 않으므로, 확인하는 동안 시작을 23시로
  미뤘다가 22시로 되돌렸다. 생성 세 번으로 테스트 계정 크레딧 300 을 썼다.

## 2026-10-09 (이어서) — 워커 쪽 취소 중단 · 실패 환급 실검증(backlog F 닫음, E-27 올림)

2026-08-13 · 08-14 에 문법 검증만 했던 두 경로를 로컬에서 실제 편집 워커(`npm run worker`)로 돌렸다. API 는 `auth:stub` 으로 인증하고
(`SUPABASE_URL=http://127.0.0.1:54321` — 스텁이 `127.0.0.1` 로 발급해 `localhost` 로 주면 issuer 가 달라 401 이다), 새 사용자에 20초 세로
합성 클립 셋을 `media-e2e.mjs --upload-only --token` 으로 올렸다. 로컬 `.env` 의 가입 보너스 1000 과 `promo` 300 으로 잔액 1300 에서 시작했다.

- **취소** — `export`(잔액 1300 → 1200) 직후 작업이 `processing` · 10 일 때 `DELETE /edit-jobs/{id}` → 잔액이 바로 1300 으로 돌아왔다(API 의 환급).
  워커는 그때 돌던 컷편집을 마친 뒤 다음 진행률 갱신(35)에서 "편집 취소 감지, 중단"으로 멈췄다(취소 12초 뒤). BGM · 업로드로 가지 않았고 MinIO 에
  그 작업의 결과물이 없다. 원장은 `export_reserve -100` · `export_refund +100` 한 번씩, 40초 뒤에도 작업 `canceled` · 무비 `draft` · 결과물 없음.
- **실패 환급** — 워커를 끈 채 `export`(1300 → 1200)하고 원본 하나를 MinIO 에서 지운 뒤 워커를 켰다. 다운로드가 404 로 실패해 작업이
  `failed`(`INTERNAL`)가 되고 워커가 `refund_export_credits` 로 환급했다 — 원장 `export_refund +100` 한 번, 잔액 1300.
- **찾은 것** — 실패 5초 뒤 BullMQ 가 같은 작업을 다시 넘겼고(`attempts: 3`), 워커는 `mark_processing` 거절을 "편집 취소 감지"로 적고 끝냈다.
  재시도가 실제로는 재시도하지 않고 일시적 실패도 첫 시도에서 확정된다 — backlog E-27. 환급은 두 번 되지 않았다.

## 2026-10-10 — 일시적 실패는 워커가 다시 시도한다(MOV-12, backlog E-27 닫음)

편집 큐는 `attempts: 3` 으로 넣는데 워커가 첫 예외에서 실패를 확정하고 환급해, 큐의 재시도는 시작에서 거절되며 "편집 취소 감지"로
찍히기만 했다(2026-10-09 "워커 쪽 취소 중단 · 실패 환급 실검증"). S3 일시 오류도 사용자에게 바로 실패로 갔다. 스펙 MOV-10 은 이미
"자동 재시도로 추가 차감되지 않는다"고 재시도를 전제하고 있었다.

- **스펙** — MOV-12 에 "일시적인 오류는 서버가 스스로 다시 시도(최대 3회) · 그동안 만드는 중 · 진행 줄이 '다시 시도하는 중' · 진행률은
  뒤로 가지 않음 · 마지막 시도까지 실패해야 실패로 알림 · 원본 없음 · 시간 초과는 바로 알림"을 더했다([specs/movie.md](./specs/movie.md)).
- **워커** — `process_edit_job`(`apps/ai-worker/src/worker.py`)이 마지막 시도(`attemptsMade + 1 >= attempts`)에서만 `failed` · 환급을
  확정한다. 그 전의 실패는 작업을 `queued` · 진행률 0 으로 되돌리고(`db.requeue_for_retry`, 그 사이 취소됐으면 다시 시도하지 않는다)
  `{progress: 0, step: "다시 시도"}` 를 보낸 뒤 큐에 맡긴다. 원본 없음 · 시간 초과는 `job.discarded` 로 남은 시도를 버리고 바로 확정한다
  (bullmq 파이썬 2.14 는 `UnrecoverableError` 를 따로 다루지 않는다). 시작이 거절되면 상태를 읽어 취소와 이미 끝난 작업(`JobSettled`)을
  가른다 — 끝난 작업을 "취소"로 적지 않는다.
- **앱** — 단계 문구 표에 `다시 시도` → "다시 시도하는 중"을 더하고(`lib/edit-step-label.ts`), 러너가 보여 준 진행률보다 낮게 보고된 단계는
  반영하지 않는다(`reportedStep`) — 다시 시작한 작업의 앞 단계가 문구를 거꾸로 돌리지 않게, 재시도 알림만 예외다. 기능 문서
  [movie.md](../apps/mobile/docs/features/movie.md) Progress.
- **API 문서** — 작업 상태가 `processing` → `queued` 로 돌아갈 수 있음을 route 설명(`openapi.json` 재생성)과 [api-spec.md](./api-spec.md)
  WebSocket 절에 적었다. 코드 변경은 없다(앱은 `queued` 를 "계속 기다림"으로 읽고, MOV-11 판정 · 취소는 `queued` 를 이미 다룬다).
- **검증** — 워커: `tests/test_edit_worker.py` 8건(일시적 실패는 되돌리고 확정하지 않음 · 마지막에 확정 · 재시도 없는 큐는 바로 확정 · 실패 중
  취소면 다시 시도 안 함 · 원본 없음 · 시간 초과는 바로 확정 · 끝난 작업은 settled · 취소된 작업은 canceled). 수정을 빼면 5건이 실패한다.
  앱: 문구 · `reportedStep` · 러너 테스트, 수정을 빼면 6건 실패. 로컬 실스택(auth 스텁 · API · 워커)으로 두 번 돌렸다 — 원본을 지운 채
  시작해 첫 시도 실패(작업 `queued` · 0, 환급 없음) 뒤 원본을 되돌리자 5초 뒤 재시도가 `done`(원장은 예약 -100 하나), 원본을 지운 채
  두면 0 · 5 · 10초 뒤 세 번 시도하고 마지막에만 `failed`(INTERNAL) · 환급 1회. 워커 220건 · `npm test -w apps/api` 41개 파일 626건 ·
  `npm run verify:mobile` 176개 스위트 1412건 통과(lint 경고 1건은 원래 있던 것). 기기 화면은 보지 않았다.

## 2026-10-10 (이어서) — SNS 업로드 준비 경고가 서명 호스트를 본다(backlog E-21 닫음)

인스타 · 틱톡에 넘기는 영상 URL 은 결과물의 presigned GET 이고, 서명 호스트는 `S3_PUBLIC_ENDPOINT` → `S3_ENDPOINT` → AWS S3 순이다
(`apps/api/src/services/storage.service.ts` `presignClient`). 그런데 기동 때 외부 도달 여부를 경고하는 `snsUploadReadiness` 는 CloudFront 를 먼저 보는
`publicBaseUrl` 을 판정해, `CLOUDFRONT_DOMAIN` 만 터널 주소이고 `S3_PUBLIC_ENDPOINT` 가 localhost 면 경고 없이 업로드가 400 이 됐다.

- **고친 것** — `StorageConfig.presignOrigin` 을 `presignClient` 와 같은 순서로 정하고(`apps/api/src/config.ts`), 기동 경고가 그 값을 본다
  (`apps/api/src/app.ts`). 경고와 업로드 거절(400) 문구가 고칠 값으로 `CLOUDFRONT_DOMAIN` 대신 `S3_PUBLIC_ENDPOINT` 를 말한다. 터널 스크립트
  (`apps/api/scripts/dev-tunnel.sh`)가 `.env` 에 넣을 값으로 `S3_PUBLIC_ENDPOINT=https://media-dev.<도메인>` 도 출력하고, 그 값을 손으로 넣으라던
  [local-tunnel.md](./local-tunnel.md) §6 · [sns-setup.md](./sns-setup.md) §1 을 고쳤다. AWS 서버는 엔드포인트가 비어 서명 호스트가 AWS S3 라 경고가 없다.
- **검증**: `config.test.ts` 에 서명 호스트 세 경우(AWS S3 · 공개 엔드포인트 · CloudFront 만 공개 — 수정 전 셋 다 실패)를 더했다. `npm test -w apps/api` 41개 파일 629건 ·
  typecheck · lint 통과.
- **남은 것**: 터널로 실제 키 업로드를 다시 돌리는 확인은 backlog F 로 옮겼다(C-2 · D-3 와 같은 자리에서).

## 2026-10-10 (이어서) — UX 문구 규칙의 범위를 좁힌다(backlog H-1 닫음)

오너가 권장안을 골랐다. [ux-writing.md](../apps/mobile/docs/ux/ux-writing.md) 용어표를 좁혔다. `지우기` · `지울까요` 금지는 사용자가 누르는 버튼과
묻는 질문에만 걸고, 결과를 설명하는 문장의 `지워요`(분석 동의 문구 등)는 허용한다. `촬영` 금지는 카메라 컨트롤의 보이는 라벨과 접근성 라벨에만
걸고 메시지(`촬영을 완료하지 못했어요`)는 둔다 — 그래서 캡처 화면 ✕ 의 접근성 라벨 두 곳을 `촬영 닫기` 에서 `카메라 닫기` 로 바꿨다
(`apps/mobile/src/pages/capture-record/ui/capture-record-page.tsx`). 템플릿 힌트의 `장면`(`처음 본 장면`)은 컷이 아니라 찍을 대상을 말하므로 허용한다.

## 2026-10-10 (이어서) — 결정이 끝난 결정 문서의 제목을 바꾼다(backlog H-2 닫음)

오너가 권장안을 골랐다. "결정 요청 —"으로 시작하던 네 문서(`snap-retention-period` · `local-copy-after-upload` · `movie-cleanup-after-export` ·
`movie-export-policy`)와 구독을 들인 것처럼 읽히던 `storage-and-subscription-policy` 의 제목을 결정을 말하는 제목으로 바꿨다. 옛 제목을 인용하거나
앵커로 가리키는 곳은 없었고, [decisions/README.md](./decisions/README.md)는 파일 이름과 요약으로 적혀 있어 그대로 맞다.

## 2026-10-10 (이어서) — 테스트의 한국어는 리터럴도 된다(backlog H-4 닫음)

오너가 권장안을 골랐다. [writing-unit-tests.md](../apps/mobile/docs/workflows/writing-unit-tests.md)가 리터럴과 `\uXXXX` 이스케이프를 둘 다 허용한다.
편집 도구가 리터럴로 되써 규칙이 지켜지지 않았다(46개 파일). 스타일을 바꾸려고 파일을 변환하지 않는다.

## 2026-10-10 (이어서) — 모바일 에셋은 루트 assets 에 둔다(backlog H-7 닫음)

오너가 권장안을 골랐다. 규칙은 "여러 slice 가 쓰면 `shared/assets`, 한 slice 만 쓰면 그 근처"였지만 `src/shared/assets` 는 없고 화면이 그리는
브랜드 글리프도 루트 `apps/mobile/assets/images` 에 있었다. 지금 구조를 규칙으로 적었다 — 이미지와 폰트는 모두 루트 `assets` 에 두고
`@/assets/*` 로 불러온다([expo-router.md](../apps/mobile/docs/frameworks/expo-router.md) §Asset placement,
[feature-sliced-design.md](../apps/mobile/docs/architecture/feature-sliced-design.md)의 `shared` 트리에서 `assets` 를 뺐다). 파일은 옮기지 않았다.

## 2026-10-10 (이어서) — ONBOARDING 의 통합 전 브랜치 절을 걷는다(backlog H-9 닫음)

오너가 권장안을 골랐다. [ONBOARDING.md](../ONBOARDING.md) §5 의 "모노레포 통합(2026-08-31) 이전에 분기한 브랜치" 절은 그런 브랜치가 원격 · 로컬
어디에도 없어 지우고, 지금도 쓸모 있는 한 가지 — `apps/mobile` 의 `git log` · `git blame` 이 통합 커밋 `d13f921` 이전으로 내려가지 않는다는 것 — 만
§5 목록의 한 줄로 남겼다. 그 절을 가리키는 링크는 없었다.

## 2026-10-10 (이어서) — editSpec v3 결정 ID 에 접두를 붙인다(backlog H-10 닫음)

[decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md)의 결정 항목 ID(`A-1`~`D-8`, 27개)가 백로그 ID 와 모양이 같아 grep 과 독자가 헷갈렸다
(백로그 B-6 은 알림 설정, 결정 B-6 은 컷 타이밍). 오너 결정으로 `V3-A1` · `V3-B6` 꼴로 바꿨다 — 접두를 붙이고 가운데 하이픈을 빼 백로그 ID 와
겹치지 않는다.

- **바꾼 곳** — 결정 문서(34곳)와 두 초안 [plans/edit-spec-v3.md](./plans/edit-spec-v3.md) · [plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md)
  (24 · 14곳), 이 ID 를 인용하는 [backlog.md](./backlog.md) A-7 · [auto-edit-draft.md](./decisions/auto-edit-draft.md) ·
  [trend-editing-pipeline.md](./plans/trend-editing-pipeline.md), 무효화 사전의 `note` 세 곳(`packages/shared-types/src/invalidation-vocabulary.json`),
  코드 주석(`invalidation.ts` · `invalidation.py` · 두 무효화 테스트). 같은 문서에 섞인 백로그 ID(A-3 · A-7 · C-7 등)와 만료 예고의 D-3 · D-1 은 그대로다.
  결정 문서 헤더에 정정 배너를 달아, 그 전의 기록(이 progress 포함)은 옛 ID 를 쓴다고 적었다.

## 2026-10-10 (이어서) — 문서만 바꾼 변경에는 CI 를 돌리지 않는다

CI(`.github/workflows/ci.yml`)가 문서만 바꾼 PR 과 `main` push 에도 네 작업(API 빌드 · 모바일 검증 · API 통합 테스트 · 워커 테스트)을 모두 돌렸다.
어떤 검사도 `docs/` 나 마크다운을 읽지 않으므로(모바일 prettier 도 `*.md` 를 무시한다, `docs/` 의 마크다운 아닌 두 파일도 코드가 쓰지 않는다)
`push` · `pull_request` 에 `paths-ignore: ['docs/**', '**/*.md']` 를 두었다. 코드가 하나라도 섞이면 지금처럼 전부 돈다. `main` 에 브랜치 보호 ·
필수 검사가 없어(2026-10-10 확인) 건너뛴 PR 의 머지가 막히지 않는다 — 나중에 필수 검사를 걸면 문서 PR 이 "대기"로 남지 않게 다시 봐야 한다.
[ONBOARDING.md](../ONBOARDING.md) §3 의 CI 설명을 맞췄다.

## 2026-10-10 (이어서) — 만료 예외 결정 문서에 결정 기록을 채운다(backlog H-3 닫음)

오너가 권장안을 골랐다. [movie-snap-expiry-exemption.md](./decisions/movie-snap-expiry-exemption.md)는 상태가 `결정(잠정)` 인데 결정 기록이 없고
인덱스에서는 "결정 대기" 표에 있었다. 상태는 그대로 두고 결정 기록 표를 새로 만들어 잠정 결정 A(예외 없음, 2026-09-15)와 기각 이유를 채웠다 —
결정자는 커밋에도 남지 않아 "기록 없음"으로 적었다. [decisions/README.md](./decisions/README.md)에서는 "결정 완료" 표로 옮기고 "잠정 · 다음 회의에서
C 부터"라고 밝혔다. 다시 볼 안건은 그대로 backlog A-1 에 있다.

## 2026-10-10 (이어서) — 모바일 로컬 개발 문서를 지금 Mac 에 맞춘다(backlog H-6 닫음)

[local-development-and-testing.md](../apps/mobile/docs/workflows/local-development-and-testing.md)의 명령이 구형 Intel Mac(Xcode 16.4 · `iPhone 16` ·
AVD `Pixel_API_35` · 캐시의 Expo Go)을 기준으로 했다. 지금 작업하는 Mac(Xcode 27 · `iPhone 17` · 손으로 만든 AVD `snaply_api35` · Expo Go 를
api.expo.dev 에서 받는다)을 기본으로 바꾸고, 두 프로필을 표로 나란히 적었다. 구형 장비가 아직 쓰이는지 알 수 없어 구형 절은 걷지 않았다.
Expo Go 를 받는 명령은 `https://api.expo.dev/v2/versions` 의 응답(`sdkVersions["57.0.0"].iosClientUrl` → `Expo-Go-57.0.9.tar.gz`)으로 확인했다.

## 2026-10-10 (이어서) — 워크릿에서 JS 로 넘길 때는 scheduleOnRN 을 쓴다(backlog H-8 닫음)

[animations-and-gestures.md](../apps/mobile/docs/frameworks/animations-and-gestures.md)는 `runOnJS` 를 처방하고 다섯 파일이 그렇게 썼는데, 스플래시만
`react-native-worklets` 의 `scheduleOnRN` 을 썼다. 설치된 Reanimated 4.5.1 이 `runOnJS` 를 `@deprecated` 로 표시하고 `scheduleOnRN` 을 쓰라고
안내하므로 그쪽으로 통일했다 — `bottom-sheet.tsx` · `timeline-cut.tsx` · `extract-window.tsx` · `capture-flight.tsx` 의 `runOnJS(fn)(...args)` 를
`scheduleOnRN(fn, ...args)` 로 바꾸고, 문서에 규칙과 이유를 적었다. Gesture Handler 의 `.runOnJS(true)`(`extract-strip.tsx`)는 다른 API 라 그대로다.

- **검증**: `npm run verify:mobile` 통과(176개 스위트 1412건, lint 경고 1건은 원래 있던 것). 기기에서는 보지 않았다 — 바텀 시트 닫기 · 컷 다듬기 · 추출 창 · 촬영 비행 애니메이션의 완료 콜백이 대상이다.

## 2026-10-10 (이어서) — env-management 의 후속 연계를 배너로 옮긴다(backlog H-11 닫음)

[decisions/env-management.md](./decisions/env-management.md)의 "후속 연계"는 작성 뒤에 덧붙인 결정(배포 플랫폼 = AWS 공모전 서버)인데 본문 절로 남아
있었다([doc-conventions.md](./doc-conventions.md) §헤더: 후속 결정은 헤더 아래 배너). 헤더의 `> **후속 결정**(2026-10-08)` 배너로 압축하고 절을 지웠다.
빈 값을 옮기지 않는 이유 같은 쓸모 있는 사실은 배너에 남겼고, 지운 절을 가리키는 링크는 없었다.

## 2026-10-10 (이어서) — UX 목표 문장을 하나로 맞춘다(backlog H-12 닫음)

오너가 권장안을 골랐다. [guardrails.md](../apps/mobile/docs/ux/guardrails.md)는 그대로 둔다. 목표 문장은 [philosophy.md](../apps/mobile/docs/ux/philosophy.md)를
원천으로 두고 [principle-priority.md](../apps/mobile/docs/ux/principle-priority.md)에만 있던 조건("능력 · 통제를 잃지 않고")을 더했으며,
principle-priority 는 그 문장을 그대로 인용한다. [ux/README.md](../apps/mobile/docs/ux/README.md)의 라우팅 표는 바꿀 것이 없었다.

## 2026-10-10 (이어서) — A-1 ② 의 통과를 유지한다(backlog H-14 닫음)

2026-10-09 정리에서 A-1 "서버 전환 실기기 검증"의 ② "편집이 PATCH 된다"를 2026-10-01 실기기 기록으로 통과 처리한 것을 오너가 그대로 두기로 했다 —
② 는 무비 편집이 서버에 PATCH 로 닿는다는 뜻이다. 2026-10-09 휴대폰에서 바꾼 스타일이 결과물에 반영된 것도 같은 경로다.

## 2026-10-10 (이어서) — RLS 정책이 없던 테이블 다섯 개(backlog E-19 닫음)

`rls-policies.sql` 은 "모든 테이블에 RLS 를 켠다"는 원칙인데 뒤에 생긴 `user_consents` · `video_signals` · `movie_recommendations` ·
`movie_recommendation_items` · `movie_drafts` 는 RLS 를 켜는 줄도 없었다. 로컬과 AWS 서버는 각자의 Postgres 라 새는 것은 없지만,
공유 Supabase DB 로 돌아가면 이 다섯은 앱에 든 공개(anon) 키로 Data API 에서 열린다. (a) 원칙을 지키기로 했다.

- **정책** — 다섯 모두 서버(API · 워커)만 쓰는 데이터라 기존 `video_analyses` · `credit_ledger` 처럼 **본인 것 조회만** 연다. 소유자 컬럼이
  없는 `video_signals` 는 `videos` 를, `movie_recommendation_items` 는 `movie_recommendations` 를 거쳐(`exists`) 판정한다. 동의 기록은
  클라이언트가 쓰면 이력을 지어낼 수 있어 특히 쓰기를 열지 않는다. 새 테이블을 만들 때 정책을 같이 쓰라는 규칙을 [team.md](./team.md) §3 에 넣었다.
- **검증** — 로컬 Postgres 에 임시 DB 를 만들어 `snaply_test` 스키마를 복사하고, Supabase 의 `auth.uid()` · `authenticated` 역할을 흉내 낸 뒤
  파일 전체를 `ON_ERROR_STOP` 으로 적용했다(오류 없음). 사용자 A · B 의 행을 넣고 A 로 읽으면 다섯 테이블 모두 A 의 1행만, 로그인 없이 읽으면
  0행이었다. 쓰기 권한을 일부러 준 상태에서도 A 의 동의 기록 추가는 `violates row-level security policy` 로 거절되고 초안 수정은 0행이었다.
  임시 DB 와 역할은 지웠다. 실제 Supabase 에는 적용하지 않았다 — 공유 DB 를 쓰지 않는다.

## 2026-10-10 (이어서) — MinIO 는 소스 빌드 미러를 유지한다(backlog E-7 닫음)

MinIO 커뮤니티판은 이미지 배포와 보안 패치를 멈췄고, 우리는 같은 릴리스(`RELEASE.2025-09-07T16-13-09Z`)를 소스에서 빌드한 GHCR 미러를
쓴다(2026-09-25). 2026-10-09 사내 서버를 접어 운영 저장소는 AWS S3 하나가 됐고, MinIO 는 로컬 개발과 CI(통합 테스트 · 이미지 스모크)에서만
돈다 — 패치 없는 서버가 네트워크에 노출되던 문제가 사라졌다.

- **결정** — 대체 서버(RustFS · Garage · SeaweedFS)로 바꾸지 않고 미러를 유지한다. 바꾸면 통합 테스트 · CI 의 저장소 동작을 새로 검증해야
  하는데 얻는 것은 로컬 · CI 의 패치뿐이다. 미러 빌드가 깨지거나 운영에서 MinIO 를 다시 쓰게 되면 다시 연다.
- **패키지 공개** — 새 개발자가 로그인 · 로컬 빌드 없이 받도록 GHCR 패키지 `vlog-studio/snaply-backend/minio` 를 공개로 하기로 했다.
  같은 날 확인 때는 익명 토큰이 발급되지 않고 manifest 가 `403` 이라 아직 비공개였다 — 설정 변경과 ONBOARDING 문구는 backlog G.
- **옮겨 둔 것** — 백로그 본문에만 있던 "업스트림 `.hotfix.*` 태그는 amd64 만 있다"는 주의를 태그를 올리는 `minio-image.yml` 주석으로 옮겼다.
- **실수** — 익명 pull 을 확인하려고 이 Mac 에서 `docker logout ghcr.io` 를 실행했다. 로그인이 있었다면 풀렸다(`docker login ghcr.io` 로 되돌린다).

## 2026-10-10 (이어서) — MinIO 미러 패키지는 비공개로 둔다(backlog G 항목 지움)

바로 위에서 공개하기로 했던 GHCR 패키지 `vlog-studio/snaply-backend/minio` 를 **비공개로 유지**한다. 공개는 새 개발자의 첫 실행 몇 분을
줄이는 편의일 뿐이고, 비공개여도 막히는 곳이 없다 — `ensure-minio-image.sh` 가 받지 못하면 같은 Dockerfile 로 로컬 빌드하고(CI 도 같다),
배포 잡은 잡 토큰으로 받는다. 회사 조직 이름으로 이미지를 외부에 내놓는 일과 MinIO(AGPL) 바이너리 공개 배포의 의무를 따질 필요도 없어진다.
ONBOARDING §3 의 "`docker login ghcr.io` 가 되어 있으면 받아 오고, 아니면 로컬 빌드" 는 그대로 맞다.

## 2026-10-11 — 기능 문서 상태 라벨 정리(backlog H-13 닫음)

- **스냅 추출**([snap-extract.md](../apps/mobile/docs/features/snap-extract.md))은 `Partial` 을 유지한다. 근거를 "Android 실기기 검증 대기"에서
  "에뮬레이터에서만 확인"으로 고쳤다 — 2026-10-09 EAS release 빌드(네이티브 trim 포함)를 에뮬레이터에 깔아 갤러리 영상을 스냅으로 잘라
  업로드 · 무비 생성 · 재생까지 했지만(같은 날 "테스터 앱을 EAS 로도 만든다"), 실기기와 iOS 는 아직이다.
- **서버 추천(Stage 2)**([movie-templates.md](../apps/mobile/docs/features/movie-templates.md))을 `Functional`(dormant)에서 `Not implemented`(dormant)로
  바꿨다. 상태 어휘는 사용자가 얻는 효과를 기준으로 하는데, 서버 플래그(`MOVIE_RECOMMENDATION_ENABLED`)가 꺼져 아무에게도 추천이 가지 않는다.
  앱 쪽은 다 만들어져 있어 플래그를 켜는 날(A-6) `Functional` 로 올린다.
- **앱 맵 순서**([features/README.md](../apps/mobile/docs/features/README.md))는 2026-10-09 에 맞춘 `root-layout.tsx` 선언 순서(가드 우선순위)를 유지한다.

## 2026-10-11 (이어서) — DB 복구 리허설 · 용량 실측(backlog B-8 두 항목 닫음)

AWS 서버의 SSM 셸(`snaply` 계정)에서 오너가 명령을 돌리고 결과를 받아 정리했다. 운영 DB(`snaply`)는 읽기만 했다.

- **덤프** — `/data/backup` 에 매일 18:30 UTC(03:30 KST) 덤프가 쌓인다(10-08 11K · 10-09 20K · 10-10 32K). `/data` 50G 중 4.7G.
- **복구 리허설** — `snaply_restore_check` 를 만들어 10-10 덤프를 `ON_ERROR_STOP` 으로 부었다 — 오류 없이 0.7초. 운영과 대조하면
  `users` 2 · `movies` 5 · `edit_jobs` 14 · `credit_ledger` 20 · 마이그레이션 30개(마지막 `20261007010000_add_video_kept_for_restore`, 저장소와 같다)가
  같고 `videos` 만 운영 62 · 복구본 56 — 덤프 뒤에 올라온 스냅이다. 리허설 DB 는 지웠고 남은 DB 는 `snaply` 하나다.
- **절차** — 실제로 되돌리는 순서(앱 컨테이너 멈춤 → DB 지우고 만들기 → 붓기 → 마이그레이션 대조 → 올리기)와 리허설 명령을
  [deployment-aws.md](./deployment-aws.md) §5 에 적었다. 실제 되돌리기는 운영에서 돌리지 않았다.
- **용량** — 유휴: 컨테이너 모두 CPU 1% 아래, 메모리 약 1GiB/7.6GiB, load 0.01 ~ 0.04. 렌더 중: 에뮬레이터(테스터 앱)로 20초 클립에서 자른
  5초 스냅 여러 개로 24초 무비를 만들자 `ai-worker` 가 CPU 196%(2 vCPU 거의 전부) · 메모리 1.23GiB, 렌더 66 ~ 71초. 렌더 한 편 약 140 vCPU · 초라
  추가 요금선(24시간 평균 30% = 하루 약 51,840 vCPU · 초)까지 하루 약 350편이다. 이미지는 17개 4.2GB(3.8GB 가 지난 배포)이고 72시간 정리로
  충분하다. [deployment-aws.md](./deployment-aws.md) §6 "용량". 렌디션 · 분석 워커의 부하는 따로 재지 않았다.
- **에뮬레이터** — 추출 화면에서 에뮬레이터가 GPU 디코딩 오류(`Failed to find ColorBuffer`, h264 `no frame!`)로 꺼졌다. `-gpu swiftshader_indirect`
  로 다시 띄우자 끝까지 됐다 — 에뮬레이터 그래픽 문제로 보고 앱 결함으로 올리지 않았다.

## 2026-10-11 (이어서) — 법률 문서의 문의처(backlog D-2 한 항목 닫음)

약관 · 개인정보처리방침의 문의처가 기본값 `support@snaply.app`(우리 주소가 아니다)로 나가고 있었다.

- **코드** — `LEGAL_CONTACT_EMAIL` 이 쉼표로 여러 주소를 받아 한 줄에 하나씩 메일 링크로 보이게 했다(`apps/api/src/routes/legal.ts`).
  기동 때 한 번 읽던 것을 요청마다 읽는다. `legal.test.ts` 에 여러 주소 · 기본값 두 건을 더했고 `npm test -w apps/api` 41개 파일 631건 통과.
- **값** — 처음에 팀원 세 명의 주소를 넣었다가 `snaply@dweax.com` 하나로 바꿨다. 담당자가 바뀌어도 값을 고칠 필요가 없고 개인 주소가
  공개 페이지에 남지 않는다. **이 주소는 아직 메일함이 없다** — 공모전 동안 쓸 주소로 정했고, 회사 메일에 그룹 · 별칭으로 만들어 받는 사람을
  잇기 전까지는 문의가 반송된다. 시크릿(`dweax/service/snaply/env`)에 넣은 뒤 `6c4497b` 배포로 반영됐고, 운영 `/legal/privacy` 에
  `mailto:snaply@dweax.com` 하나만 나오는 것을 확인했다.

## 2026-10-11 (이어서) — 법률 문서에 광고와 보관 기간(backlog D-2 두 항목 닫음)

공모전 테스터도 실제 사용자라, 초안이라도 처리방침이 실제 동작과 맞아야 한다. 두 가지가 빠져 있었다.

- **보상형 광고** — 처리방침의 수집 항목(광고 시청 기록 — `ad_rewards` 의 세션 · 지급 결과 · 광고 거래 id), 광고 SDK 문단, 위탁(Google AdMob),
  국외 이전(미국 등 · 광고 식별자 · 기기 · 앱 정보 · IP · 보상 확인용 사용자 id)에 넣었다. 약관 크레딧 절에 광고 보상(하루 횟수 제한 · 시청 완료가
  확인될 때만)을 더했다. 문장은 **지금 앱의 동작 그대로**다 — SDK 는 광고 보기를 누를 때 처음 켜지고(`admob-reward-ad-provider.ts`), 맞춤 광고
  옵션도 동의(UMP) 화면도 없다. 그 정책을 정하는 일은 backlog D-2 "맞춤 광고 · 동의(UMP) 정책"으로 남겼다.
- **보관 기간** — 처리방침 "보관 및 파기"에 스냅(업로드 후 15일, SNAP-9) · 지운 스냅도 그때까지 최근 삭제에서 되살릴 수 있음(SNAP-20) · 앨범
  사본은 기기에 남음(SNAP-17) · 결과물(정리하면 바로, 아니면 30일 — MOV-16 · 17) · 구성은 남음을 넣고, 약관에 "영상의 보관" 절을 더했다(이후 절
  번호를 하나씩 밀었다). 일수는 `retention-policy.ts` 의 상수를 읽어 쓴다 — 정책 값을 바꾸면 문서가 같이 바뀐다. 최종 수정일을 2026-10-11 로 올렸다.
- **검증** — `legal.test.ts` 에 "보관 기간을 정책 값 그대로 알린다" · "보상형 광고가 수집 항목 · 위탁 · 국외 이전에 모두 있다"를 더했다.
- **찾은 것** — 처리방침이 아직 "Supabase(싱가포르)가 데이터베이스"라고 적는다. AWS 로 옮긴 뒤 DB 는 AWS 서버의 Postgres 이고 Supabase 는 인증만
  한다 — AWS 리전 확인과 함께 고치도록 backlog D-2 에 올렸다. 법무 검토는 여전히 남아 있다(페이지 상단 "출시 전 초안").

## 2026-10-11 (이어서) — 처리방침의 데이터베이스는 서울(backlog D-2 두 항목 닫음)

오너가 공모전 서버의 리전이 `ap-northeast-2`(서울)임을 확인해 줬다. 이 서버는 CloudFront 를 쓰지 않고 버킷이 퍼블릭 차단이라
(`CLOUDFRONT_DOMAIN` 을 비움 — deployment-aws.md §2) 영상 · 결과물이 엣지로 나가지 않는다 — 처리방침의 "국내(서울) 리전에 저장되며 국외로
이전되지 않습니다"가 사실로 확정됐다.

- **데이터베이스 서술** — 처리방침이 "Supabase(싱가포르)가 계정 인증 · 데이터베이스"라고 적고 있었다. AWS 로 옮긴 뒤 데이터베이스는 이 서버 안의
  Postgres 이고 Supabase 는 인증만 한다. 수탁자 표의 Supabase 를 "계정 인증(로그인)", AWS 를 "서버 운영, 데이터베이스, 영상 파일 저장 및 전송"으로,
  국외 이전 표의 Supabase 항목을 "계정 식별자, 이메일 등 로그인 정보"로 좁혔고 국내 저장 문장에 데이터베이스를 더했다(`apps/api/src/routes/legal.ts`).
- **검증** — `legal.test.ts` 에 "데이터베이스를 국내에 두고 Supabase 에는 로그인 정보만 맡긴다"를 더했다. 서버가 옮겨 가거나 CloudFront 를 붙이면
  이 확인을 다시 한다(파일 머리말 3-(a)).

## 2026-10-11 (이어서) — `POST /edit-jobs` 를 없앴다(backlog A-1 한 항목 닫음)

결정 ⑤(2026-09-09 "한 버전 공존 후 폐기", [decisions/movie-export-policy.md](./decisions/movie-export-policy.md))의 마지막 단계다. 앱은
2026-09-12 에 무비 생성(`POST /movies/{id}/export`)으로 옮겼고 그 뒤로 이 라우트를 부르지 않는다 — 스토어에 나간 빌드가 없고 테스터 APK 도
모두 무비 경로다. 그래서 A-7(editSpec v3)을 붙일 곳이 무비 생성 하나가 됐다.

- **지운 것** — 라우트(`apps/api/src/routes/edit-jobs.ts`), 계약의 `createEditJob` · 입력 스키마 · `jobCreatedSchema`(`packages/shared-types`),
  `openapi.json` 의 해당 경로(재생성). 조회 · 취소(`GET` · `DELETE /edit-jobs/{id}`)와 진행률 WebSocket 은 그대로다. 생성 서비스(`createEditJob`)는
  무비 생성이 쓰므로 남았다 — 그 안의 v2 분기(전환 없이 프리셋만)는 이제 부르는 곳이 없다.
- **테스트** — 크레딧 예약 · 환급(`billing.test.ts`)은 무비 생성으로 옮겼다(같은 검증). "무비 없는 작업이면 `movieId: null`"(`movies.test.ts`)은 옛 행을
  직접 만들어 확인한다. 라우트별 rate limit 테스트는 지웠다 — 토큰당 분당 5회는 이 라우트에만 있었고, 무비 생성은 전역 제한 · 크레딧 예약 ·
  사용자당 생성 1개(MOV-11)가 막는다. "`POST /edit-jobs` 는 없다(404)"를 더했다. `npm test -w apps/api` 41개 파일 634건, `npm run verify:mobile`
  1412건 통과(앱은 주석만 바뀌었다).
- **문서** — [api-spec.md](./api-spec.md) AI 편집 절을 "작업은 무비 생성으로만 만든다"로 고쳐 크레딧 · `QUEUE_FAILED` · 409 설명을 옮기고, rate limit 목록에서
  뺐다. Swagger 설명 · 스펙 MOV-8 · backlog A-7 · A-10 의 "폐기 예정" 문구를 고쳤다. 출력 비율을 고를 수 있던 유일한 길이 이 라우트였지만 앱은
  쓴 적이 없다 — 고르게 할지는 A-10 에 그대로 있다.

## 2026-10-11 (이어서) — 공모전 서버의 기간 · 백업 · 편집 동시성(backlog B-8 · A-7 항목 닫음)

오너 결정과 같은 날의 실측을 [decisions/aws-contest-server.md](./decisions/aws-contest-server.md) "운영 기간 · 영상 백업 · 편집 동시성"에 적었다.

- **기간** — 공모전 서버는 2026년 11월까지 운영한다(B-8 "수명"). [deployment-aws.md](./deployment-aws.md) §0 에도 적었다.
- **영상 백업** — S3 버킷의 버전 관리를 켜지 않는다(B-8 "백업의 사각"). 기간 한정 서버이고 영상 보관이 원래 짧다. DB 는 덤프 + 볼륨 스냅샷 그대로.
- **편집 워커 동시성 1** — 렌더 한 편이 2 vCPU 를 거의 다 쓰는 실측("DB 복구 리허설 · 용량 실측")으로, 올려도 처리량이 늘지 않고 작업마다 시간 ·
  메모리만 겹친다. 지금 설정(큐마다 기본 1, 새 작업은 `edit-v3` 로만)이 이미 그렇다 — 코드는 바꾸지 않았다. vCPU 4 이상으로 옮기거나 대기가
  불만이 되면 다시 본다(A-7 "편집 워커 동시성" 닫음).
- **외부 연동** — 공모전에는 SNS 연동이 필요하다고 정했다. B-8 "외부 연동 켜기"를 "SNS 연동 켜기"로 좁혀 콘솔에 넣을 주소 · 테스터 계정 조건 ·
  키 순서를 적었고, 결제 · 광고는 켜지 않는다(크레딧은 가입 보너스). 틱톡 게시는 미디어 호스트 검증에 막혀 B-8 "TikTok 게시"에 남았다.

## 2026-10-11 (이어서) — 계정을 바꾼 기기에 이전 계정의 푸시가 간다(backlog A-1 ⑥ 화면 통과 · E-28 닫음)

에뮬레이터(`snaply_api35`, 테스터 앱, AWS 서버)에서 테스트 계정 둘로 계정 전환(A-1 ⑥)을 확인하다가 푸시 쪽 결함을 찾아 고쳤다.

- **화면(A-1 ⑥)** — 두 번째 계정으로 로그인하자 무비 0편 · 스냅 0개 · 최근 삭제가 비었고 템플릿 슬롯도 모두 0컷이었다. 크레딧과 알림 설정은
  그 계정 것이었다(알림 설정이 계정을 따른다, NTF-7). 처음 계정으로 돌아오니 무비 4편 · 스냅 32 · 크레딧 800 · 알림 설정이 그대로였다.
  무비 카드 넷이 "컷 0 · 0초"였지만 전환과는 무관하다 — 그 무비들이 쓰던 테스트 스냅이 최근 삭제에 있고(스냅을 지우면 무비의 컷도 빠진다),
  전환 전에 연 무비에도 이미 "편집한 컷 구성이 있어요"가 떠 있었다.
- **찾은 것 → 고침(E-28)** — 서버는 계정마다 FCM 토큰 하나를 두는데(B-2), 로그아웃이 토큰을 그대로 두고, 다른 계정이 같은 토큰을 등록해도 이전
  계정의 것을 치우지 않았다. 그래서 한 기기에서 계정을 바꾸면 그 기기의 토큰이 두 계정에 남아, 이전 계정의 알림 — 무비 완성 알림은 무비 제목을
  싣는다 — 이 지금 다른 계정으로 로그인한 그 기기로 간다. 코드로 확인했고 기기에서 재현하지는 않았다. 앱은 로그아웃할 때 기기의 토큰을
  폐기하고(`deleteFcmToken`, 다음 로그인은 폐기가 끝난 뒤 새 토큰을 등록한다), 서버는 토큰을 등록할 때 같은 토큰을 가진 다른 계정에서 지운다
  (오프라인이라 폐기가 실패한 경우의 대비). 스펙 NTF-5 에 "기기는 지금 로그인한 계정의 알림만 받는다"를 더했다.
- **검증** — `npm test -w apps/api` 41개 파일 637건(새 `POST /auth/fcm-token` 테스트 셋 중 계정 전환 사례는 수정 전 실패) · typecheck · lint,
  `npm run verify:mobile` 176개 스위트 1415건(새 훅 테스트 셋 중 둘은 수정 전 실패). 기기 확인은 배포 뒤에 한다(A-1 ⑥ 에 절차).

## 2026-10-11 (이어서) — 앱에서 Instagram 에 연결하고 무비를 게시한다(backlog B-8 "SNS 연동 켜기" 인스타그램 닫음)

공모전 서버(B-8)에 인스타그램 연동을 켰고, 앱에 연결 · 게시 화면이 없던 것(SNS-8 `보류`)을 만들었다.

- **콘솔 · 시크릿** — Meta 앱 "Snaply"(개발 모드)의 Instagram 비즈니스 로그인에 이 서버의 콜백 · 개인정보 · 약관 주소를 넣고, 크리에이터로 바꾼
  테스터 계정 하나를 앱 역할에 넣었다. `INSTAGRAM_*` · `INSTAGRAM_REDIRECT_URI` · `SNS_TOKEN_ENCRYPTION_KEY` 를 시크릿에 넣고 배포했다.
- **앱** — 나 탭 → 소셜 연결(`/settings/social`)에서 연결 · 다시 연결 · 연결 해제, 무비 시청 화면과 ⋯ 시트에서 `Instagram에 게시`. 게시 시트는
  연결이 없으면 그 자리에서 연결을 받고, 누르기 전에 "게시하면 이 앱에서는 무비가 정리돼요"를 알린다(MOV-17 그대로). 틱톡은 `준비 중`.
  스펙 SNS-1 · SNS-8, 기능 문서 me · movie, UX 용어(게시 · 연결)를 같이 고쳤다.
- **찾은 것 → 고침** — ① 서버가 크리에이터 계정을 거절했다: Instagram 은 크리에이터를 `MEDIA_CREATOR` 로 주는데 허용 목록이 `BUSINESS` · `CREATOR`
  뿐이라 토큰 교환이 성공하고도 `reason=account_type` 으로 돌려보내 연결이 저장되지 않았다. 대소문자 없이 비교하고 `MEDIA_CREATOR` 를 허용,
  거절하면 받은 값을 로그에 남긴다. ② Android 에서는 돌아오는 링크를 브라우저 세션이 아니라 라우터가 받아 세션이 '닫힘'으로 끝나, 실패 사유가
  화면에 나오지 않았다. 세션이 열린 동안 들어온 앱 링크도 결과로 읽는다.
- **검증** — `npm test -w apps/api` 41개 파일 637건(크리에이터 계정 콜백 테스트 셋 추가) · lint, `npm run verify:mobile` 182개 스위트 1443건.
  에뮬레이터(테스터 앱, AWS 서버): 연결 → 소셜 연결에 `@dayeonnnn2`, 완성 무비를 설명 없이 게시 → 버튼이 "게시하는 중…" → 무비가 정리되고
  스튜디오로 넘어갔다. 실제 휴대폰에서는 보지 않았다(SNS-8 의 "실기기 미검증"). 게시한 릴스는 G "테스트 게시물 정리" 대상이다.

## 2026-10-11 (이어서) — 서버 전환 실기기 검증을 마쳤다(backlog A-1 한 항목 닫음)

E-28 수정(#69)이 AWS 서버에 배포된 뒤 `main`(`6d9fa41`)으로 테스터 APK 를 다시 빌드해 에뮬레이터(`snaply_api35`)에 덮어 설치했다(앱 데이터는
그대로). 테스트 계정 둘(A · B)로 A-1 ⑥ 의 남은 푸시 쪽을 보고, 같은 자리에서 정리 뒤 다시 만들기까지 봤다.

- **이전 계정의 푸시(⑥, E-28)** — B 로 무비 알림을 켜고 3초 스냅 하나로 무비를 만들었는데, 15초 만에 완성돼 알림이 로그아웃 **전에** 왔다(정상 —
  판정에 쓰지 않았다). 그래서 스냅 넷(약 12초)으로 다시 만들고 `무비 만들기` 4초 뒤에 로그아웃했다. 무비는 19:54 에 완성됐지만(B 로 다시 로그인해
  완성 시각을 확인) 로그아웃한 채로 약 100초, A 로 로그인한 뒤 약 1분 동안 기기에 새 알림이 오지 않았다. 대조로, B 로 로그인한 채 다시 만든 무비의
  완성 알림은 왔다 — 로그아웃하면 그 계정의 푸시가 기기에 닿지 않는다. A 의 화면에는 B 의 무비가 없었다.
- **정리 · 다시 만들기(MOV-17 · 18 · 19)** — B 의 완성 무비에서 `공유` 로 시스템 공유 시트를 띄우고 아무것도 하지 않고 닫자, 무비는 그대로 두고
  "기기에 저장했다면 무비를 정리할 수 있어요. · 정리하기"가 떴다. `저장했어요, 정리하기` 뒤 결과물이 사라지고 컷 넷이 남은 편집 화면으로 돌아왔고,
  다시 `무비 만들기` 하자 크레딧이 300 → 200 으로 100 이 다시 나갔다.
- **표기** — A-1 "서버 전환 실기기 검증"(①~⑥)을 닫고 MOV-2 · 17~19 · NTF-5 · 6 의 실기기 미검증을 지웠다 — MOV-18 의 나머지인 SNS 게시의 자동
  판정은 같은 날 "앱에서 Instagram 에 연결하고 무비를 게시한다"에서 봤다. NTF-8 은 무비 실패 · 스냅 만료 예고의 탭만 남겼다(F 의 실패 카드 항목 ·
  A-4 SNAP-19 ⑤ 의 만료 예고). 모바일 기능 문서
  `movie.md` 의 무비 만들기 · 완성 알림 · 정리하기 행과 알림 기능 문서의 푸시 등록 행에 확인 결과를 적고, 알려진 한계의 "계정 전환은 기기 미확인"을 지웠다.
- **찾은 것** — 로그아웃해도 알림창에 이미 떠 있는 이전 계정의 알림(무비 제목이 든 완성 알림)은 남는다. E-28 과 같은 성격이라 backlog E-29 로 올렸다.
- **테스트 데이터** — B 에 스냅 넷 · 무비 둘이 생겼고 크레딧 300 을 썼다(잔액 200). A 의 스냅 · 무비는 건드리지 않았다.

## 2026-10-11 (이어서) — Meta 의 연결 해제 · 데이터 삭제 요청(backlog C-5 닫음)

Meta 앱 검수에 필요한 두 주소를 만들고 공모전 서버에서 실제 요청으로 확인했다.

- **결정** — 데이터 삭제 요청은 계정 삭제를 재사용하지 않고 **Instagram 에서 받은 데이터만** 지운다(오너 결정, 스펙 SNS-9). Instagram
  설정의 요청 하나로 Snaply 의 스냅 · 무비까지 사라지면 사용자가 기대한 범위를 넘는다. [decisions/account-deletion.md](./decisions/account-deletion.md)의
  "`deleteAccount` 재사용" 줄을 이 결정으로 바꿨다.
- **구현** — `POST /sns/instagram/deauthorize` · `POST /sns/instagram/data-deletion` 은 `signed_request` 를 `INSTAGRAM_APP_SECRET` 으로
  검증하고 그 계정의 연동과 게시 이력의 Instagram 값(게시물 ID · 실패 사유)을 지운다. 데이터 삭제는 상태 주소와 서명된 확인 코드를
  돌려주고, `GET /sns/instagram/data-deletion/status` 가 언제 지웠고 계정은 남았다고 보여 준다. 개인정보처리방침 §3 에 한 문장을 더했다.
- **실제 요청에서 찾은 것 → 고침** — ① `signed_request` 의 `user_id` 는 Meta 일반 문서의 "앱 범위 ID" 가 아니라 **프로페셔널 계정 ID**
  (`/me` 의 `user_id`, `1784…`)였다. 앱 범위 ID 로 저장을 바꿨던 첫 배포는 `removed: 0` 이었고, 저장 값을 프로페셔널 계정 ID 로 되돌렸다.
  ② 연결 해제 콜백은 urlencoded 가 아닌 형식으로 와 415 였다 — 본문 형식과 무관하게 `signed_request` 를 꺼내고, 검증 실패 때 content-type 을
  남긴다.
- **검증** — `npm test -w apps/api` 41개 파일 646건(서명 · 삭제 범위 · multipart · 위조 코드). Meta 콘솔(비즈니스 로그인 설정)에 두 주소를
  등록하고, 에뮬레이터에서 `dayeonnnn2` 를 연결한 뒤 Instagram 앱에서 Snaply 를 제거하자 Meta 가 두 요청을 보냈다 — 연결 해제가
  `removed: 1`, 이어 온 데이터 삭제는 이미 지운 뒤라 `removed: 0` 으로 200. 앱의 소셜 연결 화면은 다시 `연결` 이 됐다.

## 2026-10-11 (이어서) — 로그아웃하면 알림창의 알림도 걷는다(backlog E-29 닫음)

로그아웃은 기기의 FCM 토큰을 폐기해 그 뒤의 푸시를 막지만(E-28), 이미 알림창에 떠 있던 알림은 남아 다음 계정에게 이전 계정의 무비 제목을
보였다(NTF-5 · ACC-6 의 격리).

- **고침** — 로그아웃할 때 토큰 폐기와 함께 이 앱의 알림을 알림창에서 걷는다(`dismissAllNotifications` → `expo-notifications` 의
  `dismissAllNotificationsAsync`). 앱이 띄운 것과 FCM 이 백그라운드에서 띄운 것은 OS 에서 모두 이 앱의 알림이라 함께 걷힌다. 스펙 NTF-5 와
  푸시 기능 문서에 적었다.
- **검증** — `npm run verify:mobile` 182개 스위트 1447건(로그아웃하면 걷는다 · 세션 없는 실행은 건드리지 않는다). 에뮬레이터(새 테스터
  빌드 `ded738c`, AWS 서버): 무비 완성 알림을 켜고 무비를 만든 뒤 앱을 백그라운드로 두자 FCM 이 "무비가 완성됐어요 — '무비 10-11 (3)' …"을
  알림창에 띄웠다. 알림을 누르지 않고 앱을 열어 로그아웃하자 `dumpsys notification` 의 이 앱 알림이 2건 → 0건, 알림창에도 남지 않았다.
  앱이 앞에 있을 때 띄우는 알림(같은 알림창의 이 앱 알림)은 따로 만들어 보지 않았다.

## 2026-10-11 (이어서) — 실패 카드의 거절 안내와 실패 알림(backlog F 항목 닫음)

실제 서버에서 실패를 일으키기 어려워 미뤄 둔 확인이다. 데이터를 고치지 않고 실제 실패 경로를 태웠다: 편집 워커는 작업을 시작할 때 원본을
조회하며 지운 스냅을 건너뛰므로(`fetch_source_keys` 의 `deleted_at IS NULL`), 워커를 멈춘 사이 무비를 시작하고 그 스냅을 지우면
`SOURCE_UNAVAILABLE` 로 실패한다.

- **절차(에뮬레이터, 테스터 빌드 `ded738c`, AWS 서버)** — 오너가 SSM 에서 `ai-worker` 를 멈춤 → 새로 찍은 스냅 하나로 무비 (5)를 만들고
  시작(대기) → 그 스냅을 모든 기기에서 삭제(영향받는 무비가 (5) 하나인 것을 확인 — 기존 스냅은 다른 무비에도 쓰여 지우면 컷이 돌아오지 않아,
  SNAP-20, 쓰지 않았다) → 오너가 워커를 켬.
- **실패 알림(NTF-8)** — 몇 초 안에 앱이 "무비를 만들지 못했어요 / 무비 10-11 (5) · 이 무비가 쓰던 스냅이 모두 삭제돼서 만들 수 없었어요."를
  띄웠고, 탭하자 무비 (5) 화면이 열렸다.
- **카드의 거절 안내(MOV-12)** — (5)에 컷 하나를 넣어 `다시 시도` 를 살리고, 무비 (4)를 만드는 동안 스튜디오 보드의 (5) 카드에서 `다시 시도` 를
  누르자 사유 줄이 "다른 무비를 만드는 중이에요."로 바뀌었다. 무비 탭 그리드에서는 누르기 전에 (4)가 끝나 거절을 잡지 못했다 — 같은
  `MovieFailureNotice` 를 그린다. 크레딧은 (4)의 생성 100, 실패한 (5)는 환급.
- **찾은 것 → 고침** — 컷이 하나도 없는 무비의 빈 화면이 "이 무비가 쓰던 스냅의 보관 기간이 끝났어요."라고 했다. 빈 목록에 `every` 가
  참이 돼서다. 스냅을 지우면 컷이 빠지므로 빈 목록은 삭제의 결과다 — `emptyStageReason` 으로 묶어 편집 화면 · 감상 화면 모두 "모두
  삭제됐어요"로 읽는다. `npm run verify:mobile` 182개 스위트 1449건.
- **남은 시험 데이터** — 무비 (5)(실패, 검은 컷 하나)와 무비 (4)(완성), 최근 삭제의 시험 스냅 하나. 무비 완성 알림은 켠 채다.

## 2026-10-11 (이어서) — 개발 합의 항목 정리 — B-2 · B-3 · B-4

오너가 권장안대로 정했다.

- **B-4 위치 알림 이력 정리(구현)** — `notification_logs` 의 위치 알림(`geofence`) 행은 30분 쿨다운 판정에만 쓰이는데 끝없이 쌓였다.
  만료 정리 배치(`media:purge-expired`, 매일 04:00)에 ④를 더해 7일 지난 위치 알림 행을 지운다(`purgeOldGeofenceLogs`,
  `GEOFENCE_LOG_RETENTION_DAYS = 7`). 만료 예고(`snap_expiry`) 행은 중복 예고를 막는 유일한 근거라 남긴다. dry-run 은 개수만 보인다.
  `npm test -w apps/api` 41개 파일 647건(7일 지난 위치 알림만 지우고 6일째 행 · 만료 예고 행은 남는다). [deployment-aws.md](./deployment-aws.md)
  §4 배치 표를 고쳤다.
- **B-3 `AuthUser.email`** — 이메일이 필요한 기능이 없어 추가하지 않고 닫았다.
- **B-2 FCM 멀티 디바이스** — 공모전 동안은 단일 기기를 유지한다. 공동 소유 스키마 변경이라 공모전 뒤에 정한다(항목은 열어 둠).

## 2026-10-11 (이어서) — 끝내지 않은 무비의 만료를 알린다(backlog A-1 "결과물 만료 안내" 닫음)

끝내지 않은 결과물은 30일 뒤 정리 배치가 지우는데(MOV-16) 앱 어디에서도 그 말을 하지 않았다. 오너가 권장안(세 곳 모두)을 골랐다.

- **완성 알림** — 본문이 "'{제목}' 무비를 지금 볼 수 있어요. 30일 뒤 사라지니 저장하거나 게시해 두세요."가 됐다(NTF-6, 기간은
  `MOVIE_RESULT_RETENTION_DAYS`).
- **감상 화면** — 사실 줄 아래에 "{날짜}까지 볼 수 있어요", 마지막 3일은 "{n}일 뒤 사라져요 · 저장하거나 게시해 두세요"를 경고색으로
  보인다(`pages/movie/model/result-expiry.ts`). 알림을 끈 사용자에게는 이것이 유일한 안내다. 앱에는 결과물의 기한 필드가 없어
  `render.renderedAt` + 30일로 세고 날짜 단위로만 말한다.
- **만료 예고(NTF-10)** — 10시 배치(`media:notify-expiring`)가 스냅 예고에 이어 `sendMovieExpiryNotices` 를 돈다: 끝내지 않았고 지우지
  않은 무비 중 결과물이 D-3 을 지난 것에 한 번(밀린 것도), 무비 알림을 켠 사용자에게만, 같은 날 여러 편이면 한 알림으로. 발송 기록은
  `notification_logs` 의 새 종류 `movie_expiry`(마이그레이션 `20261011000000_add_movie_expiry_notification_kind`)이고, 실패하면 선점을
  되돌린다. 한 편이면 탭이 그 무비를 연다(`movie_expiry` 를 앱의 탭 라우터에 더함).
- **검증** — `npm test -w apps/api` 41개 파일 652건(대상 고르기 · 중복 없음 · 끝낸 · 지운 무비 제외 · 묶기 · 무비 스위치 · 실패 되돌리기 ·
  완성 알림 문구), `npm run verify:mobile` 183개 스위트 1454건. 기기에서는 보지 않았다 — 감상 화면 줄은 다음 테스터 빌드, 예고 푸시는
  결과물이 27일 지나야 나간다.

## 2026-10-12 — 제품 결정 셋 — 피드 · 버전 · 길이(backlog A-10 세 항목 닫음)

오너가 A-10 의 넷 중 셋을 권장안대로 정했다. 넷째(출력 비율)는 다시 검토한다. 결정과 기각한 대안은
[product-concept.md](./decisions/product-concept.md) §7.

- **앱 안 피드 없음** — 무비는 공유 · 저장 · SNS 게시로 나간다. MOV-23 에 한 줄을 더했다.
- **버전 없음 + 다시 만들기 전 확인** — 살아 있는 결과물은 하나(MOV-23, 이미 그렇게 동작). 그런데 완성된 무비의 `이 구성으로 다시 만들기`
  는 확인 없이 바로 이전 완성본을 지우고 크레딧을 썼다. 이제 같은 자리에서 "지금 완성된 무비는 사라지고, 크레딧을 다시 써요."와
  `그대로 두기` · `다시 만들기` 로 한 번 묻는다(`RemakeConfirm`, 만들기 취소와 같은 제자리 확인). 편집을 마칠 때의 시트
  (`EditExitSheet`)는 같은 문장을 본문에 더해 그 행 자체가 확인이 된다 — 시트 위에 확인을 또 쌓지 않는다. 가격은 서버가 정하므로
  숫자는 말하지 않는다.
- **길이 규칙 = 최대 50초** — 컷 최대 10개(MOV-5) × 스냅 최대 5초(SNAP-1). MOV-5 에 적었다. 목표 길이 선택은 트렌드 편집(A-7) 때.
- **검증** — `npm run verify:mobile` 184개 스위트 1456건(확인 줄 · 확인 탭에서만 시작). 기기에서는 다음 테스터 빌드에서 본다.
- **(이어서) 출력 비율** — 1:1 · 16:9 를 넣는 비용(서버 반나절 · 앱 1~2일, 대부분 미리보기의 블러 배경 흉내)을 보고 오너가 세로 9:16 하나로
  정했다. MOV-8 을 `구현됨`(세로 하나, 고르지 않음)으로 고치고 A-10 을 닫았다. 테스트에서 필요해지면 1:1 부터 더한다.

## 2026-10-12 (이어서) — 닉네임을 고칠 수 있다(backlog A-9 의 닉네임 · 아바타 닫음)

오너 결정: 관심사는 보류하되 나 탭의 `관심사 · 준비 중` 은 남긴다(개발되지 않았다는 것이 보여야 한다), 닉네임 수정은 넣는다, 아바타는
보여 줄 곳이 없어 만들지 않는다. 스펙 ACC-5 를 그대로 고쳤다.

- **앱** — 나 탭의 이름(연필 아이콘)을 누르면 `EditNicknameSheet` 가 열린다: 이름 한 칸(지금 보이는 이름으로 시작, 50자), 취소 · 저장. 빈
  이름은 "이름을 입력해 주세요."로 막고(서버가 빈 닉네임을 받지 않는다) 앞뒤 공백은 지운다. 저장은 `PATCH /auth/me` 의 `nickname` 이고
  서버의 답을 캐시에 넣어 이름과 첫 글자가 바로 바뀐다. 실패하면 시트에 남아 "이름을 저장하지 못했어요. 다시 시도해 주세요."를 보인다.
  닉네임이 없으면 로그인 계정의 이름을 보인다. 새 기능 슬라이스 `features/edit-nickname`(team.md §1 플랫폼 트랙).
- **검증** — `npm run verify:mobile` 185개 스위트 1461건(이름 규칙 셋, 닉네임 우선 · 이름에서 시트 열기 · 닉네임 없을 때 로그인 이름).
  서버는 이미 닉네임을 받아 바꾸지 않았다. 기기에서는 다음 테스터 빌드에서 본다.

## 2026-10-12 (이어서) — 쌓인 앱 변경을 에뮬레이터로 확인

테스터 빌드 `3e7039f`(EAS `46711ae2`)를 에뮬레이터에 깔고 AWS 서버로 봤다.

- **닉네임** — 빈 이름은 "이름을 입력해 주세요."로 막혔고, 저장한 이름이 나 탭의 이름과 첫 글자를 바로 바꿨다. **앱을 막 열거나 다시 앞으로
  가져온 직후의 첫 저장은 20~30초 걸렸다** — 서버 로그의 `PATCH /auth/me` 는 12ms 였고, 1분 뒤 같은 저장은 3초 남짓이었다. 요청이 나가기 전의
  대기라 `authHeader()` 의 `supabase.auth.getSession()` 이 복귀 때의 세션 갱신을 기다린 것으로 보인다(확정 아님). 휴대폰에서 같은지 보고
  정한다. 테스트 때문에 계정 닉네임이 "Dayeon" 이 됐다(adb 로 한글을 입력할 수 없다).
- **남은 기간 표시** — 10월 11일에 완성한 무비 (4)의 감상 화면이 "2026년 11월 10일까지 볼 수 있어요"를 보였다.
- **다시 만들기 확인** — `이 구성으로 다시 만들기` 가 "지금 완성된 무비는 사라지고, 크레딧을 다시 써요."와 `그대로 두기` · `다시 만들기` 를
  보였고, `그대로 두기` 는 무비와 잔액을 그대로 두었다.
- **보지 못한 것** — 컷이 없는 무비의 빈 화면 문구(스냅을 더 지워야 한다), Android 에서 Instagram 연결이 실패했을 때의 안내(실패 상황이 필요하다).

## 2026-10-12 (이어서) — 보안 저장소 읽기를 한 번으로(backlog E-30 계측)

닉네임 저장이 20~30초 걸린 원인을 찾으려고, 요청 · `supabase.auth.getSession()` · 보안 저장소 읽기 시간을 logcat 에 남기는 임시 계측 빌드
(EAS `8581ec1a`, 커밋하지 않음)를 에뮬레이터에 깔았다.

- **재현되지 않았다** — 70초 백그라운드 뒤 복귀 직후 저장 62ms, 완전 종료 뒤 시작 직후 저장 119ms. 앱 안에서 요청 전에 기다리는 길은
  `getSession()` 하나였다.
- **측정된 낭비 → 고침** — Supabase 는 `getSession()` 마다 세션을 저장소에서 읽고, 모든 API 요청이 그것을 부른다. 시작 때 요청 9개가 동시에
  여러 조각의 보안 저장소 값을 읽어 요청마다 0.3~0.7초 줄을 섰다. `chunkedSecureStorage` 가 읽은 값과 쓴 값을 메모리에 두고, 같은 키의 동시
  읽기는 기기 읽기 한 번을 나눠 쓴다(이 프로세스만 쓰므로 안전하다, 쓰기 · 지우기가 들어온 읽기보다 이긴다). 테스트 다섯을 더해
  `npm run verify:mobile` 185개 스위트 1466건.
- **20~30초는 열어 둔다** — 서버 도착까지의 시간이라 연결 대기도 들어 있고, 그때 에뮬레이터 네트워크가 바뀌던 중이었다. 휴대폰에서 다시 본다(E-30).

## 2026-10-12 (이어서) — 편집 결과물의 기본 처리(backlog A-7 "편집 경로의 기본 처리" 중 색 맞춤 말고 전부)

결정(auto-edit-draft §6.3)이 "툴이 아니라 항상 적용"으로 둔 처리가 편집 워커에 없었다. 컷마다 녹음 크기가 달라 컷이 바뀔 때 소리가 튀고,
컷 경계에서 '틱'이 날 수 있었다.

- **컷별 음량** — `normalize_clip` 이 컷 구간의 통합 음량을 재(`measure_loudness`, loudnorm 측정) -16 LUFS 로 맞추는 **선형 이득**을 준다
  (±12dB 상한, -50 LUFS 아래 무음에 가까운 컷과 잴 수 없는 컷은 그대로). 키운 만큼 넘치지 않게 −1dBFS 리미터를 건다.
- **마이크로 페이드** — 컷 양 끝 5ms(컷이 아주 짧으면 길이의 1/4).
- **마지막 손질 `finalize`** — 자막 뒤 업로드 전에 무비 전체를 두 번에 걸쳐(측정 → 선형) -14 LUFS · TP -1.5 로 맞추고 `+faststart` 로
  저장한다. 영상 · 자막은 다시 인코딩하지 않는다(`copy`). 마지막 인코딩은 CRF 20 · High 프로파일, 중간 파일은 CRF 18.
- **회전 검증** — 가로로 인코딩하고 90° 회전 표시를 단 원본(세로로 찍은 휴대폰 영상)이 결과물에서 서 있는지 실제 ffmpeg 로 고정했다.
  FFmpeg 이 입력 단계에서 회전을 적용해 코드 변경은 필요 없었다.
- **검증** — 워커 `REQUIRE_FFMPEG=1 python -m unittest discover -s tests` 226건(새로: 이득 규칙 · 컷 그래프, 실제 ffmpeg 로 12dB 다른 두 컷이
  2dB 안으로 맞춰짐 · 마무리가 -14±1 LUFS 이고 moov 가 앞 · 눕혀 저장된 세로 영상이 선다). 스펙 MOV-8 에 소리 처리를 적었다.
- **운영 확인** — 배포 뒤 에뮬레이터에서 9컷 24초 무비 (3)을 다시 만들었다(약 60초, 정상 재생). 공모전 서버 워커 로그: 컷 9개를 정규화한 뒤
  마무리가 무비 전체를 `measured_I=-16.23` 으로 쟀다 — 컷마다 -16 LUFS 로 맞춘 결과다 — 그리고 `loudnorm=I=-14 … linear=true` · `+faststart`
  로 저장했다. 귀로 들어 보지는 않았다(에뮬레이터 소리를 들을 수 없다).
- **남은 것** — 클립 간 색 맞춤(`grade.match`)과 BGM 덕킹(A-7).

## 2026-10-12 (이어서) — 그리드 타일의 거절 안내

2026-10-11 에 보드 카드만 봤던 거절 안내(MOV-12)를 무비 탭 그리드에서도 봤다. 에뮬레이터(테스터 빌드 `3e7039f`, AWS 서버)에서 24초짜리 무비 (3)을
다시 만들기 시작하고 6초 뒤 그리드의 실패한 무비 (5) 타일에서 `다시 시도` 를 누르자, 사유 줄이 한 줄로 "다른 무비를 만드는 중이에요."가 되고
실패 배지는 그대로였다. 크레딧은 (3)의 100 만 썼다. 스튜디오 기능 문서의 "그리드는 잡지 못했다"를 고쳤다.

## 2026-10-12 (이어서) — 작은 것 넷 — 스냅 보관 기한 · 무비 카드 남은 날 · lint 경고 · 시험 데이터

- **스냅 재생 화면의 보관 기한(SNAP-13)** — 스냅을 열면 캡션이 "2026년 10월 26일까지 보관돼요", 마지막 3일은 "N일 뒤 보관 기간이 끝나요"다
  (`pages/snaps/model/snap-expiry-caption.ts`). 목록은 마지막 3일만 세므로, 언제든 날짜를 읽을 곳은 재생 화면이다. 앨범 저장 실패 문구가 있으면 그것이 먼저다.
- **무비 카드의 남은 날(MOV-16)** — 끝내지 않은 결과물이 마지막 3일이면 보드 행 · 그리드 타일에 경고색 "N일 남음"(스크린 리더에도 읽힘). 결과물 기한
  계산을 `entities/movie` 의 `movieResultDaysLeft` · `movieResultExpiresAt` 로 옮겨 감상 화면 줄과 같이 쓴다.
- **lint 경고** — `REMINDER_WINDOW_IDS` 가 타입으로만 쓰여 나던 경고를 타입 별칭으로 바꿔 없앴다. `npm run verify:mobile` 이 경고 없이 187개 스위트 1472건.
- **시험 데이터(G)** — 10월 1일 시험 무비 · 크레딧은 로컬 개발 DB 에 이미 없어 닫았다.
- **에뮬레이터 확인(테스터 빌드 `ded3b4b`, AWS 서버)** — 완전 종료 뒤 시작이 정상(저장소 캐시가 처음 들어간 빌드), 스냅을 열자 "2026년 10월 26일까지
  보관돼요", 3일 넘게 남은 무비 카드에는 남은 날이 붙지 않았다. 마지막 3일의 카드 표시는 단위 테스트로만 봤다.

## 2026-10-12 (이어서) — 컷 사이 색 맞춤(backlog A-7 "편집 경로의 기본 처리" 닫음)

시간 · 장소 · 카메라 자동 노출이 다른 스냅을 이어 붙이면 컷마다 밝기와 색이 툭 바뀌었다. 오너가 방식 A(평균 색을 중간값 쪽으로)와 "보정 → 분위기"
순서를 골랐다.

- **방식** — `pipeline/color_match.py`: 컷마다 고른 구간에서 프레임 5장의 평균 R · G · B 를 재고(HDR 은 톤매핑 뒤), 무비 전체의 **중간값** 쪽으로
  **절반만** 옮기는 `colorchannelmixer` 이득을 만든다. 밝기는 0.8~1.25배, 색 치우침은 채널마다 ±8% 상한, 아주 어두운 컷(평균 밝기 0.05 미만)과
  잴 수 없는 컷은 그대로, 컷이 하나면 아무것도 하지 않는다. 중립색(회색)이 아니라 중간값을 기준으로 해 무비 전체의 분위기(저녁의 따뜻한 톤 등)는
  남기고 튀는 컷만 끌어온다.
- **순서** — 컷 정규화에서 스타일 `eq` **앞**에 붙는다(`with_style`). 분위기는 고른 바탕 위에 모든 컷에 같은 양으로 입혀지고, 분위기를 바꿔도 보정은
  그대로다. 결과물에만 걸린다(결정 §6.3).
- **검증** — 워커 232건(새로: 규칙 다섯, 실제 ffmpeg 로 어둡고 푸른 컷이 다른 두 컷 쪽으로 다가가고(차이 25% 이상 감소) 한 컷짜리 무비는 그대로).
  보정을 끄면(`STRENGTH=0`) 그 테스트가 실패하는 것을 확인했다. 실제 사진 같은 스냅으로는 아직 보지 않았다 — 테스트 스냅이 색막대 · 그림이라
  휴대폰으로 실내 · 실외를 섞어 찍어 봐야 체감을 안다.

## 2026-10-12 (이어서) — 만료 전에 앨범 저장을 권한다(backlog A-4 닫음)

다른 기기에서 온 스냅과 이 기기에서만 지운 스냅은 보관 기간이 끝나면 받을 파일이 없어 사라진다. 오너가 가벼운 안(선택 모드의 여러 개 저장)에 예고
알림 연결을 더하기로 했다.

- **여러 개 저장** — 스냅 선택 모드의 바에 `저장`(삭제 옆). 고른 스냅을 하나씩 앨범에 저장하고(`useSaveSnapsToAlbum` — 첫 저장만 권한을 묻고,
  거절되면 멈추고, 한 개가 실패해도 나머지는 계속), 다 되면 선택을 닫고 "스냅 N개를 앨범에 저장했어요", 남은 것이 있으면 고른 채로 바에 사유를 보인다.
- **예고 알림 연결** — 서버 문구를 "N일 후 스냅 N개가 삭제돼요. 앨범에 저장하거나 무비로 만들어 두세요."로 바꾸고, 앱은 탭하면 라이브러리를
  앨범 저장 선택(`?select=album`, 개수 제한 없음, 확인 버튼이 `앨범에 저장`)으로 열고 3일 안에 사라질 스냅을 미리 골라 둔다(이 기기가 아는 기한).
- **검증** — `npm run verify:mobile` 189개 스위트 1480건(미리 고르기 · 일괄 저장의 순서 · 권한 거절 · 문구 · 알림 목적지), `npm test -w apps/api`.
  미리 고르기는 기한 3일 안의 스냅이 있어야 보인다.
- **에뮬레이터 확인(테스터 빌드 `c432954`, AWS 서버)** — 선택 모드에서 두 개를 골라 `저장` 하자 선택이 닫히고 기기 미디어 저장소의 `Pictures/Snaply/`
  에 두 영상이 들어갔다(Android 15 라 권한 질문 없음). 알림 탭이 여는 링크(`snaplyapp://snaps?select=album`)로 열자 확인 버튼이 `앨범에 저장`,
  바가 "앨범에 저장"인 선택 모드가 됐고 3일 안의 스냅이 없어 아무것도 골라져 있지 않았다.

## 2026-10-12 (이어서) — Meta 앱을 회사로 옮기고, Instagram 앱으로 넘겨 올리기를 더했다

참가자 누구나 Instagram 에 올릴 수 있게 하려고 Meta 검수를 시작했다가, 회사 결정이 필요한 단계에서 멈추고 검수 없이 되는 길을 더했다. 근거는
[decisions/instagram-app-handoff.md](./decisions/instagram-app-handoff.md).

- **앱 소유권** — 오너가 기존 계정에서 회사 계정을 Snaply Meta 앱 관리자로 초대했고, 회사 비즈니스 **주식회사 디윅스**(비즈니스 인증 완료)의 설정 →
  앱 → "앱 ID 연결"로 소유권 이전을 요청 · 승인했다. 앱 ID · 시크릿 · 콘솔 설정 · 테스터는 그대로라 서버는 바꾸지 않았다.
- **멈춘 곳** — 권한을 검수에 추가하자 Tech Provider 지정(되돌릴 수 없음)을 요구했다. 같은 비즈니스의 가게지기-운영 앱도 승인된 권한에 "인증 필요"
  (액세스 인증)가 붙어 있어 비즈니스 단위 요건으로 보고, 회사 결정으로 넘겼다(C-8).
- **Instagram 앱에서 올리기** — Instagram 게시 시트의 연결 단계 · 게시 확인 단계 아래에 `Instagram 앱에서 올리기`: 사진 권한 → 렌더 파일 받기(공유와
  같은 캐시) → 앨범 저장 → `instagram://camera`(안 되면 instagram.com). Instagram 이 열리면 시트를 닫고, 실패는 시트에 남긴다. 공유처럼 정리를 권하고
  무비를 끝내지는 않는다. `npm run verify:mobile` 189개 스위트 1483건(저장 후 열기 · 권한 거절 · 저장 실패 · 파일 없음). 기기에서는 다음 테스터
  빌드에서 본다 — 에뮬레이터에는 Instagram 앱이 없어 웹으로 열리는 것까지만 볼 수 있다.

## 2026-10-12 (이어서) — Meta 앱 검수 제출(backlog C-8)

회사가 액세스 인증(Tech Provider)을 마친 뒤 Snaply Meta 앱(ID 1828326745016512, 주식회사 디윅스 소유)의 앱 검수를 제출했다. 결과는 C-8 에서 기다린다.

- **요청 권한** — `instagram_business_basic` · `instagram_business_content_publish` 두 개로 줄였다. 각 권한에 영문 사용 설명(읽는 것은 ID ·
  username 뿐, 게시는 사용자가 무비마다 확인할 때만, REELS 컨테이너 → `FINISHED` 대기 → `media_publish`)과 에뮬레이터 시연 영상(연결 27초 · 게시 102초,
  테스터 계정 `dayeonnnn2` 로 실제 릴스 게시)을 붙였다. content_publish 의 "필수 API 테스트 호출"은 그 게시로 채워졌다.
- **데이터 처리** — 가게지기-운영 앱(10-01 제출)의 답을 자동 입력한 뒤 Snaply 에 맞게 고쳤다. 처리자에서 **OpenAI 를 뺐다** — Snaply 에서 OpenAI 는 스냅
  영상 분석에만 쓰고 Instagram 토큰 · ID · username 은 받지 않는다. AWS 의 처리 국가는 미국에서 **대한민국**(서울 리전 `ap-northeast-2`)으로 바꿨다.
  처리자 주식회사 디윅스(대한민국), 책임 주체 주식회사 디윅스, 국가 보안 요청 "아니요", 공공기관 요청 정책 "해당 사항 없음"은 그대로다.
- **Android 플랫폼** — 검수자 지침은 앱 설정에 플랫폼이 있어야 열린다. 테스터 APK 의 v2 서명 인증서 SHA-1 로 키 해시 `kmtnRrZJ1kxyZd7050I2EL9nvy8=` 를
  구해 Android 플랫폼으로 저장했다. Google Play 스토어 · 패키지 이름을 함께 넣으면 저장이 조용히 실패해(Play 에 없는 앱) 스토어 없이 등록했다 — 검수
  화면의 "Android 패키지 이름"은 "설정되지 않음"으로 남는다.
- **검수자 지침** — 업로드한 APK(테스터 빌드 `9762a15`, 영상 촬영에 쓴 빌드)로 검수하게 하고, 한국어 화면 문구마다 영어 뜻을 단 영문 절차(나 → 소셜 연결 →
  Instagram 연결 → 무비 → Instagram에 게시 → 연결 해제)를 넣었다. Facebook 로그인은 "아니요". 검수 전용 이메일 계정은 오너가 Supabase 대시보드에서
  만들었고(비밀번호는 오너 관리), 에뮬레이터에서 갤러리 테스트 영상으로 스냅 4개를 가져와 자동 편집으로 완성 무비(9초)를 하나 만들어 두었다 — 2026-11-11
  에 만료된다.

## 2026-10-13 — 개념 사전 확정(backlog A-13 1단계)

온톨로지 착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 1단계. 방법과 테스트는
[plans/content-vocabulary.md](./archive/content-vocabulary.md) §5 · §6, 결정은 [decisions/ontology-personalization.md](./decisions/ontology-personalization.md).
사용자에게 보이는 변화는 없다 — 템플릿 추천의 슬롯 배정만 바뀌고, 추천은 아직 스위치(`MOVIE_RECOMMENDATION_ENABLED`)로 꺼져 있다.

- **현행 고정(§6 의 1, `2d85505`)** — 계획 §1 의 오탐 16 · 미탐 12 · 유지 3 을 지금 규칙(양방향 부분 문자열)의 결과로
  `recommendation-score.test.ts` 에 고정하고, 사례마다 옮겨 갈 개념 id 와 도입 뒤 기대값을 같이 적었다.
- **사전 확정(§6 의 3, `280c574`)** — 초안을 `packages/shared-types/src/content-vocabulary.json` 으로 옮기고 초안 파일을 지웠다. 분석이 이미 내는
  `moods` 를 개념 6개(잔잔함 · 아늑함 · 청량함 · 감성 · 활기 · 그리움)로 더했다 — 슬롯 매칭에는 쓰지 않아 `matchFields` 와 구분한다. 규모는
  places 37 · objects 37 · actions 13 · topics 8 · moods 6. TS 로더(`content-vocabulary.ts`)와 정합성 테스트를 API(`content-vocabulary.test.ts`)와
  워커(`tests/test_content_vocabulary.py` — 필드가 분석 스키마 `LIST_FIELDS` 와 같은지 포함)에 두고, 워커의 기동 필수 사전(`REQUIRED`)에 넣었다.
- **개념 매칭(§6 의 4, `a39cbc9`)** — 채점(`score-slots.ts`)이 분석의 자유 문자열을 사전으로 정규화하고, 힌트 개념과 같거나 하위면 1 · 상위면 0.5 ·
  그 밖 0 의 평균을 키워드 점수로 쓴다. 정규화 규칙에 하나를 더했다 — 머리 낱말로 끝나는 여러 낱말 별칭(`카페에 앉아 있기` → `앉아 있기`)을
  낱말 하나보다 먼저 본다. 시드 힌트 20슬롯은 마이그레이션 `20261013000000_content_vocabulary_match_hints` 의 `UPDATE` 로 개념 id 로 옮겼고(계획
  §2.1 의 표 그대로, `temporalPrior` 는 그대로), 카탈로그의 힌트가 모두 사전에 있는지 `movie-templates.test.ts` 가 본다. 추천 재사용 키
  (`candidateHashOf`)에 사전 버전을 넣었다. §5.1 의 31사례는 도입 뒤 값으로 뒤집혀 모두 통과한다. 결정 문서
  [template-snap-recommendation.md](./decisions/template-snap-recommendation.md) §7 의 `keyword` 정의를 고쳤다.
- **검증** — `npm test -w apps/api` 42파일 714건, 워커 `unittest discover` 238건, `npm run verify:mobile` 189 스위트 1483건, API · shared-types 린트와
  타입체크.
- **하지 않은 것** — §6 의 2(§5.4 실측)는 A-3 의 팀 스냅 실측을 기다린다. 그래서 고른 사례 밖에서 개념 매칭이 부분 문자열보다 나은지는 아직 모른다
  (backlog A-6 "개념 매칭의 실측 확인"). `topics` 확장은 3단계(관심사, A-9)로 남겼다.

## 2026-10-13 (이어서) — 개념 사이의 관계(backlog A-13 2단계)

착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 2단계. 1단계는 main 에 푸시해 AWS 배포까지 끝냈다
(CI · Deploy 성공, `/health` `db=connected`). 관계는 아직 아무 채점에도 쓰지 않는다 — 취향 반영(5단계)과 AI 편집 에이전트가 쓴다.

- **사전(`62406ca`)** — [decisions/ontology-personalization.md](./decisions/ontology-personalization.md) §3.2 의 세 관계를 개념별 필드로 더했다.
  `typicallyAt`(objects · actions → places, 사물 19 · 행동 6 — 커피 → 카페, 타기 → 교통수단), `evokes`(places · objects · actions → moods, 장소 15 ·
  사물 9 · 행동 6 — 바다 → 청량함, 노을 → 감성), `suits`(moods → 전환 kind · 스타일 프리셋, 앞일수록 더 어울린다 — 잔잔함 → crossfade, 활기 →
  zoompunch). `typicallyAt` · `evokes` 는 `roleAffinity` 처럼 하위 개념이 상위 값을 물려받는다(케이크 → 디저트의 카페 · 빵집). 모든 분위기가
  `suits` 를 가져 스냅 개념 → 분위기 → 전환 · 스타일의 사슬이 끊기지 않는다. 관계 값은 잠정이다 — 시연 데이터로 다시 본다(A-13 잠정값).
- **사전 버전은 올리지 않았다** — 관계는 매칭에 쓰지 않아 추천 결과가 바뀌지 않는다. 관계를 채점에 쓰기 시작하면 그때 함께 올린다(사전 `_note`).
- **조회 함수** — `contentTypicalPlaces` · `contentEvokedMoods` · `contentMoodSuits`(`packages/shared-types/src/content-vocabulary.ts`).
- **정합성 테스트** — API(`content-vocabulary.test.ts`)와 워커(`tests/test_content_vocabulary.py`): 아는 키만 쓴다 · 관계마다 놓일 수 있는 필드와
  가리키는 필드 · 목록이 비지 않고 중복이 없다 · 모든 분위기가 `suits` 를 갖고 전환은 전환 사전의 kind, 스타일은 `STYLE_PRESETS`(API 만) ·
  상위에서 물려받는 값을 그대로 다시 적지 않는다. 마지막 검사가 광장(`square`)의 `evokes` 가 상위 거리와 같은 것을 잡아 지웠다.
- **검증** — `npm test -w apps/api` 42파일 722건, 워커 `unittest discover` 통과, `npm run verify:mobile` 1483건, API 타입체크 · shared-types 린트.

## 2026-10-13 (이어서) — 취향 프로필(backlog A-13 4단계)

착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 4단계. 2단계는 main 에 푸시해 AWS 배포까지 끝냈다
(CI · Deploy 성공, `/health` `db=connected`). 결정은 [decisions/ontology-personalization.md](./decisions/ontology-personalization.md) §4 · §5,
요구는 PRF-1 · PRF-2 · PRF-4(`결정·미구현` → `부분`). 취향은 쌓기만 하고 아직 어디에도 반영하지 않는다 — 사용자에게 보이는 변화는 개인정보처리방침
문구뿐이다.

- **표(`49fd2c8`)** — `user_tastes`(사용자 · 필드 · 개념 · `explicit`/`derived` · 가중치 · 근거 수 · 마지막 신호 시각, `(user, field, concept, source)`
  유일). 마이그레이션 `20261013010000_add_user_tastes` 와 RLS(본인 조회만) · [team.md](./team.md) §1 미디어/편집 트랙에 넣었다.
- **신호** — 이미 있는 행동에서만 낸다. 추천 채점이 끝날 때 후보(+0.3, 분석이 끝나야 개념을 알아 접수가 아니라 굳힐 때 한 번) · 새 AI 초안의
  스냅(+0.3, 재사용은 세지 않는다) · AI 정렬 무비가 처음 올라올 때 최근 초안과 비교한 남김 · 다시 넣음(+0.5)과 지운 컷(−0.5) · 무비 저장 전후의
  넣은 스냅(+0.5) · 지운 AI 컷(−0.5, 사용자가 넣었다 뺀 컷은 세지 않는다) · AI 가 고른 전환을 바꾼 경계와 스타일 변경(바꾼 값 +0.5, 원래 값 −0.5) ·
  생성이 끝난 무비의 컷 내용 · 전환 · 스타일(+1.0, `generating` 조건부 갱신으로 한 번만). 내용 개념은 끝난 분석이 있는 스냅에서 사전으로 정규화한다.
- **갱신** — `w + 0.2 × 강도 × (1 − |w|)`, 상위 개념으로 한 단계마다 절반, 반감기 30일 감쇠(읽을 때 · 갱신 전에 적용). 숫자는
  `services/taste/taste-policy.ts`(전부 잠정), 계산은 순수 함수 `taste-math.ts`.
- **응답을 늦추지 않는다** — 계획의 큐 대신 같은 프로세스에서 응답 뒤에 반영하고(`emitTasteSignals`), 종료 때 남은 반영을 끝낸다(`index.ts`).
  근거는 계획 §2.2 의 구현 메모.
- **파기** — 분석 동의 철회는 내용 개념의 `derived` 행을 지우고 전환 · 스타일은 남긴다. 반영과 엇갈리지 않게 둘 다 같은 사용자 잠금을 잡고,
  반영은 잠금 안에서 동의를 다시 본다(동의 없으면 내용 신호를 버린다). 계정 실삭제는 FK cascade, 스냅 삭제는 지우지 않는다(합산값에 스냅 내용이
  없다). 관심사 해제의 파기는 3단계(A-9).
- **개인정보처리방침** — 수집 항목 표에 "편집 취향", 분석 절에 취향의 취급(스냅 삭제 뒤에도 점수가 남음 · 옅어짐 · 동의 철회 · 계정 삭제)을 넣고
  `legal.test.ts` 로 고정했다.
- **검증** — `taste-math.test.ts`(갱신 · 감쇠 · 전파 8건), `taste.test.ts`(신호가 나는 곳 · 쌓임 · 동의 · 감쇠 · 파기 14건), `npm test -w apps/api`
  44파일 745건, API 린트 · 타입체크. 손으로 쓴 마이그레이션은 `prisma migrate diff` 로 스키마와 비교해 `user_tastes` 에 차이가 없음을 봤다.

## 2026-10-13 (이어서) — 취향 반영(backlog A-13 5단계)

착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 5단계. 4단계는 main 에 푸시해 AWS 배포까지 끝냈다
(CI · Deploy 성공, `/health` `db=connected`). 요구는 PRF-3(`결정·미구현` → `부분`) · PRF-2(`부분` → `구현됨`).

- **취향 읽기(`09ef68b`, `services/taste/taste-affinity.ts`)** — 감쇠한 가중치를 관심사 · 행동 합으로 읽고(−1~1), 개념 하나는 자기 값이 없으면
  가장 가까운 상위 개념 값을 한 단계마다 절반으로, 사물 · 행동은 흔히 보이는 장소(`typicallyAt`)의 취향을 0.5 만큼 더한다. 스냅의 취향은 보이는
  개념들의 평균, 분위기는 분석의 `moods` 와 개념이 자아내는 분위기(`evokes`)다.
- **템플릿 목록** — `GET /movie-templates` 가 사용자 취향으로 템플릿을 다시 놓는다(슬롯 힌트 개념의 평균 취향 순, 차이 0.01 미만이면 카탈로그 순서).
  앱은 이 순서를 동점 처리에만 쓴다(채울 수 있는 정도가 먼저 — 기능 문서 `movie-templates.md` 에 적었다). 계약 설명이 바뀌어 `openapi.json` 을
  다시 만들고 `api-spec.md` 를 고쳤다.
- **템플릿 추천** — 채점에 스냅 취향 항(가중치 0.1)을 더한다. 슬롯마다 같은 값이라 후보가 슬롯보다 많을 때 **어느 스냅이 자리를 얻는지**를 바꾼다.
  재사용 키에 취향 규칙 버전(`TASTE_POLICY_VERSION`)을 넣었다 — 사용자 취향 값은 넣지 않았다. 신호마다 재사용이 깨지면 같은 화면을 다시 열 때마다
  새 추천이 되어 하루 한도를 쓰기 때문이고, 결정 §7 의 "취향 프로필 버전"을 규칙 버전으로 읽은 근거다.
- **AI 전환** — 같은 장면의 가중치 뽑기에서 좋아한 전환 `2^w` 배, 경계의 두 컷 분위기에 어울리는 전환(`suits`) 1.5배. 스타일의 후보 밖으로는 나가지
  않는다(일상은 바로 넘기기 그대로) — [decisions/transition-director.md](./decisions/transition-director.md) 후속 결정.
- **하지 않은 것** — 스타일 기본값: 앱이 초안 · 무비 요청에 스타일을 늘 보내 서버 기본값이 쓰이지 않는다. 계약 · 앱 변경이 필요해 backlog A-13 에
  남겼다. AI 편집 초안(MOV-25)에의 반영은 에이전트(A-12)가 한다.
- **보장** — 취향이 없으면 세 곳 모두 지금과 같다(테스트로 고정). 비선호는 빼지 않는다: 싫어하는 템플릿은 목록 끝, 싫어하는 스냅도 다른 후보가 없으면
  슬롯을 채우고, 싫어하는 전환도 확률이 절반일 뿐 뽑힌다(PRF-2).
- **검증** — `taste-affinity.test.ts` 9건, `transition-director.test.ts` 취향 4건, `recommendation-score.test.ts` 취향 3건, `taste.test.ts` 반영 4건(취향
  없는 사용자에게서는 빠지는 스냅이 바다를 좋아하는 사용자에게서만 자리를 얻는 비교 포함), `npm test -w apps/api` 45파일 765건, API 린트 · 타입체크.

## 2026-10-13 (이어서) — 발표용 온톨로지 내보내기(backlog A-13 8단계)

착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 8단계. 5단계 배포는 AWS 배포 잡이 러너가 온라인 · 유휴인데도
71분 동안 대기열에 머물러(GitHub 배정 누락으로 본다) 그 실행을 취소하고 배포 잡만 다시 돌려 끝냈다(CI · Deploy 성공, `/health` `db=connected`).

- **명령(`1b94263`)** — `npm run ontology:export` 가 shared-types 를 빌드한 뒤 `dist/ontology/` 에 두 파일을 만든다. 원천은 JSON 사전이라 결과는
  커밋하지 않는다([decisions/ontology-personalization.md](./decisions/ontology-personalization.md) §3.3). ONBOARDING §4 에 넣었다.
  - `snaply-ontology.ttl` — OWL 온톨로지. 필드마다 클래스(Place · Object · Action · Topic · Mood ⊂ ContentConcept, Transition · StylePreset · CutRole),
    개념은 그 클래스의 개체이자 SKOS 개념(`prefLabel` · `altLabel` · `notation` · `broader`), 관계는 객체 속성(`typicallyAt` · `evokes` ·
    `suitsTransition` · `suitsStyle` · `roleAffinity`, 도메인 · 범위 포함). 사전의 "물려받기"는 펼치지 않고 적힌 값만 낸다.
  - `snaply-ontology.html` — 그래프 페이지(vis-network 9.1.9, CDN). 노드 109개 · 관계 127개, 필드별 색 범례, 관계 종류별 켜고 끄기, 개념 찾기.
- **확인** — 만든 Turtle 을 RDF 파서(`rdflib`)로 읽어 트리플 979개가 파싱되고 카페 → 가게(`broader`) · 커피 → 카페(`typicallyAt`) · 잔잔함 →
  crossfade(`suitsTransition`)가 들어 있음을 봤다. 그래프 페이지는 내장 브라우저에서 1280×800 으로 열어 분위기를 가운데로 장소 · 사물 · 전환 ·
  스타일이 이어지는 것을 봤다(관계 없는 개념이 멀리 흩어져 가운데로 모으는 힘을 키우고 배치 뒤 화면에 맞추도록 고쳤다).
- **테스트** — 변환을 순수 함수(`scripts/ontology/build.mjs` · `html.mjs`)로 두고 `npm run ontology:test`(node:test 6건): 개념마다 한 번 · 라벨 ·
  관계, 파일이 쓰는 IRI 가 모두 선언됨, 리터럴 이스케이프, 없는 대상을 가리키는 관계 거절, 그래프 엣지의 양 끝이 모두 노드, `</script>` 가 든
  데이터로 페이지가 깨지지 않음. CI 에는 넣지 않았다(루트 스크립트를 도는 잡이 없다).

## 2026-10-13 (이어서) — AI 편집 에이전트(backlog A-12 6단계)

착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 6단계, 결정 [decisions/ai-edit-agent.md](./decisions/ai-edit-agent.md),
요구 MOV-25(`결정·미구현` → `부분`). 8단계 배포는 배포 잡이 대기 없이 돌아 끝났다(CI · Deploy 성공, `/health` `db=connected`).

- **구조(`82efa3d`, `apps/api/src/services/edit-agent/`)** — `POST /movie-drafts` 가 OpenAI Responses API 의 함수 툴로 에이전트를 돌린다(분석 워커와
  같은 API, `store: false`, 추론 항목은 암호화된 채로 되돌린다). 에이전트는 넘긴 스냅의 개념 · 촬영 간격 · 신호 요약 · 스타일 · 취향 상위 8개로
  의도를 추론하고 툴을 부른다 — `select_cuts`(규칙 디렉터를 초점 · 컷 수로 실행하고 규칙 검토를 함께 돌려준다), `find_snaps`(개념과 그 하위 개념이
  보이는 스냅 — 온톨로지 검색), `analyze_snaps`(분석 요청, 초안 1회 12개까지, 기다리지 않는다), `submit_draft`(의도 · 장면 흐름 · 분위기).
  검토는 초점 개념이 컷에 있는가 · 목표 길이(1.2배까지)를 넘지 않는가 · 컷이 너무 적지 않은가이고, 재시도는 2회, 모델 왕복은 8회, 시간은 20초가
  상한이다(모두 잠정, `agent-policy.ts`).
- **판단은 에이전트, 실행은 규칙** — 디렉터(`edit-director.ts`)에 조절값 둘을 더했다: 초점 스냅의 점수 가산(묶음 안에서 앞선다, 거르기 · 중복은
  그대로)과 컷 수 상한. 생략하면 지금과 같아 규칙 버전은 올리지 않았다.
- **보내는 것** — 개념 id · 신호 요약 · 촬영 간격(분) · 별칭(`s1` …)뿐이다. 스냅 id · 프레임 · 분석 원문은 보내지 않는다. 분석에 동의하지 않은
  사용자는 개념이 없고 `find_snaps` · `analyze_snaps` 도 없다(`analyze_snaps` 는 분석 스위치도 켜져 있어야 한다).
- **기록과 재현** — `movie_drafts` 에 `mode`(`agent` · `rules` · `fallback`)와 `plan`(의도 · 흐름 · 툴 호출과 결과 요약 · 디렉터에 넘긴 조절값 · 왕복 수 ·
  토큰 · 지연)을 더했다(마이그레이션 `20261013020000_add_movie_draft_agent_plan`). 계획의 조절값을 다시 실행하면 같은 초안이다(`replayDraftPlan`,
  테스트로 고정). 재사용 키에 에이전트 프롬프트 버전 · 모델 · 사전 · 취향 규칙 버전을 넣었다.
- **폴백** — 키가 없으면 지금처럼 규칙만(`rules`). 모델 오류 · 시간 초과 · 고른 것 없이 끝남이면 규칙으로 만들고(`fallback`, `plan.error`) 그 초안은
  재사용하지 않는다. 응답 모양은 그대로라 앱은 바뀌지 않는다 — 앱은 요청 동안 `편집하는 중…` 을 보이고 타임아웃을 두지 않는다(기능 문서 `studio.md`).
- **환경** — `EDIT_AGENT_MODEL`(선택, 기본 `gpt-5.6-luna`)을 선언했다. `OPENAI_API_KEY` 는 이제 API 도 읽는다 — 운영 API 는 분석 워커와 같은 시크릿을
  읽어 이미 키가 있으므로 배포하면 켜진다([deployment-aws.md](./deployment-aws.md) §2).
- **함께 닫은 것** — A-11 "초안의 vision 분석"(`analyze_snaps`).
- **하지 않은 것** — 실제 모델 호출: 로컬 `.env` 에 키가 없어 실제 모델로 돌려 보지 못했다. 테스트는 각본 모델이다(backlog A-12 "운영 첫 확인").
  전환 고르기: 초안 응답에 전환이 없어 계약 · 앱 변경이 필요하다(A-12). 과금 · 남은 무료 횟수: 7단계.
- **검증** — `edit-agent.test.ts`(루프 10건: 계획 저장과 재실행, 별칭만 보냄, 검토 실패와 재시도 상한, 하위 개념 검색, 동의 없는 사용자의 툴 제한,
  분석 요청 대상과 상한, 고장 난 인자, 고르지 않고 끝냄, 모델 오류 · 시간 초과), `movie-drafts-agent.test.ts`(API 5건: 응답 모양 · 계획 저장 · 재사용 ·
  폴백과 재사용 안 함 · 미동의 · 키 없음), `edit-director.test.ts` 조절값 4건, `npm test -w apps/api` 47파일 784건, API 린트 · 타입체크.

## 2026-10-13 (이어서) — 에이전트 운영 확인(backlog A-12)

6단계를 main 에 푸시해 AWS 배포까지 끝냈다(CI · Deploy 성공, 배포 잡 대기 없음, `/health` `db=connected`). 운영 API 는 분석 워커와 같은 시크릿으로
`OPENAI_API_KEY` 를 받아 배포와 함께 에이전트가 켜졌다.

- **확인** — 에뮬레이터(테스터 빌드, 검수 전용 계정 — 분석 미동의)에서 스냅 4개로 `스냅 골라 자동 편집` → 앱이 약 11초 `편집하는 중…` 뒤 무비를
  열었다(컷 3개, "스냅 1개는 넣지 않았어요"). 운영 DB 의 그 초안: `mode` `agent`, 의도 "짧은 일상 기록", 툴 `select_cuts` → `submit_draft`(검토 한 번에
  통과), 조절값 초점 없음 · 컷 수 4, 왕복 2 · 에이전트 5.0초 · 입력 1,847 · 출력 114 토큰. 같은 스냅의 전날 초안은 `rules` 였다(재사용 키가 달라
  새로 만들었다).
- **읽은 것** — 실제 모델(`gpt-5.6-luna`)과 Responses API 가 툴 스키마(strict)를 받아들인다. 분석에 동의하지 않은 계정이라 개념 없이 촬영 흐름 ·
  신호로만 판단해 의도가 일반적이다. 토큰은 결정 문서 §5.1 의 추정(입력 15~30k)보다 한 자릿수 적어 1회 약 $0.0005 이지만 표본이 하나다(A-12 잠정값).
- **남긴 것** — 검수 전용 계정에 확인용 초안 무비("무비 10-13")가 하나 더 생겼다. 검수용 완성 무비("무비 10-12")는 그대로다.

## 2026-10-13 (이어서) — 관심사(backlog A-9)

착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 3단계. 요구 ACC-5(`부분` → `구현됨`) · PRF-1 · PRF-4
(`부분` → `구현됨`). 결정 [decisions/ontology-personalization.md](./decisions/ontology-personalization.md) §4 · §5.

- **사전(`a99021d`)** — `topics` 를 8개에서 18개로 늘렸다(친구 · 데이트 · 반려동물 · 자연 · 운동 · 요리 · 쇼핑 · 전시 · 예술 · 공연 · 공부 · 작업,
  별칭 포함). 사전 버전을 2 로 올려 추천 재사용 키가 바뀌었다.
- **서버** — `GET /interest-topics`(사전 순서의 `{ id, label }`, 계약 `contract/interest-topics.ts`). `PATCH /auth/me` 의 `interests` 는 사전의 주제
  id 만 받고(아니면 400 `UNKNOWN_INTEREST` + 틀린 값), 중복을 지워 통째로 바꾼다. `GET /auth/me` 는 사전에 있는 값만 돌려준다 — 예전 빌드가 저장한
  자유 문자열은 지우지 않고 응답에서만 뺐다(다음 저장 때 사라진다). 고른 관심사는 같은 트랜잭션에서 취향 프로필의 `explicit` 행(가중치 0.5, 잠정)이
  되고, 해제하면 그 행을 지운다. 관심사 행은 감쇠하지 않고, 분석 동의 철회에도 남는다(분석에서 온 것이 아니다). 템플릿 순서 · 추천 · AI 편집 초안이
  이미 취향을 읽으므로 따로 고친 곳 없이 반영된다 — 카페를 고르면 `GET /movie-templates` 의 첫 템플릿이 `cafe` 가 되는 것을 테스트로 고정했다.
- **앱(`353f807`)** — 나 탭의 `관심사` 행이 `준비 중` 대신 고른 관심사를 읽어 주고(이름 둘 + `외 N개`, 없으면 `고르지 않음`) `/settings/interests`
  를 연다. 화면은 주제를 체크박스 알약으로 보이고 고른 수(`N개 골랐어요` · `고른 관심사가 없어요`)를 위에 둔다. 누르면 바로 저장한다 — 다른 나 탭
  설정처럼 선호 하나를 켜고 끄는 일이라 누름이 곧 확정이고 다시 누르면 되돌아가서, 저장 버튼을 두지 않았다(UX interaction pattern §3 의 확정 버튼 대신
  §2 의 "고르는 것이 확정"을 따른 이유 — 기능 문서 `me.md`). 화면에 먼저 반영하고 서버 응답으로 덮으며, 거절되면 되돌리고 `관심사를 저장하지 못했어요.
  다시 시도해 주세요.`, 빠른 연속 탭은 마지막 응답만 반영한다. 새 기능 슬라이스 `features/choose-interests`, 화면은 `pages/me`. 예전 빌드의 기기
  전용 관심사 태그(`notification-settings`)는 쓰지도 올리지도 않는다(주석을 고쳤다).
- **문서** — 스펙 ACC-5 의 관심사 동작, `api-spec.md`, `openapi.json`, 기능 문서 `me.md`, `team.md` §1(`choose-interests` · `interest-topics`).
- **검증** — `interests.test.ts`(10건: 주제 목록 · 인증 · 저장과 관심사 행 · 해제 · 빈 목록 · 사전 밖 거절 · 예전 값 숨김 · 감쇠 없음 · 동의 철회에도 남음 ·
  템플릿 순서), 앱 `interest-read-out.test.ts` · `use-interests.test.ts`(14건: 바로 반영 · 해제 · 거절 시 되돌림 · 늦은 예전 응답 무시 · 로드 전 무시 · 목록
  실패와 재시도 · 로그아웃 상태) · `me-interests-page.test.tsx`(5건) · `me-page.test.tsx` 갱신, `npm test -w apps/api` 48파일 794건,
  `npm run verify:mobile` 192 스위트 1502건, 워커 사전 테스트.
- **하지 않은 것** — 에뮬레이터 · 기기 확인(새 테스터 빌드가 필요하다 — A-9 에 남김).

## 2026-10-13 (이어서) — 관심사 에뮬레이터 확인(backlog A-9 닫음)

A-9 를 main 에 푸시해 AWS 배포(CI · Deploy 성공, `/interest-topics` 가 인증 없이 401)와 테스터 빌드(`42d510d`)를 끝내고 에뮬레이터에 깔았다.

- **확인(검수 전용 계정)** — 나 탭 `관심사` 행이 `고르지 않음` 이었고, 누르면 관심사 화면이 열려 주제 18개가 서버 순서로 나오고 위에 `고른 관심사가
  없어요`. 카페 · 여행을 누르자 바로 채워지고 `2개 골랐어요`, 여행을 다시 누르자 `1개 골랐어요`. 나 탭 행은 `카페`. 앱을 완전히 끄고 다시 열어도
  `카페` — 서버에 남았다. 비행기 모드에서 산책을 누르자 `1개 골랐어요` 로 되돌아가고 `관심사를 저장하지 못했어요. 다시 시도해 주세요.`(비행기 모드는
  다시 껐다).
- **보지 못한 것** — 휴대폰 · iOS. 템플릿 카드 순서의 변화는 이 계정에서 보이지 않는다 — 앱은 채울 수 있는 정도로 먼저 정렬하고 서버 순서는 동점에만
  쓴다(서버 순서는 `interests.test.ts` 가 고정한다). 검수 전용 계정에 관심사 `카페` 가 남아 있다.

## 2026-10-13 (이어서) — 초안 과금(backlog A-12 7단계)

착수 계획 [plans/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 7단계, 결정 [decisions/ai-edit-agent.md](./decisions/ai-edit-agent.md) §5,
요구 CRD-9(`결정·미구현` → `구현됨`). 오너가 서버 부하를 이유로 스위치 없이 바로 켜기로 했다(공모전 기간 포함). 관심사(A-9)는 배포 · 테스터 빌드
`42d510d` · 에뮬레이터 확인까지 끝냈다(위 항목).

- **서버(`58f1f15`)** — 에이전트가 만든 초안은 최근 24시간 3번까지 무료, 그 뒤 1번에 20크레딧(`credit-policy.ts` 의 `FREE_EDIT_DRAFTS_PER_DAY` ·
  `EDIT_DRAFT_COST`). 무비 생성의 예약을 그대로 써서 유저 행을 잠그고 잔액을 본 뒤 차감하고(모자라면 402 `INSUFFICIENT_CREDITS` + `required` ·
  `balance`, 에이전트를 부르지 않는다), 에이전트가 끝까지 만들면 확정, 규칙으로 돌아가거나(`fallback`) 기록이 실패하면 돌려준다. 재사용한 제안 ·
  에이전트가 없는 서버의 초안(`rules`)은 무료이고 무료 횟수에도 세지 않는다. `movie_drafts.charged_credits`(무료 횟수는 `mode = agent` 이고 0 인 행) ·
  원장 `movie_draft_id`(한 초안의 비용 · 환급은 한 번씩 — unique, FK 없음) · 원장 사유 `draft_charge` · `draft_refund`(마이그레이션
  `20261013030000_add_edit_draft_charge`). 응답에 `chargedCredits`, 새 `GET /movie-drafts/allowance`(`agent` · `freeRemaining` · `nextCost` 등).
- **앱(`c2638ab`)** — 자동 편집으로 스냅을 고르는 동안 선택 바가 `자동 편집 · 무료 2번 남음 · 최대 30개` / `자동 편집 · 20크레딧 · 최대 30개`(에이전트가
  없으면 붙이지 않는다). 잔액 부족은 `크레딧이 모자라요. 자동 편집 1번에 20크레딧이 필요해요.` 와 함께 `이 스냅으로 새 무비` 를 권한다(하루 상한과 같은
  처리). 초안이 나오거나 거절되면 비용과 잔액 쿼리를 무효화한다. 크레딧 내역 문구 `자동 편집` · `자동 편집 환급`.
- **받아들인 것** — 무료 횟수는 잠그지 않고 세어 동시 요청 두 개가 마지막 무료를 함께 쓸 수 있다(하루 상한이 묶고, 크레딧을 잘못 빼는 쪽으로는 틀리지
  않는다). 분석 동의를 철회하면 초안 기록이 지워져 그날의 무료 횟수 · 상한을 다시 센다(원장은 남는다) — 결정 문서 §5 구현 메모.
- **검증** — `movie-drafts-agent.test.ts` 과금 5건(무료 3번 뒤 20 차감 · 잔액 부족 402 와 에이전트 미호출 · 폴백 환급과 원장 순서 · 폴백 · 재사용 · 규칙
  초안은 무료 횟수에 안 셈 · 에이전트 없는 서버의 비용 조회), 앱 `draft-cost.test.ts` · `use-edit-draft.test.ts`(잔액 부족 문구 · 필요 크레딧 유지) ·
  `use-compose-movie.test.ts`(402 → `credits` 와 부족분 · 초안 뒤 비용 · 잔액 무효화), `npm test -w apps/api` 48파일 799건, `npm run verify:mobile`
  193 스위트 1511건. `use-compose-movie.test.ts` 에 QueryClient 를 붙이면서 기본 가비지 수집 타이머가 Jest 를 5분 붙잡아 `gcTime: Infinity` 로 막았다.
- **하지 않은 것** — 에뮬레이터 확인(새 테스터 빌드가 필요하다 — A-12).

## 2026-10-13 (이어서) — 초안 과금 에뮬레이터 확인(backlog A-12)

7단계를 main 에 푸시해 AWS 배포(CI · Deploy 성공, `/movie-drafts/allowance` 가 인증 없이 401)와 테스터 빌드(`b897f00`)를 끝내고 에뮬레이터에 깔았다.

- **확인(검수 전용 계정, 오늘 에이전트 초안 1번을 쓴 상태)** — `스냅 골라 자동 편집` 의 선택 바가 `자동 편집 · 무료 2번 남음 · 최대 30개`. 스냅 조합을 바꿔
  초안을 두 번 만들자 `무료 1번 남음` → `자동 편집 · 20크레딧 · 최대 30개`. 그다음 초안을 하나 더 만들자 나 탭 크레딧이 400 → 380 이 되고 크레딧 내역 맨
  위에 `자동 편집 -20`(그 아래 `무비 만들기 -100` · `가입 보너스 +500`). 운영 서버에서 에이전트 초안 · 무료 횟수 · 예약과 확정 · 원장 문구가 이어서 동작한다.
- **보지 못한 것** — 잔액 부족 문구(잔액이 20 아래인 계정이 없다 — 테스트로는 고정, A-12 에 남김), 휴대폰.
- **남긴 것** — 검수 전용 계정에 확인용 초안 무비가 몇 개 더 생겼고(`무비 10-13 …`), 크레딧이 380 이다. 검수용 완성 무비 `무비 10-12` 는 그대로다.

## 2026-10-13 (이어서) — 에이전트가 전환을 고른다(backlog A-12)

MOV-25 의 넷째 툴(결정 [decisions/ai-edit-agent.md](./decisions/ai-edit-agent.md) §3.2). 오너가 고른 방식(나) — 에이전트는 무비의 **분위기**를 정하고, 경계별
전환은 서버가 그 분위기를 따라 고른다. 계약 · 앱 변경이 없어 새 테스터 빌드가 필요 없다.

- **에이전트** — 새 툴 `pick_transitions(mood)`. `select_cuts` 뒤에만 받고, 개념 사전 `moods` 의 id(`moods:calm` · `calm` · 표현 `잔잔한`)만 받는다. 고른
  스타일의 후보 중 그 분위기에 어울리는 전환(`favored`)을 돌려준다. 계획의 `mood` 는 이 툴의 값이 우선이고, 없으면 `submit_draft` 의 값이 사전에 있을
  때만 남는다(전에는 아무 문자열). 프롬프트 버전 2 — 초안 재사용 키가 바뀌어 예전 초안이 돌아오지 않는다.
- **무비** — `movies.mood`(마이그레이션 `20261013040000_add_movie_mood`). `arranger: ai` 무비를 만들 때 그 무비의 초안(재사용 창 안의 가장 최근 초안 중 컷을
  모두 담은 것 — 취향 신호의 짝짓기를 `findMovieDraft` 로 뽑아 함께 쓴다)의 `plan.mood` 를 옮긴다. 응답에는 드러나지 않는다.
- **전환** — transition-director 의 `agentSuits` — 같은 장면 안의 모든 경계에서 어울리는 전환의 비중을 `EDIT_AGENT_MOOD_BOOST`(잠정 2)배. 스타일의 후보
  밖으로는 나가지 않는다(일상은 그대로 `hardcut`). 컷 · 스타일을 바꿔 다시 골라도 무비의 분위기를 따른다.
- **검증** — `edit-agent.test.ts`(선택 전 거절 · 사전 밖 거절 · 감성의 `favored` · 툴 값이 submit 보다 앞섬 · submit 의 사전 밖 값은 버림),
  `transition-director.test.ts`(분위기가 dip 비중을 올리고 후보 밖 flash 는 없음 · 비우면 그대로), `movie-transitions.test.ts`(초안의 분위기가 무비에 남고
  생성 · 재저장의 AI 경계가 따름 · 맞는 초안이 없거나 사람이 짠 무비거나 사전 밖이면 없음), `npm test -w apps/api` 48파일 804건, `npm run lint -w apps/api`.
- **하지 않은 것** — 운영에서 에이전트가 실제로 `pick_transitions` 를 부르는지(다음 초안부터 `movie_drafts.plan->'steps'` 로 본다), `pick_music` · `pick_style`(A-12).

## 2026-10-13 (이어서) — 분위기 id 를 툴에 목록으로(backlog A-12)

위 항목을 배포(CI · Deploy 성공)하고 에뮬레이터 검수 계정(분석 미동의 · 일상 · 스냅 4개)으로 초안을 만들었다. 무비 `무비 10-13 (7)` 이 열렸고, 오너가 운영 DB 에서
본 계획은 `agent` · 툴 `select_cuts` → `pick_transitions` ×4 → `submit_draft`, 왕복 6 · 15.8초 · 입력 9,055 · 출력 774 토큰(전 버전 초안은 왕복 2 · 약 5초 ·
약 1,800 토큰). `pick_transitions` 의 앞 세 번은 `style:일상` · `moods:casual` · `moods:일상` 으로 거절됐고 네 번째 `moods:cozy` 가 들어가
`plan.mood` · `movies.mood` 모두 `cozy` — 저장 경로는 끝까지 동작했다. 원인은 분석에 동의하지 않은 계정은 스냅에 분위기가 없어 에이전트가 id 를 본 적이
없다는 것이다.

- **고침** — 분위기 id 를 `pick_transitions` 의 `enum`(strict 스키마라 모델이 목록 밖을 내지 못한다)과 `submit_draft` 의 설명에 넣었다. 툴은 한 번만 받고(두 번째는
  거절), 스타일에서 바뀌는 전환이 없어도 "정했다"로만 답한다(다시 고르게 하지 않는다). 틀린 값의 거절에도 목록을 붙인다. 프롬프트 버전 3.
- **검증** — `edit-agent.test.ts`(틀린 값의 거절에 목록 · 두 번째 호출 거절), `npm test -w apps/api` 48파일 804건, lint.
- **운영 확인** — 배포(CI · Deploy 성공) 뒤 같은 계정 · 스냅 4개로 초안을 다시 만들었다(무비 `무비 10-13 (8)`). 계획은 `agent` · 프롬프트 버전 3 · 툴 `select_cuts` →
  `pick_transitions` → `submit_draft`, 왕복 3 · 8.7초 · 입력 3,951 · 출력 322 토큰, `plan.mood` · `movies.mood` 모두 `calm`. 분위기를 한 번에 골랐다.

## 2026-10-13 (이어서) — 취향이 권하는 스타일(backlog A-13)

PRF-3 의 마지막 반영처(`부분` → `구현됨`). 오너가 고른 방식(가) — 서버가 권하는 스타일을 계약에 더하고 앱이 근거가 없을 때 쓴다.

- **서버** — 프로필(`GET` · `PATCH /auth/me`)에 `recommendedStyle`(`감성` · `여행` · `일상` · `null`). 규칙은 `taste-affinity.ts` 의 `recommendedStyle` —
  스타일 취향에 좋아하는 분위기가 어울리는 스타일(사전 `suits.styles`)을 `TASTE_RELATION_RATIO`(0.5)만큼 더한 점수의 최고가 `TASTE_STYLE_MIN`(0.15,
  잠정 — 스타일을 한 번 바꾼 것 0.1 로는 안 되고 그 스타일로 한 편 완성한 0.2 면 된다) 이상일 때만. 계약 · `openapi.json` · `api-spec.md`.
- **앱** — `entities/movie` 의 `movieStyleQueries.recommended()`(`GET /auth/me` 의 그 필드만, 5분 stale). `useComposeMovie` 가 읽어 자동 편집은
  최근에 손댄 무비의 스타일 → 권하는 스타일 → `일상`, 직접 고른 스냅의 새 무비는 권하는 스타일 → `일상`(전에는 늘 `일상`). 템플릿은 템플릿의 스타일 그대로.
  기능 문서 `studio.md` · `snaps.md` · `movie.md`.
- **검증** — `taste-affinity.test.ts`(근거 없음 · 한 번 바꾼 정도는 null · 완성한 스타일 · 분위기에서 오는 스타일 · 싫은 분위기는 무시), `interests.test.ts`
  (새 계정 null → 취향이 생기면 `여행`, PATCH 응답도), 앱 `recommended-style.test.ts` · `use-compose-movie.test.ts`(권하는 스타일로 시작 · 자동 편집은 최근
  무비가 먼저). `npm test -w apps/api` 48파일 808건, `npm run verify:mobile` 194 스위트 1515건(끝에 "Jest did not exit" 경고가 한 번 났고 다시 돌리면 나지 않았다).
- **에뮬레이터 확인** — 배포(CI · Deploy 성공)와 테스터 빌드(`89c1727`)를 깔고 검수 계정으로 `스냅 골라 새 무비` 에서 스냅 2개로 새 무비(`무비 10-13 (9)`)를 만들었다 —
  스타일 `일상`. 이 계정의 취향은 일상 쪽이거나 권할 근거가 없어(완성 무비가 일상 한 편) 화면만으로는 권하는 스타일과 기본값을 가를 수 없다. 앱이 새 필드를 읽으며
  깨지지 않는 것까지 봤다. 다른 스타일을 권하는 계정으로 보는 것은 A-13 잠정값 확인에 함께 남긴다.

## 2026-10-13 (이어서) — 인스타그램 삭제 콜백이 큰 본문에 멈추지 않는다(backlog E-31 닫음)

10-11 ~ 10-12 main 변경 리뷰에서 찾았다. 인증 없이 열린 `POST /sns/instagram/deauthorize` · `/data-deletion` 이 `signed_request` 를
꺼내는 multipart 정규식(`name="signed_request"\r?\n(?:[^\r\n]*\r?\n)*?\r?\n…`)은 `name="signed_request"` 를 되풀이한 본문에서 시간이
본문 크기의 제곱으로 늘었다 — 서명을 확인하기 **전에** 돈다. node 로 재면 22KB 25ms · 44KB 101ms · 88KB 402ms 이고, Fastify 기본 상한
1MiB 를 채운 요청 한 건이면 이벤트 루프가 약 50초 멈춘다. 공모전 서버는 공개 주소라 누구든 보낼 수 있다.

- **고침** — 두 라우트에 본문 상한 16KB(`bodyLimit`, 넘으면 읽기 전에 413 — Meta 가 보내는 것은 수백 바이트의 `signed_request` 하나다)를
  걸고, multipart 는 정규식 대신 `indexOf` 로 앞에서부터 한 번만 훑는다(파트 머리 뒤 첫 빈 줄의 다음 줄이 값). 같은 본문이 88KB 에 0.2ms,
  4MB 에 4.6ms 다(JSON 정규식 · urlencoded 파싱 포함). [api-spec.md](./api-spec.md)의 "urlencoded 로 온다"를 받는 형식 넷과 상한으로 고쳤다.
- **검증** — `npm test -w apps/api` 48개 파일 811건 · typecheck · lint. 테스트는 로컬 `apps/api/.env` 의 `OPENAI_API_KEY` 를 비우고 돌렸다 —
  비우지 않으면 편집 에이전트가 실제 모델을 불러 `movie-drafts.test.ts` 의 제안 순서 한 건이 실패한다(CI 에는 키가 없어 통과한다 — 바로 아래 E-32 로 고쳤다). 새 테스트 셋(파트 머리에 줄이 더 있는 multipart · 큰 본문은 413 이고 아무것도 지우지 않음 ·
  한도 안에서 이름만 되풀이한 본문은 400) 중 413 사례는 수정 전 실패(옛 코드는 66KB 를 정규식으로 다 읽고 400).

## 2026-10-13 (이어서) — API 테스트가 개인 OpenAI 키로 실제 모델을 부르지 않는다(backlog E-32 닫음)

E-31 을 검증하다 찾았다. 편집 에이전트(`services/edit-agent/agent-runtime.ts`)는 `OPENAI_API_KEY` 가 있으면 **호출 시점에** 실제 모델을
부르는데, 테스트 설정이 이 키를 비우지 않았다. 그래서 키를 넣어 둔 개인 `apps/api/.env` 로 `npm test -w apps/api` 를 돌리면 초안 테스트가
회사 키로 실제 모델을 불렀다 — 실행마다 과금되고(`movie-drafts.test.ts` 한 파일에 103초), 제안 순서가 그때그때 달라 한 건이 실패했다.
CI 에는 키가 없어 통과했다.

- **고침** — `test/setup/env.ts` 가 `OPENAI_API_KEY` 를 빈 값으로 박는다. 다른 외부 키처럼 지우기만 하면(`hermetic.ts`) `@prisma/client` 의
  dotenv 가 개인 `.env` 값으로 되살린다 — 다른 키는 설정을 한 번 읽어 두지만 에이전트는 부를 때마다 환경을 읽는다. 빈 값은 dotenv 가 덮지 않는다
  (`CREDIT_SIGNUP_BONUS` 와 같은 방식). 테스트는 지금처럼 각본 모델을 끼운다.
- **검증** — `harness-safety.test.ts` 에 "편집 에이전트는 실제 모델을 부르지 않는다"(Prisma 를 불러온 뒤에도 키가 비어 있다)를 더했고 수정 전
  실패. 개인 키가 든 `.env` 그대로 `npm test -w apps/api` 48개 파일 812건 통과(37초) · typecheck · lint.

## 2026-10-13 (이어서) — 만들지 못한 무비에는 결과물 만료 예고를 보내지 않는다(backlog E-33 닫음)

10-11 ~ 10-12 main 리뷰에서 찾았다. 무비 결과물 만료 예고(NTF-10)의 대상 쿼리(`expiry-notice.service.ts` `findDueMovies`)가 결과물 영상의
상태를 보지 않았다. 생성을 시작하면 무비가 새 결과물 영상을 가리키고(`movie.service.ts` export), 실패하면 워커가 그 영상을 `failed` 로만
바꾸고 지우지 않는다(`ai-worker/src/db.py`). 그래서 만들지 못한 무비에도 27일 뒤 "남기려면 저장하거나 게시해 주세요"가 가고, 탭하면 실패한
무비가 열렸다.

- **고침** — 결과물이 완성(`status: 'done'`)된 무비만 고른다. 스펙 NTF-10 에 "만들지 못한 무비에는 보내지 않는다"를 더했다.
- **검증** — `expiry-notice.test.ts` 에 "만들지 못한 무비에는 보내지 않는다"를 더했고 수정 전 실패. `npm test -w apps/api` 48개 파일 813건 · typecheck · lint.

## 2026-10-14 — 컷 시작의 페이드와 무비 전체 음량을 바로잡는다(backlog E-34 · E-35 닫음)

10-11 ~ 10-12 main 리뷰에서 찾은 편집 워커의 소리 결함 둘(10-12 "편집 경로의 기본 처리"). 워커 이미지의 ffmpeg 7.1 로 재현했다.

- **컷 시작 페이드(E-34)** — 컷마다 `volume → alimiter → afade` 를 거는데, `alimiter` 는 기본으로 미리보기(attack 5ms)만큼 소리를
  늦춘다. 그래서 컷의 첫 5ms(240 샘플)는 0 이고 페이드는 그 0 위에 걸렸으며, 진짜 소리는 5ms 지점에서 제 크기로 갑자기 시작했다 —
  없애려던 '틱' 이 그대로였고 끝 5ms 는 잘렸다. `latency=1` 로 지연을 되돌린다(첫 샘플부터 오른다). 필터를 `clip_level_filter` 로 빼고,
  사인파를 PCM 으로 통과시켜 첫 5ms 가 비지 않고 첫 1ms 가 5~10ms 보다 작으며 길이가 그대로인지 보는 계약 테스트를 더했다.
- **무비 전체 음량(E-35)** — `finalize` 는 loudnorm 을 두 번(측정 → `linear=true`) 걸었는데, loudnorm 은 피크와 평균의 차가 12.5dB 를
  넘으면 말없이 동적 모드로 돌아간다. 말소리처럼 음절마다 오르내리고 파열음이 튀는 합성 신호 셋(피크 − 평균 18 ~ 20dB)이 모두 `dynamic`
  이었고 −14.7 ~ −16.5 LUFS 로 목표에 못 미쳤다. 리뷰 때 쓴 "조용한 바탕에 드문 딸깍" 신호는 통합 음량이 딸깍 몇 번으로만 정해지는
  비현실적인 신호라 비교에서 뺐다. 오너 결정(세 방식 비교 뒤): **선형 이득 + 4배 오버샘플링 리미터(−2.5dBFS, 트루 피크 −1.5dB 안)** 를
  걸고, 리미터가 피크를 누른 만큼 크기가 줄어드므로 거친 소리를 다시 재 모자란 만큼 더한다(±0.3 LU 안 또는 4번). 같은 신호 셋이
  −14.17 ~ −14.18 LUFS · 트루 피크 −1.92 ~ −2.36dB, 20초 영상에 2 ~ 3초. 리미터 높이는 AAC 인코딩이 피크를 올리는 몫을 남긴 것인데
  그 몫이 ffmpeg 판마다 달랐다 — −1.8dBFS 로는 7.1 에서 −1.45dB, −2dBFS 로는 7.1 에서 −1.66dB 였던 시험이 CI 의 6.1 에서 −1.43dB 라
  여유를 1dB 로 늘렸다(시험 신호의 잡음도 `seed` 로 고정했다). 기각한 두 방식(loudnorm 동적 유지 · 트루 피크까지만 키우는 선형)은
  [decisions/auto-edit-draft.md](./decisions/auto-edit-draft.md) §6.3 오디오 행. 무비 전체 이득 상한은 30dB(작게 녹음된 무비).
- **검증** — 워커 이미지(`snaply-ai-worker:local`, ffmpeg 7.1.5, `--network none`, `REQUIRE_FFMPEG=1`)에서 248건 통과. 새 계약 테스트
  "피크가 큰 무비도 플랫폼 크기와 트루 피크를 지킨다"(입력이 loudnorm 의 선형 조건을 넘는지 먼저 확인)와 "컷은 페이드로 시작한다",
  단위 테스트(리미터가 줄인 만큼 더한다 · 이미 맞으면 한 번만 더 잰다 · 재지 못하면 크기를 그대로 둔다). 실제 휴대폰 영상으로는 아직
  보지 않았다 — 배포 뒤 테스터 앱으로 확인한다(backlog F "무비 음량의 실물 확인").

## 2026-10-14 (이어서) — 남은 기간 표시 셋 — 예고로 연 라이브러리 · 무비 카드 · 마지막 날(backlog E-36 · E-37 · E-38 닫음)

10-11 ~ 10-12 main 리뷰에서 찾은 앱의 남은 기간 표시 결함 셋(10-12 "만료 전에 앨범 저장을 권한다" · "작은 것 넷").

- **예고로 연 라이브러리(E-36)** — 만료 예고를 탭하면 곧 사라질 스냅을 골라 둔 채 열리는데(SNAP-13), 스냅 저장소만 기다리고 마감 시각이 든
  동기화 저장소는 기다리지 않았다. 둘은 따로 복원되므로, 앱이 꺼진 상태에서 탭하면 마감 시각을 하나도 모르는 채 0개를 고르고 그 도착을 끝난
  것으로 쳤다. 시작할 때 맞추기(reconcile)가 마감 시각을 늦게 쓰는 경우도 같다. 미리 고르기를 `pages/snaps/model/use-notice-preselection.ts`
  로 빼서 두 저장소를 다 기다리고, 빈 답은 확정하지 않고 기다리다가 사용자가 직접 고르면 멈춘다(도착할 때 이미 있던 선택은 예전처럼 바꾼다).
- **무비 카드(E-37)** — 카드의 `N일 남음` 이 화면을 처음 띄울 때 한 번 읽은 시계로 계산돼, 탭이 며칠씩 떠 있는 동안 카운트다운이 시작되지
  않았다. `shared/lib/datetime` 에 `useNow`(한 시간마다 · 앱이 앞으로 돌아올 때 다시 읽음)를 두고 카드가 쓴다.
- **마지막 날(E-38)** — 그리드 · 스냅 재생 화면 · 무비 감상 화면 · 무비 카드가 남은 시간을 24시간 단위로 올려 세어, 30분 남아도 "1일 뒤
  사라져요"였다(내일 해도 된다고 읽힌다). 오너 결정(세 안 중): **달력의 날짜로 센다** — 재생 · 감상 화면은 `오늘` · `내일` · `N일 뒤`,
  그리드 · 카드는 `N일 남음`(당일은 `오늘까지`). D-1 예고 푸시의 "내일"과 맞는다. `shared/lib/datetime` 의 `calendarDaysUntil` ·
  `relativeDayPhrase` · `daysLeftBadge` 를 넷이 같이 쓰고, 쓰는 곳이 없어진 `entities/movie` 의 `movieResultDaysLeft`(올림)를 지웠다.
  스펙 SNAP-13 · MOV-16 과 기능 문서(snaps · movie · studio)를 고쳤다. 최근 삭제 화면의 `오늘까지`(24시간 기준)는 그대로 뒀다.
- **검증** — `npm run verify:mobile` 197개 스위트 1528건(lint 경고 2건은 main 의 관심사 테스트 두 파일에 있던 것). 새 테스트: 미리 고르기 6건(그중 "마감 시각이 없으면 계속 기다린다" · "사용자가 고르면 멈춘다"는
  예전 동작에서 실패), `useNow` 3건, 달력 날짜 4건, 카드 "탭을 띄워 둔 채 카운트다운이 움직인다"(예전 시계에서 실패). 날짜를 다루는 테스트는
  `TZ=UTC` · `Asia/Seoul` · `America/Los_Angeles` 에서 모두 통과. 기기에서는 보지 않았다 — 휴대폰 확인은 A-4 SNAP-19 ⑤ 의 만료 예고(10-21 · 10-23)
  에서 미리 고르기까지 본다.

## 2026-10-14 (이어서) — main 리뷰의 문서 정리

10-11 ~ 10-12 main 리뷰(문서 · 기록 쪽)에서 나온 것을 정리했다. 코드는 바꾸지 않았다.

- **backlog** — `c432954`("만료 전에 앨범 저장을 권하기" 닫음)가 바로 아래 **A-6 머리글과 도입부까지 지워**, A-6 의 남은 항목(활성화 · 상한 값 ·
  키워드 매칭 · 추천이 쓰이는 곳 · 후속 후보)이 A-4 아래 붙어 있었다 — 되살렸다. 닫은 줄 B-3 · G "시험 데이터"에 progress 제목을 달았고, G "인스타 연동
  재연동"은 가리키던 progress 에 근거가 없어(근거는 커밋 `3379fe4` 메시지뿐 — 그 연동은 접은 사내 서버에 있었고 로컬 개발 DB 에도 없다) 이 항목을
  가리키게 했다. 기기 확인이 남았는데 열린 항목이 없던 셋을 F 에 올렸다 — NTF-10 만료 예고(2026-11-07 무렵 D-3), SNAP-13 남은 기간 표시(2026-10-21
  부터), SNS-8 Instagram 게시와 Instagram 앱으로 넘기기(Instagram 앱이 깔린 휴대폰). 닫은 줄은 ID 순 · 같은 ID 안에서는 날짜 순으로 다시 놓았고
  (A-9 · A-7 · A-10 줄이 A-1 과 A-2 사이에 있었다), 열린 C-8 을 C-6 뒤로 옮겼다.
- **결정 문서** — `account-deletion.md` 는 Meta 삭제 요청의 범위 변경을 본문 취소선으로 고쳐 두었다 — 본문을 되돌리고 헤더 아래 후속 결정 배너로
  옮겼다(doc-conventions §헤더). `snap-album-save-and-device-delete.md` 에 ①의 B 를 들인 후속 결정 배너(2026-10-12), `notification-preferences.md` 에
  무비 만료 예고는 무비 알림 스위치를 따른다는 후속 결정 배너(2026-10-11)를 달았다. `product-concept.md` §7 의 제목 "정하지 않았던 것 셋"을 넷으로
  (같은 날 출력 비율이 더해졌다).
- **API 문서 · 기능 문서** — `api-spec.md` 알림 표: 스냅 예고 본문의 D-1 은 "내일"이고 탭하면 곧 사라질 스냅을 골라 둔 채 연다, 무비 만료 예고는
  만들지 못한 무비를 뺀다(E-33), 무비 완성의 "`POST /edit-jobs` 로 만든 결과물"은 없앤 경로라고 밝혔다. `location-and-push-notifications.md` 의 알림 탭
  라벨에 `movie_expiry`(기기 미확인)를 더했다. `me.md` 의 이름 저장 20 ~ 30초 대기 원인을 E-30 의 계측(`getSession()` 0.06 ~ 0.12초 — 네트워크로 본다,
  확정 아님)에 맞췄다.
- **progress** — 2026-10-12 "그리드 타일의 거절 안내"의 "어제"를 2026-10-11 로, 그 뒤의 빈 줄 두 번을 한 번으로.
- **E-29 의 빈 곳** — E-29 는 "앱이 띄운 알림과 FCM 이 띄운 알림 모두"가 완료 조건인데 앱이 띄운 알림은 보지 않은 채 닫혔다. 같은 날(2026-10-11)
  같은 호출(`dismissAllNotificationsAsync`)을 쓴 다른 빌드(머지하지 않고 닫은 #71)로 에뮬레이터에서 앱을 연 채 받은 완성 알림과 뒤에서 FCM 이 띄운
  완성 알림을 알림창에 두고 로그아웃하자 둘 다 사라졌다 — 여기 기록해 둔다.
- **올린 것** — "실기기 미검증"의 기준(에뮬레이터 확인으로 지우는가)이 항목마다 다르다(MOV-12 · NTF-8 은 에뮬레이터로 지웠고 SNAP-13 은 휴대폰을
  기다린다). 정하는 일이라 backlog H-15 로 올렸다.

## 2026-10-14 (이어서) — Instagram 삭제 요청이 정확히 그 계정의 값을 지운다(backlog E-39 닫음)

10-11 ~ 10-12 main 리뷰에서 찾은 SNS-9(Meta 의 연결 해제 · 데이터 삭제 요청) 결함 셋. 개인정보처리방침이 "Instagram 에서 요청하면 게시 기록의 Instagram
값을 지운다"고 약속하는데 그렇지 못한 경우가 있었다. 요청은 Instagram 계정 ID(프로페셔널 계정 ID)로 오고, 서버는 그 ID 의 연동으로 사용자를 찾아
그 사용자의 Instagram 게시 이력 값을 지웠다.

- **찾은 것** — ① 앱에서 먼저 연동을 해제한 사용자는 연동 행이 없어 요청이 아무것도 지우지 못했다(게시물 ID · 실패 사유가 남는다) ② 다른 Instagram
  계정으로 바꿔 연결한 사용자는 이전 계정의 요청이 아무것도 못 지우고, 새 계정의 요청은 이전 계정 값까지 지웠다 ③ 연결할 때 프로필(`/me`) 조회가
  실패하면 토큰 응답의 `user_id`(앱 범위 ID)를 저장해, 그 연동은 요청과 영영 맞지 않았다.
- **고침(오너 결정 — 두 안 중 "해제 · 계정 교체 때 지움", "한 번 더, 그래도 안 되면 거절")** — 앱에서 해제할 때(`disconnect`)와 다른 계정으로 다시
  연결할 때(`handleCallback`, 이전 계정 ID 와 다르면) 같은 트랜잭션에서 그 플랫폼의 게시 이력 값을 지운다(`forgetPlatformValues` — 게시 이력 행은
  남는다). 그러면 남는 값은 늘 지금 연결된 계정의 것이라 요청이 정확히 그 계정만 지운다. 연결할 때 프로필을 한 번 더 묻고, 그래도 계정 ID 가 없으면
  연동하지 않고 `sns/error?reason=profile_unavailable` 로 돌려보낸다(앱은 모르는 사유를 일반 실패로 보인다 — 앱 수정 없음). 기각한 안: 게시 이력마다
  계정 ID 저장(공유 파일 `schema.prisma` 변경과 백필이 필요하고, 이미 해제한 사용자의 옛 이력은 계정을 알 수 없어 여전히 못 찾는다).
- **옛 값** — 해제할 때 지우게 되기 전에 해제한 사용자의 값은 데이터 마이그레이션 `20261014000000_forget_sns_values_without_connection`(스키마 변경 없음,
  배포의 `migrate deploy` 가 한 번 돈다)이 지운다 — 그 플랫폼 연동이 없는 사용자의 게시 이력 값. 예전에 프로필 조회 실패로 앱 범위 ID 를 저장한
  연동은 알아볼 방법이 없어 그대로다 — 그 사용자가 다시 연결하면 프로페셔널 계정 ID 로 바뀌고(다른 ID 라 이전 값도 지워진다), 공모전 서버의 연동은
  테스터 몇 명뿐이다.
- **문서** — 스펙 SNS-9, [api-spec.md](./api-spec.md)(해제 설명 · `profile_unavailable`), 개인정보처리방침(`legal.ts` — 연동을 해제하면 접근 토큰과
  게시 기록에 남은 그 서비스의 값을 지운다, 두 곳). 틱톡도 같은 해제 경로라 해제하면 틱톡 값을 지운다.
- **검증** — `npm test -w apps/api` 48개 파일 819건 · typecheck · lint. 새 테스트(해제하면 그 플랫폼 값만 지움 · 해제 뒤 온 삭제 요청 · 다른 계정으로 다시 연결 · 같은 계정은
  남김 · `/me` 두 번 실패하면 연동하지 않음 · 한 번 실패해도 다시 물음 · `profile_unavailable`) 여섯은 수정 전 실패, 마이그레이션 SQL 은 테스트 DB 에서
  연동이 없는 사용자의 값만 지우는 것을 확인했다. 실제 Meta 요청으로는 아직 보지 않았다 — 배포 뒤 테스터 계정으로 앱에서 해제한 다음 Instagram 에서
  데이터 삭제를 요청해 본다(backlog F "Meta 삭제 요청의 실제 확인").

## 2026-10-14 (이어서) — 앱의 작은 결함 넷 — 세션 읽기 · 앨범 저장 문구 · 오프라인 넘기기 · ⋯ 시트(backlog E-40 ~ E-43 닫음)

10-11 ~ 10-12 main 리뷰(앱)에서 찾은 것 넷. 모두 코드에서 확인하고 고쳤다.

- **세션 읽기(E-40)** — 10-12 "보안 저장소 읽기를 한 번으로"가 더한 메모리 캐시가, 기기 읽기가 예외를 던지면 `null` 을 "세션 없음"으로
  기억했다. 일시적인 키스토어 오류 한 번이면 앱을 다시 켤 때까지 로그아웃된 것처럼 보인다. 던진 읽기는 기억하지 않고 다음에 다시 기기에 묻는다
  (`shared/lib/secure-storage/chunked-secure-storage.ts`). 저장 형식 · 쓰기 · 지우기는 그대로다.
- **앨범 저장 문구(E-41)** — 여러 스냅 저장이 하나도 못 하면 "스냅 0개를 앨범에 저장했어요 · 3개는 저장하지 못했어요", 고른 스냅이 이미 사라진
  빈 묶음이면 "스냅 0개를 앨범에 저장했어요"였다. 이제 "스냅 3개를 앨범에 저장하지 못했어요. 다시 시도해 주세요." · "저장할 스냅이 없어요."
- **오프라인 넘기기(E-42)** — "Instagram 앱에서 올리기"가 서명된 주소가 없을 때 늘 `unavailable`("아직 완성된 무비가 없어서 공유할 수 없어요.")을
  돌려줬다 — 오프라인이라 주소를 못 받은 완성 무비도 그랬다. 공유 버튼이 이미 가르는 두 경우(`ShareBlock` 의 `no-render` · `unresolved`)를 넘기기도
  가른다: 주소를 못 받았으면 "완성된 무비를 불러오지 못했어요. 연결을 확인해 주세요."
- **⋯ 시트(E-43)** — 넘기기가 끝나면 단계가 `onCancel` 을 불렀는데, ⋯ 시트에서 그것은 "메뉴로 돌아가기"라 Instagram 에서 돌아오면 ⋯ 메뉴가 열려
  있었다. 단계에 `onHandedOff` 를 따로 두고 ⋯ 시트는 시트를 닫는다(감상 화면의 따로 띄운 시트는 예전처럼 닫는다).
- **검증** — `npm run verify:mobile` 198개 스위트 1535건(lint 경고 2건은 main 의 관심사 테스트 두 파일에 있던 것). 새 테스트(던진 읽기 뒤 다시 묻는다 · 문구 둘 · 넘기기의 `unresolved` · 넘기기가 시트를 끝낸다 /
  실패하면 남는다)는 넷 다 수정 전 실패. 에뮬레이터에서는 E-43 을 봤다 — ⋯ 시트에서 넘긴 뒤 돌아오니 시트가 닫혀 있었다(2026-10-15 "에뮬레이터로
  앱 한 바퀴"). E-42 의 안내는 오프라인에서도 받아 둔 파일로 넘기기가 성공해 화면에 나오지 않았다. 넘기기의 휴대폰 확인은 backlog F
  "Instagram 게시의 휴대폰 확인"과 같은 자리에서 본다.

## 2026-10-15 — 템플릿 카드를 취향 순으로(PRF-3)

오너가 고른 방식(나) — 결정은 [decisions/ontology-personalization.md](./decisions/ontology-personalization.md) §7 메모. 서버는 템플릿 목록을 이미 취향 순으로
주었지만(A-13 5단계) 앱이 모자란 컷 수 → 짧은 템플릿 순으로 다시 놓아 취향은 동점에서만 작동했다.

- **앱** — `use-template-offers.ts` 의 정렬을 "다 채울 수 있는가 → 서버 순서"로. 다 채울 수 있는 템플릿이 앞이고, 각 묶음 안은 서버 순서(취향 순, 취향이
  없으면 카탈로그 `walk` · `day` · `cafe` · `trip`)다. 서버 · 계약 변경 없음.
- **받아들인 것** — 취향이 없는 사용자의 못 채우는 템플릿이 모자란 컷 수 대신 카탈로그 순으로 놓인다(스냅 4개 · 취향 없음: `day` · `walk` · `cafe` · `trip`,
  전에는 `day` · `cafe` · `walk` · `trip`. 스냅이 없으면 `walk` 가 첫 카드, 전에는 `day`).
- **검증** — `use-template-offers.test.ts`(다 채운 템플릿이 취향 3위여도 맨 앞 · 못 채우는 묶음은 모자란 컷 수와 상관없이 취향 순 · 취향 없으면 카탈로그 순),
  `npm run verify:mobile`. 기능 문서 `movie-templates.md`, 스펙 PRF-3.
- **에뮬레이터 확인** — 테스터 빌드(`d9c56ce`)를 깔고 검수 계정(관심사 `카페`, 스냅 4개)의 스튜디오를 봤다: `하루 요약`(4컷 중 4컷) · `카페 한 곳`(5컷 중 4컷) ·
  `동네 산책`(6컷 중 4컷) · `나들이`(6컷 중 4컷). 취향이 없다면 못 채우는 묶음은 카탈로그 순(`동네 산책` · `카페 한 곳`)이어야 하므로, `카페 한 곳` 이 앞선 것은
  서버의 취향 순서가 반영된 것이다(이 계정은 전의 규칙 — 모자란 컷 수 — 으로도 같은 순서라 화면만으로는 전과 같아 보인다). 3일째 켜 둔 에뮬레이터(부하 평균 12)에서
  앱을 켠 뒤 약 20초 동안 스튜디오 본문이 비어 보였다 — JS 가 바빠 `FadeInView` 가 시작되지 않은 것으로, 그 뒤 CPU 0% 에서 정상으로 그려졌다(이번 변경과 무관).

## 2026-10-15 (이어서) — BGM 을 버킷에서 받고 무비마다 고정한다(backlog A-7 · E-5)

공모전용 BGM 을 무료 라이선스 9곡으로 정한 뒤([decisions/bgm-sourcing.md](./decisions/bgm-sourcing.md) "공모전 기간"), 곡이 오기 전에 할 수 있는 둘을 먼저 넣었다.
운영 무비에는 지금 음악이 없다 — 곡이 git 에 없어 배포 이미지의 워커가 BGM 없이 렌더한다.

- **버킷에서 받기** — 편집 워커가 `BGM_S3_PREFIX`(AWS compose 는 `assets/bgm/`)의 `manifest.json` 을 읽어 적힌 곡을 `BGM_DIR` 로 받고, 빠진 곡은
  지운다(`music.sync_library`, 10분에 한 번까지 · 재시작 없이). 목록 권한 없이 객체 읽기만 쓴다. 매니페스트는 곡마다 출처 · 약관 URL · 확인일을 적는 자리다.
  실패하면 있는 곡으로(없으면 BGM 없이) 렌더하고 Sentry 에 남긴다. 새 변수는 env-spec · `.env.example`, 올리는 법은 [deployment-aws.md](./deployment-aws.md)
  "BGM 곡 올리기".
- **무비마다 고정(E-5)** — 무작위 대신 `sha256("{movieId}:music:{tag}")` 로 이름순 목록에서 고른다. API 가 편집 작업 데이터에 `movieId` 를 싣는다(큐 안의
  값이라 앱 계약은 그대로, 없으면 작업 id). 무효화 사전대로 컷을 넣고 빼고 바꿔도 같은 곡이고, 스타일을 바꾸면 태그가 바뀌어 다른 곡이다.
- **검증** — `tests/test_music.py` 10건(같은 무비 같은 곡 · 무비마다 고루 퍼짐 · 태그가 비면 전체에서 · 매니페스트 검증(경로 탈출 · 음원 아님) · 받기와
  지우기 · 이미 있는 곡은 다시 받지 않음 · 10분 간격 · 버킷을 못 읽으면 있는 곡 유지 · 접두가 없으면 아무것도 안 함), 워커 테스트 전체 258건,
  `movie-transitions.test.ts`(큐의 작업에 `movieId`), `npm test -w apps/api`.
- **남은 것** — 곡 고르기와 올리기(오너 · 팀), 실제 곡으로 볼륨 확인, 곡을 스펙에 핀으로 남기기(E-5 · `bgm_tracks`).

## 2026-10-15 (이어서) — 에뮬레이터로 앱 한 바퀴(공모전 서버, backlog E-44 엶)

E-40 ~ E-43 을 고친 작업 트리(main `ad49481` 위)를 공모전 서버를 보는 release 빌드로 만들어 에뮬레이터에 깔고, 테스트 계정 B(닉네임을
`walk-test-2` 로 바꿈)로 에뮬레이터에서 볼 수 있는 동작을 돌았다. 크레딧은 오너가 SSM 으로 넣었다([deployment-aws.md](./deployment-aws.md) §8).

- **계정** — 로그인 · 닉네임 바꾸기(나 탭의 이름과 첫 글자가 바로 바뀜) · 로그아웃 · 다시 로그인.
- **스냅** — 영상에서 가져오기(말소리 비슷한 합성 클립 두 개 → `오늘` 묶음), 재생 화면의 "2026년 10월 26일까지 보관돼요", 한 개 앨범 저장
  (`Pictures/Snaply`, "앨범에 저장했어요"), 여러 개 저장("스냅 2개를 앨범에 저장했어요" 뒤 선택이 닫힘), 삭제 확인(날짜와 무비 컷 수의 변화
  1→0 · 4→3) → "스냅 1개를 삭제했어요" → 최근 삭제 "3초 · 12일 남음" → 되살리기 "스냅을 되살렸어요".
- **무비** — 감상 화면 "10월 14일 오후 11:08 완성 · 6초 · 일상" · "2026년 11월 13일까지 볼 수 있어요". 방해 금지 시간(22~08시) 안이라 완성
  알림이 오지 않았다(맞음). 방해 금지 시간을 잠시 0~8시로 바꾸고 본 완성 알림은, 앱이 앞에 있을 때 온 것은 앱이 띄운 알림으로 나왔고 탭하니 그 무비의
  감상 화면이 열리며 트레이에서 사라졌다. 앱을 뒤로 둔 채 온 것(FCM 시스템 알림)은 만들기 뒤 20초 안에 트레이에 도착했다 — 이것은 탭하지 않고
  로그아웃 확인에 썼다. 다시 만들기 확인은 "지금 완성된 무비는 사라지고, 크레딧을 다시 써요." · `그대로 두기` · `다시 만들기`.
- **AI 자동 편집** — 스냅 4개 → 컷 2개(1.5초 · 2.5초), "스냅 2개는 넣지 않았어요 · 다시 넣기", 전환 `검게 넘기기`. 그 편집안으로 만든 무비도
  완성 알림이 왔다. 무료 횟수는 3번 → 2번이었고 다음 날 아침 7시에도 2번이었다 — 무료를 최근 24시간으로 세는 결정
  ([decisions/ai-edit-agent.md](./decisions/ai-edit-agent.md) §5)대로다.
- **⋯ → Instagram에 게시** — 연결 단계와 `Instagram 앱에서 올리기` 줄이 보였고, 넘기기는 앨범에 저장한 뒤 브라우저를 열었다(에뮬레이터에
  Instagram 앱이 없다). 앱으로 돌아오니 ⋯ 시트가 닫혀 있었고(E-43) 정리 제안이 떴다.
- **오프라인** — 감상 화면이 "완성된 무비를 재생할 수 없어요. 연결을 확인하고 다시 열어 주세요."를 보였다. 넘기기는 받아 둔 파일로 그대로 성공해
  E-42 의 안내는 화면에 나오지 않았다(단위 테스트로만 확인).
- **로그아웃** — 트레이에 완성 알림이 있는 채 로그아웃하니 앱의 알림이 1건 → 0건(E-29).
- **음량** — 받은 무비(합성 클립 두 개 + BGM)가 −14.51 LUFS · TP −2.22 dBTP 로 허용(−14 ±0.5)의 끝이다. 실제 스냅으로 다시 잰다(backlog F
  "무비 음량의 실물 확인").
- **찾은 결함(E-44)** — 비행기 모드로 앱을 새로 켜면 나 탭의 이름이 닉네임 대신 로그인 이메일로, 크레딧 줄이 잔액 없이 보이고, 연결이 돌아와도 ·
  탭을 옮겨도 · 앱을 뒤로 보냈다 다시 열어도 그대로였다. 크레딧은 크레딧 화면을 다녀오면, 이름은 앱을 다시 켜야 돌아왔다. 프로모션 크레딧을 넣은 뒤
  나 탭 잔액이 0 으로 남았던 것도 같은 쪽이다 — 앱이 앞으로 돌아오거나 연결이 돌아올 때 쿼리를 다시 부르는 계기가 없다.
- **남긴 것** — 방해 금지 시간은 22~08시로 되돌렸다. 테스트 계정 B 에 시험 무비 `무비 10-14 (2)` · `(3)` 과 앨범 사본이 남아 있다(지울지는
  오너). 오너가 무비용으로 찍어 둔 다른 테스트 계정의 스냅은 건드리지 않았다.

## 2026-10-15 (이어서) — 오프라인으로 켠 뒤 연결이 돌아오면 다시 읽는다(backlog E-44 닫음)

에뮬레이터 둘러보기에서 찾은 것. 비행기 모드로 앱을 켜면 나 탭의 이름이 로그인 이메일로, 크레딧 줄이 잔액 없이 남고, 연결이 돌아와도 앱을 다시 켜기
전까지 그대로였다. React Native 에서는 TanStack Query 가 연결 복구도 앱 복귀도 알지 못해(웹의 `online` · `visibilitychange` 가 없다), 처음 조회가
실패한 쿼리를 다시 부르는 계기가 없었다.

- **오너 결정** — 연결 복구는 `expo-network` 로 알고(네이티브 모듈 — APK 를 다시 빌드해야 한다), 앱이 앞으로 돌아오면 실패한 조회와 크레딧 잔액을
  다시 부른다. 기각: 새 의존성 없이 `AppState` 만(Android 는 빠른 설정을 내려도 앱이 뒤로 가지 않아, 앱을 보는 채 연결이 돌아오면 회복되지 않는다),
  복귀 때 오래된 조회 전부(요청이 늘고 "복귀 때 다시 부르지 않음" 기본값을 뒤집는다).
- **연결** — `onlineManager` 가 `shared/lib/network-state`(expo-network 의 `isInternetReachable`)를 따른다. Android 는 네트워크가 아예 없으면 구독할 때
  아무것도 알리지 않아, 비행기 모드로 켜면 "온라인"으로 남고 돌아와도 바뀐 것이 없다 — 그래서 구독할 때 지금 상태를 한 번 읽는다(그보다 먼저 온 변화가
  이긴다). 연결이 돌아오면 화면에 걸린 낡은 조회를 다시 부른다(`refetchOnReconnect: true` — `networkMode: 'always'` 에서는 TanStack 이 기본으로 끄므로
  적어 둬야 한다. 테스트가 이것을 잡았다).
- **복귀** — `focusManager` 가 `AppState` 를 따른다(`active` 가 앞). 실패한 조회만 다시 부르고(`refetchOnWindowFocus` 가 실패면 `'always'`), 크레딧
  잔액은 쿼리에서 따로 켠다 — 공모전 동안 운영자가 서버에서 넣는 크레딧이 나 탭에 크레딧 화면을 열 때까지 보이지 않았다. 앱이 뒤에 있는 동안은 재시도와
  주기 조회가 앱이 돌아올 때까지 기다린다.
- **오프라인 안내는 그대로** — `networkMode: 'always'` 로 조회 · 쓰기가 오프라인에서도 나가 실패하고 화면이 그렇다고 말한다. TanStack 기본값이었다면
  멈춘 채 로딩만 보였을 것이다.
- **검증** — `npm run verify:mobile` 201개 스위트 1548건(lint 경고 2건은 main 의 관심사 테스트 두 파일에 있던 것). 새 테스트 가운데 연결 복구 · 복귀 ·
  크레딧 잔액 셋은 수정 전 실패, 성공한 조회는 복귀 때 다시 부르지 않음 · 오프라인에서도 조회가 실패로 끝남 둘은 원래 동작을 지킨다. 에뮬레이터(이
  트리의 release 빌드, 공모전 서버): 비행기 모드로 켠 나 탭이 앱을 그대로 둔 채 연결을 되돌리자 약 4초 뒤 `walk-test-2` · `2,200 크레딧` 으로 돌아왔고,
  오프라인으로 연 크레딧 화면은 2초 안에 `다시 불러오기` 를 보였다가 연결이 돌아오자 2초 안에 잔액을 읽었다. 앱 복귀 경로와 크레딧 잔액의 복귀 때 읽기는
  단위 테스트로만 봤다. 감상 화면의 "완성된 무비를 재생할 수 없어요 … 다시 열어 주세요"는 조회가 아니라 플레이어(`expo-video`)의 오류라 이 변경과
  무관하게 그대로다(다시 열어야 재생된다).
- **휴대폰** — 네이티브 모듈이 들어가 휴대폰의 앱도 새 APK 로 다시 깔아야 한다.

## 2026-10-15 (이어서) — main 리뷰에서 남은 결함 열하나(backlog E-45 ~ E-51 · E-53 ~ E-56 · G 닫음)

2026-10-14 main 리뷰(서버 · 워커 · 앱)에서 큰 것을 고친 뒤 남은 것을 지금 코드에서 다시 확인해 backlog 에 올리고(E-45 ~ E-56) 고쳤다. 판단이 필요한
넷은 오너가 정했다 — Meta 요청은 24시간, 색 맞춤은 밝은 쪽 기준 제한 + 밤 컷 밝기 유지, 실패하면 그것 없이 완성, 선택은 제한 없이 무비만 10개.
E-52(음량 측정 비용)는 재 보고 정하기로 남겼다.

- **서버 — 만료 예고(E-45 · E-46)** — 선점을 `createManyAndReturn` 으로 해 이번 실행이 넣은 행만 보낸다(동시에 돈 배치가 둘 다 보내지 않는다).
  보내지 못한 예고의 선점 해제가 실패하면 삼키지 않고 Sentry 로 보고한다 — 그 예고는 다시 가지 않기 때문이다. 문구의 남은 날은 창(`3일 후`)이
  아니라 실제 마감일까지 KST 달력의 날짜로 센다(`오늘` · `내일` · `N일 후`, 여러 개면 가장 이른 마감일). 두 창(D-3 · D-1)이 함께 밀리면 가까운
  쪽만 보내고, 가까운 창의 기록이 먼 창을 덮는다 — 전에는 같은 날 예고가 두 번 갔다.
- **서버 — Meta 재전송(E-47)** — 연결 해제 · 데이터 삭제 요청의 `issued_at` 이 24시간보다 오래면 400 이고 아무것도 지우지 않는다. `issued_at`
  이 없으면 받는다(서명이 덮어 필드를 빼 위조할 수 없다).
- **워커 — 측정(E-48 · E-49)** — 음량 · 색을 렌더와 같은 `0:a:0` · `0:v:0` 에서 잰다. ffmpeg 7.1 의 기본 선택은 `default` 표시가 있는 트랙을
  먼저 골라, 그 표시가 다른 트랙에 있으면 다른 트랙을 쟀다(재현: 음량 −9.44 대 −41.80 LUFS, 색은 파랑 대 빨강). 측정이 실패하면 경고를 남긴다.
  HDR 색 측정은 프레임을 줄이고 작게 만든 뒤 톤매핑한다 — 3초 1080×1920 HDR10 컷에서 1.15초 → 0.26초(2 CPU), 잰 색은 원래 순서와 0.03
  안에서 같다(테스트). 렌더의 색 맞춤 · 분위기 필터는 축소한 화면에 건다(막대가 검게 남도록 `pad` 앞).
- **워커 — 색 맞춤(E-50)** — 밝은 쪽(채널마다 상위 1%)이 넘치면 이득 전체를 같은 비율로 줄인다(가장 큰 이득은 1 아래로 내리지 않는다).
  밝기 0.2 아래인 밤 컷은 밝히지 않고 색만 맞춘다. 0.05 아래인 컷은 기준(중간값)에서도 뺀다. 결정 문서
  [auto-edit-draft.md](./decisions/auto-edit-draft.md) §6.3 과 MOV-8 에 적었다.
- **워커 — 대체 경로(E-51)** — BGM 합성이 실패하면 BGM 없이, 마지막 손질(음량 · faststart)이 실패하면 손질 없이 올리고 Sentry 에 남긴다.
- **앱 — 공유 · 넘기기(E-53)** — 진행 중 확인을 ref 로 바로 해 두 번째 탭은 무시한다(`busy` — 아무 말도 하지 않는다). 같은 결과물의 내려받기는
  하나만 돌고 나머지가 그 결과를 함께 쓴다(같은 `.part` 를 둘이 쓰던 문제). 저장은 됐는데 Instagram 이 열리지 않으면 "무비를 앨범에
  저장했어요. Instagram 앱을 직접 열어 올려 주세요."
- **앱 — 선택(E-54 · E-55)** — 여러 스냅 앨범 저장 중에는 초안 요청 때처럼 고르기 · 취소 · 뒤로가 막힌다. 스냅 탭의 일반 선택은 개수 제한 없이
  고르고, 10개를 넘으면 `이 스냅으로 새 무비` 만 꺼지며 바가 "한 편에는 스냅 10개까지 들어가요. 무비로 만들려면 N개를 빼 주세요."라고 한다
  (`pages/snaps/model/selection-limits.ts`). 자동 편집과 무비에 스냅 더하기는 그대로 고를 때 막는다. SNAP-4 에 적었다.
- **앱 — 닉네임(E-56) · "3일"(G)** — 저장을 이벤트 처리 안에서 ref 로 한 번만 하게 해 완료 키도 두 번 저장하지 않는다(React Compiler 가 렌더 중
  ref 접근을 막아 `handleSubmit` 을 이벤트 안으로 옮겼다). 저장 실패 경로 테스트를 더하고, `me-page.test.tsx` 의 상태가 테스트 사이로 새지 않게
  했다. 스냅 만료의 3일은 스냅 엔티티의 `SnapExpiryCountdownDays` 하나를 셋이 쓴다.
- **검증** — API 전체 48개 파일 828건, 워커 이미지(ffmpeg 7.1)에서 `REQUIRE_FFMPEG=1` 전체 268건, `npm run verify:mobile` 204개 스위트
  1563건(lint 경고 2건은 main 의 관심사 테스트 두 파일에 있던 것). 새 테스트는 수정 전 코드에서 실패하는 것을 확인했다 — 서버 7건, 워커 9건
  (HDR 측정 순서 테스트는 같은 결과를 확인하는 것이라 전에도 통과), 앱 5건. 에뮬레이터(이 트리의 release 빌드, 공모전 서버, 테스트 계정 B):
  11개를 고르면 거절 없이 골라지고 바의 안내와 함께 무비 버튼만 꺼졌다. 서버에만 있는 스냅 6개를 저장하는 동안 뒤로 · 취소가 선택을 끝내지
  못했고, 끝나자 앨범 사본이 6개 늘며 선택이 닫혔다(그 6개는 이번에 가져와 이 기기에서만 지운 시험 스냅이다). E-53 · E-56 은 단위 테스트로만,
  E-46 · E-47 은 테스트로만, E-50 은 합성 값으로만 봤다 — 실제 밤 · 창 장면은 아직이다. CI(ffmpeg 6.1)는 PR 에서 본다.

## 2026-10-16 — A-3 실측 준비 — 운영 서버의 실측 계정과 집계 쿼리(backlog A-3 · A-12 · A-14)

오너가 BGM 곡 고르기는 따로 하기로 하고 A-3 실측 준비를 맡겼다. 실측은 첫 계획(개발 환경)과 달리 **AWS 공모전 서버에서 실측 전용 계정으로** 한다 — 로컬
`apps/api/.env` 에 OpenAI 키가 없고, 공모전 지표(A-14)와 에이전트 실측(A-12)이 같은 표본에서 나와야 한다. 서버는 지금 분석이 꺼져 있다(앱 나 탭 `스냅 분석 ·
준비 중`).

- **집계** — `deploy/aws/measure.sql`(배포가 서버의 `deploy/` 로 옮긴다). 사용자 id 하나로 스냅 분석(상태 · 모델별 p50/p90 지연 · 토큰 · 실패 사유 · 보낸
  프레임 수 · 사람 채점용 결과 표)과 AI 편집 초안(모드별 p50/p90 · 왕복 · 토큰 · 크레딧, 에이전트 성공률, 첫 검토 통과율 · 평균 재시도, 초점 · 분위기를 쓴 비율,
  초안마다 에이전트와 그 시각의 분석 토큰)을 낸다. 운영 DB 를 읽기만 한다.
- **검증** — 테스트 DB 에서 트랜잭션 안에 예시 행(분석 1 · 초안 agent 1 · fallback 1)을 넣고 돌려 숫자가 맞는 것을 본 뒤 되돌렸다(성공률 0.5 · 첫 통과율 0 ·
  재시도 1 · 지연 8.7/20.0초).
- **절차** — [deployment-aws.md](./deployment-aws.md) "실측": 예산 상한(오너) → `MOVIE_RECOMMENDATION_ENABLED=true` 와 재배포(오너) → 실측 계정 가입 · 분석 동의
  (오너, 관심사는 비워 둔다) → 팀 스냅 30~100편 · 외출당 10편 이상 → `promo` 크레딧 → 템플릿 추천 · 초안 20회 이상 → 집계 · 사람 채점.
- **남은 것** — 위 절차의 사람이 하는 단계 전부. 시크릿 변경 · 가입 · 촬영은 이 저장소 밖이다.

## 2026-10-16 (이어서) — 음량을 ebur128 로 잰다(backlog E-52 닫음)

편집 워커의 컷 · 무비 음량 측정(`editor.measure_loudness`)을 `loudnorm` 의 측정값에서 `ebur128` 로 바꿨다. loudnorm 은 재기만 할 때도 192kHz 로
리샘플한다. 결과물은 같고 시간만 준다.

- **측정** — 이 Mac(ffmpeg 8.1)에서 30초 무비 대역(분홍 잡음 + 사인, 3초 주기로 크기가 바뀜)을 3초 컷 10개 + 무비 전체 3번(처음 + 보정)으로 쟀다:
  loudnorm 1.64 · 2.97초, ebur128 0.53 · 0.92초(약 3배). 값은 −30.13~−30.29 대 −30.0~−30.3 LUFS 로 0.15 LU 안 — 목표 허용(±0.5)보다 작다.
  서버(2 vCPU)는 더 느려 무비 한 편에 몇 초가 줄 것으로 본다(서버에서는 재지 않았다).
- **바뀐 것** — ebur128 은 0.1 LU 단위로 내고, 소리가 없으면 −70 LUFS(절대 게이트)를 낸다 — 호출하는 쪽의 무음 기준(−50)이 그대로 거른다. 트루 피크를
  재는 테스트 도우미만 loudnorm 을 쓴다(`_parse_loudnorm` 을 테스트로 옮김).
- **검증** — `test_ffmpeg_contract.py` 에 두 측정이 같은 크기를 낸다(0.3 LU 안) · 무음은 −50 아래 · 요약 파싱 2건을 더했다. 워커 테스트 272건(`REQUIRE_FFMPEG=1`),
  기존 음량 테스트(무비 −14 LUFS · 컷 크기 맞춤 · 트루 피크)는 그대로 통과.

## 2026-10-16 (이어서) — 문서 정리 3차 — 감사와 정리

**목표**: 에이전트가 문서를 읽고 바로 판단할 수 있게, 2026-10-09 감사 뒤에 생긴 문서끼리 · 문서와 코드 사이의 모순과 낡은 서술, 읽을 필요 없는
분량을 걷는다.

**방법** — 영역 여덟(루트 · 운영, API · 스펙, 결정 두 묶음, 계획 · 보관 색인, 백로그 · 진행 기록, 모바일 기능 문서, 모바일 규칙 · UX)을 읽기 전용으로
감사하고, 찾은 것을 코드 · git 이력 · 진행 기록과 대조한 뒤 파일이 겹치지 않게 나눠 고쳤다.

**오너 결정(2026-10-16)**
- **H-15**: (b) — 앱 동작은 Android 에뮬레이터 확인으로 "실기기 미검증"을 지우고, 기기에만 있는 것(푸시 수신 · 권한 · 카메라 · 앨범 · 다른 앱
  열기)만 휴대폰을 기다린다. iOS 는 "iOS 출시 전"(A-4). 규칙은 [specs/README.md](./specs/README.md) §요구사항 표기 규칙.
- **진행 기록은 달마다 보관한다** — 8 · 9월을 [archive/progress-2026-08.md](./archive/progress-2026-08.md) ·
  [archive/progress-2026-09.md](./archive/progress-2026-09.md)로 옮겼다. 보관본은 완료 기록으로 인용할 수 있다(constitution 제7조 단서,
  [decisions/progress-monthly-archive.md](./decisions/progress-monthly-archive.md)).
- **모바일 UX 문서는 중복을 걷고 근거를 줄인다.** **구형 Intel Mac 은 쓰지 않는다**(관련 절차를 걷었다). 공유 Supabase DB 경로는 남긴다.

**바꾼 것**
- **규칙** — AGENTS.md 의 문서 갱신 의무를 constitution 제3조와 같은 "같은 커밋"으로, commit · PR 지침의 "문서는 따로 커밋" 예시를 그 규칙에 맞췄다.
  계획의 수명을 "다 구현될 때까지"로(일부 구현이면 구현된 절을 포인터로 접는다 — [plans/README.md](./plans/README.md)), 스펙 라벨은 "코드가 있으면
  `구현됨`, 운영에서 꺼졌으면 괄호에 ID", 괄호에는 빠진 것과 백로그 ID 만 둔다.
- **결정 · 계획** — 결정 색인의 `구현` 열이 낡은 행(AI 편집 에이전트 · 온톨로지 "미구현", `POST /edit-jobs` "다음 릴리스", 무비 문서들의 "실기기
  미검증" 등)을 고치고, 결정 문서 스무여 곳에 정정 · 후속 결정 배너를 붙였다(재사용 키에 취향 값이 아니라 취향 규칙 버전이 들어간다, 에이전트의
  툴 다섯과 규칙뿐인 검토, API 도 시드를 파생한다 등). 다 구현된 [agentic-ontology-rollout](./archive/agentic-ontology-rollout.md) ·
  [content-vocabulary](./archive/content-vocabulary.md) 계획을 보관하고, 살아 있던 규칙은 ontology-personalization · ai-edit-agent 로, 정규화 ·
  매칭 규칙의 원천은 `content-vocabulary.json` 으로 옮겼다. 코드 주석의 계획 인용도 결정으로 바꿨다(주석만).
- **스펙 · API** — 라벨을 새 규칙에 맞췄다(SNAP-13 · SNAP-19 → `구현됨`, ADR-5 → `부분`, REC-1 · ANA-1 · ADR-1 · MOV-7 에 운영 상태). api-spec 의
  잘못 끼어든 단락(`GET /interest-topics`), 만료 예고 문구 규칙, 초안의 응답 시간 · 분석 요청, 동의 철회의 취향 파기를 고쳤다.
- **백로그** — 닫음: B-8 · C-4 · D-5 · H-15 · F 의 SNAP-13. 엶: D-6(운영 OpenAI 예산 상한) · E-57(`media:e2e` 의 키) · H-16 ~ H-18. E-5 · A-12 ·
  A-13 의 낡은 제목과 본문, 닫힌 ID(A-9 · C-5 · B-8)를 가리키던 곳을 고치고 "iOS 출시 전"을 A-4 한곳에 모았다. 맨 위에 다음 번호를 적었다.
- **운영 · 온보딩** — `.env.example` 의 기본값을 ONBOARDING 의 로컬 인프라 값으로, API 테스트 한 파일 실행 명령을 ONBOARDING §4 에, team.md 의
  커밋 수 서사를 지웠다. deployment-aws 의 배치 시각 표 · EAS 절차 · BGM 규칙은 원천(batches.cron · 모바일 문서 · bgm README)을 링크한다.
- **모바일** — 기능 문서에 빠진 라우트 넷과 slice 여덟, 낡은 "기기 미확인" 서술을 고쳤다. UX 문서 13개 2,318 → 2,129줄(규칙은 한 문서에, ux-smells ·
  guardrails · principles 의 반복과 근거를 줄임). cookbook 은 `useMutation` 을 허용하고, AGENTS.md 의 "Planned documentation" 표를 §Verification
  한 줄로 바꿨다.

**검증** — 저장소의 모든 `.md` 상대 링크 · 앵커를 스크립트로 확인했다(깨진 것 0 — `origin/main` 에서도 나오는 검사기 오탐 2건 제외). 코드 파일의
변경은 주석뿐인 것을 diff 로 확인했다. `env-spec.test.ts` 6/6, API `typecheck` · `lint` 통과, `npm run verify:mobile` 204개 스위트 1563건 통과,
바꾼 파이썬 파일 `py_compile`. 진행 기록 분할은 빈 줄 · 구분선을 빼고 줄 단위로
원본과 같다(제목 하나를 `(이어서)` 로 바꾼 것만 다르다). `deploy/minio/Dockerfile` · `minio-image.yml` 주석의 닫힌 E-7 은 고치지 않았다 — 고치면
main 머지 때 공유 MinIO 이미지를 다시 빌드해 올린다. `schema.prisma` 의 "ingest 워커" 주석도 그대로 뒀다.
같은 날 main 에 들어온 E-52 · A-3 실측 준비(위 두 항목) 위에 얹었다 — A-3 의 예산 상한은 D-6 으로 잇고 [deployment-aws.md](./deployment-aws.md)
"실측" 1 이 D-6 을 가리킨다.

## 2026-10-17 — 무비를 지우면 결과물 파일도 지운다(MOV-26)

모바일 목업 리뷰의 스펙 대조에서 나온 의심을 테스트로 확인했다. 무비 삭제(`deleteMovie`)는 `Movie.deletedAt` 만 남기고 결과물 행은 살려
뒀는데, 30일 상한 배치(`findExpiredMovieResults`, MOV-16)는 살아 있는 무비만, 남은 객체 회수(`findOrphanedObjects`)는 지운 행만 본다 —
끝내지 않은 채 지운 무비의 결과물 파일은 어느 쪽에도 걸리지 않고 영영 남았다. 지운 무비는 열 수도 같은 id 로 되살릴 수도 없어(409)
사용자에게 닿지 않는 파일이고, 앱의 삭제 확인("완성된 무비가 함께 사라져요")과 처리방침의 결과물 30일과도 어긋났다.

**바꾼 것**
- 스펙에 MOV-26 을 더했다 — 무비를 지우면 결과물 파일도 함께 지운다. [decisions/movie-export-policy.md](./decisions/movie-export-policy.md)에
  후속 결정 배너(기각: 30일 상한 배치가 지운 무비도 보게 하기 — 지운 파일을 최대 30일 더 두고 사유가 `expired` 로 남는다).
- `deleteMovie` 가 무비와 결과물 행을 한 트랜잭션에서 지운 것으로 만들고(`removalReason: user`) 결과물이 소유한 객체(편집본 · 썸네일)를
  바로 지운다. 원본 키는 스냅에서 빌려 온 것이라 두고(E-8), `purgedAt` 은 남기지 않아 S3 실패분과 생성 중에 지운 무비의 작업이 나중에 쓴
  파일은 남은 객체 정리가 회수한다. 결과물은 생성마다 새로 만든 행이라(`resultVideoId` 를 거는 곳은 `exportMovie` 하나, 값은
  `createEditJob` 이 방금 만든 영상) 다른 무비와 나눠 쓰지 않는다.
- 이미 지운 무비의 결과물은 데이터 마이그레이션 `20261017000000_discard_results_of_deleted_movies` 가 지운 것으로 표시해 다음
  `media:purge-expired` ③ 이 지운다. 개발 DB 에는 해당 행이 0건이었다.
- api-spec 의 무비 FE 안내와 Swagger 설명(`openapi.json` 재생성)에 같은 동작을 적었다.

**검증** — `retention.test.ts` 에 둘을 더했다: 끝내지 않은 무비를 지우면 결과물 파일이 바로 사라지고 원본 스냅의 파일은 남으며 정리
배치가 행을 마무리한다 · 생성 중에 지운 무비의 결과물은 작업이 파일을 쓴 뒤 남은 객체 정리가 지운다. 고치기 전의 `deleteMovie` 로 돌리면
둘 다 실패한다(지운 뒤에도 편집본 파일이 남는다 — 32일 뒤 시각으로 두 배치를 돌려도 남는 것을 먼저 봤다 · 생성 중에 지운 결과물이 남은
객체 후보에 없다). 마이그레이션 SQL 은 테스트 DB 에서 롤백
트랜잭션으로 지운 무비 · 살아 있는 무비의 결과물을 하나씩 넣어 앞의 것만 바뀌는 것을 봤다. `npm test -w apps/api` 48개 파일 830건과
`storage.service.test.mjs` 2건, API `typecheck` · `lint` 통과.

## 2026-10-18 — 다시 만들기 · 끝내기에서 남던 결과물 파일(MOV-23 · MOV-17)

전날 무비 삭제의 결과물 누수(MOV-26)를 고치며 코드에서 본 같은 계열 둘을 테스트로 확인하고 고쳤다.

- **다시 만들기** — `exportMovie` 는 결과물 포인터만 새 것으로 바꿔, 대신한 이전 결과물 행이 살아 있는 채 어떤 무비도 가리키지 않았다.
  30일 상한(MOV-16)은 무비가 가리키는 결과물만, 남은 객체 정리는 지운 행만 보므로 그 파일은 영영 남았다
  ([decisions/movie-export-policy.md](./decisions/movie-export-policy.md) ② A 의 "이전 파일 삭제"가 지켜지지 않았다).
- **끝내기** — `applyFinish` 는 S3 삭제 실패를 삼키며 "정리 배치가 회수한다"고 적었지만 `purgedAt` 을 그 자리에서 찍어, 남은 객체 정리
  (`purgedAt` 이 빈 행만 본다)가 다시 보지 않았다.

**바꾼 것**
- 스펙 MOV-23 에 이전 결과물 파일의 운명을 적었다 — 다시 만들기를 시작한 뒤 첫 정리 배치가 지운다. 생성이 시작되지 않으면(402 · 409)
  그대로다. 결정 문서에 후속 결정 배너(기각: 그 자리에서 지우기 — 이전 결과물로 진행 중인 SNS 게시가 깨진다 · 새 결과물이 완성될 때
  지우기 — MOV-23 은 다시 만들기를 시작하면 이전 결과물이 보이지 않는다고 정했다).
- `exportMovie` 가 생성이 시작된 뒤(작업 · 예약이 만들어진 뒤) 무비 갱신과 같은 트랜잭션에서 이전 결과물을 지운 것으로 만든다
  (`removalReason: user`, `purgedAt` 없음). 파일은 남은 객체 정리가 지운다.
- `applyFinish` 는 다 지웠을 때만 `purgedAt` 을 남기고, 지울 키를 `ownedObjectKeys` 로 고른다(E-8 — 원본 키는 빌려 온 것). 삼키는
  S3 실패는 `captureException` 으로 보고한다(어제의 `deleteMovie` 도 같이).
- 데이터 마이그레이션 `20261018000000_discard_unreferenced_results` — 어떤 무비도 가리키지 않는 살아 있는 결과물(대신한 이전 결과물과
  2026-10-11 에 없앤 `POST /edit-jobs` 의 무비 없는 결과물 — 앱은 결과물을 무비로만 보여 준다)을 지운 것으로 표시해 다음
  `media:purge-expired` ③ 이 지운다. 작업이 아직 도는 결과물은 건드리지 않는다. 개발 DB 에는 대상이 0건이었다.
  끝내기에서 S3 만 실패한 과거 행은 백필하지 않았다 — 다 지운 행도 키를 남기고 `purgedAt` 을 찍어 둘을 가를 수 없고, 전부 되돌리면
  "파일을 실제로 지운 시각"이 정리 배치의 시각으로 바뀐다. 개발 DB 에는 그런 행(끝낸 결과물 중 키가 남은 것)도 0건이었다.
- api-spec 의 무비 FE 안내와 `export` 의 Swagger 설명(`openapi.json` 재생성)에 이전 결과물의 운명을 적었다.

**검증** — `retention.test.ts` 에 넷을 더했다: 다시 만들면 이전 결과물이 지운 것이 되고 파일은 그 자리에 남았다가 정리 배치가 지운다(원본
스냅 · 새 결과물은 그대로) · 402 로 생성이 시작되지 않으면 이전 결과물은 그대로 · 끝내기에서 편집본 삭제만 실패하면 정리 배치가 다시
지운다 · 다 지운 끝내기는 정리 배치가 다시 보지 않는다. S3 실패는 `deleteObject` 를 감싼 `vi.mock` 이 지정한 키에서만 던지게 해 흉내
냈다. 고치기 전 코드에서는 첫째와 셋째가 실패했다(이전 결과물이 지워지지 않음 · 남은 객체 후보에 없음). 마이그레이션 SQL 은 테스트
DB 에서 롤백 트랜잭션으로 대신한 결과물(작업 끝남) · 작업이 도는 무비 없는 결과물 · 살아 있는 무비의 결과물을 넣어 첫째만 바뀌는 것을
봤다. `npm test -w apps/api` 48개 파일 834건과 `storage.service.test.mjs` 2건, API `typecheck` · `lint` 통과.

## 2026-10-18 — media:e2e 가 publishable 키로 로그인한다(backlog E-57 닫음)

`scripts/media-e2e.mjs` 의 이메일 로그인이 `SUPABASE_ANON_KEY` 만 읽어, 새 설정(`SUPABASE_PUBLISHABLE_KEY` 만 둔 `apps/api/.env`)에서는 `apikey` 가 비어
로그인이 실패했다. API(`apps/api/src/config.ts`)와 같은 순서로 `SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY` 를 읽고, 둘 다 없으면 Supabase 에 요청하기 전에
멈추며 `--token` 을 안내한다. env-spec 의 `SUPABASE_ANON_KEY` 설명도 맞췄다.

- **검증** — 스크립트 사본에 가짜 `.env` 를 물리고 로컬 HTTP 서버를 Supabase · API 대신 세워, 로그인 요청에 실린 `apikey` 를 봤다: publishable 만 → `pub-test`,
  anon 만 → `anon-test`, 둘 다 → `pub-test`, 없음 → 요청 없이 "Supabase 키가 없습니다". `node --check` 통과.
- **실행** — 오너가 로컬 스택(마이그레이션 9개를 로컬 개발 DB 에 적용한 뒤 API `localhost:3002`)에서 `npm run media:e2e -- --upload-only <3초 세로 테스트 클립>` 을
  돌렸다: 로그인(검수 계정) · 업로드 URL · S3 PUT 200 · 등록 `ready` 3초까지 통과. 이 머신의 `apps/api/.env` 는 `SUPABASE_ANON_KEY` 만 갖고 있어 실행은 anon
  대체 경로로 됐다 — publishable 경로는 위 가짜 서버 확인이 근거다. 출력이 없어진 요금제 필드(`plan=undefined`)를 찍던 줄은 사용자 id 로 바꿨다.
  로컬 개발 DB · MinIO 에 검수 계정의 사용자 행과 테스트 클립 하나가 생겼다(운영 서버와 무관).

## 2026-10-18 (이어서) — H-16 ~ 18 판단

오너가 세 판단을 정했다.

- **H-16 (a)** — 계정 삭제 확인 화면(`me-delete-account-page.tsx`)에 `소셜 연결이 모두 끊겨요`(보조 `되돌려도 다시 연결해야 해요`) 줄을 더했다. 서버는 삭제
  즉시 SNS 연동을 지우고 유예 기간 안에 되돌려도 다시 붙지 않는다(ACC-8). 스펙 ACC-8 에 "확인 화면이 이것도 말한다"를 더하고, 기능 문서 me.md 의 "말하지 않는다"를
  고쳤다. 에뮬레이터 확인은 A-15 빌드 때 함께 한다(ACC-8 라벨 괄호 · A-15 "기기 확인").
- **H-17** — 촬영 리마인더 · 하루 빈도는 나중에 붙일 기능으로 정했다. 자리 행은 그대로 두고 backlog **A-16**(요구 · 어디서 보내나 · 구현)으로 옮겼다.
- **H-18 (a)** — 앱이 무비 1편 값(`MovieRunCredits = 100`)을 상수로 아는 것을 규칙으로 정했다(CRD-1 은 고정값, 바꾸면 앱도 함께 낸다). 크레딧 기능 문서에 적고,
  A-2 · C-1 에서 값이 바뀔 수 있을 때 다시 본다.
- **검증** — `npm run verify:mobile`. 처음 돌렸을 때 lint 가 `expo-network` 를 찾지 못했다 — 10-15 커밋(`0cb99d8`)이 더한 의존성이 이 Mac 에 설치되지
  않았던 것으로, `npm install`(lockfile 그대로)로 깔고 `expo lint` 의 캐시(`apps/mobile/.expo/cache/eslint`)를 지운 뒤 204 스위트 1563건이 통과했다.

## 2026-10-18 (이어서) — 정크 저널 1단계 — 토큰 · 글꼴 · 글자 역할(backlog A-15)

A-15 구현의 토대. 순서는 토대 → 공용 컴포넌트 → 셸(탭 바) → 화면 묶음 → 마무리(글자 크기 · 기기 · 앱 크기)로 나눴다. 기준은
[decisions/junk-journal-design-system.md](./decisions/junk-journal-design-system.md) · [plans/junk-journal-redesign.md](./plans/junk-journal-redesign.md) ·
캔버스의 `jj-tokens.css`(값이 대응표와 같다).

- **색** — 역할 이름(`text` · `primary` · `background` …)은 그대로 두고 값을 정크 저널로 바꿨다(낮 / 밤). 쓰임에 따라 갈라지는 색은 글자 쪽 역할을 새로 뒀다:
  `primary` = cherry 채움 · `cherryInk` = cherry 글자(밤 대비 때문 — cherry 를 글자로 쓰면 2.56), `ai` = lavender-ink(선 · 글자) · `aiFill` = lavender, `danger` =
  cherry-ink(오류 글자), `border` = paper-edge(장식) · `fieldLine`(기능 선). 스티커 색(`pink` · `mint` · `butter` · `lavender` · `sky` · `kraft` …) · 테이프 · 종이 무늬 ·
  `navy` · `receiptBlue` · `ribbon` · `tabbar`(밤 `#6B5238`) · `shadowInk` 를 더했다. `Radius` 단계는 0(`pill` 만 둥근 물건용), `Shadows` · `Sizes`(터치 48) ·
  `OpacityDisabled` 를 더했다.
- **대비가 깨지는 곳만 이번에 고쳤다** — 글자 · 아이콘으로 쓰던 `primary` 28곳 → `cherryInk`. 버터 띠(`warmSurface`) 8곳은 안쪽을 `ThemeScope scheme="light"` 로
  감쌌다(밤에 크림 글자가 버터 위에서 사라지던 것). 빨간 채움 + 흰 글자의 삭제 · 취소 버튼 6곳 → 크래프트 + `stickerInk`(삭제는 빨강이 아니다). 무비 상태 배지를
  태그로(초안 sheet · 만드는 중 sky · 완성 mint · 실패 cherry), 스냅 칸의 실패 배지 cherry · 만료 임박 배지 pink + 진한 잉크, `ai` 버튼은 lavender + 진한 잉크.
- **글꼴** — Gaegu 700(Google Fonts, OFL) · D2Coding 400 · 700(NAVER 1.3.2, OFL)을 넣고 Pretendard GOV 500 · 800 을 뺐다(`app.json` 의 `expo-font` 양 플랫폼,
  라이선스 파일 `OFL-Gaegu.txt` · `OFL-D2Coding.txt`). 다섯 파일 약 22.7MB(전 네 파일 약 21.7MB). iOS 묶음 이름(name ID 16)은 `Pretendard GOV` · `D2Coding`,
  Gaegu 는 한 굵기라 ID 1 `Gaegu` 로 충분하다.
- **글자 역할** — 단계에 `data` 13/20 · `bodySm` 15/22 · `barTitle` 17/24 를 더하고 `micro` · `display` 를 지웠다(12px 미만 없음). `heading` · `subtitle` · `title` 은
  Gaegu, `data` · `dataSm` · `note` · `edge` · `eyebrow` 는 D2Coding, 나머지는 Pretendard 400 / 700. 제목이 아닌 `heading` 셋 — `BackBar` 의 화면 이름 → `barTitle`,
  가져오기 칸의 `+` → 아이콘, `만드는 중…` → `barTitle` + `ai` 색 — 은 손글씨로 바꾸지 않았다(결정 5). `link` · `linkPrimary` 는 빨간 글자가 아니라 잉크 700(형광펜
  밑줄은 글자 버튼 컴포넌트 몫). 500 · 600 · 800 을 직접 쓰던 세 곳을 400 / 700 으로, `BackBar` 터치 44 → 48.
- **문서** — cookbook §14(색의 두 쪽 · 스티커 색 위 글자 · 세 글꼴), 앱 글꼴 절차(세 글꼴 표 · 굵기 · iOS 묶음), 기능 문서 app-shell-and-navigation 의 글꼴 행.
- **검증** — `npm run verify:mobile` 204 스위트 1563건(경고 2건은 원래 있던 관심사 테스트의 `Array<T>`). 기기 확인은 아직 — 글꼴은 네이티브에 들어가 새 빌드가
  있어야 보인다. 공용 컴포넌트 · 탭 바 · 화면은 아직 옛 모양(둥근 모서리만 사라졌다)이라 지금 빌드는 섞인 모습이다.


## 2026-10-19 — 정크 저널 2단계 — 공용 컴포넌트 · 화면 전부(backlog A-15)

1단계(토큰 · 글꼴)에 이어 공용 컴포넌트와 화면을 캔버스대로 바꿨다. 커밋은 화면 묶음마다 나눴다.

- **새 공용 컴포넌트** — `Tag` · `CheckStrip` · `ListRow` · `StickerButton` / `StickerFace` · `TapeChip` / `TapeLabel` · `KeyButton` · `ModeTab` ·
  `TitleLabel` · `PunchedHoles` · `DottedRule`. `SnaplyButton` 에 `colors` · `leading` · `busy`, `Polaroid` 에 `picture` · `overlay` · `children`. 목록은 cookbook §14.
- **화면** — 로그인 · 가입 · 재설정 · 계정 복구, 스냅 탭(격자 종이 · 폴라로이드 · GUEST CHECK · 노트 선택 바 · 삭제 시트 · 최근 삭제 영수증 · 플레이어),
  촬영 · 가져오기(어두운 무지 바탕 유지, 스티커 단추 · 테이프 라벨 · 박음질 셔터), 무비 편집 · 감상(테이프 붙인 프린트 · 필름 리본 타임라인 · 키캡 ·
  테이프 칩 · 주문서 진행 영수증), 무비 탭 · 템플릿 상세, 나 탭과 설정 하위.
- **캔버스가 앱과 다르게 그린 곳** — 녹화 보관함의 삭제 질문을 시스템 알림 → 보관함 안의 어두운 시트로, 스냅 첫 로딩에 점선 스케치 자리 표시, 생성 거절
  띠를 머리 아래로, 선택 바의 삭제를 글자 동작으로. 나 탭에 다른 탭처럼 `나` 제목을 달았다. 완성 축하 화면은 새 동작이라 넣지 않았다(후속 후보).
  진행 영수증은 단계 목록 대신 지금 단계 한 줄 — 앱이 단계를 지어내지 않는다는 기능 문서의 결정을 따랐다.
- **고친 것(기기에서 찾음)** — 점선 리더(`DottedRule`)가 SVG 100% 폭으로 줄 전체를 재서 셰브런 너머까지 그려지고 나 탭 설정 행의 값이 밀려 사라졌다 →
  남는 폭만 차지하는 상자 안에 그린다. 내용이 짧은 화면에서 종이 무늬가 내용 끝에서 끊겼다 → 스크롤 내용이 화면 끝까지(`flexGrow: 1`).
  Android 에서 한쪽만 점선인 테두리는 실선이 되므로 `DottedRule` 이나 SVG 선을 쓴다(cookbook §14).
- **검증** — `npm run verify:mobile` 1571건. tester 빌드(EAS `a7389f7e`)를 에뮬레이터(API 35)에 깔아 스튜디오 · 스냅 · 선택 모드 · 무비 탭 · 감상 · ⋯ 시트 ·
  편집 · 나 탭 · 계정 삭제를 낮 · 밤 · 동작 줄이기 · 글자 1.3배 · 2배로 봤다. 위 두 수정은 다음 빌드(EAS `21da7cd1`)에서 확인했다 — 나 탭 설정 행에 값과 셰브런이 제자리에 있고, 무비 탭 · 스냅 탭의 종이가 화면 끝까지 간다. 계정 삭제 화면의
  `소셜 연결이 모두 끊겨요` 줄(H-16)을 보고 ACC-8 의 괄호를 지웠다. 휴대폰 확인과 iOS 확인(A-4)은 남았다.
- **앱 크기** — tester APK 158.2MB.

## 2026-10-19 (이어서) — main 위에 출시 점검 수정(backlog A-15)

정크 저널 리디자인이 두 번 만들어졌다 — main 에 병합된 것(최다연, 18커밋)과 병렬 브랜치 `feat/junk-journal-redesign`(46커밋, 출시 점검 세 차례 포함,
push 해 둠). 오너가 **main 을 바탕으로** 정했고, 병렬 브랜치가 찾은 문제 중 main 에도 있는 것만 main 의 컴포넌트 · 토큰 이름 위에 다시 고쳤다(브랜치
`feat/journal-release-fixes`, 레인마다 커밋 하나). 병렬 브랜치는 지우지 않고 참고로 둔다. main 의 디자인 선택(랜섬 탭 제목, 첫 로딩 스케치, settle 모션,
불투명 분홍 글자 버튼, 체리 생성 티켓 …)은 결함이 아니면 그대로다.

**두 구현의 비교** — 영역 열 개를 나눠 양쪽 코드를 맞대고 다른 검토자가 주장을 다시 확인했다. main 쪽에 남아 있던 것: 스크롤 내용 높이만큼 큰 SVG
비트맵(스냅 탭 · 무비 탭 · 최근 삭제 — Android 크래시 경로), 최근 삭제의 가상화 회귀, 카메라 위 REC · 길이 칩 대비(약 1:1), 18dp 손잡이, 무비 편집의 안내 띠
넘침, 동작 줄이기의 빈 탭, 밤 스플래시 색 튐과 세션 복원 전 스플래시 사라짐, 약관 링크 없음, 오류 화면 · 없는 주소 화면 없음, 결정 미기록.

**고친 것**
- **종이** — `PaperGround` 의 줄을 1dp `View` 로, `PaperPiece` 는 찢긴 띠만 SVG 로. 호출부는 그대로다(스크롤 내용의 첫 자식이어도 안전).
- **셸 · 출시 설정** — 캔버스의 체리 표식 스플래시와 세션 복원까지 머무는 오버레이, 낮 · 밤 종이색 네이티브 창, minSdk 28, Android 16 대화면 세로 고정
  (임시 옵트아웃 — A-17), 라우트 사이트맵 끄기, 루트 오류 경계, 없는 주소 화면(버튼 `돌아가기` — E-60), 동작 줄이기에서 탭 전환을 0ms 로.
  [decisions/android-release-config.md](./decisions/android-release-config.md).
- **촬영 · 가져오기** — 카메라 위 REC 카운트다운 · 고르지 않은 길이 칩을 어두운 워시 위 크림 글자로, 카운트다운을 매초 읽지 않게, 손잡이 48dp(제스처와 뷰 둘 다),
  어두운 화면의 밝은 시스템 바 글리프.
- **무비** — 안내 띠를 높이 상한이 있는 스크롤 영역에, 트림 손잡이 48dp, 주소를 받는 동안의 거짓 "완성된 무비가 없어요" 제거, 만료 컷 안내를 360dp 에서 끝까지.
- **스튜디오 · 무비 탭** — 만료 카운트다운이 잘리지 않게(MOV-16), 밤에 분홍으로 눌린 줄의 글자를 스티커 잉크로, 템플릿 칸 컨트롤 48dp.
- **스냅** — 최근 삭제를 다시 `FlatList` 로, 시간 줄이 360~390dp 에서 잘리지 않게, 고른 순서를 접근성 이름과 순번 원판(1.3배 상한)에.
- **나 · 인증** — 약관 링크(새 요구 ACC-12 — 로그인 안내문의 두 낱말과 나 탭의 두 행), 메일 다시 보내기의 링크 모양, 밤의 크레딧 `+N` 대비, 설정 행이 값까지 읽힘.
- **공용** — 화면보다 긴 시트가 스크롤되고, 오류 카드 · 토스트가 나타날 때 스스로 읽힌다. cookbook §14 에 이번에 찾은 규칙을 적었다(내용 따라 커지는 SVG 금지,
  고정 크기 그림 안 글자 상한, 제스처 손잡이 터치 영역, 인라인 실패 줄 낭독).
- **결정** — main 이 구현하며 고른 것을 결정 10~19 로(병렬 브랜치가 고른 것은 기각한 대안으로), 병렬 브랜치의 출시 점검이 먼저 찾아 이 브랜치에도 세운 규칙을 결정 20~23 으로 기록했다.

**검증** — `npm run verify:mobile` 통과(235개 스위트 1721건, main 의 1571건에서 늘었다. 경고 2건은 원래 있던 `Array<T>`). 레인마다 다른 검토자가 diff 를
봤다. 종이 테스트 7건은 고치기 전 코드에서 모두 실패한다. 기기에서는 아직 보지 않았다 — 네이티브 설정이 바뀌어 `expo prebuild --clean` 뒤 다시 빌드해야 한다.
A-15 "기기 확인"을 실제로 본 범위에 맞춰 고쳤고, 새로 연 것은 A-17(넓은 화면) · E-58(앱 크래시 보고) · E-59(오프라인 스플래시 시간) · E-60(없는 주소에서 돌아갈
때의 크래시 — 이 브랜치 빌드에서 다시 볼 것)이다. 서버 쪽 `pick_style` · 컷 상한은 따로 브랜치 `feat/agent-pick-style` 에 있다.

## 2026-10-19 (이어서) — 없는 주소 화면에서 돌아갈 때의 크래시(backlog E-60)

`expo prebuild --clean` 뒤 다시 빌드한 이 브랜치의 dev 빌드(에뮬레이터 API 35)에서, 앱이 떠 있는 동안 `snaplyapp://nowhere` 로 연 없는 주소 화면의
`돌아가기` 가 무비 · 나 탭 위에서 `addViewAt … The specified child already has a parent` 로 앱을 멈췄다. 하드웨어 뒤로 가기는 같은 자리에서 멈추지
않았다 — 버튼이 쓰던 `router.back()` 이 원인이었다. 버튼을 이 화면 자기 내비게이터의 `useNavigation().goBack()`(하드웨어 뒤로 가기와 같은 길)으로
바꿨다. 기록이 없으면 그대로 `replace('/')` 다.

**검증** — 무비 · 나 · 스냅 탭 위에서 각각 다섯 번(E-60 완료 조건), 열다섯 번 모두 멈추지 않고 원래 탭으로 돌아갔다. 하드웨어 뒤로 가기도 그대로다. 같은 빌드에서 네이티브 설정(minSdk 28, 대화면 옵트아웃
속성, 낮 · 밤 종이색 창 배경)과 체리 표식 스플래시, `View` 로 그린 스튜디오 종이도 확인했다. 없는 주소 화면 테스트 3건, `npm run verify:mobile` 통과.

## 2026-10-19 (이어서) — main 위 출시 점검 수정의 에뮬레이터 확인(backlog A-15)

같은 dev 빌드(에뮬레이터 API 35, 411dp · 360dp)에서 포팅한 수정을 확인했다.

- **확인됨** — 스냅 탭의 모눈 · 최근 삭제의 줄 종이가 `View` 선으로 그려진다. 최근 삭제는 다시 `FlatList` 다(지운 스냅 세 개를 목록에서 보고 모두
  되살렸다). 고른 순서가 순번 원판과 접근성 이름(`3초 스냅, 2번째로 고름`)에 나온다. 카메라 위 고르지 않은 길이 칩과 녹화 중 `REC 2초` 가 어두운 워시 위
  크림 글자로 읽히고, 상태 바 글리프가 밝다. 동작 줄이기(애니메이션 배율 0)에서 네 탭이 모두 바로 그려진다. 나 탭의 `이용약관` 행은 브라우저를 열고
  서버의 `/legal/terms` · `/legal/privacy` 가 200 이다(브라우저 첫 실행 동의 화면은 누르지 않았다). 밤 테마의 나 · 스튜디오 탭.
- **고친 것** — 최근 삭제가 서버가 아직 길이를 재지 않은 스냅(`durationMs` 없음)을 `0초` 로 적었다 → 그때는 길이를 빼고 남은 날만. 글자 1.3배 · 2배의
  360dp 에서 한 줄로 묶은 한국어 값이 말줄임표 없이 낱말 중간에서 잘렸다(나 탭 설정 행 `자동 저` · `연결된 계정 없`, 선택 바의 `새 무비 · 최대 10개`,
  화면 밖으로 밀린 날짜 줄의 `2개 · 0:06`) → 자리가 없으면 다음 줄로 통째로. 선택 바의 `이 스냅으로 새 무비` 가 한 음절씩 끊기던 것은 옆에 한 줄로
  들어가지 않으면 자기 줄을 통째로 쓴다 — 360dp 에서는 1배에서도 그렇다(main 에서도 1배 360dp 에서 `새 무 / 비` 로 끊겼다), 411dp 1배는 그대로 옆. 사진 아래 길이 캡션은 1.25배에서 멈춘다(받침 띠 높이). cookbook §14 에 "값은 한 줄로
  묶지 않고 줄을 바꾼다"를 더했다.
- **보지 못한 것** — 무비 화면(이 개발 계정에 무비가 없다), 로그인 화면의 약관 링크(로그아웃해야 보인다), 크레딧 `+N`(내역이 없다), 휴대폰.
- **dev 에서만 보이는 경고** — dev 클라이언트 딥링크로 띄우거나 화면 밀도를 바꿔 액티비티가 다시 만들어질 때 expo-router 내부(`ExpoRoot` ·
  `useLinking`)의 콘솔 오류(`Can't perform a React state update on a component that hasn't mounted yet`, `configured linking in multiple places`)가
  뜬다. 라이브러리 쪽이고 앱 동작은 그대로다.

**검증** — `npm run verify:mobile` 통과(235개 스위트 1726건). 새 테스트 5건은 고치기 전 코드에서 실패한다.

## 2026-10-20 — main 위 출시 점검 수정의 PR 전 검토(backlog A-15)

`feat/journal-release-fixes` 의 PR 을 열기 전에, 에뮬레이터에서 찾아 고친 세 커밋(없는 주소 화면 · 최근 삭제 길이 · 큰 글자 줄바꿈)을 다른 검토자가
보고 지적마다 반박을 시도했다. 남은 것 넷과, PR 본문을 diff 와 맞춰 보다 나온 하나(서 있는 오류 카드)를 고쳤다. PR 의 미확인 항목은 A-15 의 남은 확인에 더했다.

- **없는 주소 화면** — 앱이 꺼진 채 연 링크(뒤에 기록이 없음)에서 `돌아가기` 가 `replace('/')` 였는데, 로그아웃 상태에서는 `(tabs)` 가 루트 가드에 닫혀
  있어 그 replace 가 소리 없이 버려지고 두 버튼이 모두 먹지 않았다. 세션이 여는 화면(새 비밀번호 · 로그인 · 계정 복구 · 스튜디오, 가드 순서대로)으로
  replace 한다. 로그인 상태의 콜드 링크는 에뮬레이터에서 스튜디오로 갔다. 로그아웃 · 복구 · 삭제 유예 쪽은 단위 테스트로만 봤다(로그아웃하면 다시
  로그인할 수 없어서).
- **줄을 넘긴 값의 정렬** — 자기 줄보다 긴 값은 그 줄 안에서 다시 줄바꿈되는데, Android 는 그 상자를 줄 폭만큼 잡아 `marginLeft: 'auto'` 가 밀 자리가
  없었다 → `textAlign: 'right'`.
- **공용 `ListRow`** — 새 cookbook 규칙과 같은 줄이 줄바꿈이 없어 2배 · 360dp 에서 무비 상세 시트의 `완성` · `전체 길이` 값이 행 밖으로 나갔다 → 같은
  방식으로 줄바꿈.
- **선택 바 티켓이 일하는 동안의 줄** — 티켓이 자기 줄을 쓸지가 글자 폭으로 정해지면서, 누르는 순간 바뀌는 글자(`편집하는 중…` · `저장하는 중…`)와
  릴 때문에 370~394dp 폰에서는 티켓이 손가락 아래에서 줄을 옮길 수 있었다(글꼴 폭으로 계산 — 기기에서 본 것은 아니다) → 쉬던 때의 줄을 기억해 일하는 동안 그대로 둔다. 384dp · 411dp 1배에서는 옆, 360dp
  에서는 자기 줄인 것을 에뮬레이터에서 봤다.
- **서 있는 오류 카드** — 오류 카드가 나타날 때 스스로 읽히게 한 뒤로, 실패한 무비의 사유와 스냅 탭의 `스냅 N개를 올리지 못했어요` 처럼 상태로 서 있는
  카드도 화면을 열 때마다(스냅 탭은 앱을 켤 때 스튜디오 뒤에서) 읽혔다 → 두 카드는 `announce={false}`(main 처럼 마운트 때는 읽지 않고 바뀔 때 읽는다).
- **E-60** — 완료 조건(탭마다 다섯 번)을 채웠다. 무비 · 나 · 스냅 탭 × 5회, 하드웨어 뒤로 가기도 멈추지 않았다.
- **문서** — A-15 의 남은 확인 목록, 기능 문서의 상태 표기(동작 줄이기 탭 · 체리 스플래시 · 종이 창), 결정 인덱스의 Android 출시 설정 행, ACC-12
  라벨을 이번 에뮬레이터 확인까지 맞췄다. 결정 10~19(main 의 선택)와 20~23(출시 점검 규칙)을 이 기록에서도 나눠 적었다.
- **dev 에서만** — dev 클라이언트에서 화면 밀도 · 글자 크기를 바꿔 액티비티가 다시 만들어지면 처음 연 링크가 다시 적용된다(없는 주소 링크로 연
  앱이면 그 화면이 다시 뜬다). 앱이 꺼진 채 연 링크는 dev 클라이언트에서는 개발 런처가 먼저 받는다.

## 2026-10-20 (이어서) — 모바일 테스트 뒤 jest 가 5분 동안 끝나지 않던 것

`npm run verify:mobile` 이 테스트를 모두 통과한 뒤 `Jest did not exit one second after the test run has completed` 를 내고 최대 5분 동안 끝나지 않았다
(로컬 · CI 모두 — main 의 CI `Verify (Mobile)` 도 요약 뒤 약 4분 반을 기다렸다. 2026-10 에 한 번 본 간헐 경고와 같은 것). 테스트 파일을 반씩 나눠
돌려 `features/choose-interests/model/use-interests.test.ts` 하나로 좁혔다. 그 테스트의 `QueryClient` 는 쿼리만 `gcTime: Infinity` 이고, 앱에서
`useMutation` 을 쓰는 두 곳 중 관심사 쪽 테스트만 뮤테이션 `gcTime` 을 두지 않아, 언마운트 뒤 남은 뮤테이션이 TanStack 의 기본 5분 GC 타이머를
걸었다(닉네임 쪽 테스트는 이미 두고 있었다). `mutations: { gcTime: Infinity }` 를 더하고 cookbook 의 쿼리 테스트 규칙에 적었다.

**검증** — `QueryClient` 를 만드는 테스트 23개를 하나씩 돌려 끝나지 않는 것이 그 파일뿐임을 확인했다. 고친 뒤 그 파일 단독, 전체 jest(요약 뒤 1초 안에
종료), `npm run verify:mobile`(26초에 스스로 종료, 236개 스위트 1733건)이 모두 바로 끝난다.

## 2026-10-20 (이어서) — 무비 컷 상한 20 · AI 편집 초안 입력 40(MOV-5 · MOV-21, backlog A-18)

여행처럼 스냅이 많이 쌓인 무비를 10컷에 담으면 하루에 한두 컷만 남아, 오너가 컷 상한을 20(최대 100초)으로, AI 편집 초안에 한 번에 넘기는 스냅을
40개로 올렸다. 크레딧은 길이와 상관없이 1편 100 이다. 배경과 기각한 대안(12 · 15컷, 긴 무비를 유료 혜택으로, 길이로 상한)은
[product-concept.md](./decisions/product-concept.md) §8.

- **상한이 네 곳에 따로 있었다** — 공유 계약 `MOVIE_CLIP_MAX` 말고도 `apps/api/src/services/edit-job.service.ts` 의 `MAX_CLIPS`, 편집 워커
  `apps/ai-worker/src/pipeline/edit_spec.py` 의 `MAX_CLIPS`, 앱 `apps/mobile/src/entities/movie/model/movie.ts` 의 `MovieSnapLimit` 이 10 이었다. 서버
  쪽 사본은 공유 상수로 바꿨고, 워커(Python)와 앱(번들에 계약 패키지를 넣지 않는다)의 값은 API 테스트가 파일에서 읽어 계약과 맞춰 본다
  (`movies.test.ts` · `movie-drafts.test.ts`). 워커만 10 으로 남았다면 서버가 받은 11컷 이상 무비가 렌더에서 실패했다.
- **초안 재사용 키** — 컷 상한이 고르는 결과와 에이전트 툴 정의(`maxCuts` 1~20)를 바꾸므로 `EDIT_DIRECTOR_VERSION` · `EDIT_AGENT_PROMPT_VERSION`
  을 3 → 4 로 올렸다. 올리지 않으면 24시간 재사용 창이 예전 10컷 초안을 돌려준다.
- **컷을 잇는 단계의 메모리** — 워커 이미지(`snaply-ai-worker:local`, ffmpeg 7.1)를 `--cpus 2` 로 묶고 합성 스냅(1080x1920 · 5초 · 소리 있음, 전환은
  다섯 종류를 돌아가며)으로 렌더를 재자, 렌더 시간은 길이에 비례했지만(25초 무비 37초 · 100초 157초) 세그먼트를 한 ffmpeg 의 입력 N개로 잇는
  `_join_segments` 의 최대 RSS 가 컷 수에 비례했다 — 5컷 1.6GB · 10컷 2.6GB · 20컷 4.5GB. 공모전 서버는 7.6GiB 에 워커 메모리 한도가 없어
  20컷이면 다른 워커와 겹칠 때 여유가 없다. 입력마다 디코더를 한 스레드로 두자(`-threads 1`) 5컷 1.0GB · 10컷 1.3GB · 20컷 2.0GB 가 됐고, 그
  단계 시간도 20컷 42초 → 30초로 줄었다(전체 렌더 138.5초). 나머지 단계(구간 정규화 약 0.2GB · 마지막 음량 손질 약 0.8GB)는 컷 수와 상관없다.
- **문서** — 스펙 MOV-5 · MOV-21 · SNAP-4, 결정 §8 과 edit-director · auto-edit-draft 의 후속 결정 배너, 결정 인덱스, `api-spec.md`, 앱 기능 문서
  (snaps · studio · movie · README), [deployment-aws.md](./deployment-aws.md#용량-2026-10-11-실측) 의 최대 길이 무비 추정, backlog A-18.

**검증** — `npm test -w apps/api`(49개 파일 841건, 버전을 올린 뒤 관련 5개 파일 128건 다시), `npm run verify:mobile`(236개 스위트 1733건),
`npm run lint` · `npm run typecheck`, 워커 이미지 안의 `REQUIRE_FFMPEG=1 python -m unittest discover -s tests`(273건). 20컷 렌더의 결과물은 1080x1920
H.264 + AAC · 100.3초였다. 공모전 서버의 휴대폰 스냅 렌더와 에뮬레이터에서의 20컷 무비 · 40개 초안은 아직이다(A-18).

## 2026-10-20 (이어서) — 20컷 무비 · 40개 초안의 에뮬레이터 확인(backlog A-18 · E-61)

PR #87 이 main 에 들어간 `a1de19a` 를 에뮬레이터(`snaply_api35`, dev 빌드)에서 돌렸다. 3000 에 떠 있던 로컬 API 는 그 전 코드라 같은 커밋으로 API 를
3001 에 따로 띄우고 Metro 를 그쪽으로 돌렸다. 편집 워커(`edit-jobs` · `edit-v3`)와 렌디션 워커는 이 커밋의 `apps/ai-worker/src` 와 공유 사전을 마운트한
`snaply-ai-worker:local` 컨테이너다(편집 워커는 `--cpus 2`). 계정의 쓸 수 있는 스냅이 6개라, 서로 다른 합성 스냅 45개(1080x1920 H.264 High · 5초 · 소리
있음, 라이프 게임 무늬, 촬영 시각은 10/17 ~ 10/19 에 흩음)를 MinIO 에 올려 다른 기기의 스냅처럼 `videos` 행과 렌디션 작업으로 넣었다. 에뮬레이터가 High
프로필을 검게 그려서 렌디션 객체만 같은 클립의 Baseline 판으로 덮었다. 그중 3개는 선명도가 문턱값(15) 아래다.

| 확인 | 결과 |
|---|---|
| 스냅 탭에서 21개 · 22개 고름 | ✅ `이 스냅으로 새 무비` 가 꺼지고(`enabled=false`) 바가 `한 편에는 스냅 20개까지 들어가요. 무비로 만들려면 1개를(2개를) 빼 주세요.` |
| 18개로 만든 무비의 타임라인 | ✅ 추가 칸이 `2개 더` → 19컷 `1개 더` → 20컷 `가득 참` 이 되고 꺼진다. 20컷은 100초 |
| 무비의 `스냅 더 넣기` 에서 남은 칸보다 많이 고름 | ✅ 바가 `무비 10-20 18/20 · 2개 더` 이고, 세 번째를 `한 편에는 스냅 20개까지 들어가요. 지금은 2개만 더 담을 수 있어요.` 로 거절한다 |
| 20컷 미리보기 재생 | ✅ 처음부터 재생해 100초에 `컷 20 / 20` 에 닿고 스트립이 따라간다. 화면 녹화에서 무대가 검은 것은 경계마다 0.25초 표본 하나씩(검게 넘기기 전환)뿐이다 |
| `자동 편집` 고르기 | ✅ 바가 `자동 편집 · 무료 3번 남음 · 최대 40개` 이고, 41번째를 `자동 편집에는 스냅 40개까지 넣을 수 있어요.` 로 거절한다 |
| 40개로 받은 초안 | ✅ 에이전트(`gpt-5.6-luna`, `select_cuts` 의 `maxCuts: 20`)가 무료(`charged_credits` 0)로 8.5초 만에 20컷 · 40초 초안을 냈고, 앱은 `스냅 20개는 넣지 않았어요` 와 함께 20컷 무비를 열었다 |
| 20컷 무비 생성 | ✅(E-61 을 고친 뒤) 렌더는 끝났는데 앱이 `마무리하는 중 · 95%` 에서 멈췄다. 고친 계약으로 API 를 다시 띄우자 앱의 다음 조회로 `완성 · 100초` 가 되고 100초 끝까지 재생됐다 |
| `스냅 더 넣기` → `이 무비에 넣기` | ❌ 컷은 저장되지만 앱이 멈춘다 — E-62 로 열었다 |

- **렌더** — 20컷 · 100초 무비(일상) 한 편이 120.4초 걸렸다. 컷 정규화 20개가 95초(컷당 약 4.7초), 컷 잇기 · 마무리가 22초(입력마다 `-threads 1`), 올리기가
  2초다. 로컬에는 BGM 버킷 설정이 없어 BGM 은 빠졌다. 결과물은 1080x1920 H.264 High + AAC · 100.27초다. 합성 무늬는 압축이 쉬워 휴대폰 스냅보다 빠를 수 있다.
- **메모리** — 2초 간격 `docker stats` 의 `ai-worker` 최대는 잇기 단계의 2.46GiB(정규화 단계는 0.9GiB 아래), cgroup `memory.peak` 는 2.51GiB(페이지 캐시
  포함)다. 컨테이너 전체(워커 파이썬 · 쓰는 중인 파일의 캐시 포함)라 위 항목의 ffmpeg 하나의 최대 RSS(20컷 2.0GB)와 그대로 비교되지는 않는다.
- **E-61 — 작업 조회의 10컷 상한** — 계약의 `MAX_EDIT_CLIPS = 10`(`packages/shared-types/src/contract/edit-jobs.ts`)이 `editSpec` 의 컷(v2 `clips` · v3
  `timeline.cuts`)을 묶어, `GET /edit-jobs/{id}` 가 11컷 이상 작업마다 응답 직렬화에서 500(`Too big: expected array to have <=10 items`)이었다. 진행률은
  `/progress` 로 와서 95% 까지 차지만, 앱은 완료를 이 조회로 알기 때문에 끝내 모른다. 백그라운드 · 콜드 스타트 뒤에도 무비가 `만드는 중` 이었고(서버의
  `GET /movies` 는 `ready`), 그동안 다른 무비의 `무비 만들기` 는 `다른 무비를 만드는 중이에요` 로 막혔다(초안 화면에서 잘못 눌러 드러났다 — 생성 · 차감은
  없었다). 위 항목이 찾은 네 사본 말고 다섯 번째 사본이고, `a1de19a` 와 함께 공모전 서버에 배포돼 있었다. 상수를 없애고 `MOVIE_CLIP_MAX` 를 쓰게 했고,
  초안 계약 설명에 남은 "최대 10개" 둘도 같은 상수로 바꿨다. 새 `apps/api/test/edit-jobs-read.test.ts` 가 20컷 무비의 생성 작업(v3)을 대기 중과 끝난 뒤에
  읽고, 옛 v2 `clips` 20개도 읽는다 — 상한을 10 으로 되돌리면 둘 다 500 으로 실패한다.
- **옛 앱** — 테스터 폰의 옛 앱은 `MovieSnapLimit = 10` 이라, 서버가 11컷 이상 초안을 돌려주면 `unreachable` 로 실패한다. 서버는 그대로 두고 이 수정이 배포된
  뒤 새 APK 를 테스터에게 배포하기로 했다(오너 결정, A-18 에 남김).
- **E-62** — 무비의 `스냅 더 넣기` 에서 `이 무비에 넣기` 를 누르면 무비로 돌아가는 순간 `addViewAt … The specified child already has a parent`(Fabric
  `SurfaceMountingManager`, `ReactTextView`)로 dev 빌드가 오류 화면이 된다. 18 → 19컷, 19 → 20컷, 1컷 무비 1 → 2컷 세 번 모두 같았고, 컷은 매번 서버에
  저장됐다. 컷 수와 무관해 상한 변경 탓은 아니다. E-60 과 같은 예외이고, 이 화면도 `router.back()` 으로 돌아간다.

**검증** — `npm test -w apps/api`(50개 파일 843건 — 새 2건 포함, 이어서 `tsc` · `node --test`), `npm run lint` · `npm run typecheck`,
`npm run openapi:write -w apps/api`(`maxItems` 10 → 20 넷과 설명 둘). 에뮬레이터의 표는 스크린샷 · `uiautomator` 트리 · 3001 API 요청 기록 · 개발 DB 로 봤다.
멈춰 있던 20컷 무비는 새로 만들지 않고, 고친 계약으로 다시 띄운 3001 API 에서 확인했다. 크레딧은 생성 한 번(100)만 썼고 초안은 무료 횟수 안이다.

## 2026-10-20 (이어서) — 스냅 넣기 확인 뒤의 Android 크래시(backlog E-62)

무비의 `스냅 더 넣기` 에서 `이 무비에 넣기` 를 누르면 무비로 돌아가는 순간 dev 빌드가 `addViewAt … The specified child already has a parent` 로
멈췄다(위 항목). 같은 예외였던 E-60 은 `router.back()` 이 원인이었지만, 이번에는 에뮬레이터에서 경우를 나눠 보니 달랐다.

| 경우 | 결과 |
|---|---|
| 고르지 않고 `무비로 돌아가기`(`router.back()`) · 하드웨어 뒤로 가기 · 고른 뒤 `무비로 돌아가기` | 멈추지 않는다 |
| `이 무비에 넣기`(원래 코드) | 3번 모두 멈춘다(위 항목) |
| `이 무비에 넣기` 를 E-60 처럼 `useNavigation().goBack()` 으로 | 멈춘다 |
| 컷을 넣고 **한 프레임 뒤에** 돌아감(`requestAnimationFrame`) — `goBack()` 이든 `router.back()` 이든 | 16번 모두 멈추지 않는다 |
| 한 프레임을 다시 빼고 앱을 새로 띄움(대조) | 바로 멈춘다 |

`confirmPicks` 가 `appendSnaps` 로 무비 저장소를 바꾸고 같은 틱에 화면을 닫았다. 그 쓰기가 고르기 화면(고른 칸이 `담김`)과 그 아래 무비 화면(새 컷)을
다시 그리는데, 화면을 떼어 내는 것과 한 커밋에 들어가면 Android 의 뷰 마운트가 실패한다. 뒤로 가는 API 는 상관이 없었다. `pages/add-snaps` 의
`confirmPicks` 가 컷을 넣은 다음 프레임에 돌아가게 했고(`requestAnimationFrame(goBack)`), 이유를 주석과 기능 문서 movie.md 의 Add snaps 행에 적었다.
네이티브 마운트 순서라 Jest 로는 재현되지 않아 JS 테스트는 더하지 않았다.

**검증** — 에뮬레이터(dev 빌드, 로컬 API): 고친 코드로 새로 띄운 번들에서 컷 넣기 8번(18 → 19 → 20컷 포함, 매번 그 무비로 돌아와 컷 수가 늘었다)과
넣지 않고 돌아가기(`무비로 돌아가기` · 하드웨어 뒤로 가기)가 멈추지 않았다. 핫 리로드 번들까지 합하면 한 프레임을 둔 넣기 16번이 모두 그랬다. `npm run verify:mobile` 통과.

## 2026-10-20 — 단어 단위 ASS 자막과 번들 한글 글꼴(backlog A-7)

번인 자막 결정([decisions/subtitle-rendering.md](./decisions/subtitle-rendering.md), 미결)을 기다리지 않고 만들 수 있는 부분 — whisper 단어
타임스탬프를 줄로 묶어 ASS 문서를 만드는 일 — 을 렌더 경로 밖에 먼저 넣었다.

- **ASS 공용 부품** — `pipeline/ass.py`: 시각(센티초) · 이스케이프(`{` `}` `\` 는 전각으로) · 색(`RRGGBB` → `&HAABBGGRR`) · 스타일 줄 · 문서 조립 ·
  `ass` 필터 인자(번들 글꼴 디렉터리를 항상 `fontsdir` 로). 텍스트 액센트도 같은 부품을 쓴다.
- **말소리 자막** — `pipeline/ass_caption.py`: 쉼(600ms) · 글자 수(14) · 줄 길이(2.5초)로 줄을 나누고, `karaoke`(말하는 단어가 채워짐) · `pop`(단어가 말하는
  순간 나타남) 두 스타일. whisper 가 한 어절을 여러 조각으로 내도 띄어쓰기를 그대로 붙이고, `\k` 를 절대 시각의 센티초 차이로 써 밀리지 않는다.
- **찾은 결함 — 한글이 빈 네모로 구워졌다** — 처음 문서가 글꼴을 `Pretendard` 로 요청했는데 저장소의 파일은 패밀리 이름이 `Pretendard GOV` 라
  libass 가 DejaVu 로 대체했고 한글 글리프가 하나도 없었다(데모로 구워 보고 찾음 — 영문으로만 검사한 렌더 테스트는 통과했다). 글꼴을 워커 이미지에
  함께 넣고(`apps/ai-worker/assets/fonts/` — Pretendard GOV Bold, OFL), `tests/test_ass.py` 가 스타일 글꼴 이름을 파일의 `name` 표 패밀리 이름에 묶고,
  ffmpeg 계약 테스트가 **한글**을 굽고 libass 의 "Glyph not found" 를 실패로 본다.
- **검증** — 아래 항목의 전체 실행에 포함.

## 2026-10-20 (이어서) — 텍스트 액센트 · 이모지 스티커 엔진(MOV-27 `부분`, backlog A-19)

BGM 컷편집 무비의 글은 받아쓰기가 아니라 컷의 내용에 맞는 의성어 · 감탄 · 키워드와 이모지 스티커라는 방향을 데모로 맞춘 뒤(yoojinhee03,
결정은 [decisions/text-accent-stickers.md](./decisions/text-accent-stickers.md) — 잠정, 미디어/편집 트랙 담당 검토 전) 사전과 워커 엔진을 넣었다.
**결과물에는 아직 붙지 않는다** — 엔진을 부르는 곳이 없다(렌더 경로 · 피사체 위치 · 에이전트 · 생성은 A-19).

- **사전** — [`accent-vocabulary.json`](../packages/shared-types/src/accent-vocabulary.json)(v1): 액센트 27개(꿀꺽 · 바삭! · 철썩~ · 찰칵! · 여유~ ·
  신난다!! · 하늘 미쳤다 …)와 불러내는 content 개념 id, 종류 넷(의성어 · 느낌 · 감탄 · 키워드)의 글꼴 · 크기 · 자리 무리 · 머무는 박자, 분위기별 팔레트,
  개념별 이모지, 생성 글 문턱(한글 · `!?~.` · 8자 · 금칙어). 워커 `vocabulary.REQUIRED` 에 넣어 기동 시 검증된다.
- **엔진** — `pipeline/text_accent.py`(고르기 · 색 · 자리 · 박자), `pipeline/accent_render.py`(ASS — 모션 여섯은 오버라이드 태그만),
  `pipeline/sticker.py`(이모지 배치 — 피사체 가장자리에 걸치게, 액센트와 서로를 피함, 반 박자씩 차례로, 바로 앞 컷의 이모지는 뒤로),
  `pipeline/sticker_render.py`(Pillow 로 흰 칼선 스티커를 그려 길이 전체의 RGBA 트랙 한 장 — qtrle .mov — 으로 굽는다. libass 는 컬러 이모지를 못 그린다),
  `pipeline/layout.py`(세이프 에어리어 · 겹침 판정 공용). 하위 개념은 상위의 액센트 · 이모지를 물려받고(커피 → 음료 → 꿀꺽), 피사체 상자가 없으면 빈 모서리만
  쓴다. 층 b(에이전트가 사전 id 를 고름) · c(생성 글)는 `Override` 입구와 문턱까지 — 사전에 없는 id 는 오류, 문턱을 못 지난 생성 글은 버리고 사전으로.
  모든 선택은 `style-director` 스테이지 시드의 sha256 으로만 갈린다.
- **에셋** — 글꼴 셋(Black Han Sans · Jua · Do Hyeon, OFL)을 `assets/fonts/` 에, Noto Emoji `v2.047` PNG 44개를 `assets/stickers/emoji/` 에(라이선스 문서
  불일치는 A-19 에 남김). 워커 의존성에 `Pillow==11.3.0`.
- **데모** — 같은 엔진으로 10컷(120 BPM 합성 박자, 피사체 상자는 흉내)을 구워 Playwright 로 확인했다. 데모에서 고친 것: 감탄 상자가 `!` 를 한 글자
  폭으로 재서 너무 넓어 다음 키워드가 자리를 잃었다(문장부호 · 영숫자는 반 폭으로), 같은 장소가 이어지는 컷에 스티커가 똑같이 되풀이됐다(앞 컷 이모지를 뒤로).
- **검증** — CI 와 같은 조건(Docker `python:3.11-slim` + apt ffmpeg 7.1, `requirements.txt`, `REQUIRE_FFMPEG=1`, ResourceWarning 을 오류로)에서
  `python -m unittest discover -s tests` **341건 통과**, `compileall` 통과. 새 테스트: `test_ass.py` · `test_ass_caption.py` · `test_accent_vocabulary.py`(개념 id ·
  자리 이름 · 글꼴 · 이모지 파일 · 팔레트를 다른 사전 · 파일과 묶음) · `test_text_accent.py` · `test_sticker.py`, 계약 테스트에 말소리 자막(한글) · 액센트 네 종류의
  한글 · 스티커 트랙 알파 합성. 휴대폰 · 공모전 서버 확인은 결과물에 붙인 뒤(A-19).

## 2026-10-20 (이어서) — 액센트를 영상에 맞춘다: 움직임 · 정점 · 배경 대비(MOV-27, backlog A-19)

사전에서 고른 글 · 모션 · 색이 영상과 무관하던 것을, 이미 잰 영상 신호로 맞추게 했다 — 모델을 부르지 않는다
([decisions/text-accent-stickers.md](./decisions/text-accent-stickers.md) §3 "영상에 맞추기").

- **에너지** — `pipeline/accent_fit.py`: 컷 구간 움직임(`video_signals.motion`) 평균을 무비 안에서 견줘 high · mid · low(상위 · 하위 1/3, 움직이는 컷이 셋 미만이거나
  전부 floor 이하면 mid, 신호가 없는 컷은 mid). 어긋나는 사전 모션만 바꾼다(빠른 컷의 wave → shake 등, 사전 `energy.energyMotions`). 스티커 모션도 에너지를 따른다.
- **정점** — 컷 안 최댓값이 floor 를 넘고 평균의 1.6배 이상이면 그 순간에 가장 가까운 박자에 등장(머물 박자 하나가 남지 않으면 앞 박자). `timing` 을 `accent_fit` 으로 옮겼다.
- **대비** — 컷 가운데 프레임을 6x10 휘도 격자로 줄여(`pipeline/accent_inputs.py` `luma_grid`) 글자 자리의 배경 밝기를 재고, 채움색과 0.3 미만 차이면 채움 · 외곽선을 맞바꾼다(상자 종류 제외).
  바뀐 근거는 액센트 `notes` 에 남는다.
- **데모에서 찾은 결함** — 가만히 있는 클립의 인코딩 잡음이 평균의 몇 배라 "움직임 정점"으로 잡혔다 → 정점에도 절대 floor 를 걸었다(테스트로 고정).
- **데모** — 장면마다 실제 클립(가만히 · 천천히 · 계속 흔들림 · 한 번 크게 튐 · 밝은 하늘)을 만들어 `snap_signals.read_signals` 와 `luma_grid` 로 재서 엔진에 넣었다:
  가만히 있는 카페는 low(꿀꺽 pop → wave), 흔들리는 두 컷은 high(스티커 회전 · 흔들림), 튀는 바다는 정점(7.1초) 근처 박자 7초에 철썩~ 등장(컷 시작 6초 대신),
  밝은 하늘(휘도 0.94)은 크림색 글자를 진한 글자로.
- **검증** — 새 테스트 `test_accent_fit.py`(상대 에너지 · 모션 바꾸기 · 정점과 잡음 · 대비 · 엔진 반영 · 스티커 에너지 · 컷 구간 자르기), 계약 테스트에 휘도 격자(위 흰색 · 아래 검정).
  전체 실행은 다음 항목과 함께.

## 2026-10-20 (이어서) — 층 c — 생성 글 · 이모지 풀(MOV-27, backlog A-19)

사전에 없는 장면에도 글이 붙도록 LLM 이 컷마다 짧은 글과 이모지를 짓는 코드를 넣었다([decisions/text-accent-stickers.md](./decisions/text-accent-stickers.md) §2).
같은 날 키를 넣고 실제 모델로 한 번 쟀다(아래 "실측").

- **생성** — `pipeline/accent_writer.py`: 무비 하나에 Responses API 호출 한 번(컷 전부 · 허용 이모지 목록 · 구조화 출력 strict). 입력은 컷의 장면 설명(분석 summary) ·
  개념 이름 · 에너지 · 사전 후보, 모델은 `EDIT_AGENT_MODEL`(워커 config 에 추가 — 이미 `shared` 로 선언된 변수라 env-spec 은 설명만 고쳤다). 응답은 문턱(한글 8자 ·
  금칙어) · 종류 · 이모지 풀을 지나야 하고, 버린 것은 `rejected` 로 남긴다. `to_inputs` 가 엔진 입력(`text_accent.plan` 의 overrides · `sticker.plan` 의 emoji_overrides)으로 잇는다.
- **이모지 풀** — 사전 `stickers.generatedPool` 102개(Noto `v2.047` PNG, 2.4MB). 사전의 개념별 이모지는 전부 이 안에 있다(테스트).
- **찾은 결함 — 긴 생성 글이 늘 drop** — 테스트로 넣은 "라떼아트 미쳤다"(8자)가 감탄 크기(120px)로는 세이프 에어리어보다 넓어 자리를 못 찾았다. 자리에 들어가지 않으면
  80% · 65% 로 줄여 보고(`text_accent.SHRINK`, ASS `\fs`), 생성 글의 기본 모션을 종류별로(의성어 · 감탄 stamp, 느낌 wave) 정했다. 생성 이모지는 사전 후보의 시드 회전과 무관하게
  맨 앞에 붙는다.
- **실측 스크립트** — `apps/ai-worker/scripts/try-accent-writer.py`: 지어낸 장면 8개(사용자 스냅을 보내지 않음)로 한 번 호출해 사전 후보와 생성 글 · 이모지 · 버린 것 · 토큰 ·
  지연을 찍는다. 키가 없으면 안내하고 끝난다(확인함).
- **검증** — `test_accent_writer.py`(요청 모양 · 문턱으로 거르기 · 변형 선택자 · 모르는 컷 · 엔진으로 잇기 · 호출 실패를 가짜 SDK 로), `test_accent_vocabulary.py` 에 풀 · 에너지 규칙.
  API 의 env-spec 테스트는 vitest 전역 셋업이 로컬 Postgres 를 요구하는데 DB 가 떠 있지 않아 돌리지 못했다(바뀐 것은 `EDIT_AGENT_MODEL` 설명 문자열 하나).
- **실측(1회)** — `try-accent-writer.py`, `gpt-5.6-luna`, 지어낸 장면 8개: 8컷 모두 글이 나왔고 문턱에서 버린 글 · 이모지 0. 사전 후보가 맞는 3컷(꿀꺽 · 철썩~ ·
  두근두근)은 그대로 두고 5컷은 장면을 더 짚었다(크루아상 "결이 살아!", 질주하는 강아지 "쏜살같이", 동시 점프 "폴짝!", 케이크 "달콤해!", 전시 "와 멋지다!"), 이모지는
  컷마다 2개(🥐🤤 · 🐶💨 …). 입력 1,209 · 출력 610 토큰(추론 379), 지연 8.4초. 표본 1회 · 지어낸 입력이라 품질 판단의 근거로는 부족하다 — 실제 분석 summary 로 다시 잰다(A-19).
- **전체 실행(이 항목과 앞 항목)** — CI 와 같은 조건(Docker `python:3.11-slim` + ffmpeg 7.1, `REQUIRE_FFMPEG=1`, ResourceWarning 을 오류로)에서
  워커 `unittest discover` **376건 통과**, `compileall` 통과.

## 2026-10-21 — BGM 비트 그리드 · 액센트를 결과물에 굽는다(MOV-27, backlog A-19 · A-7)

텍스트 액센트가 고정 500ms 간격이 아니라 무비에 깔린 곡의 박자에 맞고, 편집 워커가 결과물에 실제로 굽게 했다 — 스위치(`TEXT_ACCENTS_ENABLED`, 기본 false)를 켰을 때만.

- **비트 그리드** — `pipeline/beat_grid.py`: librosa 없이 numpy 로 같은 방식 — 로그 간격 24대역의 spectral flux(대역마다 같은 비중) → 자기상관 + 120 BPM 중심 사전분포로 템포 →
  Ellis(2007) 동적 계획법으로 박자, 프레임 시각은 창의 가운데. 곡 옆 `<곡>.beats.json` 에 캐시(버전이 다르면 다시 계산). 무비보다 짧은 곡은 박자도 되풀이(`in_movie`).
  합성 곡(킥 정박 + 하이햇 엇박 + 패드 + 잡음)으로 잰 값: 90 · 100 · 120 · 128 · 140 · 174 BPM 모두 템포 ±1% 안, 박자 전부 찾음, 위치 오차 중앙값 15~23ms · 최대 33ms
  (계획서 §11 의 50ms 기준 안). 3분 곡 분석 0.08초.
- **분석 중 찾은 것** — ① 칸을 그냥 더하면 넓은 칸을 차지하는 하이햇이 킥을 눌러 박자가 엇박에 붙었다(오차가 박자 간격의 ~0.4) → 대역 평균 + 저음 onset 이 반 박자 옆에서 더 세면
  옮기기. ② 창의 시작을 시각으로 써 ~46ms 앞섰다 → 창 가운데. ③ 140 BPM 이 70 으로(옥타브 오류) → 80 BPM 미만으로 잡혔을 때만 두 배 템포를 본다(90 · 100 이 180 · 200 이
  되지 않게). ④ 캐시의 BPM 자릿수와 처음 분석값이 달랐다 → 같은 자릿수로.
- **엔진** — `accent_fit.timing` · `sticker.plan` 이 박자 목록을 받는다(정수 간격도 그대로 받는다). 머무는 길이 · 반 박자 차례 · 박자마다 튐이 그 자리의 실제 간격을 쓴다.
- **결과물 연결** — `pipeline/accent_stage.py` + `worker.py` 3-1 단계(BGM 뒤 · 자막 앞): 컷 경계(컷 길이 누적), 스냅의 최신 완료 분석(`db.fetch_accent_inputs`) → 개념 id
  (`pipeline/content.py` — TS `normalizeContentValue` 의 이식, 공유 사례 `packages/shared-types/fixtures/content-normalization.json` 22건으로 두 구현을 묶음), `video_signals.motion`,
  원본 대표 프레임의 밝기, 고른 곡의 비트로 액센트 · 스티커를 정해 스티커 트랙 → 글(ASS) 순서로 굽는다. 소리는 그대로(copy). 실패하면 이 단계 없이, 붙일 것이 없으면 다시
  인코딩하지 않는다. 층 c(생성)는 렌더 때 부르지 않는다. 고른 결과를 구성에 고정하는 것 · 피사체 위치는 A-19 에 남았다.
- **설정** — 워커 `TEXT_ACCENTS_ENABLED`(env-spec · `.env.example` 에 추가, origin shared). 운영(공모전 서버)은 켜지 않았다.

## 2026-10-22 — 트렌드 레시피 — 음원만 · 고정 타이틀 · 효과음 · 이음 · 배속(MOV-28, backlog A-20 · E-64)

사용자가 준 레퍼런스 릴스 4편(프레임 · 소리 분석, [decisions/trend-recipes.md](./decisions/trend-recipes.md) §1)을 따라 숏브이로그 스타일을 레시피(데이터)로 두고,
각 요소의 엔진을 워커에 넣었다. 렌더 쪽(소리 · 타이틀 · 글 밀도 · 효과음)은 편집 워커에 `MOVIE_RECIPE`(기본 `classic` — 지금까지와 같다)로 붙었고,
컷 구간을 바꾸는 이음 · 배속은 AI 초안 단계에 잇기 전이다(A-20).

- **레시피** — `packages/shared-types/src/recipe-vocabulary.json`(classic · trend-routine · trend-montage · daylog), `pipeline/recipe.py`. 워커 시작 때 `MOVIE_RECIPE` 를 검사한다.
- **음원만** — `music.mix` 에 원본 · BGM 크기. 기본(1 · 0.25)은 이전과 같은 필터 그래프(테스트로 고정), 원본 0 이면 BGM 만.
- **고정 타이틀** — `pipeline/title_card.py`: 타자기체(D2Coding) "vlog / 부제" 내내, 손글씨(Gaegu) "Mini VLog / in 장소!!" 처음 3초. 부제 · 장소는 분석 `topics` · `places` 최빈값.
  글꼴 둘(OFL)을 `assets/fonts` 에 더했다.
- **글 밀도** — `pipeline/density.py`: 사전 글은 점수 하한 · 상한 · 4초 간격, 스티커는 글이 남은 컷에만. classic 은 제한 없음(이전과 같음).
- **효과음** — `sfx-vocabulary.json`(소리 15 + 이음 2, Pixabay 19개 `assets/sfx`, 출처 README) · `pipeline/sfx.py`: 내용 개념 + 분석 자유 문자열의 키워드로 컷마다 하나,
  같은 소리 두 컷 쉬기, 상한. 시각은 움직임 정점 또는 컷 시작.
- **이음** — `pipeline/continuity.py`: 10fps 작은 프레임의 밝기(렌즈 가림) · 차이 + 위상 상관 가로 이동(휩팬) · 구도 유사도로 자를 곳과 다음 컷 시작을 정하고, 없으면 경계를
  곡 박자에 맞춘다. 경계는 전부 바로 넘김.
- **배속** — `editor.retime_clip`(구간만 setpts · atempo 로 미리 굽기, 0.5~4배). 레시피의 행동(걷기 · 이동)을 분석이 본 스냅만.
- **많은 컷 결합(E-64 ② 일부)** — `editor.join_groups`/`_join`: 9컷 이상이면 바로 넘김 경계에서 8개씩 묶어 잇고 concat 으로 다시 인코딩 없이 붙인다.
- **레퍼런스 분석기** — `pipeline/reference.py` · `scripts/analyze-reference.py`: 영상 하나에서 컷(히스토그램 변화 — 휩팬은 컷으로 세지 않음) · 컷 길이 분포 · 박자 맞춤 비율 ·
  가림/휩팬 수 · (선택) whisper 로 말소리를 재고 가까운 레시피를 제안한다.
- **한 번에 렌더** — `pipeline/trend_edit.render`: 이음 계획 → 배속 → 결합 → 음원 → 타이틀 · 글 · 스티커 → 효과음 → 마지막 손질. 데모와 이후 초안 연결의 자리.
- **샘플로 찾은 결함(같은 날 고침)** — 샘플 스냅 32개로 5편을 렌더해 보며: ① 9컷 무비가 8 + 1 로 나뉘면 마지막 묶음(구간 하나)의 소리 라벨 `[0:a:0]` 을 필터 출력처럼
  매핑해 ffmpeg 가 거부 → 대괄호 없이 매핑, 계약 테스트를 9컷으로. ② '화면이 고르게 움직이면 배속' 조건이 손으로 든 영상에서 거의 늘 참(32컷 중 21컷) → 분석의 행동만
  (8컷으로). ③ 한 글자 키워드 '면' 이 '화면' 에, '고기' 가 '물고기' 에 걸려 후루룩 · 지글지글이 남발 → 키워드 두 글자 이상(테스트), `notKeywords`, `sfxVocabularyVersion` 2.
- **샘플 렌더(로컬 전용 — 가족 영상)** — 8GB Docker 에서 ffmpeg 스레드만 줄여 5편 모두 통과(32컷 무비 포함 — 묶음 결합 전에는 같은 환경에서 죽었다). 길이 3.2~16.7초,
  배속 컷 0~8개, 이음은 휩팬 1곳씩 · 나머지 박자(샘플이 가림 · 휩팬을 의도하고 찍은 영상이 아니다), 효과음은 승용차 → 탁 · 촬영 → 찰칵 · 걷기 → 저벅 · 수영 → 첨벙.
  타이틀 한글이 구워진 것을 프레임으로 확인했다. 부제가 '어린이' 처럼 밋밋한 것은 A-20 '타이틀 문구'.
- **검증** — 테스트: `test_recipe`(레시피 · 배속 · 묶음 나누기) · `test_title_card` · `test_density` · `test_sfx`(키워드 두 글자 · notKeywords 포함) · `test_continuity`(가림 · 휩팬 · 구도 ·
  박자 경계 · 배속 규칙) · `test_reference`, `test_music`(섞기 그래프 고정), `test_edit_worker`(레시피 연결), `test_ffmpeg_contract.py` `TrendRecipeContract`(배속 길이 · 효과음 자리 ·
  타이틀 한글 · 가림 읽기 · 9컷 묶음 결합의 길이와 마지막 구간 소리 · 한 편 전체). CI 와 같은 조건(Docker `python:3.11-slim` + ffmpeg 7.1, `REQUIRE_FFMPEG=1`, ResourceWarning 을 오류로)에서
  워커 `unittest discover` **459건 통과**, `compileall` 통과. API `env-spec.test.ts` · `content-vocabulary.test.ts` 40건 통과(로컬 Postgres).

## 2026-10-22 (이어서) — 트렌드 레시피 편집 효과 — 전환 · 분할 · 줌 · 색 필터 · 얼굴 스티커 · 최소 15초(MOV-28, backlog A-20)

첫 데모를 본 사용자 요청으로 트렌드 레시피에 편집 효과를 더했다. 결정 · 기각한 대안은 [decisions/trend-recipes.md](./decisions/trend-recipes.md) §7.
레시피 사전 v2(`transitions` · `split` · `zoom` · `look` · `faceStickers` · `continuity.minMovieMs` · `accents.gapMs`), classic 은 모두 꺼짐(이전과 같음).

- **최소 15초** — `continuity.budgets`(스냅마다 고르게, 스냅 길이를 넘지 않게) + 같은 스냅의 점프컷(`jump`). 원본이 모자라면 배속을 풀고, 건너뛰는 길이(200ms)는 원본에
  여유가 있을 때만 — 처음엔 원본이 빠듯해도 200ms 씩 건너뛰어 2.5초 × 3 원본이 5.3초가 됐다(계약 테스트가 잡음, 고침).
- **전환 효과 · 줌 · 분할** — `pipeline/cut_fx.py`: 이음 없는 경계의 rate 비율에 palette 무게로(같은 것 연달아 금지). 결합 전환(flash · dip · zoompunch)은 편집기가,
  컷 전환(whip · zoom · spin · glitch · shake)은 나가는/들어오는 컷에 반씩 zoompan · rotate · avgblur · gblur · rgbashift · noise 로 굽는다. 줌 push · pull · punch(박자).
  분할 2 · 3칸은 칸이 좌우에서 차례로 밀려 들어오고 길이는 칸의 합 — 처음엔 앞 칸 길이만큼 기다려 샘플에서 흰 빈칸이 1초 가까이 남고 거기 글이 얹혀,
  칸 길이의 절반 · 최대 0.4초 간격으로 바꿨다. 편집기에 `prepare_segments`(정규화 + 색 맞춤) · `join_prepared`(효과 구운 구간 결합)를 더했다.
  ffmpeg 식이 `+-(` 를 읽지 못해 whip · spin 의 들어오는 쪽이 실패 → `(-1)*` 로.
- **색 필터** — `pipeline/look.py`: film · warm · cool · vivid · mono · retro, `auto` 는 장면 단어가 컷의 1/3 이상일 때만. 컷 효과와 같은 인코딩에 붙는다.
- **얼굴 스티커** — `pipeline/face.py` + OpenCV `FaceDetectorYN` · YuNet(`assets/models`, MIT, 227KB) · `opencv-python-headless==4.10.0.84`. 결합본을 10fps 로 읽어 트랙을
  잇고(겹침 0.3, 한 프레임 놓침 허용, 3프레임 이동 평균) 조건에 맞는 얼굴에 왕관 · 선글라스 · 하트 · 반짝이. `sticker_render` 가 같은 오버레이 트랙에 굽는다.
  샘플 프레임 비교: Haar 6장 맞힘 1 · 오검출 3, YuNet 8장 얼굴 13 · 오검출 0.
- **효과음 · 글** — 트렌드 레시피의 효과음 상한을 없애고 경계 소리(fx-* · panel · face, `sfxVocabularyVersion` 3)를 더했다 — 수 상한 대신 220ms 안 겹침만 뺀다.
  글은 상한 대신 간격(`gapMs`).
- **검증** — `test_cut_fx` · `test_look` · `test_face`(트랙 · 고르기 · 보간 · 모델 파일 · 빈 프레임에 얼굴 없음), `test_continuity`(최소 길이 · 점프컷 · 배속 풀기 · budgets),
  `test_density`(gapMs), `test_sfx`(상한 없음 · 경계 소리), `test_recipe`(새 칸 · 값 검사), `test_ffmpeg_contract.py` `CutFxContract`(효과 5종 · 줌 3종 · 색 6종이 이 ffmpeg 에서
  돌고 길이를 지킴, mono 는 무채색, 3칸 분할의 차례 · 멈춘 첫 칸, flash 결합). CI 와 같은 조건(Docker `python:3.11-slim` + ffmpeg 7.1, `REQUIRE_FFMPEG=1`)에서
  워커 `unittest discover` **498건 통과**. 실행 시간이 96초 → 919초로 늘었는데, 같은 시각 Docker VM(8GB)에 다른 프로젝트 컨테이너(opensearch · kafka · mongodb 등)가
  떠 있어 손대지 않은 기존 테스트(색 맞춤 60초 · 전환 58초)도 함께 느려졌다. 새 테스트 중 가장 무거운 것은 트렌드 한 편 렌더(이 환경에서 180초) · 효과 렌더(55초).

## 2026-10-22 (이어서) — 렌더 속도 · 시네마틱 레시피 · 매치컷 · HDR 폭 결함(MOV-28, backlog A-20)

- **렌더 속도** — 단계별 측정(트렌드 한 편 D: 78초 — 컷 정규화 37% · 효과 굽기 19% · 결합 15% · 합성 10% · ffprobe 135회 11초)으로 고쳤다: 배속 · 효과 · 색을 컷
  정규화 **한 번**에(`editor.prepare_segments` 의 speeds · extras), 전환 효과를 전부 구간 안에 굽고 결합은 **다시 인코딩하지 않고**(`editor.concat_copy` — 영상 프레임 수로
  자리를 정하고 소리만 aresample async), ffprobe 결과 캐시(경로 · 수정 시각 · 크기), 음원만 레시피는 컷 음량 측정 생략, 중간 파일 `ultrafast`(결과물 설정은 합성 한 번),
  스티커 트랙은 스티커가 있는 프레임 · 영역만. classic 경로의 명령은 바뀌지 않는다(인자 기본값). 전후 비교 측정은 같은 VM 의 다른 컨테이너 부하로 흔들려
  (손대지 않은 합성 단계도 8 → 16초) 사용자 요청으로 중단 — 확정된 수치는 없다. 이어 붙이기는 Debian ffmpeg 7.1 에서 경계 몇 곳의 소리가 25~50ms 밀린다(9.0 은 0).
- **시네마틱 · 매치컷** — decisions/trend-recipes.md §8. `cinematic` 레시피(레터박스 · 한 스냅 한 컷 · 매치컷 · 점수 위주 순서), `pipeline/match_cut.py`,
  `cut_fx` 의 match 줌 · letterbox · band_spec, `title_card` 의 cinematic, `look` 의 soft, `reference.boundaries`. sample/02(친구 · 음식 7개)로 렌더:
  15.3초 · 7컷, 순서가 음식끼리 모였고 경계 6곳 중 4곳에 매치 줌. 피사체를 흰 종이로 잡는 경계가 있다(backlog).
- **HDR 폭 결함** — 톤매핑 직후 `format=yuv420p`(위 §8). `HdrContract.test_hdr_cut_with_colour_match_keeps_the_whole_picture`.
- **검증** — 매치컷 이전 코드로 Docker(ffmpeg 7.1) 워커 `unittest discover` **512건 통과**. 이후 `test_match_cut`(피사체 · 움직임 · 연결 점수 · 순서 · 매치 필터) ·
  `test_continuity`(한 스냅 한 컷 · 가장 안정된 구간 · 박자에 맞춰도 15초) · `test_cut_fx` · `test_recipe` · `test_title_card` · `test_reference` 와
  `CutFxContract` 의 피사체 좌표 · 경계 쌍 테스트를 로컬에서 통과 — 전체 실행은 아직.


## 2026-10-22 (이어서) — 무비마다 레시피 고르기(앱 → API → 워커) · 온톨로지 · 빠른 컷 · 포맷 12개 · 레퍼런스 따라 하기(MOV-28, backlog A-20)

결정 · 근거는 [decisions/trend-recipes.md](./decisions/trend-recipes.md) §9~§11.

- **무비마다 레시피(실제 앱 경로)** — 계약: `MOVIE_RECIPES`(`packages/shared-types/src/recipe.ts`, 사전 이름과 테스트로 묶음) · `movieRecipeSchema`, 무비
  응답 · 생성 · 수정에 `recipe`(기본 `classic`), editSpec v3 에 `recipe` · `autoCuts`(classic 이 아닐 때만 싣는다 — classic 무비의 스펙은 그대로). DB:
  `movies.recipe`(마이그레이션 `20261022000000_movie_recipe`). API: 저장 · 응답 · 생성 시 `autoCuts` = `arranger: ai` + 모든 컷 `trimOwner: ai`. 워커: 무비의 레시피를
  읽고(모르는 이름은 classic), `autoCuts` 면 `trend_edit.render` 로 컷 · 순서 · 효과 · 음원 · 글 · 효과음까지(실패하면 보통 경로), 아니면 보통 경로에 레시피의 소리 ·
  타이틀 · 글 · 효과음만. 시드는 무비 + 작업(다시 만들 때마다 다른 변형, 곡은 같다). 촬영 시각은 `db.fetch_captured_at`. 앱: 무비 화면 칩 `편집 · {이름}` →
  `RecipePickerSheet`(12개, 레시피마다 한 줄 설명, AI 컷 무비 · 손본 무비에서 무엇이 바뀌는지 안내), 저장은 스타일과 같은 길(outbox `PATCH`) — apps/mobile/docs/features/movie.md.
  `openapi.json` · api-spec 갱신.
- **온톨로지 · 자유도(§9)** — 연결 점수의 태그를 개념 계층 매칭 0.7 + 사전 밖 낱말 0.3 으로(`match_cut.concept_similarity` · `tag_similarity`), 움직임 연결
  규칙 사전 `motion-link-vocabulary.json`(소프트 점수), 순서의 temperature · explore(규칙 밖 예산) 샘플링.
- **빠른 컷 + 효과음(§10)** — `pipeline/fast_cut.py`(모션 피크 후보 · 흔들림/초점 거르기 · 빔 서치), 효과음 트랜지언트 정렬 · 동시 발음 2 · 꼬리 250ms ·
  낮은 점수 경계 전환음(간격 · 상한) · 덕킹(`sidechaincompress`), 팬 이어주기, EDL(`Result.edl`), 트렌드 포맷은 화면을 꽉 채움(cover).
- **포맷 = 전략 묶음(§11)** — 레시피 `format`(cuts · link · primitives · overlay), 프리미티브 스피드램프(구간 setpts 식) · 프리즈(loop) · 드롭 플래시, 오버레이 촬영 시각 ·
  프리즈 라벨, before/after 점수(`match_cut.link_contrast`), 새 포맷 6개(비트싱크 · 스피드램프 · 하루 타임스탬프 · before/after · ASMR · 프리즈+텍스트) — 레시피 12개.
  레퍼런스 따라 하기 엔진(`reference.to_recipe` · `letterbox`, `analyze-reference.py --recipe`, `trend_edit.render(spec=...)`).
- **샘플로 찾은 결함(같은 날 고침)** — 흔들림 필터가 한 번 움직이는 영상의 피크 구간을 흔들림으로 버림(평균 → '구간 70% 가 중간값 4배' 로), 빠른 컷의 전환음
  과다(15개 중 10개), 같은 의성어 두 번, 가로 영상이 흐린 배경 띠 안에 작게, 촬영 순서 포맷이 앞 스냅을 건너뛰고 9초로 끝남(가장 이른 스냅에서 시작), 덕킹이 거의 안
  걸림(문턱 0.04 → 0.015 · 비율 6, 음원 대역만 재는 계약 테스트로 확인).
- **검증** — API `npm test -w apps/api` **845건 통과**(새 `movie-recipe.test.ts` — 저장 · 400 · classic 스펙 그대로 · autoCuts 세 경우 · 사전 이름 일치; 큐는 다른 프로젝트
  Redis 를 쓰지 않게 테스트 전용 Redis 6390 에서). 앱 `npm run verify:mobile` 통과(테스트 1,592 · format · lint · typecheck). 워커: 매치컷 이전 Docker 전체 512건 통과,
  이후 단위 · 계약 테스트(`test_fast_cut` · `test_formats` · `test_match_cut` · `test_sfx` · `test_reference` · `test_edit_worker` 20건 · `CutFxContract` · 덕킹)를 로컬에서
  통과. Docker(ffmpeg 7.1) 워커 `unittest discover` **559건 중 558건 통과** — 남은 1건(`test_rendition_worker` 의 `test_slow_signals_leave_the_saved_rendition_ready`)은
  이번에 손대지 않은 렌디션 워커의 시간 제한 테스트로, 따로 돌리면 통과하고 전체를 같이 돌릴 때(같은 VM 에 다른 컨테이너가 떠 있는 상태)만 시간 초과로 흔들렸다.
  전체 실행에서 찾은 결함 1건 — 원본에 줌이 없는 스냅의 구간이 1.5초로 고정돼 최소 길이를 못 채움(`motion_windows(target=)` — 최소 길이 몫) — 은 고쳤다.
- **실제 엔진으로 두 편** — 워커의 레시피 경로(`worker._render_trend` → `trend_edit.render`)를 그대로 불러(DB 조회 두 개만 샘플의 저장된 분석 · 파일의 촬영 시각으로
  바꿔 끼움, 음원은 고른 Pixabay 곡 폴더에서 워커가 무비 키로) sample/01(가족 나들이 32개) → 빠른 컷 15.2초 · 20컷 · 의성어 4 · 얼굴 스티커(왕관) · 효과음 11 · 56초,
  sample/02(친구 · 음식 7개) → 시네마틱 15.6초 · 11컷 · 의성어 2 · 띠 분할 1 · 효과음 6 · 75초(8GB Docker, ffmpeg 스레드 제한). 로컬 전용(가족 영상).
  앱 → API → 워커를 실제로 이은 끝에서 끝까지 실행(로컬 스택)은 하지 않았다.
- **잘못된 회전 정보 바로잡기(같은 날)** — sample/02 의 카카오톡 영상 하나가 회전 정보(90°)대로 세우면 오히려 누웠다(회전 정보를 무시하면 바로 선다). `pipeline/orient.py`:
  회전 정보가 있는 원본만, 세 프레임을 '회전 적용' · '무시' 로 읽어 얼굴(YuNet) 수를 비교하고 무시한 쪽이 뚜렷이 많을 때만 회전 정보를 0 으로 덮어 다시 감싼다
  (`-display_rotation:v:0 0 -c copy`, 다시 인코딩 없음). 얼굴이 없으면 파일 정보대로. 워커는 원본을 받은 직후 이것을 거친다(보통 경로 · 레시피 경로 모두).
  sample/02 7개 중 그 1개만, sample/01 33개(회전 정보 있는 30개) 중 0개가 걸렸다. 레터박스 화면 분할은 첫 칸을 원래 띠 자리에 두고 둘째 칸을 아래에서 연다
  ('Vlog' 타이틀이 두 칸 사이 틈에 걸렸다). `test_orient`(판정 규칙 · 회전 읽기 · 얼굴 없으면 그대로) — Docker 48건(orient · 워커 · cut_fx · CutFxContract) 통과.
- **분할 뒤 멈춤 · 소리 끊김 · 끝맺음(같은 날)** — 실제 엔진으로 만든 sample/02 무비에서 세 가지가 보였다. ① 소리가 9.2초에서 끊김(영상 15.5초):
  효과음 덕킹(`sfx.mix_into(duck=True)`)의 사이드체인이 마지막 효과음에서 끝나 압축기가 음원까지 멈췄다 — 단계별 길이를 재 보니 이 단계에서만 짧아졌다.
  효과음 묶음을 `apad` 로 늘리고 길이는 음원이 정한다(01 의 0.5초 짧음도 같은 원인). ② 분할 화면에서 첫 칸이 0.7초 멈춤: 칸은 분할이 끝날 때까지 보이는데
  원본을 컷 길이만큼만 잘라 나머지를 마지막 프레임으로 채웠다 — 칸마다 원본을 (분할 길이 − 들어온 시각)만큼 더 쓰고(원본이 모자라면 그때만 멈춤,
  `trend_edit._panel_ends` · `cut_fx.split_graph(lengths=)`), 소리는 그대로 칸 길이만큼 차례로. ③ 끝이 뚝 잘림: 마지막 단위를 0.5초 검게
  닫고(`END_FADE_S`), 섞은 소리 전체를 1초 페이드 아웃(`music.mix(end_fade=)` — 기본 그래프는 그대로). 다시 만든 02: 영상 15.5초 · 소리 15.49초,
  freezedetect(0.3초) 0건, 끝 0.4초에서 −13dB → −42dB. 01: 15.1초 · 15.08초, 멈춤 0건. 덕킹 계약 테스트에 '마지막 효과음 뒤에도 음원이 그대로' ·
  분할 칸 길이 · 끝 페이드 단위 테스트를 더했다 — Docker 전체 564건 통과.
- **편집 사전을 온톨로지 내보내기에(같은 날)** — 팀 질문(편집 스킬 · 효과음이 스키마에 있나)에 따라 발표용 OWL 내보내기에 효과음 · 의성어(`evokedBy` → 개념) ·
  카메라 움직임 연결 규칙 · 레시피를 클래스 · 관계 · 개체로 엮었다(`scripts/ontology/editing.mjs`, decisions/trend-recipes.md §12 ·
  ontology-personalization.md §3.3). 원천은 각 JSON 사전이고 개념 사전 판(v2)은 그대로 — 추천 재사용 키 영향 없음. `npm run ontology:test` 8건 통과
  (편집 관계 · 없는 개념을 가리키면 거부 포함), 내보낸 Turtle 을 rdflib 로 읽어 트리플 1,682개(효과음 15 · 이음 효과음 12 · 의성어 27 · 움직임 5 · 연결 규칙 7 ·
  레시피 12 · 색감 3 · 컷 효과 4 · evokedBy 52)를 확인했다.
- **ffmpeg 6.1 에서 구간이 한 프레임 짧던 것(같은 날)** — main 병합 뒤 CI(Ubuntu 24.04, ffmpeg 6.1)에서 `test_many_prepared_segments_join_by_copy_without_the_sound_drifting`
  가 실패했다(12구간 6초가 5.76초). 6.1 의 fps 필터가 원본 끝에서 마지막 프레임을 버려 0.5초 구간이 14프레임이 됐다(7.1 · 9 는 15). 이어 붙일 구간(`-t` 를 거는
  경우)만 영상 끝에 한 프레임을 늘려 두고 `-t` 가 자른다(`editor.normalize_clip`) — 보통 경로의 명령은 그대로. Ubuntu 24.04 컨테이너에서 실패를 재현하고 고친 뒤
  15프레임 · 6.0초를 확인했고, Debian ffmpeg 7.1 에서 워커 전체 565건 통과.

## 2026-10-22 (이어서) — 묶음 결합의 소리 · 영상 싱크와 회전 정보 바로잡기 실측(backlog E-64 · A-20)

트랙 담당이 main 의 레시피 작업을 검토하다 보통(classic) 경로에도 걸리는 두 변경 — 9컷 이상의 묶음 결합(`editor._join` · `join_groups`)과 원본 회전 정보
바로잡기(`worker._upright_sources` → `orient.fix`) — 을 운영과 같은 워커 이미지로 쟀다. main `ca9599f` 로 빌드한 이미지(Debian ffmpeg 7.1.5), `--cpus 2
--memory 8g --memory-swap 8g --network none`. 측정 스크립트는 커밋하지 않았다.

- **묶음 결합 싱크 — 경계에서 밀리지 않는다** — 원본마다 초록 프레임 한 장과 40ms 비프를 같은 순간에 넣고(컷 0.7~1.6초 구간 트림, 원본 소리 44.1k · 48k
  섞음), 결과물에서 컷마다 '비프 시작 − 초록 프레임 시각'을 쟀다. 같은 컷을 기존 단일 결합(`join_groups` 를 한 묶음으로 바꿔 끼움)과 묶음 결합으로 각각 렌더했다.
  묶음끼리 `-c copy` 로 이어 붙여 AAC 패딩만큼 소리가 밀릴 것으로 의심했지만 그렇지 않았다.

  | 경우 | 단일 결합(ms) | 묶음 결합(ms) | 같은 컷의 차이 최대(ms) |
  |---|---|---|---|
  | 하드컷 9컷(묶음 2) | −7 ~ +33 | −7 ~ +32 | 1 |
  | 하드컷 12컷(묶음 2) | +1 ~ +37 | +1 ~ +37 | 0 |
  | 하드컷 16컷(묶음 2) | −2 ~ +38 | −5 ~ +38 | 3 |
  | 하드컷 20컷 두 편(묶음 3) | −7 ~ +46 | −7 ~ +40 | 18 · 24 |
  | 섞인 전환 16컷(묶음 2) | −7 ~ +74 | −7 ~ +32 | 48 |
  | 섞인 전환 20컷(묶음 3) | −14 ~ +91 | −11 ~ +51 | 84 |

  (양수는 소리가 늦음. 섞인 전환은 crossfade · dip · flash · zoompunch · hardcut.) 첫 묶음은 두 방식이 같고, 뒤 묶음의 차이는 대부분 한 프레임(33ms) 안이며
  묶음을 지날수록 커지지 않는다. 48 · 84ms 는 기존 단일 결합 쪽이 크게 어긋난 컷(+74 · +91ms — crossfade 다음 컷)이다. 어느 쪽도 사람이 알아차리는
  기준(ITU-R BT.1359 — 소리가 45ms 앞서거나 125ms 늦으면)을 넘지 않았다. 묶음 결합 결과물은 소리 · 영상이 함께 21ms 늦게 시작하고 길이가 약 20ms 길다 —
  싱크와는 관계없다. 렌더 시간은 묶음 결합이 4~7% 짧았다(20컷 26.5초 → 24.8초). 재지 않은 것: 메모리 최대치(E-64 의 목적), 실제 폰 영상, 운영 서버 사양.
  30fps 라 한 프레임보다 작은 차이는 이 방법으로 가르지 못한다.
- **회전 정보 바로잡기 — 정상 원본 오판 0, 잘못 붙은 회전 정보는 얼굴 있는 4개 중 3개** — dev MinIO 의 앱 촬영 스냅 12개(3초 720p, 회전 정보 −90 이 9개, 얼굴이
  보이는 것 4개). 정상 원본 12개는 모두 그대로 뒀다(얼굴 있는 4개 포함). 메신저 사본을 흉내 낸 파일(회전을 픽셀에 구운 뒤 −90 회전 정보를 다시 붙임) 9개 중
  얼굴 있는 4개에서 3개를 바로잡았다 — 재생 화면이 바로 선 기준과 픽셀 차 0.0. 1개는 놓쳤다: YuNet 이 누운 화면 3장 중 2장에서도 얼굴을 찾아 '무시한 쪽 3 >
  적용한 쪽 2 × 1.5' 를 넘지 못했다. 누운 얼굴도 잡히므로 정상 원본을 잘못 돌리지 않게 막는 것은 1.5배 여유뿐이다(이번 표본에서는 걸린 적 없음). 얼굴 없는
  5개는 근거가 없어 그대로(설계대로). 판정과 상관없이 다시 감싸는 단계(`-display_rotation:v:0 0 -c copy`)는 ffmpeg 7.1 에서 회전 0 · 바로 선 화면을 냈다.
  비용은 회전 정보가 있는 원본마다 약 0.83초(12개 7.5초, 첫 호출의 모델 적재 0.6초 별도) — 원본마다 차례로 돌아 회전 정보 있는 원본 20개면 보통 경로 렌더도
  약 17초 늘어난다. 표본은 dev 스냅뿐이고 실제 메신저 파일 · 옆모습 · 가린 얼굴은 없었다. 내려받은 스냅과 렌더 결과물은 측정 뒤 지웠다.

## 2026-10-22 (이어서) — 워커 기본 레시피를 없애고 액센트 플래그를 classic 무비에(backlog E-67 · H-19)

트랙 담당 검토에서 올린 두 항목을 같은 날 닫았다.

- **`MOVIE_RECIPE` 를 없앴다(E-67)** — API 는 classic 무비의 editSpec 에 `recipe` 를 싣지 않는데, 워커는 그때 `MOVIE_RECIPE` 를 써서 이 값을
  classic 이 아니게 두면 사용자가 '기본'을 고른 무비까지 그 레시피로 만들었다. 무비마다 레시피를 고르게 된 뒤로는 워커 전체의 기본값이 필요 없어,
  워커 `config.MOVIE_RECIPE` · 기동 때의 이름 검사 · env-spec · `.env.example` 에서 뺐다. `worker._recipe_of` 는 스펙에 없으면 classic, 모르는 이름도
  classic(그대로). 계약 `editSpecV3Schema.recipe` 의 설명을 고치고 `openapi.json` 을 다시 만들었다. decisions/trend-recipes.md §4 에 덧붙임. 운영 시크릿에
  `MOVIE_RECIPE` 를 넣어 두었다면 이제 아무 효과가 없다.
- **액센트 플래그의 뜻(H-19 (a))** — `TEXT_ACCENTS_ENABLED` 는 classic 무비의 텍스트 액센트 · 스티커만 켜고 끈다. 레시피 무비는 레시피의 글 · 스티커 ·
  고정 타이틀이 같은 단계에 있어 플래그와 상관없이 굽는다 — 동작은 그대로이고 MOV-27 · env-spec · `.env.example` · 워커 주석 · A-19 ·
  decisions/text-accent-stickers.md §7 의 문구를 맞췄다.
- **검증** — `test_edit_worker` 에 '스펙에 레시피가 없으면 환경에 `MOVIE_RECIPE` 가 있어도 classic' · '플래그가 꺼져도 레시피 무비는 액센트 단계를 돈다'를
  두고, 워커 설정을 바꿔 끼우던 테스트를 스펙의 `recipe` 로 바꿨다. 워커 이미지(Debian ffmpeg 7.1)에서 `REQUIRE_FFMPEG=1 python -m unittest discover -s tests`
  **566건 통과**. `npm run typecheck` · `npm run lint`(`apps/api` · `packages/shared-types`) 통과. `npm test -w apps/api` 는 세 번 돌려 세 번 모두 851건
  통과 — 첫 번째에만 vitest 가 처리되지 않은 오류 1건을 보고해 실패로 끝났고(내용은 남기지 못했다), 두 번째 · 세 번째는 오류 없이 통과했다.

## 2026-10-24 — 배포가 CI 를 기다린다(backlog E-68)

`deploy.yml` 이 CI 결과를 보지 않아, 2026-10-22 `b3321a0` 처럼 CI 가 실패한 커밋도 운영에 나갔다.

- **바꾼 것** — Deploy 맨 앞에 `wait-for-ci` 잡을 더했다. 같은 커밋의 CI(`ci.yml`, push) 실행을 GitHub API 로 찾아(나타날 때까지 최대 10분)
  끝나기를 기다리고(최대 60분), 결론이 `success` 가 아니면 실패한다. `deploy-aws` 는 `wait-for-ci` 와 `build-and-push` 를 둘 다 기다린다.
  이미지 빌드 · 스모크는 그동안 나란히 돌아 배포가 그만큼만 늦는다.
- **고른 이유** — CI 의 `workflow_run` 으로 Deploy 를 띄우는 안은 `paths` 를 걸 수 없어 앱만 바꾼 커밋도 배포되고, AWS runner 의 작업 전 검사가
  push 로 뜬 작업만 받는다. Deploy 안에서 CI 검사를 다시 돌리는 안은 같은 검사를 두 번 돌리고 목록이 따로 낡는다. 배포 경로는 모두 CI 의
  `paths-ignore` 밖이라 배포되는 커밋에는 CI 가 반드시 돈다.
- **검증** — 잡이 쓰는 API 조회를 지난 커밋에 돌려 봤다: `b3321a0` → `completed failure`(막힌다), `ca9599f` → `completed success`(통과),
  문서만 바꾼 `52f4aa9` → CI 실행 없음(이 커밋은 배포 경로가 아니라 Deploy 도 뜨지 않는다). YAML 구문 확인. 이 커밋(`d2c8b56`)의
  Deploy 가 첫 실행이었다 — `wait-for-ci` 가 06:36:28 ~ 06:39:51 UTC 동안 CI 를 기다려 성공(CI 끝 06:39:46)을 확인했고, 그사이 이미지 빌드 ·
  스모크가 나란히 돌았으며(~06:40:55), `deploy-aws` 는 그 뒤 06:40:58 ~ 06:42:10 에 성공했다.
- **문서** — deployment-aws.md §3(흐름 그림 · CI 실패 시 배포하지 않음). B-9(브랜치 보호)는 오너 판단으로 개발 단계 동안 보류.

## 2026-10-26 — 공모전 지표 실측(backlog A-14 · A-18 · A-3)

AWS 공모전 서버에서 실측 전용 계정 하나로 쟀다. 서버 분석을 켜고(`MOVIE_RECOMMENDATION_ENABLED=true`, Deploy 재실행), 테스터 앱(main `c78236d` 로컬
release 빌드 — EAS 무료 빌드 한도 소진)을 에뮬레이터에 깔아 새 계정으로 가입 · 분석 동의 · `promo` 1,000 크레딧.

- **표본** — 팀원 휴대폰으로 찍은 실제 여행 영상 37개(몽골 29 · 일본 8, H.264 1080p, 세로 26 · 가로 11)를 `영상에서 가져오기`로 3초 스냅
  39개로 만들었다(일본은 긴 영상 2개에서 하나씩 더). 가져온 스냅의 촬영 시각은 가져온 시각이라(`create-extracted-snap.ts`) 셋이 모두 "오늘"로
  묶였다 — 초안은 여행별로 스냅을 골라 요청했다. 분석 카테고리(음식 · 야간 · 흔들림 …)를 일부러 채우지는 못했다.
- **스냅 분석(A-3)** — 초안이 요청한 23개 분석, 실패 0. 처리 중앙값 12.4초 · p90 14.1초, 스냅당 입력 900 · 출력 269 토큰, 보낸 프레임 평균 2.65장
  (4장 6건). 모델 `gpt-5.6-luna`, 프롬프트 v1. 사람 채점용 표는 받아 두었고 채점은 남았다(A-3 "품질 · 단가 기준선").
- **AI 편집 초안(A-12 · A-14)** — 20회, 고른 스냅 10~29개.
  - 에이전트 성공률 **20/20(100%)**, fallback 0. 에이전트 시간 중앙값 **7.6초** · p90 **10.0초**, 평균 왕복 3.3.
  - 검토 첫 통과율 **75%** · 평균 재시도 0.25, 초점 개념을 쓴 비율 85%, 분위기를 정한 비율 100%.
  - 앱에서 `편집하는 중…` 이 보인 뒤 무비가 열리기까지(손으로 잰 19회) 중앙값 16.6초 · p90 20.2초(9.3 ~ 25.4) — 처음 쓰는 스냅의 분석을
    기다린 1 ~ 10회 중앙값 19.1초, 분석이 끝나 있던 11 ~ 20회 11.95초.
  - 초안이 쓴 컷 6 ~ 11개(스냅을 20개 넘게 골라도 10개 안팎).
  - 토큰 — 에이전트 합계 입력 156,553 · 출력 7,621(초안당 평균 7,828 · 381), 분석 합계 입력 약 26,000 · 출력 약 7,400.
- **1회 비용(A-14)** — 결정 문서 [ai-edit-agent.md](./decisions/ai-edit-agent.md) §5.1 의 단가(100만 토큰당 입력 $0.20 · 출력 $1.20, 제3자
  가격표 — 공식 가격 확인 전)로 20회 합계 약 $0.055, **초안 1회 평균 약 $0.0027(환율 1,400원 가정 약 4원)**. 에이전트만 약 $0.002, 새 스냅 12개를
  처음 분석하는 초안이면 약 $0.008(약 11원). 추정(15 ~ 20원)보다 낮은 것은 에이전트 토큰이 추정(입력 15 ~ 30k)의 절반 아래였기 때문이다.
  `measure.sql` 의 "초안마다 분석 토큰" 표는 초안 시각 앞뒤 2분으로 짝을 지어 연달아 돈 초안끼리 같은 분석을 겹쳐 세므로, 비용은 합계로 냈다.
- **20컷 렌더(A-18)** — 3초 스냅 20개(60초, 일상 · classic): 대기 0초 · 렌더 **435초**(제한 600초의 73%), 앱 기준 443초. `ai-worker` 최고 **973MiB**
  (로컬 추정 2.0GB 보다 낮다) · CPU 최고 약 195%. 최대 길이(100초)는 재지 않았다 — 비례하면 제한 시간을 넘을 수 있어 A-18 에 남겼다.
- **운영 DB 를 손으로 고친 것** — 초안의 하루 상한(24시간 10회, `DAILY_DRAFT_LIMIT`)에 걸려, 1 ~ 10회 집계를 먼저 저장한 뒤 실측 계정의
  `movie_drafts.created_at` 10행을 24시간 앞으로 옮겼다(다른 사용자 무관). 그래서 1 ~ 10회의 분석 토큰 짝짓기는 첫 집계 파일의 값을 쓴다.
- **남은 것** — 추천 정확도의 실제 분석값(A-6), 직접 편집 시간(팀원), 분석 사람 채점(A-3), 최대 길이 렌더(A-18), 모델 단가의 공식 가격 확인.

## 2026-10-26 (이어서) — 개념 매칭 실측과 사전 v3(backlog A-6 · A-14)

같은 실측 계정의 완료된 분석 28건(몽골 여행 스냅 — 초안 실측 뒤 5건이 더 분석됐다)을 운영 DB 에서 읽어, 예전 규칙(부분 문자열, `a39cbc9^` 의
`matchesAny` 와 2026-08-19 시드 힌트) · 사전 v2 · 사전 v3 으로 슬롯 20개(힌트 없는 `walk/hero` 제외)와 짝지었다. 채점 단위는 (슬롯, 필드, 스냅) —
그 스냅의 그 필드 값이 슬롯 힌트에 실제로 맞는가 — 이고, 세 규칙 중 하나라도 맞다고 한 148쌍을 Claude 가 채점했다(애매 2쌍 제외, 사람 검수 전).

| 규칙 | 맞게 고름 | 오탐 | 놓침 |
|---|---|---|---|
| 예전(부분 문자열) | 61 | 7 | 45 |
| 사전 v2 | 66 | 34 | 40 |
| 사전 v3 | 100 | 1 | 6 |

- **v2 가 예전보다 오탐이 많았다** — 글자 겹침 오탐(`타` ~ 장작이 타오름, `들` ~ 손 흔들기, `벽` ~ 벽돌 화덕)은 v2 에서 모두 사라졌지만,
  계층에서 새 오탐이 났다. 도로(`road`)가 거리(`street`)의 하위라 시골 도로가 골목 · 거리 슬롯을 채웠고(15), 스냅이 상위 개념일 때의
  잠정 0.5 가 상점 → 카페 슬롯 · 구름(하늘) → 노을 슬롯 · 차량 이동 → 걷기 슬롯을 만들었다(18 — 그 0.5 가 맞힌 것은 5).
- **사전 밖 비율** — v2 에서 서로 다른 값 기준 places 3/21 · objects 9/76 · actions 9/35 · topics 3/45. 사전이 도시 · 카페 위주라 초원 · 사막 ·
  산악 지대 같은 자연 여행 값이 없었다. v3 에서 places 14/21.
- **v3 으로 고친 것**(`contentVocabularyVersion` 2 → 3) — `road` 의 상위(`street`)를 뗐고, `match.broader` 를 0.5 → 0 으로, 별칭을 더했다
  (`scenery` ← 초원 · 들판 · 평원 · 구릉지 · 사막 · 모래사막 · 모래언덕, `mountain` ← 산지 · 산악 · 산악 지대, `road` ← 비포장도로 · 포장도로).
  정규화 공유 사례에 실측 값 4개를 더했다. 온톨로지는 개념 사이 관계 하나(도로 → 거리)가 빠지고 별칭이 12개 늘었다(그래프 페이지 관계 203 → 202).
- **남은 오탐 · 놓침** — 오탐은 `나무 선반` → 나무(머리가 아닌 낱말을 보는 정규화 ③) 1. 놓침은 구름만 적힌 노을 장면 3(노을이 objects 에 없고
  topics 에 있다), `산지 초원` 이 풍경으로 풀려 산 슬롯을 놓친 것 1, 걸어서 이동한 `이동` 2(상위 0 의 대가).
- **단서** — v3 은 이 28건을 보고 고친 사전을 같은 28건으로 잰 값이다. 한 여행(자연 풍경)이고 채점도 사람이 하지 않았다 — 다른 여행 표본과
  사람 채점으로 다시 재는 일은 backlog A-6 에 남겼다.
- **확인** — `npm test -w apps/api`(852 통과), 워커 사전 테스트(`tests.test_content_vocabulary` 외 51 통과), `npm run ontology:test`(8 통과).

## 2026-10-26 (이어서) — 모델 단가의 공식 가격 확인(backlog A-14)

실측 비용(초안 1회 약 $0.0027 · 약 4원)에 쓴 `gpt-5.6-luna` 단가를 OpenAI 공식 가격표(developers.openai.com `api/docs/pricing` · 모델 페이지
`gpt-5.6-luna`)에서 확인했다 — Standard, 입력 272K 토큰 이하에서 100만 토큰당 입력 $0.20 · 캐시 입력 $0.02 · 출력 $1.20 으로 결정 문서
[ai-edit-agent.md](./decisions/ai-edit-agent.md) §5.1 의 값과 같다. 실측 요청은 모두 272K 아래라 긴 문맥 할증(입력 2배 · 출력 1.5배)은 없다.
캐시 입력 할인은 넣지 않고 계산했으므로 실측 비용은 위쪽 값이다. 표기 날짜가 없는 가격표라 확인한 날짜를 함께 적는다.

## 2026-10-25 — 레퍼런스 말뭉치 도구 — 오프라인 포맷 발굴(backlog A-20, trend-recipes §13)

릴스 · 틱톡 · 쇼츠 레퍼런스를 사람이 모아 새 포맷 후보를 찾는 1단계 도구. 운영은 쓰지 않는다.

- `apps/ai-worker/scripts/reference-corpus.py` `init` · `analyze` · `report`, 순수 로직 `pipeline/reference_corpus.py` · `reference_rows.py` ·
  `reference_cluster.py` · `reference_corpus_md.py`. `analyze-reference.py` 의 분석 흐름을 `reference.measure` 로 빼 두 스크립트가 함께 쓴다.
- 검증: `tests/test_reference_corpus.py` 21개 통과. 전체 `unittest discover` 587개 중 실패 9건은 모두 `test_ffmpeg_contract` — 로컬 Homebrew ffmpeg 에
  libass(`ass` 필터)가 없어서이고 변경 전 실행에서도 같았다. `analyze-reference.py` 출력은 변경 전후 같은 영상에서 바이트 단위로 같았다(`--boundaries --recipe`
  있음 · 없음). 스모크(저장소 밖 임시 디렉터리): 저장소 안 경로 `init` 거부(exit 2), 시트 4줄(정상 2 · 잘못된 id 1 · 영상 없음 1) → 성공 1 · 건너뜀 2,
  `trim_end_s` 0.5 반영(5.4초 → 4900ms), `--speech` 실행 뒤 원본 삭제, `report.json` · `report.md` 생성.
- 수집(`collect`, 같은 날 추가): yt-dlp 로 목록을 훑어 길이 · 조회수 · 업로드일로 고르고 받는다. `tests/test_reference_collect.py` 9개 통과.
  확인: 유튜브 쇼츠 해시태그 피드는 조회수와 함께 읽힌다. 틱톡 단일 영상 · 계정 목록은 메타데이터가 읽히지만 해시태그 목록(`/tag/`)은 yt-dlp 가 깨졌다고
  표시하고 실패한다. 인스타그램은 로그인 없이 빈 응답이다. 틱톡 탐색 페이지를 브라우저 위장(curl_cffi)으로 읽으려던 시도는 자동 승인 분류기가 봇 차단
  우회로 막았고, 그 뒤 위장 패키지를 빼고 진행했다.

## 2026-10-26 (이어서) — 레퍼런스 컷 검출 보정 · 직접 고른 10편 분석 · 매치컷 고른 화면 오류(backlog A-20, trend-recipes §13)

- 쇼츠 135편(해시태그 피드)의 첫 리포트가 커버리지 1% · 원테이크 100편으로 나왔다. 확인해 보니 컷 검출이 컷을 1/3~1/4 만 잡았다(가로 영상을 세로 화면에
  넣은 검은 띠가 밝기 분포 변화를 묻고, 문턱 0.35 가 비슷한 색의 컷을 놓침). 처음엔 ffmpeg scene 검사로 '원테이크가 맞다'고 봤으나 그 명령이 `-v error` 로
  showinfo 출력을 숨겨 늘 0 이었다 — 근거가 아니었다. 135편 특징값은 보정 전 값이라 쓰지 않는다(원본은 이미 지움).
- `reference.cuts_of` 를 검은 띠 제외 + 분포 변화 0.2 + 튀는 픽셀 차이로 바꿨다. 사용자가 고른 10편(인스타 3 · 틱톡 1 · 유튜브 6, 인스타 1편은 영상 요청 403)에서
  ffmpeg scene(검은 띠 자른 뒤) 컷 수 16 · 40 · 9 · 12 · 8 · 33 · 43 · 20 · 11 · 45 대비 이전 0 · 0 · 4 · 4 · 1 · 11 · 10 · 7 · 0 · 12 → 지금 11 · 36 · 11 · 10 · 7 · 33 · 34 · 21 · 12 · 34.
  휩팬은 사건으로 세고 컷 옆은 빼서 틱톡 6.6초 영상의 휩팬 10 → 2. 테스트: 검은 띠 안의 컷(이전 검출기로는 0), 사건 묶기, 컷 옆 휩팬, 원테이크 제외.
- `match_cut.subject` 가 고른 화면(검은 프레임 · 단색)에서 눈에 띄는 곳이 없어 `ZeroDivisionError` 로 멈췄다(레퍼런스의 검은 컷에서 발견). 운영 매치컷도 같은
  함수라 사용자 영상의 검은 구간에서 같은 오류가 날 수 있었다 — 가운데 · 중간 크기(빈 구간 기본값과 같음)를 돌려준다. 테스트 추가.
- 10편 리포트: 원테이크 0, 커버리지 20%(2/10). 못 맞춘 축은 휩팬 4(우리 포맷 대부분 전환 팔레트에 whip 없음) · 레터박스 3(가로 영상을 세로에 넣은 몽타주 —
  지금은 cinematic 만 레터박스이고 박자 맞춤이 켜져 있다) · 원본 말소리 2 · 박자 2. 박자에 맞은 컷의 몫은 대부분 0.24~0.43 으로 우연(±80ms 창 · 약 120BPM 에서
  약 1/3)과 비슷하다 — 박자 맞춤은 10편 중 2편뿐. 군집은 k=2 · silhouette 0.13 으로 10편으로는 구조가 약하다.
- 전체 `unittest discover` 600개 중 실패 9건은 모두 `test_ffmpeg_contract`(로컬 ffmpeg 에 libass 없음 — 변경 전과 같음).

## 2026-10-26 (이어서) — 모든 무비는 음원만(ASMR 예외) · 시네마틱 분할 3칸(MOV-28, trend-recipes §14)

- 레퍼런스 후보 렌더(워커 Docker 이미지 — 로컬 ffmpeg 에 libass 가 없어 트렌드 렌더가 안 된다, 샘플 스냅 14개 · 합성 박자음)를 본 사용자 결정.
  `recipe-vocabulary.json` 11판: classic · 하루 타임스탬프 · 하루로그의 소리를 원본 0 · 음원 1.0 으로, 시네마틱 `split.sizes` [2] → [3].
  렌더로 확인: 2칸이면 둘째 칸이 띠 아래에만 열려 위가 비었고, 3칸이면 띠 · 아래 · 위가 찬다. 스펙 MOV-28 을 먼저 고쳤다.
- 검증: 워커 `unittest discover` 602개 — 실패 9건은 모두 `test_ffmpeg_contract`(libass 없음, 변경 전과 같음). classic 소리를 고정한 테스트는 새 값과
  되돌릴 값(주석)으로, ASMR 만 원본을 남기는지 · 레터박스 분할이 3칸인지 테스트 추가. 모바일 `jest src/entities/movie` 242개 통과.
  API `test/movie-recipe.test.ts` 는 3개 통과(레시피 이름 계약 포함) · 4개 시간 초과 — 로컬 Redis 컨테이너(두 달 전 것)가 `NOAUTH` 로 큐 연결을 막아서이고
  이 변경과 무관하다(컨테이너는 손대지 않음).

## 2026-10-27 — 운영 버킷에 BGM 9곡을 올렸다(backlog A-7 · A-20)

트렌드 레시피 작업 때 고른 Pixabay 곡 9개를 운영 영상 버킷 `assets/bgm/` 에 올렸다. 그 전까지 운영 매니페스트는 **0곡**이라 운영 무비에 음악이 없었다.

- **곡** — `daily` 3(Summer Adventures · Rise and Shine · Party All Night — 여자 보컬), `upbeat` 6(Meet You Again · Dance The Night Away · Island Queen —
  남자 보컬, Charming Phonk · Summer x Chill UpTempo · Party - Upbeat Party — 빠른 비트). 곡마다 출처 · 약관 URL(Pixabay Content License) · 확인일을 매니페스트에
  적었다. `calm`(감성)은 0곡 — 감성 스타일 무비는 아직 곡 없이 렌더된다(backlog A-7).
- **확보** — 2026-10-22 받아 둔 파일이 임시 폴더 자동 정리로 사라져, Pixabay 곡 페이지의 내려받기 버튼으로 다시 받았다. 9곡 모두 끝까지 디코딩되고(48kHz/44.1kHz
  스테레오, 1:04~3:32), 워커의 매니페스트 파서(`music.parse_manifest`)로 읽힌다.
- **올린 길** — 담당자 역할로는 버킷에 쓸 수 없고 서버에 명령을 바로 보낼 수도 없어서, 사용자가 서버 셸에서 `ai-worker` 컨테이너로 지금 매니페스트와 15분짜리
  업로드 주소를 받고 내 컴퓨터에서 곡 → 매니페스트 순으로 올렸다(deployment-aws.md "BGM 곡 올리기"). 결과: 매니페스트 0 → 9곡, 곡 9개 · 매니페스트 업로드 성공.
- 워커가 실제로 받아 쓰는지(다음 편집 작업에서 `BGM 라이브러리 9곡`)와 볼륨은 아직 보지 않았다.

## 2026-10-27 (이어서) — 레시피 무비를 다시 만들면 같은 편집 · 레시피가 고른 렌더의 컷은 '모름'(backlog E-65 · E-66, MOV-28)

테스터 APK 를 내기 전에(A-18) 레시피 무비의 두 결함을 닫았다. 스펙 MOV-28 을 먼저 고쳤다.

- **E-65 — 같은 구성이면 같은 편집** — AI 컷 레시피 무비의 순서 · 효과 시드가 `{movieId}:{jobId}` 라 다시 만들 때마다 편집이 바뀌어 MOV-14(같은 구성이면
  같은 결과)와 어긋났다. 시드를 무비 + 편집 스펙의 해시(`worker._variant_key`)로 바꿨다 — 컷 · 레시피 · 스타일이 같으면 같은 편집, 바뀌면 새로 고른다.
  새 변형을 일부러 고르는 일은 A-20 '변형 2~3개 중 고르기' 로 남는다. 곡은 이미 무비마다 고정(E-5 의 핀은 남음).
- **E-66 — 레시피가 고른 렌더의 컷 목록은 '모름'** — 앱은 작업이 끝날 때 무비의 컷 목록을 `render.snapRefs` 로 얼리는데, 레시피가 컷을 고른 무비의 파일은
  같은 스냅을 여러 번 쓰거나 배속 · 분할을 넣어 그 목록으로 표현할 수 없다. 워커의 EDL 을 돌려받아 얼리는 길도 같은 이유로 손실이 커서 택하지 않았다.
  `recipePicksCuts`(classic 이 아닌 레시피 + 컷을 전부 AI 가 정함)면 `render.snapRefs` 를 비워 두고 — 원래 있던 '모름' 의미대로 편집 뒤 달라짐 안내와
  '완성 당시 구성으로 되돌리기' 가 꺼진다. 파일의 구성을 편집 화면에 보이는 일은 A-20(레시피 컷 고르기를 초안 단계로 · EDL 저장).
- 검증: 워커 `test_edit_worker` 22개(시드가 구성을 따르고 작업 id 를 쓰지 않음 — 새 테스트), 모바일 `jest src/entities/movie src/pages/movie` 419개
  (레시피 무비는 '모름' · classic · 손본 무비는 얼림 — 새 테스트), 모바일 verify 1,762개. 실제 엔진(Docker ffmpeg 7.1, sample 스냅 5개)으로 같은 구성을 두 번 구워
  편집 결정(EDL)이 같고 스타일만 바꾸면 달라지는 것을 cinematic · fast-cut 두 레시피에서 확인했다.

## 2026-10-27 (이어서) — 스냅 분석의 넘친 목록은 앞의 6개만(backlog E-63)

모델이 사물이 많은 장면에서 `objects` 를 7개 이상 내면 검증(`schema.py` `MAX_LIST_ITEMS = 6`)이 거절해 `SCHEMA_INVALID` 로 분석을 한 번 더 불렀다(2026-10-21
샘플 32개 중 2개).

- **바꾼 것** — 거절하지 않고 앞의 6개만 남긴다(넘친 뒤쪽은 빈 문자열이어도 보지 않는다). 몇 번 잘랐는지는 워커 로그(`… 앞 6개만 남긴다`)로 센다. 프롬프트 ·
  구조화 출력 스키마 · 프롬프트 버전은 그대로라 배포에 따로 할 일이 없다.
- **택하지 않은 안** — 프롬프트에 한도를 적기. 프롬프트를 바꾸면 `VIDEO_ANALYSIS_PROMPT_VERSION` 과 운영 시크릿을 함께 올려야 하고, 적어도 모델이 지킨다는 보장이
  없어 검증은 어차피 남는다.
- **검증** — 워커 이미지(`snaply-ai-worker:measure`)에서 `tests.test_video_analysis` 통과. 거절을 고정하던 테스트를 '앞의 6개를 남기고 넘친 뒤쪽은 보지 않는다'로 바꿨다.

## 2026-10-27 (이어서) — ffmpeg 실패의 원인이 오류에 남는다(backlog E-64 ①)

오류에는 ffmpeg stderr 의 끝 800자만 싣는데, 그 자리를 진행 표시줄(`frame=… speed=…`)이 채워 원인이 잘렸다. 메모리 부족으로 커널이 죽이면(`SIGKILL`) ffmpeg 는
아무 말도 남기지 못해 종료 이유도 없었다.

- **바꾼 것** — 새 `pipeline/ffmpeg_error.py`. `editor._run`(편집 · `cut_fx` · `trend_edit`) · `rendition._run` 이 ffmpeg 를 `-nostats` 로 돌리고, 효과음 합성(`sfx`) ·
  액센트 합성(`accent_stage`)은 명령에 `-nostats` 를 넣었다. 다섯 곳(스티커 트랙 `sticker_render` 포함 — 이미 `-v error`)이 종료 코드 · 신호를 오류 **끝**에 붙인다
  (`… (exit 1)`, `… (SIGKILL — 메모리 부족으로 강제 종료됐을 수 있다)`) — 작업 실패 기록(`edit_jobs.error_message`)은 앞 1,000자를, 마지막 손질 실패 로그는 끝 300자를
  자르므로 끝에 둔다. 운영 사양 메모리 실측(②)은 E-64 에 남았다.
- **전후 비교**(워커 이미지 `snaply-ai-worker:measure`, ffmpeg 7.1.5) — 1080x1920 인코딩을 2초 뒤 `SIGKILL` 로 끝냈다. 예전 문구는 끝이 진행 줄 3개였고 종료 이유가
  없었다(`returncode -9`). 고친 문구는 진행 줄 0개 · 출력 스트림 정보 뒤 `(SIGKILL — …)` 로 끝난다. 실제 렌더(435초)였다면 진행 줄이 800자를 다 채운다.
- **검증** — 워커 이미지(`REQUIRE_FFMPEG=1`)에서 새 `tests/test_ffmpeg_error.py`(`-nostats` 넣기 · 종료 상태 문구 · `editor._run`)와 실제 ffmpeg 를 1.5초 뒤 죽이는
  계약 테스트(`FailureMessageContract`)를 더했다. 전체 `unittest discover`(E-63 포함) 610개 중 실패 1 — `test_reference_corpus` 의 'git 저장소 안 경로 거부'가 저장소 안
  경로를 거부하지 못했다. 테스트를 위해 복사한 디렉터리에 `.git` 이 없어서이고 이 변경과 무관하다(CI 의 checkout 에는 있다).

## 2026-10-27 (이어서) — 편집 제한 시간 900초(backlog A-18)

테스터 앱(2026-10-30, 회사 Play Console 내부 테스트)을 내기 전에 정했다. 최대 길이(100초) 무비는 2026-10-26 실측(60초 무비 435초)에 비례하면 약 720초라 600초
제한에서 실패한다. 재 보고 정할 시간이 없어 오너 결정으로 제한을 먼저 올렸다 — 근거 · 치르는 값 · 기각한 대안은
[decisions/aws-contest-server.md](./decisions/aws-contest-server.md) "편집 제한 시간 900초".

- **바꾼 것** — 워커 `config.EDIT_TIMEOUT_SECONDS` 기본값 600 → 900. `env-spec.ts` · `.env.example` · api-spec.md(`TIMEOUT` 설명) · MOV-5 라벨 ·
  deployment-aws.md §6 을 맞췄다. 운영은 코드 기본값을 쓴다 — Secrets Manager 에 `EDIT_TIMEOUT_SECONDS` 가 있으면 그 값이 이긴다.
- **남은 것** — 최대 길이 무비의 실측(A-18). 900초에 가까우면 다시 정한다.

## 2026-10-27 (이어서) — Play 내부 테스트 준비 — 패키지 `com.dweax.snaply` · 업로드 키 서명(backlog A-18)

테스터 버전을 회사 Google Play Console 내부 테스트로 낸다(2026-10-30 까지, 오너 결정). 결정 · 기각한 대안은
[decisions/android-release-config.md](./decisions/android-release-config.md) "패키지 이름 · 업로드 키".

- **바꾼 것** — `app.json` 의 `android.package` 를 `com.anonymous.snaplyapp` → `com.dweax.snaply`(오너 결정, Play 는 바꿀 수 없다), `android.versionCode: 1`.
  새 설정 플러그인 `plugins/with-release-signing.js` 가 release 를 업로드 키로 서명한다 — 키 · 비밀번호는 Gradle 속성(`SNAPLY_UPLOAD_*`, 저장소 밖)이고, 없으면
  debug 키 그대로라 테스터 APK 는 어디서나 빌드된다. prebuild 템플릿이 바뀌어 고칠 자리를 못 찾으면 플러그인이 prebuild 를 실패시킨다(조용히 debug 키로 남지 않게).
  기기 설치 스크립트의 앱 id 도 바꿨다. iOS 번들 ID 는 그대로다.
- **아직 빌드는 못 한다** — Firebase 의 `google-services.json` 에 새 패키지의 client 가 없어 Android 빌드(debug 포함)가 실패한다. Firebase 앱 등록 · 업로드 키 ·
  Play Console 앱 만들기는 오너 몫이다(deployment-aws.md §8 "Google Play 내부 테스트로 내기").
- **확인** — 플러그인 테스트(템플릿에 서명 넣기 · debug 빌드와 키 없는 release 는 debug 키 · 두 번 돌려도 같음 · 템플릿이 바뀌면 실패), 지금 `android/app/build.gradle`
  에 플러그인을 돌려 `signingConfigs.release` 와 조건부 `signingConfig` 가 들어가는 것을 봤다. `release-config.test.ts` 가 패키지 이름과 플러그인 등록을 고정한다.
  `npm run verify:mobile` 239 suites / 1,768 tests 통과(lint 경고 2건은 이번에 손대지 않은 테스트 파일의 것).

## 2026-10-27 (이어서) — Play 내부 테스트용 번들 1.0.0(1) 빌드(backlog A-18)

Firebase 프로젝트 `snaply-829b9` 에 Android 앱 `com.dweax.snaply` 를 더해 받은 `google-services.json`(예전 패키지의 client 도 함께)을 넣고, 오너가 만든 업로드 키를
`~/.gradle/gradle.properties` 로 읽어 main `88aed66` 을 빌드했다.

- **빌드** — `expo prebuild --clean --platform android` 뒤 `EXPO_PUBLIC_API_BASE_URL=https://snaply-api.dweaxai.com ./gradlew app:bundleRelease app:assembleRelease -x lint -x test`
  (2분 18초). AAB 109MB · APK 200MB.
- **확인** — 번들에 운영 서버 주소가 들어 있다. AAB · APK 모두 debug 인증서가 아니라 업로드 키(`O=DWEAX, C=KR`, SHA-256 `F8:E9:D8:E4:…:8E:31`)로 서명됐다.
  `com.dweax.snaply` · versionCode 1 · versionName 1.0.0 · minSdk 28 · targetSdk 36. 에뮬레이터(API 35)에 APK 를 깔아 띄우면 크래시 없이 로그인 화면이 열린다
  (로그인 · 무비 생성은 보지 않았다).
- **Play 에 올리지 못했다** — 내부 테스트 첫 버전에서 Play 앱 서명 약관에 동의하려면 계정 권한이 필요해 막혔다. 회사 개발자 계정 관리자에게 문의 중이다.
- **Play 가 요구할 수 있는 신고** — 번들의 권한에 광고 ID(`ACCESS_ADSERVICES_AD_ID` 등 — AdMob), 백그라운드 위치 · 위치 포그라운드 서비스(위치 알림)가 있다.
  출시 전에 Play 의 광고 ID · 권한 신고나 데이터 보안 양식을 요구하면 그때 채우거나 그 권한을 뺀 빌드를 다시 올린다.

## 2026-10-27 (이어서) — 큐를 연결 초기화가 끝난 뒤에 닫는다(backlog E-69)

API 통합 테스트가 테스트는 모두 통과한 채 처리되지 않은 오류(`Error: Connection is closed.`, 3건)로 실패해 배포를 막았다(CI `29fdae7` 첫 실행, 2026-10-22 에도 한 번).

- **원인(추정)** — 큐 셋(편집 legacy · v3 · 분석 · 렌디션)은 `lib/redis` 의 공유 ioredis 연결을 쓴다. BullMQ 5.80 은 초기화 중(`status: initializing`)인 공유 연결의 큐를
  닫을 때 연결을 그대로 두고 오류 리스너만 뗀다(`RedisConnection.close` → `removeAllListeners`). 그 뒤 `disconnectRedis()` 가 연결을 끊으면 남은 초기화 명령(`INFO`)이
  `Connection is closed` 로 거절되고, 초기화의 `.catch(err => this.emit('error', err))` 가 리스너 없는 `error` 를 던져 처리되지 않은 거절이 된다. CI 스택이 BullMQ 가
  아니라 ioredis 의 소켓 종료(`event_handler.js` `close` → `flushQueue`)를 가리키는 것(던져진 것이 그 오류 객체 그대로)과, `close()` 로 닫는 큐가 셋이라 오류 3건인 것이
  이 경로와 맞는다. 테스트 3개짜리 짧은 파일(`docs-dev-login`)이 CI Redis 의 초기화보다 먼저 끝날 때만 난다. 로컬에서는 같은 순서(큐 생성 직후 닫기 · 연결 끊기, 닫힌
  포트)로 재현하지 못했다 — 느린 Redis 를 흉내 내는 로컬 프록시는 띄우지 않았다.
- **바꾼 것** — `lib/redis.ts` 의 `closeQueueWhenReady`: 큐를 닫기 전에 연결 초기화(`waitUntilReady`)를 최대 5초 기다린다(초기화가 실패해도 · Redis 가 죽어 있어도
  닫고 넘어간다 — 종료가 멈추지 않게). 세 큐 모듈의 `close*Queue` 가 이것으로 닫는다. 테스트 정리(공용 하네스 · `docs-dev-login`)와 서버 종료(`index.ts`)가 렌디션 큐도
  닫는다 — 서버 종료는 분석 큐도 닫지 않고 있었다.
- **확인** — 새 `test/close-queue-when-ready.test.ts`(준비 뒤에 닫음 · 준비가 안 오면 5초 뒤 닫음 · 초기화 실패여도 닫음), API typecheck · lint 통과. 로컬 `npm test -w apps/api` 를 두 번 돌려 두 번 모두 52 파일 · 855 테스트 통과, 처리되지 않은 오류 0. 재발 여부는 CI 에서 더 본다(E-69 완료 조건).

## 2026-10-28 — 운영 레시피 무비에 BGM · 글 · 이모지가 붙는 것을 봤다(backlog A-7 · A-19 · A-20)

2026-10-27 올린 BGM 9곡을 운영 워커가 실제로 쓰는지 남아 있던 것을(위 "운영 버킷에 BGM 9곡을 올렸다") 에뮬레이터 앱(운영 서버 · 측정 계정)으로 봤다.

- **만든 것** — 사용자가 손본 초안 `무비 10-26 (22)`(몽골 여행 스냅 8컷 · 스타일 일상)에 레시피 시네마틱을 골라 생성. 09:11 시작 → 09:15 완성, 23.9초.
  손본 무비라 컷 구간 · 순서는 그대로이고 소리 · 타이틀 · 글 · 효과음만 레시피를 따른다(MOV-28).
- **소리** — 사용자가 재생해 들었다: 곡이 깔리고 잘 들린다(시네마틱은 원본 소리 0 · 음원 1.0). 어느 곡인지와 효과음은 따로 가리지 않았다.
- **화면**(재생 중 캡처 22장) — 가운데 띠에 영상 · 위아래 칸에 같은 장면을 흐리게(세 칸 레터박스, #95), 무비 내내 'Vlog' 타이틀과 부제 "@암석 지형 !",
  글 "찰칵!"(노을 찍는 컷) · "하늘 미쳤다"(하늘 컷), 이모지 📸 · ☁️. 셀카 컷이 여럿인데 얼굴 스티커는 보이지 않았다(시네마틱 레시피 설정인지는 보지 않았다).
- **남은 것** — `calm` 0곡과 원본 소리를 섞는 무비(ASMR)의 볼륨(A-7). 부제가 첫 컷의 장소("암석 지형")라 여행 전체를 대표하지 못하는 것은 관찰만 했다.

## 2026-10-28 (이어서) — 편집 품질: 레퍼런스가 못 맞춘 축의 레시피 셋 · 무비 전체를 대표하는 타이틀 · 감성 곡 3개(MOV-28, backlog A-20 · A-7)

사용자 요청(편집 품질 올리기 1 → 2 → 3). 결정 · 기각한 대안은 [decisions/trend-recipes.md](./decisions/trend-recipes.md) §15. 스펙 MOV-28 의 레시피 목록과
'원본 소리는 ASMR 만' 문장을 먼저 고쳤다.

- **① 레시피 셋**(사전 판 12, 계약 `MOVIE_RECIPES` · 앱 카탈로그 · `openapi.json` · api-spec) — 휩 몽타주 · 가로 몽타주 · 말소리 브이로그. 직접 고른 레퍼런스 10편
  리포트(`reference-corpus.py report`, 특징값 복사본으로)의 커버리지 20% → 90%(9/10). 같은 10편으로 값을 맞췄다(처음 값은 40%) — 넓은 말뭉치로 다시 잰다.
  워커 Docker 이미지 · 샘플 스냅 7개로 셋을 구워 보니 처음엔 셋 다 15초 미만이었다 — 두 몽타주는 `oneCutPerSnap` 을 풀고(22.9 · 28.2초), 말소리 브이로그는
  점프컷(`format.jumpCuts` — 빔 서치가 같은 스냅의 다음 구간을 잇고, 안정 구간을 나눈 후보 · 합으로 견주기 · 스냅 건너뛰기 벌점)으로 7.3 → 13.3초.
  휩 몽타주 전환 6/14 가 휩, 가로 몽타주는 띠 안 'Vlog' 타이틀 · 얼굴 왕관 스티커, 말소리 브이로그는 원본 소리(평균 −17dB).
- **② 타이틀** — `title_card.words` 가 같은 문자열(두 컷 이상) → 내용 개념(상위 개념까지, 두 컷 이상) → 기본값 순으로 고른다. 2026-10-28 운영 무비(몽골 여행)의
  "@암석 지형 !"이 같은 입력에서 "여행" · "풍경"으로. 기존 수족관 사례는 그대로.
- **③ 감성(`calm`) 곡 3개** — Lofi Chill Vlog Beats · Chillhop Jazz Coffee Shop(alex-morgan) · Emotional(AtlasAudio), Pixabay 곡 페이지에서 받아 끝까지 디코딩 확인
  (1:44~2:53). 업로드는 사용자 몫(서버 셸 — 2026-10-27 과 같은 스크립트, 가짜 서버 출력으로 '9곡은 건너뛰고 3곡만'을 확인).
- 검증: 워커 `test_recipe` · `test_formats` · `test_fast_cut`(점프컷 · 나눈 후보 — 새 테스트) · `test_title_card`(개념으로 묶기 · 공유 없으면 기본값 — 새 테스트),
  모바일 verify 1,771개, typecheck · lint. API 전체는 두 번 돌려 각각 다른 테스트 1개가 실패했고(`edit-jobs-read` · `ad-reward`) 단독 실행은 통과 — E-69 의
  간헐 실패로 보고 이 변경과 무관하다고 판단했다(레시피 이름 계약 테스트 `movie-recipe.test.ts` 는 통과). 워커 전체(Docker ffmpeg 7.1) 615개 통과.

## 2026-10-29 — 분석의 피사체 상자로 꾸밈을 피사체 옆에(MOV-27 · ANA-2, backlog A-19)

사용자 요청("이모지 위치가 네 모서리에 고정돼 있다"). 글 · 이모지는 피사체 옆에 놓도록 설계됐지만 피사체 위치를 주는 곳이 없어 사용자가 컷을 고른 무비는 늘
안전 영역의 네 모서리였다. 결정과 실측은 [decisions/subject-boxes.md](./decisions/subject-boxes.md)(같은 날 결정 — 분석 응답에 프레임별 상자). 스펙 MOV-27 · ANA-2 를 먼저 고쳤다.

- **실측 두 번** — 루나(`gpt-5.6-luna`)에 프레임 12장을 한 장씩: 9장 맞음 · 확신도는 구분력 없음(모두 0.87~0.99). 운영 형태(스냅 14편, 스냅당 최대 4장 한 요청,
  지금 프롬프트 대 `subjects` 를 더한 프롬프트): 하류가 쓰는 개념의 일치가 같은 프롬프트끼리 0.56 · 기준↔신규 0.57 로 기존 분석이 나빠지지 않았고,
  거르는 규칙을 지난 상자가 36장 중 29장에 남았다(위치는 눈으로 모두 맞음). 스냅당 출력 +386 토큰(약 $0.0005) · 지연 +1.5초.
- **분석(프롬프트 v2)** — 시스템 프롬프트에 규칙 한 줄, 스키마에 `subjects`(프레임별 최대 3개 · 이름 · 0~1 상자). 저장 전에 `schema.subject_box` 가 거른다 —
  면적 60% 초과 · 가로나 세로 90% 이상(선반 · 모래언덕 띠) · 면적 0.5% 미만 · 거꾸로. 모양이 틀린 `subjects` 는 분석을 실패시키지 않고 버린다.
  `VIDEO_ANALYSIS_PROMPT_VERSION` 기본값 v1 → v2(env-spec · `.env.example`), `MAX_OUTPUT_TOKENS` 700 → 1400(실측 최대 886).
- **저장 · 계약** — `video_analyses.subjects`(JSONB, 기본 빈 배열 — 마이그레이션 `20261029020000_video_analysis_subjects`), 계약 `videoAnalysisResultSchema.subjects` ·
  `openapi.json` · api-spec. 이 전의 분석은 빈 배열이라 꾸밈은 모서리로 간다.
- **렌더** — 새 `pipeline/subject.py`: 컷 구간 가운데에 가장 가까운 분석 프레임의 첫 상자를 골라(그 프레임이 비면 없음) 원본 크기 · 회전과 맞춤 방식
  (흐린 배경 · 단색 띠 · cover · contain, 레터박스 띠)대로 화면 좌표로 옮긴다. 보통 경로(`accent_stage.build_cuts`)와 AI 컷 경로(`trend_edit._contexts` —
  매치컷이 찾은 피사체가 먼저)에 연결. 얼굴 스티커는 그대로 YuNet.
- **확인** — 실측 분석(스냅 14편의 상자)을 미리보기에 넣어 같은 컷을 상자 있음 · 없음으로 구웠다: 텐트 안 강아지 · 맥주잔 · 후지산 · 승합차 컷에서 이모지가
  모서리 대신 피사체 곁으로 옮겨 갔고, 상자가 걸러진 컷(기념품 가게 · 노을)은 모서리 그대로. 염소 컷은 뒤쪽의 작은 동물 상자가 남아 그 곁으로 옮겨 갔다(첫 상자를 쓰는 규칙의 한계). 워커 새 테스트 `test_subject`(가까운 프레임 · 빈 프레임은
  빌리지 않음 · 맞춤 방식별 옮기기 · 잘림 · `build_cuts`) · `test_video_analysis`(거르는 규칙 · 틀린 모양 버림), API `video-analysis.test.ts`(상자 · 예전 분석은 빈 배열).
  `npm test -w apps/api` 54 파일 · 867개 통과, 워커 전체 650개 중 실패 9건은 로컬 ffmpeg 에 libass 가 없는 ASS 렌더 테스트(전과 같음),
  `npm run typecheck -w apps/mobile` 통과.
- **운영에 반영할 것** — 운영 시크릿에 `VIDEO_ANALYSIS_PROMPT_VERSION` 이 있으면 v2 로 올린다(없으면 기본값 v2). 회전 정보가 잘못 붙어 워커가 바로 세운 원본은
  분석 프레임과 방향이 달라 상자가 어긋날 수 있다(드물다 — `subject.py` 머리말).

## 2026-10-29 (이어서) — 배포 직후 AI 컷 레시피 무비에 BGM 이 빠졌다(MOV-28)

사용자 보고("운영에서 무비를 만들어 보니 BGM 이 안 깔린다"). 곡 라이브러리는 볼륨 없이 워커 컨테이너 안(`BGM_DIR=/app/assets/bgm`)에 버킷에서 받아 두는데
(`music.sync_library`), 받는 것은 보통 경로의 `music.apply_bgm` 뿐이었다. 컷을 AI 가 고른 레시피 무비(`worker._render_trend`)는 곡을 직접 고르면서
라이브러리를 맞추지 않아, 배포로 새로 뜬 워커에서는 곡이 하나도 없어 원본 소리 그대로 만들어졌다(`trend_edit.render` 의 "곡이 없으면 원본 소리"). 2026-10-22 부터
있던 빈틈이고, 같은 날 배포 세 번(#99 · #100 · #101)으로 컨테이너가 바뀌며 드러났다 — 보통 경로 무비가 한 번 돌아 라이브러리를 받은 뒤에는 AI 컷 무비에도 곡이 깔린다.

- **고침** — `_render_trend` 가 곡을 고르기 전에 `music.sync_library` 를 부른다(이미 맞췄으면 `SYNC_INTERVAL_SECONDS` 안에서 넘어간다).
- **확인** — 새 `test_edit_worker.RenderTrendTrackTest`(라이브러리를 맞춘 뒤 곡을 고르고 그 곡이 렌더에 간다). 고치기 전 코드에서는 실패, 고친 뒤 통과. 워커 전체 652개 중 실패 9건은 로컬 ffmpeg 에 libass 가 없는 ASS 렌더 테스트(전과 같음).

## 2026-10-30 — 앱에서 꾸밈 켜고 끄기

backlog A-22 의 앱 화면. 무비 편집 화면의 칩 줄에 **꾸밈** 칩(켜진 것을 읽어 준다 — `꾸밈 · 글자·이모지`, `꾸밈 · 없음`)을 두고, 누르면
글자 · 이모지 · 얼굴 스티커 스위치 세 개가 있는 시트가 열린다(`pages/movie/ui/decoration-sheet.tsx`). 스위치는 순서 고정처럼 바로 저장되고
무비의 `decorations` 를 통째로 보낸다(`PATCH /movies/{id}`). 레시피를 바꾸면 서버처럼 앱도 새 레시피의 기본값으로 되돌린다 — 앱은 계약 패키지를
타입으로만 쓰므로 기본값은 사본(`RecipeDecorationDefaults`)이고, 테스트가 `recipe-vocabulary.json` 과 레시피마다 비교한다. 이 필드 전에 저장된
무비는 레시피 기본값으로 읽고 `decorations` 를 보내지 않는다(서버가 가진 값 그대로). 완성된 무비의 시트는 "다시 만들 때 적용돼요. 컷·순서·음악은
그대로예요." 를 적는다.

검증: `npm run verify:mobile` 통과(테스트 240 파일 · 1797개 — 새 `decoration-sheet.test.tsx`, 기본값 사본 대조, 레시피를 바꾸면 기본값으로,
스위치 저장 · 보내기 · 예전 무비). 에뮬레이터 · 실기기에서는 아직 보지 않았다 — 완료 조건(글자 끄고 이모지만 켠 무비를 실기기에서)은 A-22 에 남는다.
