# Snaply 개발 진행 기록 — 2026년 8월

> **보관 문서** (2026-10-16 이동): [progress.md](../progress.md)에서 2026-08-04 ~ 08-20의 항목을 월 단위 규칙대로 옮겼다 —
> progress.md 에는 이번 달만 두고 지난달은 `archive/progress-YYYY-MM.md` 로 보낸다.
> **완료 기록이다** — 무엇을 언제 어떻게 검증했는지의 근거로 인용할 수 있지만, 각 항목은 그 시점의 기록이라 지금의 동작 · 구조 ·
> 명령은 코드와 [specs/](../specs/README.md) · 각 원천 문서가 우선한다. 미결은 [backlog.md](../backlog.md)에만 있다.
> 이동하면서 상대 링크 경로만 archive 위치에 맞게 고쳤다(그 외 본문 불변).

---

## 2026-08-04 — 실검증 라운드 1 — 미디어/편집 트랙 (Dev A)

**목표**: Phase 3~5를 mock/합성 클립이 아닌 **아이폰 실촬영 영상(HEVC/.MOV)** 으로 end-to-end 재검증 (team.md §2 "바로 착수" 항목).

**검증 결과** (아이폰 세로 MOV 3클립, `npm run media:e2e`)
- 업로드: presigned PUT → `POST /videos` → `ready`, HEVC/quicktime 그대로 통과 ✅
- 편집: 큐 적재 → 워커 → `done`, 진행률 0→100 실시간 ✅ (클립 3개 crossfade, 수초 내)
- 결과물: 1080x1920 세로 h264+aac, 썸네일 세로, `editedUrl` 인증 없이 재생 가능 ✅
- 자막: `subtitles: true` 시 whisper가 실음성("안녕하세용") 정확 인식 → mov_text 트랙 ✅

**발견·수정한 결함**
1. **결과물이 가로(1920x1080)로 렌더링** — 숏폼 앱인데 세로 클립이 레터박스로 박힘.
   Phase 5 검증이 가로 합성 클립이라 통과했던 것. → 세로 1080x1920 전환, 비율 다른
   원본은 확대·크롭·블러 배경 위 overlay, 회전 메타데이터(90/270도) 반영 (`editor.py`)
2. **`editedUrl` 403** — 개발 MinIO가 비공개 기본값이라 `publicUrl()` 주소가 재생 불가
   (운영은 CloudFront라 문제 없음). → `ensureBucketForDev()`가 기동 시 `s3:GetObject`만
   공개 정책 멱등 적용. 쓰기는 presigned PUT 전용 유지, 실제 AWS에선 no-op

**기획 반영: 자막 opt-in 전환**
- 쇼츠용이라 자막 불필요 → `POST /edit-jobs`에 `subtitles?: boolean` (기본 false) 추가
- false면 whisper 전사·삽입 건너뜀(가장 무거운 단계 절약). 워커의 whisper 선로드도
  제거해 lazy 로드로 — 기본 플로우에선 모델이 메모리에 안 올라감
- 소프트 자막(mov_text)은 플레이어에서 켜야 보이고 브라우저 `<video>`/SNS 업로드에선
  안 보임/유실됨. 자막을 살리는 기획이 되면 **burn-in**(영상에 굽기) 재검토 필요

**개발 도구 추가**
- `npm run media:e2e` — 로그인→업로드→편집→결과 URL 원커맨드 (--style/--subtitles/--upload-only)
- `npm run media:cleanup` — TEST_EMAIL 계정의 업로드·편집 테스트 데이터 정리

**특이사항**
- 개발 API 포트는 3000 유지 — 로컬에서 점유된 경우 각자 `.env`의 `API_PORT`로 변경 (개인 환경 설정, 레포 기본값 아님)
- 테스트 계정: `dayeon-test@dweax.com` (Supabase admin API로 생성, 비밀번호는 각자 관리)
- whisper 자막은 BGM 합성 후 음원에서도 정상 인식됨 (dev BGM 기준. 실BGM은 재확인 필요)

**남은 실검증 (A 트랙)**
- [x] AI 워커 Docker 이미지 빌드 + compose 풀스택에서 편집 1건 → **라운드 2에서 완료**
- 나머지(배포 인프라 확정 후 `deploy.yml` 활성화, HDR·장시간·10클립 스트레스 케이스)는
  [backlog.md](../backlog.md) B-1·F 로 이관

---

## 2026-08-05 — 실검증 라운드 2 — AI 워커 컨테이너 (Dev A)

**목표**: Phase 9에서 용량 문제로 생략했던 ai-worker 이미지 빌드와, compose 풀스택
(postgres+redis+minio+api+ai-worker)에서의 실제 편집 1건 검증.

**검증 결과**
- ai-worker 이미지 빌드 성공 (1.38GB, python:3.11-slim + ffmpeg 7.1.5) ✅
- 컨테이너 ffmpeg **HEVC 디코딩 확인** — 아이폰 MOV 2클립으로 실편집 ✅
- compose 풀스택 편집 e2e: 업로드→큐→컨테이너 워커→done, 1080x1920 + BGM + 자막 ✅
  (인증은 실제 Supabase JWT, DB는 compose postgres에 `prisma migrate deploy`)
- whisper lazy 로드 컨테이너 동작 확인 (기동 시 미로드 → 자막 job에서 모델 다운로드 ~27s) ✅
- 검증 방법: e2e 스크립트를 compose 네트워크의 node:20 컨테이너에서 실행
  (`API_BASE_URL=http://api:3000` 오버라이드, 클립은 볼륨 마운트)

**발견·수정한 것**
1. Dockerfile이 `assets/`(BGM)를 복사하지 않았고, `BGM_DIR` 기본값(상대경로)이 컨테이너
   CWD(/app/src)와 어긋남 → `COPY assets/` + `ENV BGM_DIR=/app/assets/bgm`
2. compose ai-worker에 `depends_on: postgres` 누락 → 마이그레이션 전 기동해 crash. 추가
3. **compose 프로젝트 이름 충돌** — docker-compose.yml과 docker-compose.dev.yml이 같은
   프로젝트(디렉토리명)를 공유해, 풀스택 `docker compose down -v`가 **dev 인프라 컨테이너·
   볼륨까지 삭제**(dev MinIO 데이터 유실 사고 1회, DB는 Supabase라 무사).
   → 각각 `name: snaply-stack` / `name: snaply-dev`로 분리

**참고**
- 이미지에 fontconfig/한글 폰트 없음 — 자막 burn-in 도입 시 Noto Sans KR 등 추가 필요
- 컨테이너 안 `editedUrl`은 `http://minio:9000/...`(네트워크 내부 주소). 운영은 CloudFront라
  무관하지만, compose를 FE 대상 데모로 쓰려면 S3_ENDPOINT/publicBaseUrl 조정 필요

---

## 2026-08-11 — 환경변수 관리 정리

**배경**: `.env` 가 세 곳(루트 · `apps/api` · `apps/ai-worker`)으로 갈라져 있었다. 루트 사본은
어느 문서에도 없었지만 `docker compose` 의 `${VAR}` 보간을 떠받치고 있었고, `apps/api/.env` 와
바이트 단위로 동일했다. 결정과 기각한 대안은 [decisions/env-management.md](../decisions/env-management.md).

**구현**
- `.env` 를 `apps/api/.env` 하나로 통일. compose 는 그 파일을 `env_file` 로 읽고 인프라 주소만
  `environment` 로 덮는다(compose 규격상 `environment` 가 우선).
- 컨테이너 테스트 서버를 1급 시나리오로 지원 — `npm run stack:up` / `stack:migrate` / `stack:down`.
  외부 연동은 기본 mock(`SNS_MOCK`/`STRIPE_MOCK` — 후자는 Stripe 제거 후 `BILLING_MOCK`으로 개명),
  `CLOUDFRONT_DOMAIN=""` 로 미디어 URL 을 스택 MinIO 로 고정.
- 워커가 `apps/ai-worker/.env` → 없으면 `apps/api/.env` 순으로 찾는다. `cp` 지시 삭제.
- 변수 목록의 단일 원천 `apps/api/src/env-spec.ts` 신설. `requireEnv` 의 인자 타입이 스펙에서
  파생돼(`RequiredEnvKey`) 강제 목록과 스펙이 어긋나면 타입체크에서 걸린다.
- `test/env-spec.test.ts` 가 스펙 ↔ `.env.example` ↔ 실제 코드 사용처를 대조한다.

**발견·수정한 것**
1. `CLOUDFRONT_DOMAIN` 이 빈 문자열이면 `publicBaseUrl` 이 `''` 가 됐다 — `config.ts` 가 `??` 를
   써서 빈 문자열이 통과했다. compose 가 `${CLOUDFRONT_DOMAIN:-}` 로 정확히 빈 문자열을 주입하고
   있었으므로, 루트 `.env` 에 실제 값이 있어서 가려져 있던 버그다. `|| undefined` 로 수정.
2. **Swagger·개발 로그인 판정을 `NODE_ENV !== 'production'` → `=== 'development'` 로 반전.**
   운영은 주입 모델이라 `NODE_ENV` 를 빠뜨려도 배포가 성공한다. 기존 조건이면 그 사고가
   "개발 로그인이 열린 채 운영 기동"으로 끝났다.
