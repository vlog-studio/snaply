# Snaply 개발 진행 기록 — 2026년 9월

> **보관 문서** (2026-10-16 이동): [progress.md](../progress.md)에서 2026-09-02 ~ 09-29의 항목을 월 단위 규칙대로 옮겼다 —
> progress.md 에는 이번 달만 두고 지난달은 `archive/progress-YYYY-MM.md` 로 보낸다.
> **완료 기록이다** — 무엇을 언제 어떻게 검증했는지의 근거로 인용할 수 있지만, 각 항목은 그 시점의 기록이라 지금의 동작 · 구조 ·
> 명령은 코드와 [specs/](../specs/README.md) · 각 원천 문서가 우선한다. 미결은 [backlog.md](../backlog.md)에만 있다.
> 이동하면서 상대 링크 경로만 archive 위치에 맞게 고쳤다(그 외 본문 불변).

---

## 2026-09-02 — 모노레포 문서 정합성 및 모바일 의존성 단일화

분리 저장소 시절의 경로와 역할 설명을 현재 모노레포 구조에 맞춰 정리했다. 루트 문서 지도를
모바일 문서까지 확장하고, 환경변수·팀 소유권·API 계약·기능 상태 문서가 실제 코드와 같은 내용을
가리키도록 갱신했다. 완료된 IAP 전환 계획과 더 이상 현행 회의 입력으로 쓰지 않는 백엔드 결정
워크시트는 `docs/archive/`로 옮겼다.

계정 삭제 문서와 화면에 남아 있던 "구독 즉시 해지" 설명은 실제 서버 동작인 소셜·FCM 정리,
진행 중 작업 취소, 예약 크레딧 환급에 맞췄다. 영화 완료 알림과 위치 기반 추천 알림은 현재 구현
범위와 남은 실기기 검증을 구분해 기록했고, OpenAPI 스냅샷과 모바일 생성 타입도 다시 동기화했다.

모바일 타입 검증 실패는 루트와 `apps/mobile`에 서로 다른 React Native 타입이 설치된 것이
원인이었다. 루트 override로 Expo SDK 57 호환 버전인 `react-native@0.86.3`과
`@react-native/jest-preset@0.86.3`을 단일화하고 의존성을 dedupe했다. 화면 코드에 타입 단언을
추가하지 않고 `app-tabs.tsx`의 `PressableProps` 충돌을 제거했다.

**검증**
- `npm run verify:mobile`: **123 suites, 943 tests 통과**, format·lint·typecheck·API 스냅샷 검사 통과
  (`notification-settings-store.ts`의 기존 미사용 값 경고 1건은 유지)
- `npm test -w apps/api`: Vitest **23 files, 319 tests 통과**, 스토리지 Node 테스트 1건 통과
- `npm run typecheck -w apps/api`, `npm run lint -w apps/api`, `git diff --check` 통과
- 루트·`docs/`·모바일 문서 **77개**의 로컬 Markdown 링크 검사 통과

---

## 2026-09-05 — API 계약을 스키마 우선으로 — Zod 계약 패키지

**배경**: 한 엔드포인트의 계약이 여섯 곳(shared-types 타입, 수기 JSON 스키마, 라우트 요청 인터페이스,
모바일의 OpenAPI 스냅샷·생성 타입, 모바일 Zod, `api-spec.md`)에 손으로 적혀 있었고 어느 둘의 일치도
검사되지 않았다. 모바일 스냅샷은 실행 중인 서버를 curl 해 갱신했다. 결정과 기각한 대안은
[decisions/api-contract-schema-first.md](../decisions/api-contract-schema-first.md).

**구현** (5단계, 각각 독립 검증):

1. **Fastify 5** — `fastify@5.12`, `@fastify/rate-limit@11`, `@fastify/swagger@9`, `@fastify/swagger-ui@6`,
   `@fastify/websocket@11`, `fastify-plugin@5`. 코드 변경은 WebSocket 핸들러 시그니처(`(socket, req)`),
   `setErrorHandler<FastifyError>`, `decorateRequest('user')` 세 곳. swagger 9 는 body 있는 라우트의
   `requestBody.required: true` 를 내기 시작했다(정확해진 것).
2. **계약 패키지** — `packages/shared-types/src/contract/` 에 Zod 스키마·`defineRoute`·레지스트리
   `apiContract`(35 라우트). `apps/api/src/schemas/responses.ts`(770줄)와 라우트의 요청 인터페이스 12개,
   `domain.ts`·`api.ts` 의 수기 타입을 삭제하고 `z.infer` 로 대체. 백엔드는 `fastify-type-provider-zod@7`로
   검증·직렬화·OpenAPI 변환. `CREDIT_REASON`·`MAX_CANDIDATES` 같은 계약 상수는 패키지로 옮기고
   서비스는 다시 내보낸다.
   - 드러난 불일치(계약을 실제 의도에 맞춤): `POST /sns/{platform}/upload` 의 `status` 가 `success` 만
     허용돼 있었고 `api-spec.md` 가 안내하는 `requiresUserAction` 은 스키마에 없어 **앱에 도달한 적이
     없었다**. `GET /billing/credits` 의 `entries[].reason` 이 DTO 에서 `string` 이었다. SNS 라우트는
     플랫폼별 리터럴 8개에서 `{platform}` 파라미터 4개로.
   - Zod 직렬화는 `additionalProperties: false` 처럼 미선언 필드를 지우되, 계약과 어긋난 응답은
     `500 FST_ERR_RESPONSE_SERIALIZATION` 으로 드러낸다.
3. **OpenAPI 스냅샷** — `buildApp(config, { docs })` 오버라이드로 서버·DB 없이 문서를 만드는
   `src/openapi.ts`, `npm run openapi:write|check -w apps/api`, `test/openapi-snapshot.test.ts`.
   스펙 파일은 `apps/api/openapi.json` 하나(2칸 들여쓰기)로 옮겼다.
4. **모바일** — `apiRequest`·`apiPath` 가 `apiContract` **타입 전용 import** 에서 경로·메서드·query·body·
   응답 `data` 타입을 유도. `openapi-typescript`, `schema.d.ts`(5,300줄), `api:pull`/`api:gen`/`api:check`,
   `.gitattributes` 제거. `verify` 는 `contract:build` 를 먼저 실행하고 루트 `dev:mobile` 도 빌드 후 Metro.
   기존 `@ts-expect-error` 계약 테스트 7건은 그대로 통과. `docs/workflows/openapi-api-integration.md` →
   `api-contract-integration.md`.
5. **`api-spec.md`** — 599줄에서 필드 형태 서술을 걷어내고 "FE 가 다뤄야 할 동작 + WebSocket" 만 남겼다.
   WebSocket 메시지 계약은 `editProgressEventSchema` 가 원천.

**검증**
- `npm test -- --filter=@vlog-studio/api` — 24 파일 321 테스트 통과(스냅샷 테스트 2건 신규), API typecheck·lint 통과
- `npm run openapi:check -w apps/api` — 최신
- `npm run verify:mobile` — contract:build → format → lint(기존 경고 1) → typecheck → jest 통과
- 1단계 직후 Fastify 5 에서 생성한 스펙과 기존 스냅샷을 대조해 `PATCH /auth/me` 의 `requestBody.required` 외
  차이가 없음을 확인했다

**남은 것**: [backlog.md](../backlog.md) B-5 후속 — 엔티티 경계 Zod 를 계약 스키마의 파생으로(런타임 import 의
Metro/Jest 해석 확인 필요), `openapi.json` 의 `*Input` 사본 스키마.

---

## 2026-09-09 — 촬영 시각 저장 · 무비 서버 엔티티 (Dev A)

생애주기 결정 세 축이 닫히면서([backlog.md](../backlog.md) A-1) 막혀 있던 구현이 풀렸다.
착수 계획은 [archive/lifecycle-alignment.md](./lifecycle-alignment.md).

### 1. `capturedAt` 서버 저장 (SNAP-10 `구현됨`)

앱은 촬영 시각을 갖고 있었지만 보내지 않아 서버는 업로드 시각만 알았고, 시간 기준 정렬이
전송 순서 정렬이 되고 있었다. `POST /videos` 요청에 실어 보내 `videos.captured_at` 에 저장한다.

**서버가 소급할 수 없는 값**이라 컬럼은 nullable 이고, 전달 이전에 올라온 행은 업로드 시각으로
백필하지 않는다(틀린 값이 원천이 된다) — 읽는 쪽이 `createdAt` 으로 폴백한다.

- 검증: 아이폰 클립(`creation_time` 2026-08-04T09:14:46Z)을 로컬 MinIO 에 올려 등록 → 조회까지
  같은 시각으로 왕복 확인. 계약 테스트 5건 신설, 모바일 943 통과
- Supabase 가 일시정지 상태라 `npm run auth:stub` 으로 인증을 대신했다

### 2. 낡은 Prisma 클라이언트 프리체크 (E-6 닫힘)

스키마 변경을 pull 하고 `db:generate` 를 빼먹으면 무관해 보이는 실패가 무더기로 났다(08-20 에
72건). 이제 테스트 global setup 이 스키마와 생성물의 스키마 사본을 대조해 **한 줄로 멈추고
해결 방법을 알려준다.** 사본은 정렬만 다시 맞춘 판본이라 공백을 정규화해 비교한다.

### 3. 무비(프로젝트) 서버 엔티티 — A-1 본체

무비가 앱 로컬에만 있어 기기를 바꾸면 사라졌고, 서버는 프로젝트의 존재를 몰랐다.

- **스키마**: `movies` · `movie_clips` + RLS 정책. 컷은 스냅을 **참조**만 하므로 한 스냅을 여러
  무비가 다르게 쓰고, 무비를 지워도 스냅은 남는다. `result_video_id` 하나로 살아 있는 결과물을
  가리키고(교체, 누적 아님), `finished_at` 이 "사용자가 가져갔다"를 기록한다
- **계약·API**: `contract/movies.ts` + 6개 엔드포인트(생성·목록·상세·수정·삭제·내보내기·끝내기).
  **내보내기는 기존 편집 엔진을 그대로 재사용**한다 — 워커·파이프라인 무변경
- **순서**: 배열 순서가 곧 재생 순서다(`order` 필드를 응답에 두지 않아 두 표현이 어긋날 수 없다).
  `arranger` 가 순서의 주인이며 `ai` 일 때만 촬영 시각 순으로 정렬한다
- **사라진 스냅**: 컷을 빼지 않고 `unavailable` 로 표시한다 — 무비는 열려야 하고 사용자가
  무엇을 잃었는지 알아야 한다(SNAP-12). 그 상태로 내보내면 400
- **끝내기**: 결과물 파일을 지우고 무비는 남긴다. 다시 만들기는 새 생성이라 크레딧 100 을 다시 낸다

**구현 중 잡은 결함**: 워커는 무비를 모르므로 생성이 끝나도 무비가 `generating` 에 갇혀
수정·끝내기가 영원히 409 였다. 읽는 시점에 편집 작업을 보고 따라잡되 `updatedAt` 은 건드리지
않는다(스튜디오 보드의 정렬 기준이라 조회가 목록 순서를 바꾸면 안 된다).

**검증**: API 26 파일 349 테스트 통과(무비 23건 신설), typecheck·lint·OpenAPI 스냅샷 최신.

**남은 것**: 앱 전환(무비를 서버 쿼리로), 끝내기 호출 붙이기, e2e 갱신 — [backlog.md](../backlog.md) A-1.

---

## 2026-09-09 (이어서) — 보관 기간 만료 정리 배치 (Dev A)

결정된 보관 정책(스냅 15일 · 무비 결과물 30일)이 코드가 됐다. 세 정리 경로가 한 배치로 묶인다:
`npm run media:purge-expired -w apps/api` (dry-run 기본, `--yes` 실삭제 — `accounts:purge` 와 동일).

1. **스냅 원본** — 업로드 후 15일(SNAP-9)
2. **끝내지 않은 무비 결과물** — 생성 후 30일(MOV-16). 끝낸 것은 그때 이미 사라졌다
3. **남은 S3 객체** — 삭제가 스토리지 실패로 반쯤 끝난 행 회수(backlog E-3 닫힘)

**설계에서 지킨 두 가지**

- **만료는 유도한다.** 어떤 행도 "언제 만료된다"를 들고 있지 않고, 업로드·생성 시각과 현재
  정책 값(`services/retention-policy.ts`)으로 매번 계산한다. 구독이 사용자별로 다른 기간을
  팔기 시작해도 백필이 없다
- **삭제는 파일만, 행은 툼스톤으로 남긴다.** 그래야 사용자가 무엇을 잃었는지 알고, 그 스냅을
  참조하던 무비가 컷 하나를 `unavailable` 로 표시한 채 열린다. `사용자 삭제`와 `기간 만료`를
  `removal_reason` 으로 구분하고, `purged_at` 은 "일어난 사실"만 기록한다

**만료 → 실삭제 2단계**를 구조로 두되 간격은 **0**이다. 스냅 원본은 재생성이 불가능해서 파일을
지운 뒤에는 어떤 요금제로도 복구할 수 없으므로, 나중에 복구를 팔면 이 값만 늘리면 된다.

**검증**: API 27 파일 358 테스트(만료 9건 신설), dry-run 실행 확인, typecheck·lint 통과.

**앱에 넘긴 것**: [mobile-handover-lifecycle.md](./mobile-handover-lifecycle.md) —
무비 서버 전환·만료 표시·끝내기 버튼과 그 계약. 백로그 항목에 `앱`/`서버` 라벨을 달았다.

---

## 2026-09-09 (이어서) — 배포 렌디션 워커 (Dev A)

서버 원천 전환 2단계([decisions/snap-source-of-truth.md](../decisions/snap-source-of-truth.md) §5).
아이폰 원본은 HEVC·종종 HDR 이라 다른 플랫폼에서 재생되지 않을 수 있어, 업로드가 확정되면
**H.264/SDR 사본**을 만든다. 원본은 지우지 않는다 — 편집은 계속 원본을 쓴다.

- **세 번째 워커 프로세스**(`npm run worker:rendition`, compose `rendition-worker`). 편집·분석
  워커와 같은 이미지에 커맨드만 다르다. 적재는 `POST /videos` 가 한다
- **계약**: `Video.playbackUrl`(시한부 URL, 없으면 `originalUrls` 폴백) · `durationMs`(FFprobe 실측)
- **실패는 치명적이지 않다** — 렌디션이 없으면 일부 플랫폼에서 재생이 안 될 뿐이라 `videos.status`
  를 건드리지 않고, 큐 적재 실패도 삼킨다(파일은 이미 올라갔고 스냅은 쓸 수 있다). 변환 자체가
  안 되는 파일은 재시도하지 않는다 — 다음에도 같은 결과다
- **HDR 은 `zscale` 톤매핑 대신 `format=yuv420p` 강제 변환**으로 떨어뜨린다. zscale 이 없는
  ffmpeg 빌드가 흔해서다. HDR 원본이 다소 어두워질 수 있지만 재생되지 않는 것보다 낫다 —
  정밀 톤매핑은 A-7 렌더 파이프라인의 몫
  → 대체: 2026-09-15 "스트레스 실검증과 HDR 색 태그 결함" — `zscale` 이 있으면 톤매핑하고,
  어느 경로든 색 태그를 bt709 로 적는다
- 기존 스냅은 마이그레이션에서 `skipped` 로 표시했다. 소급 변환하지 않으며, `pending` 으로
  두면 있지도 않은 밀린 작업처럼 보인다

**검증**: 합성 HEVC(1080×1920) 업로드 → 큐 → 변환 → `playbackUrl` 발급까지 로컬 MinIO 로 확인.
결과물은 h264 High/yuv420p 이고 `moov` 가 `mdat` 앞에 있다(faststart). API 358 테스트 통과.

**FE 에 열린 것**: 3단계(reconcile)의 선행 조건이 풀렸다 —
[mobile-handover-lifecycle.md](./mobile-handover-lifecycle.md).

---

## 2026-09-09 (이어서) — SNS 게시 자동 끝내기 · 만료 예고 알림 (Dev A)

**SNS 게시가 성공하면 그 결과물을 쓰던 무비를 자동으로 끝낸다.** 다운로드 경로는 시스템 공유
시트가 저장 여부를 알려주지 않아 사용자의 명시적 행동을 받아야 하지만, 게시는 **서버가
플랫폼의 성공 응답을 직접 봤으므로** 추측이 아니다. `finishMovie` 의 본체를 `applyFinish` 로
뽑아 두 진입점이 나눠 쓴다. 틱톡의 `pending`(PULL_FROM_URL)은 제외한다 — 플랫폼이 나중에
영상을 가져가므로 지금 지우면 가져갈 대상이 사라진다. 자동 끝내기가 실패해도 게시는 성공으로
보고한다(이미 성공했고 `sns_uploads` 에 남았다).

**만료 예고 알림**(SNAP-13)이 서버에서 나간다: 삭제 **D-3 · D-1** 두 번, **KST 오전 10시**에
도는 별도 배치 `npm run media:notify-expiring -w apps/api` (dry-run 기본, `--yes` 발송).
값과 근거는 [decisions/expiry-notice-schedule.md](../decisions/expiry-notice-schedule.md).

정리 배치와 **일부러 분리했다** — 이유는 결정 문서의 "발송 시각" 절.

`notification_logs` 가 geofence 전용을 벗어났다(`NotificationKind` + nullable `location_id`).
발송보다 **먼저 행을 선점**하고 실패하면 되돌리며, `@@unique([userId, videoId, noticeDaysBefore])`
가 중복을 DB 에서 막는다. **dry-run 은 발송으로 치지 않는다**(이유는 같은 결정 문서 "함께 정한 것").

검증: `npm test -w apps/api` 374건 통과(만료 예고 13건 신규 · SNS 자동 끝내기 3건 신규).

---

## 2026-09-11 — 이미지 스모크 검사 · e2e 무비 경로 전환 (Dev A)

**빌드한 이미지가 실제로 뜨는지 CI 가 확인한다**(backlog E-4 닫힘). `deploy.yml` 이
**빌드 → 스모크 → 푸시** 순서가 됐고, 검사한 그 이미지에 태그만 붙여 올린다 — 다시 빌드하면
검사 대상과 배포 대상이 갈라진다. 전에는 Dockerfile 이 깨져도 CI 가 초록이었고 실행되지 않는
이미지가 `:latest` 로 올라갔다(실제로 두 번: BGM 자산 누락, `BGM_DIR` 경로 어긋남).

검사는 [`scripts/smoke-images.sh`](../../scripts/smoke-images.sh) 하나이고 로컬에서도 같은 명령으로
돈다(`npm run smoke:images`). API 는 compose 로 실제 기동해 `/health` 가 `db=connected` 를
돌려주는지 본다 — `status:ok` 만 보면 마이그레이션이 실패해도 통과한다. 워커는 이미지가 커서
기동 대신 정적 검사(BGM 자산·ffmpeg/ffprobe·워커 3종 임포트)를 하는데, **경로를 스크립트에
다시 적지 않고 `config.BGM_DIR` 에서 읽는다** — 다시 적으면 config 와 어긋나도 통과하고,
과거 결함이 정확히 그렇게 숨었다.

검증: 로컬에서 두 이미지를 빌드해 스모크 통과(`db=connected` 확인). `BGM_DIR` 을 일부러
어긋나게 준 실행이 exit 1 로 떨어지는 것까지 확인했다 — 통과만 하는 검사가 아니다.