3. **파서 3종의 인라인 주석 처리가 달랐다.** `KEY=   # 설명` 을 Node 는 빈 값으로, compose 와
   워커 자체 파서는 **주석 문자열을 값으로** 읽는다. `.env.example` 이 이 형식이었으므로
   컨테이너에서만 `LEGAL_CONTACT_EMAIL` 등에 주석이 들어갔다. `.env.example` 의 설명을 줄 위로
   옮기고, 워커 파서를 Node 규칙에 맞췄다(`_parse_value` + `tests/test_config.py`).
4. `.env.example` 의 `S3_ENDPOINT` 예시가 `localhost:9000` 이었다 — snaply 는 9100 을 쓴다.
5. 코드가 읽지만 `.env.example` 에 없던 변수 12개를 채웠다(`NODE_ENV`, `API_HOST`, `ENABLE_DOCS`,
   `LOG_LEVEL`, `EDIT_QUEUE_NAME`, `SUPABASE_JWT_AUDIENCE`, `SENTRY_DEBUG`, `WHISPER_MODEL`,
   `EDIT_TIMEOUT_SECONDS`, `BGM_DIR`, `TEST_EMAIL`, `TEST_PASSWORD`).

**검증**
- `npm run typecheck` / `npm run lint` 통과
- `npm test -w apps/api` — 12 파일 154 테스트 통과 (env-spec 6개 신규)
- 워커 `python -m unittest tests.test_config` — 5개 통과
- `docker compose --env-file /dev/null config` 로 **루트 `.env` 가 없는 상태**를 렌더해,
  `env_file` 이 Supabase 자격증명을 공급하고 `environment` 가 인프라 주소를 덮는 것을 확인
- 드리프트 감지 확인 — `.env.example` 에 미선언 키와 `KEY=   #` 형식을 넣으면 테스트가 실패한다

**컨테이너 실기동 검증** (루트 `.env` 를 지운 상태에서 `docker compose up --build -d api`)
- `/health` 200, `db: connected` ✅ / `stack:migrate` 로 마이그레이션 전량 적용 ✅
- **`/health` 만 보지 않았다.** 컨테이너 안에서 JWKS(`$SUPABASE_URL/auth/v1/.well-known/jwks.json`)를
  직접 호출해 **200 + 키 1개** 확인 — `env_file` 이 `SUPABASE_URL` 을 제대로 공급했고 인증 경로가
  살아 있다는 뜻이다. 잘못된 토큰으로 `/auth/me` → `UNAUTHORIZED`(토큰 검증 실패), 토큰 없이 →
  `UNAUTHORIZED`(토큰 없음)로 분기도 정상 ✅
- `NODE_ENV=development` 가 주입돼 `/docs` 200, `securitySchemes` 에 `devLogin` 등록 확인 ✅
- 컨테이너 안 `SNS_MOCK=true` / `STRIPE_MOCK=true`(현 `BILLING_MOCK`) / `CLOUDFRONT_DOMAIN=""` 확인 ✅
- 주석 유입 회귀 확인 — `LEGAL_CONTACT_EMAIL`·`SITE_VERIFICATION_META`·`STRIPE_PRICE_*` 가 모두
  빈 값이고, `/legal/terms` 의 `<head>` 에 검증 메타 태그가 들어가지 않는다 ✅

**후속 작업의 현행 위치**: 배포 플랫폼 시크릿과 Deploy 스텝 연결은
[backlog.md](../backlog.md) B-1에서 관리한다. 이번 환경변수 정리 라운드에서는 JWKS 도달까지만
재확인했지만, 실제 Supabase JWT를 사용한 컨테이너 인증은 위 "실검증 라운드 2"에서 이미 완료했다.

---

## 2026-08-11 (이어서) — Firebase 서비스 계정 키 로테이션

새 키 발급 → `.env` 교체 → 기존 키 삭제. 키가 저장소에 들어온 적은 없다 — 이력 전체를 훑어도
private key 재료가 걸리는 곳은 [apps/api/test/fcm.test.ts](../../apps/api/test/fcm.test.ts) 의 `fake`
픽스처뿐이고, `.env` 는 추적된 적이 없다. 레포 루트의 `snaply-66f8c-firebase-adminsdk-*.json` 도 이미
없으며 `.gitignore` 에 `*firebase-adminsdk*.json` 패턴이 있다.

---

## 2026-08-12 — 풀스택 Compose 공개 스토리지 주소 보간 수정

- `stack:up`이 Compose 보간용 env 파일을 지정하지 않아, `apps/api/.env`에
  `S3_PUBLIC_ENDPOINT=http://<PC의 LAN IP>:9200`을 설정해도 `docker-compose.yml`의 기본값
  `http://localhost:9200`이 API 컨테이너에 들어가던 문제를 수정했다.
- `stack:up`·`stack:migrate`·`stack:down`이 모두 `--env-file apps/api/.env`를 사용하도록 통일했다.
- AI 워커를 수동 기동하는 ONBOARDING 명령도 동일한 env 파일을 사용하도록 갱신했다.

---

## 2026-08-12 (이어서) — 원커맨드 로컬 스택 migration 자동화

- `npm run stack`이 최초 로컬 설치와 pull 후 업데이트를 모두 처리하도록 Compose에 일회성
  `migrate` 서비스를 추가했다.
- `migrate`는 Postgres healthcheck 통과 후 `prisma migrate deploy`를 실행한다. API와 AI 워커는
  migration 성공을 기다리며, 실패 시 시작하지 않는다.
- 이미 적용된 migration은 Prisma가 건너뛰므로 같은 명령을 반복 실행할 수 있다.

---

## 2026-08-12 (이어서) — 계정 삭제 기능

**정책**: soft delete + 30일 유예 + 배치 실삭제 — [decisions/account-deletion.md](../decisions/account-deletion.md).
약관이 이미 계정 삭제를 약속하고 있었으나(`routes/legal.ts`) 구현이 없던 갭을 닫았다.

**구현 내용**
- `users.deleted_at` 신설(마이그레이션 `20260812000000_add_user_deleted_at`) + 조회 인덱스
- `DELETE /auth/me` — Stripe 즉시 해지(실패 시 삭제 중단), SNS 연동·FCM 토큰 삭제,
  진행 중 편집 작업 실패 처리 + 큐 제거(최선 노력), soft delete. `purgeAfter` 반환
  → 대체: 2026-08-14 "크레딧 결제 구현 + Stripe·구독 제거" — Stripe 해지 단계는 없어졌다
- 삭제 대기 계정의 인증 요청은 `403 ACCOUNT_PENDING_DELETION` (`plugins/auth.ts`)
- `POST /auth/me/restore` — 유예 내 복구 (`authenticateAllowDeleted` 경유)
- purge 배치 `npm run accounts:purge -w apps/api` (dry-run 기본, `--yes` 실삭제):
  S3 prefix → Supabase Auth Admin → DB Cascade 순. 개별 실패는 Sentry 기록 후 계속
- 신규 서비스: `account.service.ts`, `supabase-admin.service.ts`.
  스토리지에 `deleteObjectsByPrefix`, 큐에 `removeEditJob`, Stripe 클라이언트에 `cancelImmediately` 추가
- `SUPABASE_SERVICE_ROLE_KEY` 를 서버 코드가 읽기 시작 — env-spec `origin: 'shared'` 로 변경.
  **운영 시크릿 주입 목록에 추가 필요** (B-1 배포 작업에서 함께 처리)
- auth 스텁에 Admin 삭제 엔드포인트 추가(테스트용), 개인정보처리방침에 30일 유예 명시

**검증**
- `npm test -w apps/api` — 13 파일 160 테스트 통과 (account-deletion 6개 신규:
  소프트 삭제·정리, 편집 작업 취소, 403 차단, 복구 2건, purge 유예 판정)
- `npm run typecheck` / `npm run lint` 통과

---

## 2026-08-12 (이어서) — 고아 pending 영상 정리 배치

**배경**: `GET /videos/upload-url` 은 presigned URL 발급과 함께 `status='pending'` 레코드를
선생성하는데, 클라이언트가 업로드에 실패하거나 confirm(`POST /videos`)을 생략하면 pending 행이
무한히 쌓였다(실사례: 로컬 배포에서 MinIO 공개 주소가 `localhost` 로 잘못 설정돼 모바일 업로드가
계속 실패 → snap 20개에 Video 249행). [decisions/snap-source-of-truth.md](../decisions/snap-source-of-truth.md)
§5 GC 병행 항목 ① 을 구현한 것.

**구현 내용**
- `video.service.ts` — `PENDING_VIDEO_TTL_HOURS`(24), `findStalePendingVideos`,
  `purgeStalePendingVideos`. 대상은 `kind='source' AND status='pending' AND createdAt <= now-TTL`.
  업로드만 되고 confirm 안 된 S3 객체가 있을 수 있어 S3 삭제(없으면 no-op) 후 행을 hard delete.
  개별 실패는 Sentry 기록 후 계속 (`accounts:purge` 와 동일 구조)
- 배치 `npm run videos:purge-pending -w apps/api` (dry-run 기본, `--yes` 실삭제).
  운영에서는 cron 하루 1회 상정