**`media:e2e` 가 앱과 같은 길을 간다**: `POST /movies` → `POST /movies/{id}/export` → 편집 작업
폴링 → 무비에서 결과물 찾기. 옛 `POST /edit-jobs` 직접 호출은 한 릴리스 더 살아 있지만
(backlog A-1), 검증이 앱이 가지 않는 길을 확인하면 의미가 없다. 무비 상태가 `ready` 로
반영됐는지까지 함께 본다.

**같은 날, `S3_PUBLIC_ENDPOINT` 기동 경고**(backlog E-2 닫힘). SNS 는 우리가 준 URL 을 플랫폼이
직접 내려받으므로, 도달할 수 없는 주소면 **업로드를 시도해야 비로소 400** 이 난다 — 실패 시점이
설정 시점에서 멀어 "SNS 가 안 된다" 는 신고를 받고 나서야 설정을 본다. `snsUploadReadiness()` 가
기동 때 판정해 이유와 함께 한 줄 남긴다. 미설정만 보는 대신 **업로드 때와 같은 기준**을 쓴다 —
값이 있어도 `localhost` 나 사설 IP, http 면 결과는 같기 때문이다. 전부 mock 이면 경고하지 않는다.

---

## 2026-09-11 (이어서) — 무비 완성 알림의 서버 전환 (Dev A)

완료 알림이 앱의 로컬 알림에서 **서버 푸시**로 옮겨졌다. 발송 주체가 결정 사항이었고
([decisions/movie-ready-notification.md](../decisions/movie-ready-notification.md)),
**편집 워커(Python)가 큐에 넣고 Node 쪽 전용 워커가 꺼내 보낸다.**

워커가 FCM 을 직접 부르지 않는 이유, pub/sub 대신 큐인 이유, API 프로세스 밖에 두는 이유는 결정 문서에 있다.
조용한 시간대 판정은 [`lib/quiet-hours.ts`](../../apps/api/src/lib/quiet-hours.ts) 로 뽑아 장소 추천과
나눠 쓴다. 완성 알림은 조용한 시간대면 **버린다**.

검증: `npm test -w apps/api` 387건 통과(완성 알림 7건 신규). **Python 이 넣은 작업을 Node 가
실제로 꺼내는지** 로컬 Redis 로 확인했다 — 라이브러리가 갈라지면 테스트가 전부 초록인 채
알림만 도착하지 않는다.

---

## 2026-09-12 — 촬영 스냅 해상도 하드코딩 해소 (Dev A 트랙, 앱)

백로그 A-4 의 앱 선행 과제. 촬영 스냅은 카메라가 720p 로 찍는데도 `1080×1920` 세로 스탠드인을
치수로 저장했고, 가로로 든 폰의 촬영도 세로로 기록됐다. 기기 안에서는 참아졌지만 **서버가
원천이 된 뒤에는 스탠드인과 실측을 구분할 수 없어 백필이 불가능**하다 — 그래서 무비 서버 전환(A-1)
보다 먼저 닦았다.

**측정 경로**: `expo-video` 는 iOS `naturalSize`·Android `Format.width/height` 를 그대로 넘겨
**회전 플래그를 반영하지 않는다**(세로 촬영이 가로 치수로 읽힘). 대신 이미 추출 스냅이 쓰던
네이티브 `VideoTrim` 모듈의 회전 반영 읽기를 `probe(uri)` 로 분리해 노출했다(Swift·Kotlin 양쪽,
`trim` 의 출력 기술과 같은 코드). 앱 쪽은 `shared/lib/video-metadata` 가 네이티브 probe →
`expo-video` 길이 폴백으로 `{ durationSec, width, height }` 를 한 번에 돌려준다. Expo Go 처럼
모듈이 없는 곳에서는 길이만 측정되고 치수는 스탠드인으로 남는다.

**모델**: `Snap.dimensionsMeasured` 플래그를 `durationMeasured` 와 같은 꼴로 추가했다.
스탠드인은 **플래그 없이만** 기록되므로 나중에 `POST /videos` 에 치수를 실을 때 스탠드인을
실측처럼 보내는 일이 없다. `orientationOf`·`SNAP_STAND_IN_SIZE` 는 두 feature 에 중복돼 있던 것을
`entities/snap` 으로 올렸다. 스토어 액션은 `setMeasuredDuration` → `recordMeasurement`(길이·치수
각각 독립 보정, 변화 없으면 같은 객체 반환)로 일반화했고, 시작 시 백필도
`SnapDurationBackfill` → `SnapMetadataBackfill` 로 확장해 기존 라이브러리의 스탠드인을 고친다.

**서버 계약은 건드리지 않았다** — `createVideoBodySchema` 와 `Video` 모델에 치수 컬럼이 없다.
치수를 서버에 싣는 시점은 A-4 3단계(reconcile) 설계에서 정한다.

검증: `npm run verify:mobile` 통과 — 124 스위트 963건(신규: `video-metadata` 6건, `probeVideo` 4건,
스토어 보정 8건, 촬영·추출 치수 케이스). Swift 는 `swiftc -parse` 로 구문만 확인했고
**Kotlin 은 컴파일하지 않았다.** 네이티브 변경이라 dev build 재빌드가 필요하며, **실기기(Android)
검증은 아직이다** — 세로·가로 촬영 각각 저장된 `width/height/orientation` 과 기존 스냅의 백필을
확인해야 닫힌다. iOS 는 기기가 없어 미검증.

---

## 2026-09-12 (이어서) — 알림 탭 라우팅 · 무비 서버 전환 계획 (Dev A 트랙, 앱)

백로그 A-1 의 앱 항목 "푸시 탭 라우팅" 을 구현했다. `shared/lib/notifications` 에 탭 채널 어댑터를
추가하고(FCM `onNotificationOpenedApp`·`getInitialNotification`, expo-notifications 응답 리스너·
`getLastNotificationResponseAsync`), `_app/providers/notification-tap-router.tsx` 가 두 채널을 한 번씩
듣고 시작 시 각각 "앱을 연 탭"을 묻는다. 목적지는 순수 함수 `notificationTarget` 이 `kind` 로 정한다 —
`movie_ready`·`movie_failed` 는 그 무비, `snap_expiry` 는 라이브러리(SNAP-13). 네비게이터와 로그인이
준비되기 전에 온 탭은 보류하고 준비되는 순간 보낸다(cold start). 같은 탭이 두 채널로 오면 한 번만
움직인다(id 기억 + 같은 목적지 2초 창). 앱의 로컬 알림 데이터도 서버와 같은 `kind` 꼴로 바꿨다.

**정정한 사실**: 백로그가 "완료 알림이 두 번 온다"고 적었지만, 서버의 `notifyMovieReady` 는 결과물이
속한 서버 `Movie` 가 없으면(`no_movie`) 보내지 않고 앱은 아직 `POST /edit-jobs` 를 직접 쓴다 —
**지금은 서버 완성 푸시가 오지 않는다.** 로컬 알림 제거는 export 전환과 같은 변경에서 해야 한다.
같은 조사에서 `PATCH /auth/me` 가 `notificationEnabled` 를 받지 않아 앱 스위치가 서버 발송에 닿지
않는 틈을 찾아 B-6 으로 올렸다(스키마·라우트가 공동 소유).

**무비 서버 전환은 착수하지 않고 계획으로 남겼다**([archive/movie-server-transition.md](./movie-server-transition.md)).
34개 파일이 `entities/movie` 에 의존하고, 업로드 전 스냅을 담은 초안의 자리·진행 중 jobId 복구·
실패 안내 세 가지가 구조를 갈라 결정 없이 진행하면 되돌릴 비용이 크다. 훅 계약을 유지하는
"서버 캐시 + 아웃박스" 설계를 권했다.

검증: `npm run verify:mobile` 통과 — 126 스위트 981건(신규: 목적지 매핑 9건, 탭 라우터 9건).
**실기기 미검증** — Android 에서 FCM 과 expo-notifications 가 같은 탭을 둘 다 보고하는지, cold start
에서 무비까지 도달하는지 확인해야 닫힌다.

---

## 2026-09-12 (이어서) — 무비 서버 전환 · 끝내기 · 완료 알림 정리 (Dev A 트랙, 앱 + API)

권장안이 승인되어 [archive/movie-server-transition.md](./movie-server-transition.md) 의 순서대로
구현했다. 결정과 기각 대안은 [decisions/movie-client-cache.md](../decisions/movie-client-cache.md).

**API(계약 변경 3건 + 보정 1건)**: `Movie.jobId` 노출(목록은 결과물 id 를 모아 한 번에 조회) ·
`POST /movies` 의 `id`(앱이 정한 uuid, 같은 id 재전송은 멱등, 타인 id 는 409) · `PATCH` 의 `clips: []` 허용
(마지막 스냅을 지운 무비도 초안으로 남는다) · 취소된 작업은 읽기 시 `draft` 로 보정하고 결과물 포인터를
비운다(전에는 `failed`). OpenAPI 재생성, [api-spec.md](../api-spec.md) 갱신. 테스트 394건 통과.

**앱 — 엔티티**: `entities/movie` 스토어를 서버 무비의 **캐시 + 아웃박스**로 바꿨다. 훅 계약을 유지해 34개
소비자 파일은 그대로다. 로컬 쓰기는 `pending`(`create`/`update`)·버전을 남기고, 삭제는 `pendingDeletes` 로.
`api/movie.dto.ts`(양방향 매퍼 — 스타일↔프리셋, 트림 ms, `videoId`↔`snapId` 는 주입된 리졸버) ·
`api/get-movies.ts`(전 페이지) · `api/write-movie.ts`(create/update/delete/export/finish) ·
`api/mock-movies.ts`(인메모리 목 서버) · `lib/movie-sync.ts`(순수 병합: pending 은 로컬, 나머지는 서버,
이 기기만 아는 렌더·진행률·실패 문구는 같은 결과물일 때 유지, 본 적 없는 결과물은 `adopted` 작업으로 러너에
넘김, `settledJobId` 로 재채택 방지). 무비 id 는 `shared/lib/uuid`. `SnapRef` 에 `videoId`·`unavailable`,
`Movie` 에 `finishedAt`·`settledJobId`, `MovieJob` 에 `adopted`. 기존 로컬 무비는 스토어 v1 마이그레이션이
비운다(이관 안 함, 결정 그대로). 자막 기본값을 서버와 같이 `false` 로(MOV-9).