- 테스트 hermetic 보강: `test/setup/env.ts` 가 `S3_PUBLIC_ENDPOINT` 를 테스트 MinIO 로 고정하고
  `CLOUDFRONT_DOMAIN` 을 비운다 — 개인 `.env` 의 공개 주소(LAN IP)가 새면 presigned URL 을 쓰는
  테스트가 접속 불가로 실패했다

**검증**
- `npm test -w apps/api` — 14 파일 162 테스트 통과 (pending-video-purge 2개 신규:
  TTL·상태·kind 필터 판정, 미확정 S3 객체 동반 삭제 — 실제 MinIO 에 presigned PUT 후 확인)
- `npm run typecheck` / `npm run lint` 통과

---

## 2026-08-12 (이어서) — 삭제 대기 403 에 유예 만료 시각 동봉

**배경**: `DELETE /auth/me` 는 `purgeAfter` 를 반환하지만, 앱이 그 값을 놓치거나 다른 기기에서
로그인하면 남은 유예 기간을 알 방법이 없었다. 삭제 대기 계정이 받는
`403 ACCOUNT_PENDING_DELETION` 에 같은 값을 실어, 복구 안내 화면이 별도 조회 없이
기한을 표시할 수 있게 했다.

**구현 내용**
- `account.service.ts` — `purgeAfterFor(deletedAt)` export. 30일 규칙 계산을 한 곳으로 모으고
  `deleteAccount` 도 이 함수를 쓴다. 삭제 응답과 403 이 같은 `deletedAt` 에서 계산되므로
  두 값이 문자열까지 일치한다
- `AppError` 에 optional `details?: Record<string, unknown>` 추가. 에러 핸들러(`app.ts`)가
  `error` 객체에 병합하되 `{ ...details, code, message }` 순서 — 부가 정보가 `code`/`message` 를
  덮지 못하게 한다
- `schemas/responses.ts` — `FORBIDDEN_ERROR_SCHEMA` 신설, `AUTHENTICATED_ERROR_RESPONSES` 에
  `403` 으로 등록. **Fastify 는 선언되지 않은 상태 코드에 직렬화 스키마를 적용하지 않으므로**
  선언 없이도 런타임에는 값이 나가지만, OpenAPI 에 안 잡혀 앱 `schema.d.ts` 가 필드를 모르고,
  나중에 누가 403 을 선언하는 순간 `additionalProperties: false` 로 조용히 사라진다.
  `purgeAfter` 는 optional — `AppError.forbidden()` 의 일반 403 도 같은 스키마를 쓴다
- `routes/edit-jobs.ts` 의 `403: API_ERROR_SCHEMA` 제거 — 뒤따르는
  `...AUTHENTICATED_ERROR_RESPONSES` 스프레드에 덮여 이미 죽은 선언이었다(동작 변화 없음)

**검증**
- `npm test -w apps/api` — 14 파일 163 테스트 통과 (account-deletion 1개 신규:
  유예 중 요청의 403 `purgeAfter` 가 삭제 응답과 동일)
- `npm run typecheck` / `npm run lint` 통과

---

## 2026-08-13 — 편집 작업 취소 API + 실패 분류 코드

**배경**: FE 안건 2건을 닫은 것. ① `generating` 상태에서 잘못 시작한 편집을 멈출 방법이
없어 워커 타임아웃 10분이 사실상의 상한이었다 — 취소 엔드포인트와 취소된 작업의 최종 상태
정의가 필요했다. ② 실패 시 앱이 서버 `errorMessage` 원문을 그대로 화면에 그리고 있었다 —
앱이 사용자 문구로 분기할 수 있는 **분류 코드**가 문구 개선보다 먼저다.

**구현 내용**
- `DELETE /edit-jobs/:id` — `queued`/`processing` 작업을 취소. 최종 상태 **`canceled`** 신설
  (`EditJobStatus`에 추가). 이미 `canceled`면 200(멱등), `done`/`failed`면 409 `CONFLICT`
  (`AppError.conflict` 신설), 남의 작업은 404
- 취소 시: DB 상태 변경(원천) → 결과물 video `failed`+소프트 삭제(목록에서 숨김) →
  큐 제거(최선 노력) → 진행률 채널에 `{status:'canceled'}` 발행으로 열린 WebSocket 종료
- **워커의 취소 인지** (`ai-worker`): `mark_processing`/`update_progress`/`mark_done`을
  상태 조건부 UPDATE로 바꿔, 취소된 작업은 진행률 갱신 시점에 `JobCanceled`로 중단하고
  BullMQ 재시도 없이 종료. `canceled`가 `done`/`failed`로 되살아나지 않는다
- 계정 삭제의 편집 작업 취소도 같은 최종 상태(`canceled`)로 통일 (`account.service.ts`)
- **실패 분류 코드**: `edit_jobs.error_code` 컬럼 추가(마이그레이션
  `20260813000000_add_edit_job_error_code`), `EditJobErrorCode` 타입
  (`TIMEOUT | SOURCE_UNAVAILABLE | QUEUE_FAILED | INTERNAL`, append-only).
  워커가 실패 사유별로 기록하고, API는 큐 적재 실패에 `QUEUE_FAILED`를 기록.
  `GET /edit-jobs/:id` 응답과 WS 실패 메시지(`code`)에 노출
- `getRedisPublisher()` — API 쪽 Pub/Sub 발행 전용 공유 연결 (`lib/redis.ts`)

**검증**
- `npm test -w apps/api` — 15 파일 170 테스트 통과 (edit-jobs-cancel 7개 신규:
  queued/processing 취소, 결과물 video 정리, 멱등 재취소, done/failed 409, 남의 작업 404,
  canceled 조회, errorCode 노출) + tsc + storage 테스트 통과
- 워커 파이썬 변경은 문법 검증만 수행(로컬 pytest 미설치, 기존 테스트는 순수 함수 대상).
  실제 취소 중단·코드 기록은 로컬 워커 기동 시 실검증 필요

**후속(미결 아님, 정책 대기)**: 크레딧 차감/환급이 확정되면(backlog A-2) 취소 시 환급을
이 엔드포인트에 연결한다. 앱 쪽은 `errorCode`→문구 매핑과 취소 UI를 이어받는다.

## 2026-08-14 — 크레딧 결제 구현 + Stripe·구독 제거

기본 단위 **Movie export 1회 = 100크레딧**과 "유료 구독 없음"이 확정돼
[archive/iap-migration.md](./iap-migration.md)를 구현했다. 정책 근거는
[decisions/credit-payment-model.md](../decisions/credit-payment-model.md) ·
[decisions/payment-channel-iap.md](../decisions/payment-channel-iap.md).

**스키마** (`20260814000000_add_credit_ledger_drop_subscriptions`)
- `credit_ledger` — append-only 증감 원장. **잔액은 delta 합계**이며 캐시 컬럼을 두지 않았다
  (원장과 잔액이 어긋날 여지를 없앰). 병목 시 `users.credit_balance` 증분 갱신으로 얹는다
- `purchases` — 스토어 거래 원장. `store_transaction_id` unique 가 중복 지급을 원천 차단
- `credit_ledger(edit_job_id, reason)` unique — 예약·환급 멱등성의 근거. 취소(API)와
  실패(워커)가 겹쳐도 환급이 한 번만 기록된다
- `subscriptions` 테이블 drop (운영에 유료 구독 행 없음 확인 후 이관 없이 제거)

**크레딧 서비스** (`services/credit.service.ts`, `services/billing/credit-policy.ts`)
- 지급/회수/예약/환급. "이미 처리했는지" 조회 후 분기하지 않고 **판정을 DB 제약에 맡긴다** —
  웹훅 재전송과 동시 요청은 조회와 삽입 사이를 파고들기 때문
- 환급은 금액을 인자로 받지 않고 원장에서 계산한다(실제 차감된 만큼만 되돌림)
- 미확정 수량(팩별 크레딧·가입 보너스)은 `credit-policy.ts` 한 곳에 격리 — backlog A-2 확정 시
  숫자만 교체한다

**결제 API** (`routes/billing.ts`, `routes/billing-webhook.ts`)
- `GET /billing/products` · `GET /billing/credits` · `POST /billing/sync`
- `POST /billing/webhook/revenuecat` — Authorization 헤더 시크릿 검증(서명 아님, raw body 불필요).
  이벤트 타입으로 **먼저 분기**시켜 두어 구독 이벤트가 붙어도 구조를 뒤집지 않는다
- 카탈로그에 없는 상품은 임의 지급 대신 500 — RevenueCat 재시도가 매핑 배포 후 지급으로 이어진다
- 제거: `GET /billing/plans` · `GET /billing/subscription` · `POST /billing/checkout` ·
  `POST /billing/cancel` · Stripe 웹훅

**export 연동** (`services/edit-job.service.ts`, `ai-worker/src/db.py`)
- 결과물 video + edit_job 생성과 예약이 한 트랜잭션. 잔액 부족은 `402 INSUFFICIENT_CREDITS`
  (+`required`·`balance`)이며 작업 레코드도 남지 않는다