**앱 — 기능**: `features/compose-movie` 에 `MovieSyncGate`(`use-movie-sync.ts`: 로그인·포그라운드 복귀 시
읽기, 아웃박스·업로드 상태 변화 시 드레인; `movie-outbox.ts`: 무비 하나 전송, 스냅 리졸버) 추가.
`startGeneration` 은 아웃박스를 먼저 보낸 뒤 `POST /movies/{id}/export`. `create-edit-job.ts` 삭제.
러너는 `completeMovieJob`(개명) 을 쓰고 **완료 알림을 띄우지 않는다** — 서버 푸시가 대신한다; 실패 알림만
로컬로 남기며 `adopted` 작업의 실패는 알리지 않는다. 새 기능 `features/finish-movie`(끝내기: 서버 먼저,
스토어는 응답에 따름; 확인 시트 문구). 화면: ⋯ 시트에 끝내기 단계, 공유 시트가 올라온 뒤(`useShareMovie.offered`)
감상 화면에 끝내기 안내, 타임라인에 만료 컷 "만료" 배지(삭제된 원본과 문구 구분). 앱 프로바이더에
`MovieSyncGate` 마운트.

**문서**: 모바일 기능 문서 7개(movie.md 에 "Movies live on the server"·"Finishing it" 절), specs
MOV-2·17·18·19·NTF-6·SNAP-12 상태, decisions README, 인수인계·계획 문서 archive 이동, backlog A-1 정리.

**검증**: `npm run verify:mobile` 통과 — 128 스위트 1,016건(신규: 병합 17건, 스토어 아웃박스 14건, 끝내기 4건,
uuid 3건, 컴포즈·러너 갱신). API 394건. **실기기 미검증** — 여섯 가지 확인 항목은 backlog A-1.

---

## 2026-09-15 — 알림 설정이 서버에 닿는다 (Dev A)

**사용자가 끈 알림을 서버가 계속 보내고 있었다**(backlog B-6 의 서버 쪽을 닫았다 — 앱 쪽은 남음) —
서버 발송 세 종류가 `notificationEnabled` 하나로만 판정되는데 `PATCH /auth/me` 가 그 필드를 받지 않았다.
이제 `PATCH /auth/me` 가 `notificationEnabled`(전체) · `locationNotificationEnabled` ·
`movieNotificationEnabled` · `quietStart` · `quietEnd` 를 받고, 만료 예고는 전체 스위치만 따른다. 종류별로
나눈 이유와 만료 예고만 예외인 이유는 [decisions/notification-preferences.md](../decisions/notification-preferences.md).

검증: `npm test -w apps/api` 403건 통과(신규 9건 — 저장·부분 수정·기본값·범위 검증과, 종류별
스위치가 서로 간섭하지 않는 것, 그리고 **무비·위치를 꺼도 만료 예고는 나간다**는 것).

---

## 2026-09-15 (이어서) — 만료 시각을 모르는 SNS 연동 (Dev A)

`token_expires_at = null` 인 연동(개인 계정 시절 장기 토큰 교환이 실패해 생긴 상태)은 지금까지
만료 검사도 갱신도 없이 그냥 쓰였다. 그러면 그 토큰은 **조용히 만료되고**, 그 뒤 게시는 우리 쪽
"재연동 안내" 가 아니라 플랫폼 에러로 실패해 사용자가 원인을 알 수 없다(backlog E-1 코드 쪽 닫힘).

**가짜 만료값을 넣지 않았다.** 지어낸 값은 멀쩡한 토큰에 "재연동 필요" 를 띄우고, 그쪽이 더 나쁘다.
대신 **업로드 때 갱신을 한 번 시도해 진짜 값을 알아낸다** — 성공하면 데이터가 실제로 고쳐지고,
실패하면 오늘과 똑같이 현재 토큰으로 진행한다. 상태를 고치려다 되던 게시를 깨지 않는 것이 요점이다.

게시가 실패하면 재연동을 안내한다. 이 안내는 `AppError` 재던지기보다 **앞**에 두어야 한다 —
플랫폼 거절은 클라이언트가 이미 `AppError` 로 감싸 올리므로, 뒤에 두면 가장 흔한 경로가 안내를
받지 못한다(테스트를 쓰다가 실제로 이 순서 때문에 실패했다). 원인(플랫폼 응답)은 사후 추적에
필요하므로 지우지 않고 뒤에 덧붙인다.

`GET /sns/connections` 가 `tokenExpiresAt` 을 싣는다. **`null` 은 "모른다"** 이지 "만료되지
않는다" 가 아니며, 앱은 그 경우와 이미 지난 경우에 재연동을 안내할 수 있다.

검증: `npm test -w apps/api` 409건 통과(신규 6건). **남은 것은 운영 조치 하나** — 현재 저장된
인스타 연동을 재연동하면 장기 토큰이 발급돼 만료 시각이 채워진다([backlog.md](../backlog.md) G).

---

## 2026-09-15 (이어서) — 산출물 계약 테스트와 CI 의 ffmpeg (Dev A)

파이썬 테스트는 "ffmpeg 없이 돈다" 가 설계 원칙이라 **명령줄만** 검사해 왔다. 그 방식으로는
잡히지 않는 결함이 실제로 두 번 났다 — 쇼츠 앱인데 편집 결과가 **가로 1920x1080** 으로 나온 것,
배포본이 아이폰 원본 그대로라 다른 기기에서 재생되지 않은 것. 둘 다 명령줄은 멀쩡했다.

`tests/test_ffmpeg_contract.py` 가 진짜 ffmpeg 을 돌려 **파일**을 본다: 가로 입력을 넣어도
1080x1920 세로가 나오는지, H.264/yuv420p 인지, faststart 인지(moov 박스 위치를 직접 읽는다),
길이가 실측값인지, 세로 상한을 넘지 않고 작은 원본을 키우지도 않는지, 무음 원본도 변환되는지.
입력은 저장소에 두지 않고 `lavfi` 로 만든다 — 바이너리 픽스처는 커지고 썩는다.

**관행은 깨지 않았다.** ffmpeg 이 없으면 건너뛴다. 다만 CI 에서까지 조용히 건너뛰면 검사가
있으나 마나이므로 `REQUIRE_FFMPEG=1` 이면 건너뛰지 않고 **실패**하며, CI 가 그 값을 준다.

검증: 파이썬 134건 통과(신규 6건). **검사가 실제로 잡는지도 확인했다** — 기본 렌더 스펙을 일부러
가로로 되돌리자 `(1920, 1080) != (1080, 1920)` 으로 실패했다. 통과만 하는 검사는 검사가 아니다.

---

## 2026-09-15 (이어서) — 스트레스 실검증과 HDR 색 태그 결함 (Dev A)

실제 아이폰 영상(1080x1920 H.264 High **60fps**, 데이터 트랙 5개)으로 남은 스트레스 케이스를
검증했다(backlog F).

- **10클립 상한** — 43.5초 산출물, 1080x1920 세로, 60fps 원본이 30fps 로 정규화되고 데이터
  트랙은 떨어졌다. 정상
- **장시간** — 원본을 이어붙인 182초(358MB) 단일 클립. 업로드부터 완료까지 **96초**
  (`EDIT_TIMEOUT_SECONDS=600` 대비 여유). 산출물 182.13초. 정상

**HDR 에서 결함을 찾았다.** 편집 결과물과 배포 렌디션 **둘 다** 픽셀은 8bit 로 내려놓고 색
메타데이터를 `smpte2084`/`bt2020` 으로 남기고 있었다. 플레이어는 그 태그를 보고 이미 평평해진
영상에 **HDR 톤매핑을 한 번 더** 건다 — 코드 주석이 예상한 "다소 어둡게" 가 아니라 눈에 띄게
망가지는 경로다. 파일이 자기 자신에 대해 거짓말을 하고 있었다.

고치면서 알게 된 것 둘:

- **워커 이미지(Debian)에는 `zscale`+`tonemap` 이 있다.** 코드는 "많은 빌드에 없다" 는 이유로
  쓰지 않고 있었는데, 없는 쪽은 macOS Homebrew 빌드였다. 이제 있으면 제대로 톤매핑하고
  없으면 기존 방식으로 물러난다(`pipeline/hdr.py`).
- **출력 인자 `-color_trc`/`-color_primaries` 만으로는 태그가 안 바뀐다.** mov/mp4 muxer 가
  입력의 `colr` 박스를 다시 써서 `colorspace` 만 바뀌고 전달함수·프라이머리는 PQ/bt2020 으로
  남는다(실측 확인). 프레임 속성을 바꾸는 `setparams` 필터라야 인코더·muxer 가 함께 따라온다.

검증: 파이썬 137건 통과(HDR 계약 3건 신규). **양쪽 빌드에서 확인했다** — 로컬(zscale 없음,
폴백 경로)과 워커 이미지(zscale 있음, 톤매핑 경로) 모두 산출물이 `bt709,bt709,bt709` 로 나온다.
실제 e2e 도 다시 돌려 `bt2020nc,smpte2084,bt2020` → `bt709,bt709,bt709` 로 바뀐 것을 확인했다.

**남은 것**: 돌비비전 실물은 아직 검증하지 못했다(합성 HDR10 으로만 확인, [backlog.md](../backlog.md) F). `media:e2e` 에
`--token` 을 추가해 Supabase 없이 auth 스텁 토큰으로도 돌릴 수 있게 했다.

---

## 2026-09-23 — iOS 시뮬레이터 모바일 검증 + 첫 로그인 경합 수정

iPhone 17 시뮬레이터(Xcode 27, Expo Go 57.0.9)에서 앱을 실제 로컬 API 에 붙여 검증했다.
로그인 전 화면(로그인·가입·재설정, 유효성 메시지, OS 다크 전환), 4개 탭, 설정 5화면(크레딧·알림·
테마·관심사·소셜), 뷰파인더 모달, 재시작 후 세션 유지가 모두 정상이었다. 이 Mac 에는 Simulator.app 이
없고 Xcode 번들 안의 `DeviceHub.app` 이 시뮬레이터 창이다 — 상세 절차는
[`apps/mobile/docs/workflows/local-development-and-testing.md`](../../apps/mobile/docs/workflows/local-development-and-testing.md).

**첫 로그인에서 500 을 찾았다.** 새 계정이 앱에 들어가면 템플릿·크레딧·무비 요청이 동시에 나가고,
인증 미들웨어의 `resolveUser` 가 요청마다 Prisma `user.upsert` 를 돈다. 이 upsert 는 원자적이지 않아
(findUnique → create) 같은 `supabase_uid` 의 create 가 경합했고, 진 쪽이 P2002 로 500 을 받았다 —
앱은 그 결과 무비 탭을 빈 상태로 보여줬다. 유니크 위반을 "이미 만들어졌다"로 읽어 그 행을 다시
조회하도록 고쳤다(`apps/api/src/services/user.service.ts`). 유니크 위반이 아닌 에러는 그대로 전파한다.

검증: `test/auth.test.ts` 에 3건 추가 — upsert 가 P2002 를 던지는 결정적 재현(수정 전 실패 확인),
다른 에러의 전파, 같은 sub 6개 동시 요청. API 전체 412건 + tsc 통과.

**남은 것**: 재설정 화면 카피가 "인증 코드"라 말하지만 구현은 딥링크다(모바일, 미수정). 실제 촬영·
푸시·햅틱은 시뮬레이터에서 검증 대상이 아니며 iOS 실기기는 없다.

---

## 2026-09-24 — 앱 전반 카피 정리(UX 검토 P0·P1)

시뮬레이터 화면과 전체 문구 인벤토리를 [`ux-writing.md`](../../apps/mobile/docs/ux/ux-writing.md) 기준으로
검토하고, 오너 결정에 따라 동작과 어긋난 문구(P0)와 말투·용어 불일치(P1)를 고쳤다. 화면 구조는 바꾸지 않았다.

- **동작과 어긋나던 문구**: 재설정·미인증 안내의 "인증 코드" → 재설정/인증 **링크**. 구매 기능이 없는데
  "크레딧에서 채울 수 있어요"라던 안내는 광고 보상이 켜져 있을 때만 광고로 받는 길을 안내한다.
  아무 동작도 없던 촬영 리마인더·하루 빈도·소셜 연결은 `준비 중` 행으로 바꿨다(값은 보존).
- **서버 원문 노출 제거**: `rejected` 거절 메시지·`errorDetail`·워커 진행 단계 문자열을 화면에 그대로
  보여주지 않는다. 진행 단계는 `features/compose-movie/lib/edit-step-label.ts` 가 앱 문구로 옮긴다.
- **용어·말투 통일**: 스냅/컷/무비/만들기/올리기/삭제로 고정하고(생성·업로드·지우기·칸·슬롯·장면·
  완성 파일 제거), 합니다체·~시 존대를 해요체로, `주세요` 띄어쓰기를 통일했다. 카메라 버튼은 `찍기`,
  확인 배지는 `담김`. 서버에서 결과 파일을 지우는 "끝내기"는 화면에서 `정리하기`로 부른다.
- **첫 화면**: 헤드라인 "3초씩 찍으면 / 한 편의 무비가 돼요"(브랜드 오기 "스냅리" 제거).
- **푸시(API)**: 무비 완성·스냅 만료 예고·위치 알림의 제목/본문을 앱 용어의 해요체로 바꾸고 위치 시드
  문구도 맞췄다. 템플릿 설명은 마이그레이션 `20260924000000_reword_movie_template_descriptions` 로 갱신
  (운영자가 고친 설명은 건드리지 않는다).

검증: `npm run verify:mobile`(1035건), API 전체 412건 통과. iPhone 17 시뮬레이터에서 스튜디오·나·알림·
소셜 연결 화면의 새 문구를 확인했다. 로그인 화면·촬영·추출·무비 화면은 코드로만 확인했다.

---

## 2026-09-25 — MinIO 이미지를 소스 빌드 GHCR 미러로(quay.io 차단 복구)

quay.io 의 `minio/minio` 가 익명 pull 에 401 을 돌려주기 시작해 CI 통합 테스트와 Deploy 스모크가
MinIO 기동 단계에서 깨졌다(backlog E-7 이 예고한 상황). 아카이브된 업스트림 소스의 같은 릴리스
(`RELEASE.2025-09-07T16-13-09Z`, 커밋 `07c3a42` 고정)를 [`deploy/minio/Dockerfile`](../../deploy/minio/Dockerfile)
로 빌드하고 [`minio-image.yml`](../../.github/workflows/minio-image.yml) 이 main 에서 amd64·arm64 로 GHCR 에
올린다. compose 2곳과 CI 가 그 이미지를 가리키고, 받을 수 없으면(비공개 패키지 · 미러 전)
[`scripts/ensure-minio-image.sh`](../../scripts/ensure-minio-image.sh) 가 같은 Dockerfile 로 빌드한다.

검증: 로컬 빌드 이미지의 `minio --version` 이 quay.io 이미지와 같은 버전·커밋을 찍는다. amd64·arm64
buildx 빌드 성공. 개발 MinIO 를 새 이미지로 교체(기존 볼륨 데이터 유지)한 뒤 `npm test -w apps/api`
412건 통과, 컨테이너 안 curl 헬스체크 200. GitHub Actions 에서의 실행(push · 스모크)은 PR 에서 확인한다.

---

## 2026-09-26 — Android 에뮬레이터 모바일 검증 + 촬영 화면 라이브러리 갱신 수정

Android 35 에뮬레이터(google_apis arm64)에 dev client 디버그 APK 를 올려 로컬 API·MinIO·편집/렌디션
워커에 붙여 검증했다. 4개 탭, 설정 5화면, 다크 테마, 카메라·마이크·위치·알림 권한 요청, 촬영, 무비 편집
미리보기, 무비 만들기 → 워커 편집 → 완성 화면 재생, 크레딧 100 차감까지 정상이었다. 위치 알림은
"항상 허용" 없이 돌아오는 경로(직전 수정)와 허용 후 켜는 경로 모두 확인했다. iOS 에서 보였던 탭 빈 화면은
Android 에서 재현되지 않았다.

**촬영 화면 라이브러리가 방금 찍은 스냅을 몰랐다.** 좌하단 `스냅 N` 과 `찍은 스냅` 목록은 디스크의 녹화
파일을 화면이 열릴 때 한 번만 읽고, 촬영은 capture-moment 액션이 파일을 따로 저장해서, 찍은 뒤에도 촬영
전 개수가 남았다(스냅 탭에는 정상 반영). 저장이 끝나면 세션이 `onCaptureCollected` 를 부르고 recorder 가
라이브러리를 다시 읽도록 고쳤다(`apps/mobile/src/pages/capture-record/model/`).

검증: `npm run verify:mobile`(1037건) 통과 — 저장 성공 시 1회 호출·저장 실패 시 미호출 단언 추가.
에뮬레이터에서 촬영 직후 `스냅 2` 와 목록 2개로 바뀌는 것을 확인했다. 기존 계정은 로컬 크레딧이 0이라
(가입 보너스 0 · 광고 보상 꺼짐) dev DB 원장에 `promo` 500 을 넣고 무비 생성을 확인했다. 호스트에
Python 3.11·ffmpeg 가 없어 워커는 `apps/ai-worker/Dockerfile` 이미지를 dev 인프라에 붙여 돌렸다.

---

## 2026-09-26 (이어서) — 비어 보이던 화면 채우기 + 나 탭 크레딧 잔액 갱신 수정

Android 에뮬레이터에서 화면을 돌며 콘텐츠가 비어 보이는 화면을 골라, 설명 문구 없이(프로젝트 규칙)
사용자 자신의 스냅과 상태 표시로 채웠다.

- **스튜디오**: `스냅 골라 새 무비` 블록에 스냅 탭 헤더와 같은 `N개 · m:ss` 와 최신 스냅 5개 프레임을
  붙였다(스냅 0개면 기존 한 줄). 템플릿 카드는 슬롯 수만큼의 스트립으로 시작한다 — 채워진 슬롯은 내 스냅
  프레임, 빈 슬롯은 점선. 스트립은 템플릿 화면과 같은 `spreadAcrossSlots` 배치(`TemplateOffer.slots`)다.
- **무비 화면**: 완성 무비 시청 화면이 검은 9:16 으로 열리던 것을, 첫 재생 전까지 렌더 커버(없으면 첫 컷
  프레임) 포스터로 채웠다. 편집 화면 스테이지는 처음 건드리기 전까지 첫 컷의 트림 시작 프레임을 보여 준다.
  원인은 일시정지로 연 플레이어가 `onFirstFrameRender` 를 보내고도 그 프레임이 화면에 안 나오는 것이라
  (에뮬레이터에서 관찰 — seek·재생 후에는 정상), 포스터를 첫 프레임 이벤트가 아니라 재생/조작 시점에 내린다.
- **크레딧 화면**: 잔액 아래 줄이 `보유 크레딧 · 무비 N편을 만들 수 있어요`(100 미만·음수·로딩은 기존 문구).
- **버그**: 무비 생성이 크레딧을 예약해도 나 탭 크레딧 줄이 이전 잔액(500)을 계속 보였다. 생성 시작 경로가
  크레딧 쿼리를 무효화하지 않았기 때문이다. 진행 중 실행 목록이 바뀔 때마다 잔액을 다시 읽는
  `useRunCreditRefresh` 를 `MovieGenerationGate` 에 붙였다(예약·실패/취소 환급 모두 서버에서 일어난다).