- **잠금 순서가 중요하다**: 유저 행 `FOR UPDATE` 가 INSERT 보다 **먼저**여야 한다. 뒤에 두면
  `videos`/`edit_jobs` INSERT 의 FK 검사가 같은 `users` 행에 share 락을 걸어 동시 요청끼리
  데드락이 난다 — 실제로 40P01 로 재현됐고 순서를 바꿔 해결했다
- 취소·큐 적재 실패·워커 실패 모두 환급. 환급 로직은 **DB 함수 `refund_export_credits` 한 곳**에
  두고 API(TypeScript)와 워커(Python)가 호출만 한다 — 환급을 실행하는 주체가 둘이라 같은 SQL 을
  두 언어에 복사하면 한쪽만 고쳐질 수 있다
- BullMQ 자동 재시도로는 추가 차감이 없다 (`mark_processing` 이 `failed` 를 되살리지 않아
  첫 실패가 종료 상태다)

**정리**
- `rls-policies.sql`: 삭제된 `subscriptions` 정책을 `purchases`·`credit_ledger` 로 교체.
  둘 다 **본인 SELECT 만** 허용한다 — 원장이 잔액의 원천이라 클라이언트 쓰기를 열면 안 된다
- `plan` 개념 제거: `Plan` 타입, `UserProfile.plan`, `AuthUser.plan`, `GET /auth/me` 의 `plan` 필드.
  **FE 영향 있음** — 앱이 이 필드를 읽고 있으면 정리 필요
- `stripe.client.ts`, `billing-realkey.test.ts`, `stripe` 의존성, `STRIPE_*` 환경변수 제거
- 신규 환경변수: `REVENUECAT_API_KEY` · `REVENUECAT_WEBHOOK_AUTH_TOKEN` · `BILLING_MOCK` ·
  `CREDIT_SIGNUP_BONUS` (env-spec + `.env.example` 동기화)
- 약관·개인정보처리방침의 "유료 구독/Stripe" → 크레딧 결제/RevenueCat·Apple·Google

**검증**
- `npm test -w apps/api` — 15 파일 **161 테스트 통과** + tsc + storage 테스트.
  billing 17개 신규(웹훅 401·멱등 지급·환불 회수·중복 환불 방지·알 수 없는 상품 500·
  잔액 조회·sync 멱등·402 거절·예약·취소 환급·중복 환급 방지·동시 2건 중 1건만 성공)
- 워커 파이썬 변경(`_refund_export_credits`)은 문법 검증만 수행. 실제 실패 환급은 로컬 워커
  기동 시 실검증 필요
- **미검증**: RevenueCat 실키 경로(`/billing/sync` REST 조회)와 실제 스토어 sandbox 구매 —
  스토어 상품 등록이 선행돼야 한다 (backlog C-1)

## 2026-08-14 (이어서) — 보상형 광고 크레딧

앱 팀의 계약 요청을 [decisions/ad-reward-credits.md](../decisions/ad-reward-credits.md)로 확정하고
구현했다. 초안([archive/2026-08-12-rewarded-credit-review.md](./2026-08-12-rewarded-credit-review.md) §4)의
출처별 버킷·만료·차감 우선순위는 **v1에서 채택하지 않았다** — 평면 델타 원장 위에
`reason: 'ad_reward'` 한 줄을 더하는 것으로 끝낸다.

**설계의 핵심**: "광고를 봤으니 지급해달라"는 엔드포인트를 두지 않았다. 지급의 유일한 트리거는
AdMob SSV 콜백이고, 앱은 세션을 열고 상태를 조회할 뿐이다. 콜백의 `reward_amount` 도 쓰지 않고
**세션 발급 시점에 스냅샷된 `ad_rewards.credits`** 를 지급한다.

**스키마** (`20260814020000_add_ad_rewards`)
- `ad_rewards` — 세션 왕복 상태(`pending | granted | expired | rejected`). `nonce` unique,
  `transaction_id` unique 가 SSV 재전송의 중복 지급을 원천 차단
- `credit_ledger.ad_reward_id` + `(ad_reward_id, reason)` unique — `edit_job_id` 와 같은 장치.
  한 세션은 `ad_reward` 원장 행을 최대 하나만 만든다
- `(user_id, granted_at)` 인덱스 — 한도·쿨다운을 **지급된 시각**으로 세기 때문

**서비스** (`services/ad-reward.service.ts`, `services/billing/admob-ssv.ts`)
- 서명 검증은 **수신한 raw 쿼리스트링을 `&signature=` 직전까지 잘라** ECDSA-SHA256 으로 한다.
  파싱 후 재조립하면 인코딩 차이만으로 정상 콜백이 위조로 판정된다
- 모르는 `key_id` 는 공개키 캐시를 1회 강제 갱신 후 재시도(키 로테이션 대응)
- 지급은 상태 전이 + 원장 insert 를 한 트랜잭션으로 묶고, 판정은 조회가 아니라 DB 제약에 맡긴다
- 만료된 pending 세션은 배치 없이 **조회 시점에 lazy 확정**한다 — 그 상태를 보는 사람이 곧
  그 상태에 막히는 사람이라 타이밍이 맞는다
- 검증 실패를 200 으로 삼키지 않는다(400). 삼키면 위조 시도와 정상 미지급이 로그에서 구분되지 않는다
- 거절 시에도 **수신한 `ad_unit` 을 그대로 기록**한다(검증되지 않은 값이며 진단용). Google 문서가
  `ad_unit` 형식을 못 박지 않아(설명은 "AdMob ad unit ID", 예시값은 숫자 `2747237135`) 첫 콘솔
  설정에서 허용 목록 형식이 어긋날 수 있는데, 남기지 않으면 DB만 보고 고칠 수 없다 (backlog C-6)

**API** (`routes/billing.ts`, `routes/billing-webhook.ts`)
- `GET /billing/ad-rewards`(가용성) · `POST /billing/ad-rewards`(세션 발급) ·
  `GET /billing/ad-rewards/{rewardId}`(상태) · `GET /billing/webhook/admob`(SSV, GET 쿼리스트링)
- 세션 발급 거절은 409 3종(`AD_REWARD_COOLDOWN` / `LIMIT_REACHED` / `SESSION_ACTIVE`)과
  503 `AD_REWARDS_DISABLED`. `402 INSUFFICIENT_CREDITS` 와 같은 방식으로 `error` 에
  `nextAvailableAt`·`resetsAt`·`rewardId` 를 함께 싣는다(`CONFLICT_ERROR_SCHEMA`)
- 남의 `rewardId` 는 404 — 403 으로 존재를 알리지 않는다

**앱 팀 요청 반영**
- `GET /billing/credits` 의 `entries[].reason` 을 OpenAPI **enum** 으로 고정
  (`ad_reward` 포함). 값의 원천은 `CREDIT_REASON` 이며 스키마가 그 목록을 그대로 쓴다
- `entries` 가 최대 50건이고 페이지네이션이 없다는 것을 Swagger 설명과 api-spec 에 명시
- `402 INSUFFICIENT_CREDITS` 의 `error.code` 문자열이 실제로 `INSUFFICIENT_CREDITS` 임을 확인
  (`credit.service.ts` `assertCreditsForExport`) — api-spec 예시와 일치한다

**정책값**: `AD_REWARD_ENABLED` 기본 **false**(킬 스위치). 보상 20 / 일일 3 / 쿨다운 300초 /
세션 TTL 900초는 잠정값이며 env 로 덮어쓴다. 일일 한도 기준 시각은 **KST 자정으로 확정**했다
(UTC 자정은 한국 사용자에게 오전 9시, 롤링 24시간은 앱이 한 문장으로 설명할 수 없다).
→ 대체: 2026-08-18 광고 보상 세 항목 — 세션 TTL 300초·일일 5회로 확정

**신규 환경변수**: `AD_REWARD_ENABLED` · `AD_REWARD_CREDITS` · `AD_REWARD_DAILY_LIMIT` ·
`AD_REWARD_COOLDOWN_SECONDS` · `AD_REWARD_SESSION_TTL_SECONDS` · `ADMOB_SSV_ALLOWED_AD_UNITS` ·
`ADMOB_VERIFIER_KEYS_URL` (env-spec + `.env.example` 동기화)

**검증**
- `npm test -w apps/api` — 16 파일 **186 테스트 통과** + tsc + storage 테스트.
  ad-reward 25개 신규. 테스트용 EC 키로 로컬 키셋(`file:` URL)을 물려 **서명 검증 경로를
  운영과 같은 코드로** 돌린다 — 검증을 우회하는 mock 플래그는 두지 않았다
- 커버: 정상 지급 · 같은 트랜잭션 재전송 1회 지급 · 위조 서명/만료 세션/남의 `user_id`/
  허용 밖 광고 단위/오래된 timestamp/삭제 대기 계정 거절 · 지급 시점 한도 재확인 ·
  일일 한도 409 · 쿨다운 409 · 세션 중복 409 · 만료 세션 lazy 정리 · 킬 스위치(enabled false + 503) ·
  남의 rewardId 404 · 내역의 `ad_reward` 노출
- **미검증**: 실제 AdMob 콘솔 연결(앱·광고 단위 등록, SSV 콜백 URL) — 저장소 밖 설정이
  선행돼야 한다 (backlog C-6)

---

## 2026-08-18 — 광고 보상 세션 수명·포기