- 같은 스냅을 여러 곳에 동시에 그리게 되어, 썸네일 훅이 같은 프레임의 추출을 공유하도록 했고
  `VideoFrame` 에 시간 지정(`atSec`)을 더했다.

검증: `npm run verify:mobile`(1054건) 통과 — 실행 시작·실패·취소·교체 시 잔액 무효화와 진행률 보고 시
미무효화, 잔액 문구 경계값, 템플릿 슬롯 배치, 동시 추출 1회·시간별 프레임 분리 단언 추가. 에뮬레이터에서
스튜디오·템플릿 스트립, 시청 화면 포스터 → 재생 → 끝, 편집 화면 포스터 → 스크럽, 크레딧 문구를 확인했고,
새 초안 무비를 만든 뒤 크레딧 화면을 열지 않고 나 탭이 400 → 300 으로 바뀌는 것을 확인했다. iOS 와 실기기는
확인하지 않았다.

---

## 2026-09-26 (이어서) — 나 탭의 `준비 중` 행 정리(관심사·소셜 연결)

**관심사는 고른 값이 어디에도 닿지 않았다.** 앱은 기기에만 저장하고 `PATCH /auth/me` 를 부르지 않았고,
서버의 위치 알림 판단(`location.service.ts`)은 알림 스위치·조용한 시간·쿨다운만 본다. 촬영
리마인더(2026-09-24)와 같은 기준으로 나 탭 행을 이동 없는 `준비 중` 으로 바꾸고 `/settings/interests`
화면을 걷었다(오너 결정). 기기에 저장된 기존 선택값은 지우지 않았다. 스펙 ACC-5 를 `부분` 으로 고쳤다 —
서버는 닉네임·아바타·관심사를 받지만 앱에는 닉네임·아바타 수정 화면도 없다. 남은 일은 backlog A-9.
`me.md`·`location-and-push-notifications.md` 의 "관심사는 서버에서 적용된다" 는 서술도 바로잡았다.

**소셜 연결도 같은 모양으로 맞췄다.** 행이 `준비 중` 인데 눌러 들어가면 플랫폼별 `준비 중` 두 줄만 있는
화면이었다. 행이 `TikTok · Instagram 준비 중` 을 직접 보여 주고 이동하지 않으며, `/settings/social`
화면은 첫 연결 컨트롤이 생길 때 되돌린다. 두 `준비 중` 행이 이제 같은 방식으로 동작한다.

검증: `npm run verify:mobile` 통과 — 두 행이 버튼이 아니고 읽는 값이 맞다는 단언 추가. Android 에뮬레이터에서
두 행을 눌러도 이동하지 않는 것을 확인했다. iOS 와 실기기는 확인하지 않았다.

---

## 2026-09-27 — 영상 삭제가 자기가 소유한 객체만 지운다(backlog E-8)

스냅 reconcile 계획(0단계)의 선행 결함 둘을 재현하고 고쳤다. 영상을 지우는 모든 경로(사용자 삭제 ·
기간 만료 · 남은 객체 회수)가 [`video-assets.ts`](../../apps/api/src/services/video-assets.ts) 의 한 규칙으로
"그 행이 소유한 객체"만 지운다.

- **무비 생성을 취소하면 원본 스냅 파일이 지워졌다.** 결과물 행은 원본 스냅의 S3 키를 복사해 들고 있는데
  (`createEditJob`), 취소나 `DELETE /videos/{id}` 로 soft-delete 된 결과물을 남은 객체 회수 배치가 훑으면서
  그 키, 즉 원본 스냅의 파일을 지웠다. 원본 행은 `ready` 로 남아 목록에 떴다. 결과물은 이제 원본 키를
  소유하지 않는다(컬럼은 그대로 — 워커는 읽지 않는다).
- **렌디션이 지워지지 않았다.** 사용자 삭제·만료·회수 어디에도 `renditionS3Key` 가 없어, 지운 스냅의 재생
  가능한 사본이 계정 purge 전까지 남았다. 셋 다 렌디션을 지운다. 렌디션 워커는 변환 중 스냅이 지워져
  키를 반영하지 못하면 올려 둔 배포본·썸네일을 스스로 지운다(키가 행에 없어서 회수 배치도 모른다).

검증: `test/retention.test.ts` 에 실제 MinIO 객체로 5건 추가 — **수정 전 코드에서 5건 모두 실패**,
수정 후 통과. 워커 `tests/test_rendition_worker.py` 3건(워커 이미지에서 실행).

**이미 파일을 잃은 원본 행 찾기**: 회수 배치가 결과물 행의 키를 비워 두므로 DB 조인으로는 흔적이 없다.
`kind='source' AND status='ready' AND deleted_at IS NULL` 행마다 `s3_key` 를 HEAD 해 없는 것을 찾는다
(렌디션은 남아 있을 수 있다). 개발 DB 의 업로드 완료 스냅 5건은 모두 원본이 있다.

---

## 2026-09-27 (이어서) — 스냅이 기기와 재설치를 넘어 보인다(reconcile 1~3단계)

[`archive/snap-reconcile.md`](./snap-reconcile.md) 의 1~3단계와
[`decisions/snap-sync-across-devices.md`](../decisions/snap-sync-across-devices.md) 의 규칙(SNAP-15·16,
SNAP-12 범위 조정)을 구현했다.

- **서버**: `GET /videos` 항목에 `width`·`height`(렌디션 워커가 배포본에서 회전 반영해 잰다)·`clientId`·
  `expiresAt`(보관 정책에서 유도 — 정리 배치와 같은 식) 추가, 정렬에 `id` 동점 처리. `POST /videos/lookup`
  (목록에서 사라진 스냅의 사유 — `live` / `removed` + `user`·`expired`, 남의 id 는 없는 id 와 같다).
  `POST /videos` 가 `clientId` 를 받는다. 마이그레이션 `20260927000000_add_video_dimensions_and_client_id`.
  테스트 환경의 렌디션 큐 이름을 `renditions-test` 로 나눴다(개발 워커가 테스트 작업을 가져가지 않게).
- **앱**: `features/reconcile-snaps`(`SnapReconcileGate`) 가 계정이 정해질 때와 포그라운드 복귀마다 서버
  목록을 끝까지 읽고, 목록에서 빠진 것만 lookup 으로 묻는다. 다른 기기 스냅은 서버 `videoId` 를 id 로
  `origin: 'server'`·`uploaded` 로 들어오고(업로드되지 않는다), 섬네일은 서버 것을 먼저 받아 두며, 영상은
  처음 재생할 때 받는다(`<cache>/server-snaps/`, 렌디션 우선). 다른 기기에서 지운 스냅은 원본까지 지우고,
  만료된 스냅은 `만료됨`(촬영한 기기는 파일을 둔다), 무비에는 담을 수 없다. 마지막 3일은 `N일 남음`.
  목록에 없다는 이유만으로는 지우지 않고, 한 단계라도 실패하거나 계정이 바뀌면 아무것도 쓰지 않는다.
  새 기기에서 만료 컷은 원본이 없어도 "만료"로 읽는다. 삭제 확인 문구가 모든 기기에서 지워진다고 말한다.

검증: API 전체 테스트, 워커 테스트 141건(회전 치수 계약 1건 신규), `npm run verify:mobile` 통과
(병합 규칙 17건 · 실제 스토어 통합 6건 · 파일 받기 5건 등 신규). **Android 에뮬레이터 + 로컬 서버 실검증**:
개발 DB·MinIO 에 "다른 기기 스냅" 2개를 넣고 렌디션 워커로 배포본을 만들자(720×1280 기록), 포그라운드
복귀에 스냅 5 → 7개, 서버 섬네일 표시, 13일 된 스냅에 `2일 남음`, 탭하면 `불러오는 중…` 뒤 캐시에 배포본이
받아졌다. 서버에서 삭제·만료로 바꾸자 하나는 사라지고(받은 사본도 삭제) 하나는 `만료됨`, 그 스냅으로
새 무비를 만들면 거절됐다. 넣었던 행·객체는 지웠다.

**남은 것**: 에뮬레이터의 H.264 디코더가 Main/High 프로필을 검은 화면으로 그려(받은 배포본과 기존 무비
완성본 모두, 자체 녹화인 Baseline 은 정상) 받은 사본의 화면은 확인하지 못했다. 재설치(로그인을 여기서 할 수
없다)·두 번째 실기기·iOS 는 backlog A-4 의 실기기 검증 항목에 남는다.

---

## 2026-09-27 (이어서) — 스냅 reconcile 실기기 검증(휴대폰 · 에뮬레이터 · iOS 시뮬레이터)

오너의 Galaxy S22 Ultra(무선 adb, 9월 25일 dev 빌드에 새 JS 번들), Android 35 에뮬레이터, iPhone 17 시뮬레이터
(Expo Go)를 **같은 계정**으로 로컬 API·MinIO·렌디션 워커에 붙여 계획 §5.5 의 시나리오를 돌렸다. 버림용 스냅은
에뮬레이터 카메라(가상 장면)로 찍어 쓰고, 끝난 뒤 모든 기기에서 지웠다 — 기기와 서버 모두 원래대로 스냅 5개다.

- **① 도착**: 에뮬레이터에서 찍은 스냅이 휴대폰과 iOS 에 서버 섬네일로 나타났다. 등록에 `clientId` 가 실리고
  렌디션 워커가 720×1280 을 기록했다. **받은 사본은 휴대폰과 iOS 에서 정상 재생된다** — 에뮬레이터에서 검게 나온
  것은 에뮬레이터 디코더의 한계였다(같은 High 프로필 파일).