앱 팀의 실기기 검증 리포트(2026-08-14, AdMob 미연동이라 모든 세션이 SSV 없이 `pending`)로
드러난 **대기 시간 역전**을 고쳤다 — 지급받은 사용자는 쿨다운 300초만 기다리는데, 콜백이 유실된
사용자는 진행 중 슬롯이 TTL(900초)로 풀릴 때까지 잠겼다. 결정과 기각한 대안(앱이 제안한 TTL 120초 등),
앱 팀 질문에 대한 답(한도·쿨다운의 기준 시각, 세션 남발)은
[decisions/ad-reward-credits.md](../decisions/ad-reward-credits.md) §4·§4-1.

- **세션 TTL 기본값 900초 → 300초**(= 쿨다운, `services/billing/credit-policy.ts`). TTL 이 쿨다운을
  넘기지 않는다는 관계를 타입 주석과 `.env.example`·env-spec 설명에 함께 남겼다
- **세션 포기** `DELETE /billing/ad-rewards/{rewardId}` — 새 상태 `abandoned`(`pending` 과 함께 아직 지급될
  수 있는 상태로, 만료 전에 도착한 SSV 는 그대로 지급). 컬럼은 `status VARCHAR(16)` 그대로라
  마이그레이션 없음. 멱등(확정된 세션·두 번째 포기에도 200 + 현재 상태), 남의 세션은 404

**검증**
- `npm test -w apps/api` — 16 파일 **194 테스트 통과** + tsc + storage 테스트. 포기 관련 8개 신규
- 커버: 포기 후 즉시 새 세션 발급 · 포기한 세션에 SSV 도착 시 지급 · 포기 세션을 한도 이상
  쌓아도 지급은 `dailyLimit` 까지 · 만료된 포기 세션은 거절 · 지급된 세션 포기 멱등 ·
  2회 포기 · 남의 세션 404(상태 불변) · 포기가 쿨다운을 우회하지 않음

---

## 2026-08-18 (이어서) — 광고 보상 정책 값 확정 — 20크레딧 · 일일 5회

`credit-policy.ts` 의 잠정값이던 보상량·한도를 확정했다 — 1회 보상 **20크레딧**, 일일 한도 **3 → 5회**
(`20 × 5 = 100 = MOVIE_EXPORT_COST`, 한도를 다 쓰면 정확히 export 1편). 값의 근거와 받아들인 트레이드오프는
[decisions/ad-reward-credits.md](../decisions/ad-reward-credits.md) §7.

**반영 위치**: `credit-policy.ts` 기본값·주석, `env-spec.ts`·`.env.example` 설명,
[api-spec.md](../api-spec.md) `GET /billing/ad-rewards` 예시와 표시 규칙, backlog A-2·C-6.

**검증**
- `npm test -w apps/api` — 16 파일 **196 테스트 통과** + tsc + storage 테스트
- 기본값 테스트 2개 추가(`ad-reward.test.ts`) — 다른 테스트는 env 로 한도를 3으로 덮어쓰므로
  기본값 자체가 검증되지 않았다. `credits × dailyLimit === MOVIE_EXPORT_COST` 와
  `sessionTtlSeconds <= cooldownSeconds` 를 못 박아 한쪽만 바뀌는 것을 막는다

---

## 2026-08-18 (이어서) — 광고 보상 쿨다운 300초 확정

A-2의 마지막 미결 값이었다. 값을 고른 것이 아니라 위아래가 모두 막혀 있음을 확인한 것이다 — 근거는
[decisions/ad-reward-credits.md](../decisions/ad-reward-credits.md) §7 "쿨다운 300초".

**반영**: `credit-policy.ts` 주석(하한·상한의 이유), `env-spec.ts`·`.env.example`,
[api-spec.md](../api-spec.md), backlog A-2 — **A-2에서 광고 보상 항목이 닫혔다.**
`AD_REWARD_ENABLED=true` 를 막는 것은 이제 C-6(AdMob 콘솔 설정) 하나뿐이다.

**검증**: `npm test -w apps/api` — 16 파일 196 테스트 통과 + tsc + storage 테스트.
기본값 300 은 이전 항목에서 추가한 `sessionTtlSeconds <= cooldownSeconds` 테스트가 계속 지킨다.

---

## 2026-08-19 — 스냅 내용 분석 — 방향 확정 + 스파이크 하네스

기능 방향(분석 결과는 내부 추천 입력 전용 · 추천 요청 시점의 후보 스냅만 분석 · 외부 vision API 에 프레임
4장 · 추천은 비동기 job)을 정했다 — 결정과 기각한 대안은
[decisions/snap-content-analysis.md](../decisions/snap-content-analysis.md) §1~§4. 기준선을 낼 스파이크 하네스
(`apps/ai-worker/scripts/analysis-spike/`)도 만들었지만 실행하지 않고 같은 날 본구현으로 넘어갔다 — 모듈은
`apps/ai-worker/src/pipeline/video_analysis/` 로 옮겨졌고 스파이크 디렉터리와 그 테스트는 제거됐다(결정 문서 §9,
아래 "스냅 내용 분석 본구현").

---

## 2026-08-19 (이어서) — 스냅 내용 분석 본구현 — 스키마·API·분석 워커·docker

`POST /videos/:videoId/analysis` 로 요청하면 분석 워커가 스냅의 대표 프레임을 vision 모델에
보내고, 결과가 `video_analyses` 에 남는다. 방향과 계획 대비 차이는
[decisions/snap-content-analysis.md](../decisions/snap-content-analysis.md) §9.

**DB** — `video_analyses` (마이그레이션 `20260819000000_add_video_analyses`)
- `(video_id, analysis_version)` unique 가 **버전당 1행**을 보장한다. 같은 스냅이 두 번
  분석되지 않는 것은 성능이 아니라 **과금** 문제다
- 결과 컬럼 외에 `model_version`·`prompt_version`·`input_tokens`·`output_tokens`·`attempts`·
  `error_code` 를 남긴다 — 기준선(처리시간·토큰·실패율)을 이 테이블 집계로 낸다
- `videos.status` 와 분리했다. 분석이 실패해도 원본은 `ready` 를 유지한다
- RLS 는 **select 만** 본인 것으로 허용한다. 생성·갱신은 service_role(API·워커)뿐

**API** — 라우트 2개, 재시도 전용 엔드포인트는 만들지 않았다
- `POST /videos/:videoId/analysis` → 202. 멱등: 진행 중이면 같은 `analysisId`,
  재시도 가능한 실패는 같은 행을 `queued` 로 되돌림, `done` 은 그대로,
  되돌릴 수 없는 실패는 **409**
- `GET /videos/:videoId/analysis` → 최신 버전 1건. 실패도 200 + `{ code, retryable }`,
  모델 원문 메시지는 노출하지 않는다
- 큐 적재 실패는 레코드를 `failed` 로 만들지 않고 `queued` 로 남긴 뒤 503 — 다음 요청이 다시 넣는다
- 기존 `Video` 응답에는 필드를 추가하지 않았다(테스트로 고정)

**워커** — `analysis_worker.py` (편집 워커와 별도 프로세스, 같은 이미지)
- `OPENAI_API_KEY` 가 없으면 **기동 단계에서 종료**한다. 작업을 받아놓고 전부 실패시키는
  것보다 낫다
- 프레임: FFprobe 실측 길이의 10/36.7/63.3/90% 시점을 **한 번의 ffmpeg 호출**로 뽑고,
  8x8 평균 해시로 유사 프레임을 제거한다. 실제 사용 장수는 `frame_timestamps_ms` 에 남는다
- 결과 반영은 `status='processing' AND videos.deleted_at IS NULL` 조건부 UPDATE 다.
  분석 중 영상이 삭제되면 모델 응답을 버린다
- 같은 트랜잭션에서 `videos.duration_seconds` 를 실측값으로 교정한다
- 재시도 가능한 실패만 다시 던져 BullMQ 백오프를 태운다. `AUTH_FAILED`·`SAFETY_REFUSED`·
  `FRAME_EXTRACTION_FAILED` 등은 기록만 하고 재시도하지 않는다
- `visualIssues` 는 코드 enum 으로 고정 — 자유 텍스트를 받으면 "왜 못 쓰는 스냅인가"를 집계할 수 없다

**docker** — `analysis-worker` 서비스 추가 (`docker-compose.yml`).
편집 워커와 같은 이미지에 `command: python analysis_worker.py`. `openai==1.68.2` 를
워커 requirements 에 고정했다.

**검증**
- `npm test -w apps/api` — 17 파일 **216 테스트 통과**(신규 `video-analysis.test.ts` 18개) + tsc + storage 테스트
- `cd apps/ai-worker && python3 -m unittest tests.test_video_analysis` — **38개 통과**
  (프레임 시점·유사 프레임 제거·요청 구성·오류 분류·결과 검증·analyze 오케스트레이션).
  ffmpeg·openai SDK 없이 돈다