- **② 새 기기·재설치**: 자기 스냅이 없던 iOS 시뮬레이터가 계정의 스냅 5개를 모두 서버에서 받아 왔다
  (`origin: server`). 이어서 **휴대폰에서 앱을 지우고 다시 설치해 로그인**하자, 앱 삭제로 기기에서 사라진 자기 스냅
  3개를 포함해 서버의 스냅 5개가 모두 다른 기기 스냅으로 돌아왔다. 치수 기록 이전에 올라온 행이라 크기는 스탠드인
  (1080×1920)이고, 파일을 받은 뒤 다음 시작의 백필이 잰다. 무비 2개도 돌아왔다(오너 확인 — 무비 서버 전환
  검증 A-1 ⑤ 도 이로써 통과).
- **⑤ 계정 전환**: 다른 계정으로 로그인하면 이 계정의 스냅이 보이지 않는 것을 오너가 확인했다.
- **⑥ 오프라인 복귀**: 오프라인에서 돌아와도 아무것도 지워지지 않는 것을 오너가 확인했다.
- **③ 삭제 전파**: 휴대폰에서 지운 스냅이 서버에서 `user` 로 지워지고(원본·렌디션·섬네일 즉시 삭제), 그 스냅을
  찍은 에뮬레이터에서 포그라운드 복귀에 원본 파일까지 사라졌다.
- **④ 만료**: 업로드 시각을 16일 전으로 당기고 **실제 정리 배치**(`media:purge-expired --yes`)를 돌렸다 — 드라이런
  대상은 버림용 스냅뿐이었고, 배치가 원본과 함께 **렌디션까지** 지웠다(E-8 수정의 실동작). 휴대폰과 에뮬레이터 모두
  "만료됨"이 됐고, 찍은 에뮬레이터는 파일을 남긴 채 "보관 기간이 끝났어요" 와 함께 재생했다.

**남은 것**: iPhone 실기기의 HEVC 스냅 → Android 는 iOS 출시 전으로 옮겼다 — 1차 운영 배포 대상은 Android 만이다
(2026-09-27 오너, backlog A-4). 곁가지로 재생 화면의 길이 표시가 라이트 테마에서 검은 바탕 위 어두운
글자로 거의 보이지 않는 것을 찾았다(이번 변경 이전부터 있던 문제, 별도 작업).

무선 adb 참고: 휴대폰이 `adb mdns services` 에 안 보이고 `adb connect` 가 "No route to host" 로 실패했는데, 같은
셸의 `ping` 은 됐다. 먼저 떠 있던 adb 서버가 macOS 로컬 네트워크 권한 없이 시작된 것이었다 — `adb kill-server &&
adb start-server` 로 풀렸고 기존 페어링은 그대로 유효했다.

## 2026-09-28 — 경계별 전환의 편집 화면 미리보기 검증(임시 화면)

AI 편집 초안은 경계마다 고를 수 있는 전환을 편집 화면에서 보여줘야 한다(MOV-22). 무대(`cut-player.tsx`)와 같은
구조 — `expo-video` 플레이어 둘, Android 는 `surfaceType="textureView"`, 보이는 슬롯을 불투명도로 고름 — 의 임시 화면을
만들어 v1 전환을 돌렸다(검증 뒤 삭제, 커밋하지 않음). 테스트 클립은 단색 3개(720×1280, H.264 Baseline — 에뮬레이터
디코더가 Main/High 를 검게 그리기 때문)이고, 각 클립의 0.5~2.5초 구간만 써서 앞뒤 0.5초를 여분 프레임으로 남겼다.
화면 녹화를 30fps 로 풀어 무대 세 영역(왼쪽·가운데·오른쪽)의 색을 프레임마다 분류해 판정했다.

| 전환 | iOS 시뮬레이터(iPhone 17, Expo Go) | Android 에뮬레이터(API 35, dev 빌드) |
|---|---|---|
| `hardcut` | ✅ | ✅ |
| `crossfade` — 영상 두 개를 겹쳐 불투명도로 | ✅ 두 색이 섞인 프레임이 0.8초 동안 이어진다 | ❌ 위 영상이 반투명인 동안 아래 영상이 검다 — 검정에서 페이드인하는 것처럼 보인다(4회 모두) |
| `crossfade` — 나가는 컷의 마지막 프레임을 이미지로 올려 사라지게 | 돌리지 않음 | ✅ |
| `dip` · `flash` | ✅ | ✅ |
| `zoompunch`(1.12 → 1.0) | ✅ | ✅ |
| `slide` | ✅ 오른쪽부터 바뀐다 | ✅ 같다 — 영상 두 개가 동시에 재생되며 둘 다 보인다 |

- 전환 시작 시각의 오차(플레이어 시계 기준)는 iOS 3~16ms, Android 에뮬레이터 2~50ms 였다. `timeUpdate` 를 50ms
  간격으로 받고 남은 시간을 타이머로 보정했다. 지금 무대는 250ms 간격이라 그대로 쓰면 전환이 최대 250ms 늦는다.
- `crossfade`·`slide` 는 계획의 여분 프레임 규칙(경계를 중심으로 나가는 컷은 뒤 여분까지, 들어오는 컷은 앞 여분부터)으로
  구현했다. 여분 없이 들어오는 전환(`zoompunch`)의 컷은 자른 구간의 시작 프레임(한 프레임 이내)에서 시작했다.
- Android 에뮬레이터에서는 반투명 단색 아래 영상(`dip`·`flash`)과 나란한 영상 두 개(`slide`)는 그려지고, **반투명 영상
  아래의 영상만** 검다. 디코더 수가 아니라 합성의 문제다. 에뮬레이터는 전환과 무관하게 평소 재생 중에도 0.5초마다
  무대가 1~2프레임 검게 깜빡였는데 iOS 에서는 없었다 — 에뮬레이터 렌더링의 현상으로 본다.
- 오너의 Galaxy 는 이번에 무선 adb 로 잡히지 않아 실기기는 확인하지 못했다. 남은 확인은 backlog A-11.

## 2026-09-29 — 스냅 분석 옵트인 동의(ANA-5 · REC-4)

법무 검토 전에도 **동의한 사용자에게만** 분석을 켜는 결정([decisions/snap-content-analysis.md](../decisions/snap-content-analysis.md)
§6.1)을 구현했다.

- **서버**: 동의 기록 `user_consents`(종류 · 문구 버전 · 동의 시각 · 철회 시각, 마이그레이션
  `20260929000000_add_user_consents`), `GET`·`POST`·`DELETE /auth/me/analysis-consent`. 분석 요청과 추천 요청은
  서버 스위치(`MOVIE_RECOMMENDATION_ENABLED`)와 현재 문구 버전(`2026-09-29`)의 동의가 모두 있어야 받는다 — 스위치가
  꺼져 있으면 503, 동의가 없으면 403, 옛 문구로 동의하려 하면 409. 전에는 분석 요청에 스위치 검사도 없었다. 철회는 한
  트랜잭션에서 동의에 철회 시각을 찍고 그 사용자의 분석 결과와 추천 기록을 지운다. 약관 §5와 개인정보처리방침 §2의 분석
  절이 "동의한 경우에만"을 말한다. `scripts/analysis-run.mjs` 도 동의 없는 사용자의 스냅은 거부한다.
- **앱**: 템플릿 화면이 로컬 매칭을 먼저 채운 뒤 슬롯 아래에서 한 번 묻고(`스냅을 분석해서 컷에 더 어울리게 채울까요?`),
  `분석해서 채우기`가 동의 문구 전체를 담은 시트를 연다. 추천은 동의한 계정만 요청한다. 나 탭 `스냅 분석` 행과
  `/settings/analysis` 스위치에서 켜고 끈다.
- **자동 검증**: API 테스트 442개 통과(동의 15개 · 약관의 동의 문구 1개 신규) · 모바일 `npm run verify:mobile` 143 suites / 1144 tests.

**Android 에뮬레이터(API 35, dev 빌드) 검증** — 스위치를 켠 로컬 API 를 따로 띄워 붙였다. 분석 워커는 돌지 않았고 OpenAI
키도 없어서 분석 작업은 큐에 쌓이기만 했다(외부 전송 없음).

| 단계 | 결과 |
|---|---|
| 템플릿 화면 진입 | 로컬 매칭으로 4컷 중 3컷을 채운 뒤 슬롯 아래에 질문 카드. 동의 전에는 동의 상태 조회만 있고 추천 요청은 없다 ✅ |
| `분석해서 채우기` | 시트에 보내는 것 · 받는 곳 · 용도 · 보관 · 끄는 방법 · 거절해도 된다는 점이 모두 뜬다 ✅ |
| `분석 켜기` | `POST /auth/me/analysis-consent` 200 → `user_consents` 1행(`snap_analysis`, `2026-09-29`). 곧바로 `POST /movie-recommendations` 202, 분석 3건 queued. 카드가 사라지고 로컬 매칭은 그대로 ✅ |
| 나 탭 | `스냅 분석 · 켜짐`, 설정 화면은 `2026년 9월 29일에 켰어요. 끄면 분석 결과를 지워요.`(기기 시간대 날짜) ✅ |
| 스위치 끄기 | `DELETE` 200 → 철회 시각 기록, 분석 결과 · 추천 기록 0건, 문구가 `켜면 템플릿의 컷을…`으로 ✅ |
| 철회 뒤 템플릿 재진입 | 다시 묻지 않고, API 요청도 하나도 나가지 않는다 ✅ |

- 추천 폴링은 2초 간격이었고 템플릿 화면을 떠나자 멈췄다.
- 철회 순간 큐에 있던 작업은 행이 지워져 워커가 건너뛴다(`fetch_context` → `AnalysisSkipped`). 이번 3건도 분석 워커가
  뜨면 그렇게 끝난다.
- 확인하지 못한 것: 분석이 끝난 추천으로 행이 다시 채워지는 것(분석 워커 없음 — A-3 의 실제 모델 실행과 함께), iOS
  (시뮬레이터에서 로그인 입력이 되지 않아 중단), 실기기.

## 2026-09-29 (이어서) — 워커가 `apps/ai-worker/.env` 와 `apps/api/.env` 를 겹쳐 읽는다