- **docker 스택 실검증** (`docker compose up -d --build`):
  - 마이그레이션 적용 확인, `GET /health` 200
  - `OPENAI_API_KEY` 없이 뜬 `analysis-worker` 가 의도대로 기동 단계에서 종료
  - 더미 키로 기동 → 큐 구독 → 실제 mp4(MinIO)를 내려받아 ffprobe·프레임 추출까지 수행 →
    모델 호출에서 `AUTH_FAILED`(재시도 불가)로 분류 → DB 에
    `status=failed, error_code=AUTH_FAILED, attempts=1`, **원본 영상은 `ready` 유지**
  - 모델 응답만 스텁으로 바꾼 완료 경로: `status=done` 과 결과 전 컬럼·토큰(812/96)·
    `model_version`·`prompt_version` 기록, `videos.duration_seconds` 가 잘못된 값 99 →
    실측 3 으로 교정, 완료된 분석 재실행은 **모델 호출 0회로 skip**
  - 검증용으로 만든 행·MinIO 객체는 정리했다
- **실제 모델 응답으로 끝까지 돌린 적은 없다** — 유효한 `OPENAI_API_KEY` 가 필요하다.
  남은 작업은 [backlog.md](../backlog.md) A-3

**아직 켜지 않는 이유**: 생산 스냅의 프레임이 외부로 나가므로 약관 개정·제3자 제공 고지가
선행이고, 운영 모델과 단가 상한이 정해지지 않았다. 분석은 호출하지 않으면 돌지 않으므로
배포 자체는 안전하다(자동 적재 경로가 없다).

---

## 2026-08-19 (이어서) — 약관·개인정보처리방침의 분석 고지 초안

스냅 분석은 생산 스냅의 프레임을 외부 모델로 보내므로, `routes/legal.ts` 의 출시 전 초안에 분석 고지·
수탁자·국외 이전 절을 넣었다. 테스트(`test/legal.test.ts`)가 전송 범위(프레임 4장·오디오 미전송·영상
삭제 시 동시 파기)를 문구에 고정한다.

- **보유 기간·학습 이용** — 공개 문서 기준 학습 미이용, 남용 모니터링 로그 최대 30일. Responses API 의
  `store` 기본값이 true 라 30일 보관 축이 하나 더 생기는 것을 발견해 워커에서 `store: false` 로 껐다
- **국외 이전 표** — Firebase(리전 지정 불가)·RevenueCat(미국)·Sentry(미국, DSN 이
  `ingest.us.sentry.io`)를 채웠다. Meta·TikTok 은 우리가 직접 호출하므로 표에 내렸고, Apple·Google 은
  우리가 직접 보내지 않아 표가 아니라 문장으로 관계만 적었다

남은 법무 검토와 확정 항목은 [backlog.md](../backlog.md) D-2.

---

## 2026-08-19 (이어서) — 무비 템플릿 카탈로그 서버 이관

템플릿 4개가 앱의 로컬 상수에 있었다. 슬롯의 **매칭 규칙**이 생기는 순간 정의와 규칙이 서로
다른 저장소에 있게 되고, 그러면 한쪽만 고쳐진다. 그래서 카탈로그를 서버로 옮겼다 —
[decisions/template-snap-recommendation.md](../decisions/template-snap-recommendation.md) §2.
템플릿 기반 스냅 자동 추천(backlog A-6)의 1단계다.

**DB** — `movie_templates` · `movie_template_slots` (마이그레이션 `20260819010000_add_movie_templates`)
- 유저 데이터가 아니라 제품 데이터다. `user_id` 가 없고 **행은 마이그레이션이 넣는다**.
  시드 스크립트를 두지 않은 이유: 수동 실행을 빠뜨리면 앱이 조용히 내장 폴백으로 돌아가
  "서버가 카탈로그를 소유한다"가 사실이 아니게 된다
- 시드는 앱이 지금 내장한 4개(`walk`·`day`·`cafe`·`trip`)와 **id·label·hint 가 같다**.
  같아야 서버 응답과 오프라인 폴백이 같은 템플릿을 가리키고, 이 변경이 화면을 바꾸지 않는다
- 슬롯의 `match_hints`(jsonb)에 `{places, objects, actions, topics, temporalPrior}` 를 함께
  시드했다. **아직 읽는 쪽이 없다** — 2단계 점수화가 읽는다. jsonb 라 형태가 바뀌어도
  마이그레이션이 필요 없다
- `(template_id, position)` unique — 한 자리에 두 슬롯이 오면 장면 순서가 비결정적이 된다
- `retired_at` 으로 내린다. 행을 지우면 그 템플릿으로 만든 과거 추천이 고아가 된다
- RLS 는 **켜고 정책을 만들지 않았다.** 소유자 컬럼이 없어 "본인 것만" 규칙이 성립하지 않고,
  클라이언트에 직접 select 를 열면 점수화 내부값이 그대로 나간다. service_role 만 읽는다

**API** — `GET /movie-templates` 🔒 하나. 생성·수정 경로는 두지 않았다
- 내리지 않은 템플릿을 `sort_order` 순, 슬롯은 `position` 순
- `updatedAt` 은 목록에서 가장 최근에 바뀐 템플릿의 시각이다. 한 템플릿의 문구만 고쳐도
  앱 캐시가 갱신돼야 한다
- **`matchHints` 는 응답에 없다.** 응답 스키마의 `additionalProperties: false` 와 테스트가
  이걸 고정한다 — 앱이 읽기 시작하면 가중치 조정이 다시 앱 릴리스에 묶인다
- `style` 은 `POST /edit-jobs` 가 받는 프리셋 이름 그대로 내려간다. 서버가 새 프리셋을
  추가했을 때 **거르는 쪽은 앱**이다. 서버가 거르면 새 프리셋을 아는 앱에도 안 보인다

**검증**
- `npm test -w apps/api` — 18 파일 **223 테스트 통과**(신규 `movie-templates.test.ts` 7개) +
  tsc + storage 테스트. 신규 테스트가 고정하는 것: 401, 시드 4개의 id·순서, 슬롯 순서와
  label·hint, `style` 이 편집 프리셋 집합 안에 있음, `matchHints`·`temporalPrior` 문자열이
  응답 본문에 없음, `retired_at` 제외, `updatedAt` 이 갱신 시각을 따라감
- `npm run lint` · `npm run typecheck` 통과
- 마이그레이션은 테스트 DB(`snaply_test`)에 `migrate deploy` 로 적용돼 위 테스트가 그 위에서 돌았다
- 카탈로그 행은 하네스의 TRUNCATE 대상이 아니다(제품 데이터). 테스트가 행을 건드릴 때는
  `finally` 로 원복한다 — 다음 테스트 파일이 같은 DB 를 물려받는다

**로컬 dev DB 에는 적용하지 않았다**: `.env` 의 `DATABASE_URL`(`127.0.0.1:5433`)에 아무것도
떠 있지 않고, 로컬 `snaply`(5432)는 이번 것을 포함해 **7개 마이그레이션이 밀려 있는 상태**다.
이번 변경 이전부터 그랬고, 어느 쪽도 임의로 건드리지 않았다.

**다음**: 2단계 추천 job(`POST`/`GET /movie-recommendations`) — backlog A-6.

---

## 2026-08-19 (이어서) — 템플릿 스냅 추천 API — 규칙 기반 점수화

`POST /movie-recommendations` 로 후보 스냅과 템플릿을 주면, 후보의 분석 결과를 모아 슬롯에
배정한 결과를 `GET /movie-recommendations/:id` 로 돌려준다. backlog A-6 의 2단계이며,
방향과 기각안은
[decisions/template-snap-recommendation.md](../decisions/template-snap-recommendation.md).

**새 큐를 만들지 않았다** — 접수 시점에 후보 분석을 적재하고 채점은 조회(폴링) 시점에 한다. 동시 폴링은
`status='processing'` 조건부 갱신으로 하나만 이기고, 마감 시한(3분)이 지나면 끝난 분석만으로 채점한다.
계획과 달라진 이유는 결정 문서 §7.1.

**DB** — `movie_recommendations` · `movie_recommendation_items` (`20260819020000_add_movie_recommendations`)
- `candidate_video_ids` 는 **배열**이다. 앱이 보낸 촬영 시간 순서가 점수화의 시간 사전값이라
  집합으로 뭉갤 수 없다
- `candidate_hash` 는 **정렬한** 후보 집합의 해시다. 순서만 다른 재요청이 재분석을 돌리면 안 된다
- 영상이 삭제되면 `video_id` 만 `SET NULL` — 그 자리는 비고 추천은 남는다
- 템플릿 FK 는 `RESTRICT`. 템플릿은 지우지 않고 `retired_at` 으로 내린다

**점수화** — `services/recommendation/score-slots.ts`, DB 없이 도는 순수 함수. 공식·게이트·배정 규칙과
규칙 기반으로 시작한 근거는 결정 문서 §7. 힌트 jsonb 는 방어적으로 읽는다 — 한 행의 오타가 추천 전체를
무너뜨리지 않는다

**정책** — `services/recommendation/recommendation-policy.ts`. 상한(REC-3)과 재사용 창을 서버가 집행하고
크레딧은 차감하지 않는다(근거는 결정 문서 §4). 한도는 달력 하루가 아니라 직전 24시간이다.
`MOVIE_RECOMMENDATION_ENABLED` **기본 false** — 꺼져 있으면 503 `RECOMMENDATION_DISABLED`