[AGENTS.md](../../AGENTS.md) 와 [ONBOARDING.md](../../ONBOARDING.md) §3-8 은 `apps/ai-worker/.env` 에 `DATABASE_URL` 한 줄만
두어 덮어쓰라고 안내하지만, `config.py` 는 워커 파일이 있으면 **그 파일만** 읽었다. 안내대로 하면 `REDIS_URL`·S3·
`OPENAI_API_KEY` 가 모두 빠져 분석 워커가 기동 단계에서 종료된다. 회사 OpenAI 키(C-7)를 넣기 전에 키를 읽는 곳을
확인하다 발견했다. 로컬에 워커 파일이 없어 실제로 걸린 적은 없다.

- 두 파일을 모두 읽고 같은 키만 워커 파일이 이긴다. 주입값이 둘 다 이기는 것은 그대로다(`setdefault`).
- 결정 문서 [env-management.md](../decisions/env-management.md) 의 옛 설명에 정정 배너를 붙였다.
- **검증**: `tests/test_config.py` 에 3개 추가. 워커 파일이 한 키만 덮어쓰는 경우는 고치기 전 코드에서 실패(`REDIS_URL`
  이 `None`)하는 것을 먼저 확인했다. CI 와 같은 Python 3.11 · `REQUIRE_FFMPEG=1 python -m unittest discover -s tests` 로
  144개 통과(`snaply-ai-worker:local` 이미지, 네트워크 차단).

## 2026-09-29 (이어서) — 실제 모델로 스냅 분석 · 템플릿 추천 첫 실행(backlog C-7 닫음)

회사 OpenAI 키를 `apps/api/.env` 에 넣고 분석 → 추천 → 앱 표시를 처음으로 실제 모델로 돌렸다. 전에는 스텁 응답과
직접 만든 분석 행으로만 검증했다(2026-08-19).

- **워커**: 개발 인프라에 붙인 분석 워커 컨테이너가 `video-analysis 워커 시작 (model=gpt-5.6-luna concurrency=3)` 을
  남겼다. 키는 `apps/api/.env` 를 컨테이너의 `/apps/api/.env` 에 읽기 전용으로 연결해 `config.py` 가 읽게 했다 —
  `--env-file` 과 달리 컨테이너 설정(`docker inspect`)에 키가 남지 않는다. 동의 흐름 확인 때 큐에 남은 3건은 분석 행이
  없어 모델 호출 없이 건너뛰었다.
- **모델**: 키의 프로젝트에서 `gpt-5.6-luna` 를 쓸 수 있다(`models.list`). 계획 §4.1 의 비교에 쓸 저비용 후보
  (`gpt-5.4-mini` · `gpt-5.4-nano` 등)도 있다.

**분석 4건** — 개발 계정은 동의를 철회한 상태여서 동의 행을 DB 에 직접 넣었다. `scripts/analysis-run.mjs` 로 1건, 앱의
추천 요청으로 3건을 돌렸고 모두 `done` · 재시도 없음 · `usableForEdit=true` · 품질 0.90~0.98 이었다. 요약과 사물 목록은
4건 모두 영상 내용과 맞았다(눈으로 확인). 모델 원문은 저장소에 두지 않는다([결정 문서](../decisions/snap-content-analysis.md) §5).

| 스냅 | 프레임 | 소요 | 토큰(입력 / 출력) |
|---|---|---|---|
| 에뮬레이터 가상 장면 | 1 | 4.2초 | 614 / 208 |
| 휴대폰 촬영 A | 2 | 5.2초 | 787 / 290 |
| 휴대폰 촬영 B | 1 | 4.8초 | 614 / 190 |
| 휴대폰 촬영 C | 4 | 5.7초 | 1133 / 291 |

- **앱 경로**(Android 에뮬레이터 dev 빌드, 스위치를 켠 API 를 3001 에 따로 띄움): `하루 요약` 템플릿을 열자
  `POST /movie-recommendations` 202, 후보 3건이 동시에 분석되고 폴링 시점 채점으로 **6.4초 만에** `done` 이 앱에
  닿았다. 화면은 서버 추천이 도착했을 때만 붙는 `어울림` 라벨로 49% · 46% · 48% 를 보였다. 외출의 스냅이 3개라 4칸 중
  3칸만 찼다. 추천 도착 전의 로컬 매칭 배치는 캡처하지 못해, 추천이 배치를 바꿨는지는 확인하지 않았다.
- **C-7 완료 조건과 다른 점**: 워커는 compose 서비스가 아니라 개발 인프라에 붙인 컨테이너로 띄웠고, 분석은
  `POST /videos/:videoId/analysis` 대신 스크립트와 추천 경로로 요청했다. 추천 경로도 같은 `requestAnalysis` 를 거친다.
- **남은 것**: 계획 §4.1 의 팀 스냅 30~100편 실측(사람 채점 · 모델 비교)과 키 프로젝트의 사용 한도 · rate limit 확인은
  A-3. 후보가 12개일 때의 첫 추천 대기는 재지 않았다. 스크립트의 워커 수 경고가 틀리는 결함은 E-11.
- 검증용 동의 행과 분석 결과 4건은 개발 DB 에 남겼다.

## 2026-09-29 (이어서) — 스냅 앨범 저장과 "이 기기에서만 삭제"(SNAP-17 · 18 · 19)

서버가 스냅을 업로드 후 15일만 보관하는데 녹화 파일은 앱 전용 폴더에만 있어, 앱을 지우거나 기기를 바꾸면 사용자에게
남는 사본이 없었다. 저장공간 검토 끝에 오너가 정한 대로([결정 문서](../decisions/snap-album-save-and-device-delete.md))
사용자가 기기 앨범에 사본을 갖게 하고, 삭제할 때 서버 사본을 남길지 고르게 했다.

- **앨범 저장**: 재생 화면 위쪽의 `앨범에 저장`. 이 기기에 파일이 없는 스냅은 보관 사본을 받아 저장한다. Android 는
  `Pictures/Snaply`(갤러리의 `Snaply` 앨범), iOS 는 앨범 없이 보관함에 넣는다. `expo-media-library`(SDK 57 의 `Album.create` ·
  `Asset.create`)를 들였고, 읽기 권한은 매니페스트에 들이지 않았다 — 빌드한 APK 에 `READ_MEDIA_*` 가 없다(`aapt2 dump
  permissions`).
- **자동 앨범 저장**: 나 → `앨범 저장`(`/settings/album`)의 스위치. 기본 꺼짐, 찍은 스냅만 대상이다. 촬영은 앨범 사본을
  기다리지 않고, 사본을 만들지 못하면 촬영 화면에 알린다.
- **이 기기에서만 삭제**: 보관 중인 스냅을 삭제할 때 시트가 `이 기기에서만 삭제` / `모든 기기에서 삭제` 를 묻는다(촬영
  화면의 녹화 목록은 시스템 알림으로). 파일만 지우고 스냅은 id 를 그대로 둔 채 보관 사본으로 보는 상태가 된다 — 무비의
  컷과 동기화 기록은 바뀌지 않는다. reconcile 은 이런 스냅을 다른 기기에서 온 스냅처럼 다루되 중복으로 더하지 않고,
  원본에서 잰 길이·크기를 덮어쓰지 않는다.
- **검증**: `npm run verify:mobile` 통과(152개 스위트 · 1211개). Android 에뮬레이터(`snaply_api35`, API 35)의 새 dev 빌드로 로컬
  API 에 대해 확인했다.

| 단계 | 결과 |
|---|---|
| 다른 기기에서 온 스냅의 `앨범에 저장` | 보관 사본을 받아 `Pictures/Snaply/` 에 저장, 버튼이 `앨범에 저장했어요` 로 바뀜 ✅ |
| 자동 앨범 저장 켜기 | Android 11+ 라 권한 질문 없이 켜지고 나 탭 읽기가 `자동 저장 켜짐` ✅ |
| 켠 채로 촬영(두 번) | 찍을 때마다 앨범에 저장, `datetaken` 이 촬영 시각 ✅ |
| 업로드된 내 스냅 삭제 | 시트가 두 답을 묻고, 만료일을 아직 모를 때는 날짜 없는 문구 ✅ |
| `이 기기에서만 삭제` | 원본 파일 삭제, 스냅은 같은 id · 길이 · 위치로 `origin: 'server'`, 업로드 기록 유지, 삭제 요청 없음, 표지가 새 경로로 옮겨져 목록에 그대로 ✅ |
| 그 스냅 재생 · 앨범 저장 · 새 무비 | 보관 사본을 받아 재생, 앨범에 저장, 초안이 서버에 그 `videoId` 컷으로 생김 ✅ |
| 녹화 목록에서 삭제 | 시스템 알림이 `취소 · 이 기기에서만 삭제 · 모든 기기에서 삭제`, 모든 기기에서 삭제 → 서버 행 `deleted` · `user` ✅ |
| 이 기기에서만 지운 스냅을 다시 삭제 | 선택 없이 기존 삭제, 서버 행 `deleted` · `user`, 받아 둔 사본 제거 ✅ |

- 찾은 것: 서버 사본을 앨범에 저장하면 `datetaken` 이 비어 저장한 날짜 자리에 놓인다. 배포본이 원본의 `creation_time` 을
  잃기 때문이다(backlog E-12).
- 확인하지 못한 것: 휴대폰 실기기, Android 10 이하의 저장소 권한 질문, iOS(추가 전용 권한), 이 기기에서만 지운 스냅의
  만료(단위 테스트만), 만료일이 알려진 한 개 스냅의 날짜 문구(단위 테스트만) — backlog A-4.
- 두 번째 촬영이 에뮬레이터 카메라 HAL 의 버퍼 대기(`Can't dequeue next output buffer`)로 멈췄고, 화면을 다시 열어 찍으니
  됐다. 이번 변경과 무관하다.
- 확인용으로 만든 스냅 2개와 무비 초안 1개는 앱에서 지웠고, 에뮬레이터 앨범의 테스트 영상과 자동 저장 설정도 되돌렸다.