**전역 에러 핸들러 순서를 바꿨다** (`app.ts`) — `AppError` 판정이 rate limit 판정보다 **앞**으로 왔다
(이유는 결정 문서 §7.2). 라우트별 rate limit 테스트 2건이 이 순서로도 그대로 통과한다

**검증**
- `npm test -w apps/api` — 20 파일 **257 테스트 통과**. 신규: `recommendation-score.test.ts` 14개
  (인프라 없이 도는 순수 테스트), `movie-recommendations.test.ts` 20개
- 통합 테스트가 고정하는 것: 멱등 재요청(순서만 다른 경우 포함) · 템플릿별 분리 ·
  후보 상한과 `max` 동봉 · 타 유저/미확정 스냅 403 · 내린 템플릿 404 · 24시간 한도 429와
  **재사용은 한도에 안 걸림** · 플래그 off 시 503 + 행 미생성 · 분석 미완료 시 `processing` ·
  완료 시 슬롯 배정 · `usableForEdit=false` 제외 · 분석 실패 후보 제외 후 나머지로 채움 ·
  마감 시한 초과 시 부분 채점 · 굳은 결과 재채점 안 함 · 남의 추천 404 · 영상 삭제 시 자리만 빔
- `npm run lint` · `npm run typecheck` 통과
- **실제 모델 응답으로 끝까지 돌린 적은 없다.** 통합 테스트는 분석 결과 행을 직접 만들어
  채점 경로를 검증한다. 유효한 `OPENAI_API_KEY` 로 도는 e2e 는 A-3 과 함께 남아 있다

**다음**: 앱 연동(카탈로그 원격화 + 2단계 병합) — backlog A-6.

---

## 2026-08-20 — 앵커 어휘 사전 + 워커 빌드 컨텍스트 루트 통일

editSpec v3 착수의 첫 단위. 계획과 결정 근거는
[archive/edit-spec-v3-kickoff.md](./edit-spec-v3-kickoff.md) §3.

**사전은 원본 하나** — `packages/shared-types/src/anchor-vocabulary.json` 을 TS(`anchor.ts`)와 워커
(`pipeline/anchor.py`)가 같이 읽고, TS 상수와 JSON 의 대조가 정합성 장치다. 어휘의 형태(폴백 체인은 객체
배열, `defaultAnchor` 없음, 모든 kind 가 `ref`)는 [decisions/edit-spec-v3.md](../decisions/edit-spec-v3.md) §3.

**빌드 컨텍스트를 루트로, 로더는 편집 파이프라인에** — `docker-compose.yml` · `apps/ai-worker/Dockerfile` 의
워커 컨텍스트를 루트로 옮겼다(`packages/` 가 컨텍스트 밖이라 사전이 이미지에 들어갈 수 없었다). 로더
`pipeline/anchor.py` 는 사전이 없으면 기동에 실패하고, `config.py` 가 아니라 편집 파이프라인에 둬 분석 워커는
영향받지 않는다. 배치·로딩의 근거는 같은 결정 문서 §7. 부수 효과로 `.dockerignore` 의
`apps/ai-worker/assets/bgm/**/*.m4a` 제외가 작동하기 시작했다(루트 상대 경로라 그동안 no-op). 기동 로그에
`vocabulary=v1 derivation=v1` 을 남긴다.

**얼굴 앵커 파생** — MediaPipe 6키포인트에 없는 것을 만든다
- Face Detection 이 주는 것은 양 눈·코·입·양 귀뿐이다. `forehead` · `cheekL/R` · `chin` ·
  `aboveHead` 는 전부 bbox 와 두 눈에서 파생한다. FaceMesh 468 랜드마크는 도입하지 않았다
- 원점은 두 눈의 중점, 축은 눈 각도(roll)로 회전한 얼굴 로컬 프레임이다. 기울어진 샷에서
  스티커가 수직으로만 올라가면 즉시 어색해진다
- 좌표는 **소스 정규화**다. 앵커의 출처가 전부 소스 좌표계이고, 캔버스 기준으로 저장하면
  `fitMode` 가 섞여 출력 프로필을 바꿀 때 재계산해야 한다
- 정확도가 아니라 **재현성**이 계약이다. 계수를 손대면 `derivationVersion` 을 올리고
  `tests/fixtures/anchor-derivation.json` 을 다시 만든다. 픽스처가 버전을 함께 들고 있어
  버전을 안 올리면 테스트가 잡는다

**부동소수가 동률을 가르던 버그를 고쳤다**
- `object` 의 `beside` 는 프레임 여유가 큰 쪽을 고르고 동률이면 오른쪽으로 정했는데,
  `x=0.40 · w=0.20` 에서 `1.0 - (x + w)` 가 `0.3999999999999999` 로 떨어져 **동률이 왼쪽으로
  갈렸다.** 픽스처를 처음 생성할 때 주석과 반대 값이 나와서 드러났다
- 잡음(1e-16)보다 크고 화면에서 구분되지 않는(1e-9 는 1080px 에서 100만분의 1 픽셀) 여유를
  두고 비교한다. 같은 입력을 달리 표현했다고 스티커가 반대쪽에 붙으면 안 된다
- **여유값을 사전으로 뺐다**(`tieEpsilon`). 공식은 워커 단독 구현이지만 이 값은 **계약**이다 —
  앱 프리뷰 구현이 다른 값을 쓰면 픽스처가 계약 역할을 못 한다
- 픽스처에 **경계 케이스 7건**을 넣었다(13건 중). `beside` 가 동률에서만 드러났으므로,
  0.0/1.0 경계 · 정확한 동률 · 폭 0 · 수직 눈선을 일부러 넣어 남은 공식도 같은 방식으로
  드러나게 한다. 우연한 발견을 체계로 바꾼 것이다
- 겸사겸사 **클램프하지 않는다**를 결정으로 못박았다. 프레임 위에 붙은 얼굴의 `aboveHead` 는
  음수가 맞다 — 여기서 프레임 안으로 당기면 스티커가 조용히 다른 자리에 붙고 폴백 체인은
  "성공했다"고 판단한다. 배치 가능 여부는 세이프에어리어를 아는 배치 단계가 정한다

**검증**
- 워커: `python3.11 -m unittest discover -s tests` — **80 테스트 통과**(기존 58 + 신규 22).
  신규 `test_anchor.py` 는 사전 정합성 · 폴백 체인 규칙 · 사전 부재 시 예외 · 파생 픽스처 대조 ·
  기울기 반영 · 동률 결정론 · 경계 입력(클램프 금지, 수직 눈선, 폭 0)을 고정한다.
  ffmpeg·SDK 없이 돈다
- API: `npm test -w apps/api` — 21 파일 **279 테스트 통과**. 신규 `anchor-vocabulary.test.ts` 16개
  (TS 상수 ↔ JSON 대조, 사전 내부 정합성, 검증 헬퍼). `npm run lint` · `npm run typecheck` 통과
- 도커: 루트 컨텍스트로 이미지 빌드 성공(68초). 컨테이너에서 ① 사전 존재 ② 편집 워커 임포트 시
  `v1/v1` 로드 ③ **사전을 지우면 편집 워커 기동 실패**(경로 두 개를 안내하는 메시지)
  ④ 같은 상태에서 **분석 워커는 정상 임포트** ⑤ `sys.modules` 에 `pipeline.anchor` 없음 확인
- `.dockerignore`: 더미 `.m4a` 를 넣고 컨텍스트를 확인해 제외가 실제로 작동함을 확인
- **compose 풀스택 기동과 실제 편집 잡 e2e 는 돌리지 않았다.** 이 커밋은 파이프라인 동작을
  바꾸지 않으며(사전 로드와 기동 로그만 추가), 편집 경로에서 사전을 쓰는 코드는 아직 없다

**다음**: 스테이지별 `attempt` 와 해시 고정(kickoff §4) → 무효화 표 재작성(§5).

---

## 2026-08-20 (이어서) — 스테이지별 시드 — 재현과 "다시 생성"의 분리

editSpec v3 착수의 두 번째 단위. 계획은
[archive/edit-spec-v3-kickoff.md](./edit-spec-v3-kickoff.md) §4.

**스테이지별 `attempt`** — `seed: { root, attempt: { <stage>: n } }` 로 재현과 "다시 생성"을 가른다. 스테이지
시드는 `sha256("{root}:{stage}:{attempt}")` 상위 8바이트 빅엔디언이며 알고리즘·템플릿·바이트 수·바이트 순서까지
사전에 뒀다. `root` 상한은 `Number.MAX_SAFE_INTEGER` 로 강제한다(넘으면 JavaScript 가 반올림해 API 와 워커의
`root` 가 에러 없이 달라진다). 전역 `attempt` 와 파이썬 `hash()` 를 쓰지 않는 근거는
[decisions/edit-spec-v3.md](../decisions/edit-spec-v3.md) §5.

**스테이지 이름을 닫힌 집합으로** — `packages/shared-types/src/stage-vocabulary.json`
- 열린 문자열이면 `attempt: {"style-directr": 2}` 같은 오타가 조용히 통과한다. 그 디렉터는
  `attempt=0` 을 보고, 사용자는 "다시 생성"을 눌렀는데 아무 일도 안 일어나며, 에러도 안 남는다
- 시드를 쓰는 것은 **디렉터 셋뿐**이다. 리더는 MediaPipe·VAD 라 결정적이고 `semantic-reader` 는
  결과가 `analysisVersion` 으로 핀되므로 다시 돌리지 않는다. 리더에 `attempt` 를 붙이면 거부한다
- 커밋 1의 앵커 사전과 같은 패턴이라 로더를 `pipeline/vocabulary.py` 로 뽑았다. Dockerfile 의
  COPY 도 `*-vocabulary.json` 으로 넓혀 사전이 늘어도 안 고친다

**TS·Python 검증이 갈라진 것을 테스트가 잡았다**
- `isValidSeed({ root: 7, attempt: [] })` 가 통과했다 — `Object.entries([])` 가 빈 배열이라
  `.every()` 가 참이 된다. 워커의 `parse_seed` 는 dict 만 받으므로 **API 가 통과시킨 스펙을
  워커가 거부하는** 상태였다. `Array.isArray` 를 막아 고쳤다
- 파생 함수 자체는 TS 에 없다. API 는 `root` 를 쓰고 `attempt` 를 올릴 뿐 파생값을 소비하지
  않는다 — `anchor.py` 의 파생 공식과 같은 구조이고, 골든 픽스처가 계약이다

**검증**
- 워커: `python3.11 -m unittest discover -s tests` — **97 테스트 통과**(신규 `test_seed.py` 17개).
  골든 27케이스(`root` 3종 × 디렉터 3종 × `attempt` 3종) 외에 **`PYTHONHASHSEED` 를 0·1·12345 로
  바꿔 별도 프로세스로 돌려 같은 값이 나오는지**를 테스트가 직접 확인한다. 골든 값만으로는
  한 프로세스 안에서 `hash()` 도 일관되므로 통과해 버린다
- API: `npm test -w apps/api` — 22 파일 **295 테스트 통과**(신규 `stage-vocabulary.test.ts` 16개).
  `npm run lint` · `npm run typecheck` 통과
- 도커: 와일드카드 COPY 로 사전 2개가 이미지에 들어가고, ① 편집 워커가 둘 다 읽으며
  ② **스테이지 사전만 지워도 편집 워커가 기동 실패**하고 ③ 사전을 전부 지워도 **분석 워커는
  정상 기동**(`sys.modules` 에 `pipeline.seed` 없음)한다
- 기동 로그를 `anchor=v1 derivation=v1 stage=v1` 로 확장했다

**다음**: 무효화 표 재작성(kickoff §5) — kickoff 의 결정 A-2·A-5·B-6 을 한 표가 흡수한다.

---

## 2026-08-20 (이어서) — 재생성 무효화 규칙 — 표가 아니라 데이터로

editSpec v3 착수의 세 번째 단위이자 이 계획의 중심 산출물. 계획은
[archive/edit-spec-v3-kickoff.md](./edit-spec-v3-kickoff.md) §5.

**표를 문서에 두지 않았다**
- 무효화 규칙은 구현이 참조하는 계약이다. 문서의 표는 구현과 갈라지고, **갈라진 것을 아무도
  모른다.** 원본은 [`invalidation-vocabulary.json`](../../packages/shared-types/src/invalidation-vocabulary.json)
  하나이고 TS·워커가 같은 파일을 읽는다. 앞 두 커밋의 사전과 같은 구조다
- 레이어 상태는 셋(`invalidated` · `retimed` · `preserved`)이고, 액션마다 **모든 레이어**의 상태를
  적는다 — 사전에 없는 조합은 기본값이 아니라 예외다. 액션·레이어 목록과 셀 단위 판단(`note`)은
  사전이 원천이므로 여기에 표로 옮기지 않는다. 판단의 근거는
  [kickoff §5](./edit-spec-v3-kickoff.md)

**검증**
- 워커: **118 테스트 통과**(신규 `test_invalidation.py` 21개). 액션 × 레이어 판단이 하나도 빠지지 않았는지,
  `attemptBump` 가 스테이지 사전과 맞는지(리더를 지목하면 워커의 `parse_seed` 가 그 스펙을 거부해
  **액션 자체가 실행 불가**가 된다), 만료 재생성이 시드를 하나도 바꾸지 않는지
- API: 23 파일 **315 테스트 통과**(신규 `invalidation.test.ts` 20개). `lint`·`typecheck` 통과
- 도커: **Dockerfile 을 안 고쳤다.** 커밋 2 에서 COPY 를 `*-vocabulary.json` 으로 넓혀 둔 덕에
  셋째 사전이 그대로 들어갔다. 무효화 사전만 지우면 편집 워커가 기동 실패하고 분석 워커는
  정상 기동하는 것까지 확인
- 기동 로그: `anchor=v1 derivation=v1 stage=v1 invalidation=v1`

**커밋 2 와 같은 누락이 또 나왔다.** 새 사전을 만들어도 `worker.py` 가 그 모듈을 임포트하지
않으면 기동 시 검증되지 않는다 — 테스트는 전부 초록인데 컨테이너에서 사전을 지워도 워커가 떴다.
**사전을 추가할 때마다 `worker.py` 임포트와 기동 로그를 같이 늘려야 한다.**

**남은 것**: 두 초안의 잔여 개정(kickoff §6)은 [backlog.md](../backlog.md) A-7 이 맡는다.

---

## 2026-08-20 (이어서) — 사전 기동 검증을 기계가 하게

커밋 2·3 에서 **연속으로 같은 것을 빠뜨렸다.** 새 사전을 만들고 `worker.py` 가 그 모듈을
임포트하지 않으면 기동 시 검증이 일어나지 않는다 — 테스트는 전부 초록인데 컨테이너에서
사전을 지워도 워커가 떴다. 두 번 다 컨테이너 검증에서야 드러났다.

progress.md 에 주의를 적는 것으로는 세 번째를 못 막는다. E-6(낡은 Prisma 클라이언트)에서
"문서에 적힌 주의는 다음에도 같은 방식으로 실패한다"고 정리해 놓고 같은 방식을 쓸 뻔했다.

**디렉터리 스캔은 답이 아니다** — 스캔은 있는 파일을 찾지 **빠진 파일을 모른다.** 셋 중 하나가
이미지에 없으면 "둘 적재"로 조용히 성공한다. 부재를 감지하려면 기대 집합이 선언돼 있어야 한다.

**기대 집합을 저장소에 묶었다**
- `vocabulary.REQUIRED` 에 사전 목록을 두고, `tests/test_vocabulary.py` 가 이 목록을
  `packages/shared-types/src/*-vocabulary.json` **실제 파일 목록과 대조**한다. 사전을 새로
  만들면 `REQUIRED` 에 넣기 전까지 테스트가 실패한다
- `worker.py` 는 `vocabulary.verify_all()` 을 **한 번** 부른다. 목록에 들어가는 순간 기동 검증이
  자동으로 따라오므로 **사전이 넷째로 늘어도 `worker.py` 는 손대지 않는다** — 임포트 누락이라는
  실패 모드 자체가 사라진다
- 호출 위치는 `main()` 최상단이다. DB·Redis 를 건드리기 전에 멈춘다
- Dockerfile 의 와일드카드 COPY 가 지워지지 않았는지도 테스트가 본다

**검증**
- 워커 **124 테스트 통과**(신규 `test_vocabulary.py` 6개)
- 더미 `probe-vocabulary.json` 을 저장소에 넣어 **가드가 실제로 실패시키는지** 확인
- 컨테이너에서 무효화 사전만 지우고 `pipeline.invalidation` 을 **임포트하지 않은 채**
  `verify_all()` 을 불러 잡히는 것을 확인 — 이전 방식으로는 통과하던 경로다

**대비**: 같은 날 Dockerfile 와일드카드 COPY 는 셋째 사전을 아무 변경 없이 받아냈다.
한쪽은 기계가 막았고 한쪽은 문서가 못 막았다.

---

## 2026-08-20 (이어서) — `anchorAffinity` 검증 — `fallback` 과 정반대 규칙

매니페스트 개정에서 anchor 어휘 절의 값 테이블을 지우기로 하면서, 그 절이 **값 대신 무엇을
남겨야 하는지**를 정리하다 발견했다.

두 배열이 같은 `AnchorSpec` 을 담는데 규칙이 정반대다.

| 필드 | 규칙 |
|---|---|
| `fallback` (editSpec) | `drop` 으로 **끝나야** 한다 |
| `anchorAffinity` (매니페스트) | `drop` 을 **포함하면 안 된다** |

`drop` 은 "어디에도 못 붙이면 안 붙인다"는 폴백 종점이지 붙일 수 있는 자리가 아니다. 그런데
`isValidAnchor({kind:"drop"})` 는 **참**이므로, 전용 검증이 없으면 매니페스트에 들어가도
아무도 모른다 — 그 에셋은 "아무 데도 안 붙임"을 선호하는 팩 아이템이 된다.

`isValidAnchorAffinity()` 를 TS·워커 양쪽에 넣었다. 같은 배열이 한쪽에서는 통과하고 다른
쪽에서는 거부되는 것을 테스트가 한 줄로 고정한다.

**검증**: 워커 **125 테스트**, API **317 테스트** 통과. `lint`·`typecheck` 통과.
