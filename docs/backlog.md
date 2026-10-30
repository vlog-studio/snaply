# 미결 작업 백로그

**작성일**: 2026-08-10
**상태**: 현행 — 저장소 전체의 닫히지 않은 작업을 모은 단일 목록
**원천**: 다음에 결정하거나 구현할 일의 유일한 원천. 확정된 결정의 배경·기각한 대안은
[decisions/](./decisions/README.md), 착수 전 구현 제안은 [plans/](./plans/README.md), 요구별 구현 상태는
[specs/](./specs/README.md)의 라벨, 끝난 일은 [progress.md](./progress.md)가 원천이다
**관련 문서**: [progress.md](./progress.md) · [decisions/README.md](./decisions/README.md) ·
[specs/README.md](./specs/README.md) · [doc-conventions.md](./doc-conventions.md) §본문

미결 항목은 이 문서에만 둔다 — 여러 문서에 흩어져 있으면 하나를 닫아도 나머지가 낡는다. 이 문서만 읽어도
다음에 결정하거나 구현할 일을 빠짐없이 찾을 수 있어야 하고, 다른 문서는 항목을 ID(`A-4`)로 가리킨다.

**항목 형식**: 각 항목은 **왜 막혀 있는지**와 **무엇이 있으면 닫히는지(완료 조건)**를 적는다. 결정의 배경은
결정 문서에 두고 여기서는 링크한다. 항목 앞의 `앱` · `서버` 라벨은 작업할 곳(모바일 앱 · 저장소의 API · 워커 코드)이다.

**닫는 법**: 끝난 항목(끝난 체크 항목 `[x]` 포함)은 본문을 지우고 문서 끝 [닫은 항목](#닫은-항목)에
`- **ID** 요약 — 날짜 → progress 날짜 "제목"` 한 줄만 남긴다. 진행 기록이 없는 결정이면 `→ 근거 문서` 를, 다른 항목에 합쳤으면
`— 날짜 ID 에 합침` 을, 할 필요가 없어졌으면 `— 날짜, 필요 없어 닫음` 을 쓴다. 일부만 끝났으면 끝난 부분만 옮기고 남은 것을
둔다. 번호는 재사용하지 않으며, 빠진 번호는 닫은 항목에 있다. `progress 날짜 "제목"` 은 [progress.md](./progress.md)(이번 달)와
`archive/progress-YYYY-MM.md`(지난달)에서 날짜로 찾는다 — progress.md 머리말의 grep.

다음 번호: A-24 · B-10 · C-9 · D-7 · E-70 · H-20

---

## A. 기획 · 제품 결정, 실측 대기

가장 앞단의 병목. 제품 결정이 정해지지 않아 구현을 시작할 수 없는 것(A-1 · A-2 · A-7 등)과, 구현은 끝났지만 실측 ·
잠정값 확인을 기다리는 것(A-3 · A-6 · A-11 ~ A-14)이 있다.
회의에서 정해야 하는 결정 요청 문서의 목록은 [decisions/README.md](./decisions/README.md) §결정 대기.

### A-1. 무비 생애주기 — 남은 정책

**결정됨**: 영상은 평면으로 보관하고, 편집할 클립을 참조하는 엔티티는 **`Movie`** 다
([decisions/movie-model.md](./decisions/movie-model.md)). 세부 규칙 ①~⑤는
[movie-export-policy.md](./decisions/movie-export-policy.md), 생애주기 세 축(스냅 보관 · 로컬 파일 · 내보내기 후)은
[snap-retention-period.md](./decisions/snap-retention-period.md) ·
[local-copy-after-upload.md](./decisions/local-copy-after-upload.md) ·
[movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md)가 원천이고, 요구는 SNAP-9·12·13·14 ·
MOV-16~19 다. 만료의 동작 구조(2단계 삭제 · 만료 스냅 식별 · 사전 알림)는
[snap-retention-period.md](./decisions/snap-retention-period.md#만료의-동작-구조). 위치 정보 저장 여부는 A-4 에서만
관리하고, 로컬 삭제 전환과 15일 만료가 겹치는 문제는 A-4 "전환을 켤 때 함께 볼 것"이 맡는다.

서버 API(2026-09-09)와 앱 전환(2026-09-12, [decisions/movie-client-cache.md](./decisions/movie-client-cache.md))은
끝났다 — 닫힌 항목은 [닫은 항목](#닫은-항목). 남은 것:

- [ ] **무비가 참조 중인 스냅의 만료 예외 여부**(정책) — 잠정 결정(2026-09-15): 예외 없음(현행 유지, 코드 변경 없음) → 다음 회의에서
      요금제(A-2)와 함께 선택지 C(무비를 편집하면 기간이 갱신)부터 본다 — 비용이 아니라 유료 전환 경계의 문제다. 공모전 시연 데이터는
      이 정책대로 만료 일정에 맞춰 준비한다(2026-10-15 오너). 검토한 선택지 넷과 기각 사유는
      [decisions/movie-snap-expiry-exemption.md](decisions/movie-snap-expiry-exemption.md).
      **완료 조건**: 결정 문서의 상태를 `결정` 으로 바꾼다(예외를 두면 SNAP-9 · MOV-16 을 먼저 고친 뒤 구현한다)

- [ ] **`서버`** **프로젝트(무비) 자동 삭제 킬스위치** — 프로젝트는 지우지 않되 자동 삭제를
      "기능만 만들고 기본 꺼짐"으로 두기로 했다([movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md)
      파생 결정 3). 결과물 정리(끝내기 시 삭제 MOV-17 · 30일 상한 MOV-16)는 구현됐지만 이 스위치는
      코드에 없다. 언제 지울지는 결정에 없으므로 구현 전에 정한다.
      **완료 조건**: 기본 꺼짐 설정과 삭제 경로가 테스트와 함께 들어간다

### A-2. 크레딧 결제 세부 정책 확정

과금 모델·결제 채널·보관 정책은 확정됐고 백엔드 구현도 끝났다(progress 2026-08-14 "크레딧 결제 구현 + Stripe·구독 제거") —
현행 요구는 [specs/credits-and-payment.md](./specs/credits-and-payment.md)·[snap-library.md](./specs/snap-library.md)·
[movie.md](./specs/movie.md), 배경은 [decisions/](./decisions/README.md)의 결제·스토리지 결정이 담는다.
크레딧 쪽 미결은 **코드가 아니라 값**이며 `apps/api/src/services/billing/credit-policy.ts` 의 숫자만 교체하면 닫힌다.

**결정할 것 — 크레딧(생성 축)**:
- 크레딧 팩별 **수량과 가격** (현재 500 / 1,200 / 3,000 은 잠정값이며 스토어 미등록)
- 크레딧 유효기간 (권장: 구매 크레딧은 만료 없음)
- **가입 보너스 수량** — 출시 수량 미정(코드 기본 0 = 지급 안 함, CRD-8). 공모전 서버만 시크릿으로 500 —
  [deployment-aws.md](./deployment-aws.md) §8
- 프로모션·운영 보상 지급 기준 — **공모전 동안의 테스터는 운영자가 추가로 준다**(2026-10-15 오너 결정). 원장 사유는
  이미 있는 `promo` 를 쓴다. 지급하는 도구(스크립트 · 관리 API)는 아직 없다 — 지금은 운영 DB 에 직접 넣는다
  ([deployment-aws.md](./deployment-aws.md) §8). 출시 뒤의 기준은 그대로 미결
- 고해상도 export의 추가 차감 여부 (현재 전 export 동일 100)

**결정할 것 — 구독(보관 축)**: 스냅 보관이 **기간 기준(업로드 후 15일)** 으로 바뀌어
([snap-retention-period.md](./decisions/snap-retention-period.md)) 구독이 무엇을 팔지부터 다시 정해야 한다 —
종전의 "용량 티어" 설계는 용량 한도(2GB)를 전제로 했다. 결과물 만료 안내는 2026-10-11 에 끝났다(닫은 항목 A-1).
- **구독으로 보관 기간을 팔 것인가** ⚠️ **예정일 뿐 미확정이다.** 판다면 연장(며칠/몇 달)인지
  무제한인지, 티어별로 다른지와 가격 · 연 구독 여부를 정해야 하고 구독 상품의 축이 "용량"에서
  "기간"으로 옮겨간다. **정해지기 전까지 스냅 만료 구현은 전원 15일을 가정한다**
- **구독 혜택에 워터마크 제거·고해상도 export를 포함할지**
- **용량 한도(2GB)를 존치할지** — 기간 만료가 누적을 대신 막아 평균 사용자는 닿지 않는다.
  권장은 폐기하고 남용 방지 상한만 별도로 두는 것([snap-retention-period.md](./decisions/snap-retention-period.md#이-결정이-남긴-후속-판단)).
  SNAP-9 의 ※ 메모가 이 결정을 기다린다
- [ ] **구독 만료·보관 정책 변경 때의 사전 고지** — 스냅 만료 예고(D-3 · D-1, KST 10시)는 정해졌지만
  ([decisions/expiry-notice-schedule.md](decisions/expiry-notice-schedule.md)), 사용자 구독이 끝날 때와
  우리가 보관 정책을 바꿀 때 언제 알릴지는 정해지지 않았다

경계 규칙상 **구독에 크레딧을 얹는 안은 검토 대상이 아니다**
([decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §4.3).

**완료 조건**: 위 수량·가격 확정 → `credit-policy.ts` 값 교체 → 양 스토어에 동일 상품 ID로
등록 + RevenueCat 프로젝트·웹훅 URL 연결 → 구독을 팔기로 하면 entitlement 반영(용량 한도를 남기기로
하면 그 집행 — 유예 → 읽기 전용 전이 포함) → 결제·편집 e2e 실검증.

### A-3. 스냅 내용 분석 — 구현 완료, 생산 활성화 대기

스키마·API·분석 워커·docker 배선은 2026-08-19 에 들어갔다(progress 2026-08-19 "스냅 내용 분석 본구현 — 스키마·API·분석 워커·docker",
계획 대비 차이는 [decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) §9).

분석은 명시적 요청으로만 시작된다(ANA-1) — `POST /videos/:videoId/analysis` 와 추천 요청
(`POST /movie-recommendations` 가 후보 스냅의 분석을 적재한다). **업로드 시 자동 분석은 없다.**

**2026-09-27 실동작화 착수 결정**: 분석·추천 경로를 실제 모델로 돌리고 넓히는 순서는
[plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md).
그 1·2단계의 미결이 이 항목에 있다. 회사 OpenAI 키(C-7)는 2026-09-29 에 받아 스냅 4건으로 분석 → 추천 → 앱
표시까지 한 번 돌았다(progress 2026-09-29 "실제 모델로 스냅 분석 · 템플릿 추천 첫 실행").

- [ ] **실측 키의 rate limit 확인** — 실측은 공모전 서버의 키로 돈다(아래). 그 키의 rate limit 등급이 실측 때
      `VIDEO_ANALYSIS_CONCURRENCY`(기본 3)를 올릴 수 있는 상한이다(C-7 에서 옮김). 사용 한도 · 예산 상한은 D-6 — 실측 전에 건다
- [ ] **팀 스냅 30~100편으로 실측** — **2026-10-16: AWS 공모전 서버에서 실측 전용 계정으로 한다**(로컬에는 OpenAI 키가 없고, A-12 · A-14 의 지표도 같은
      표본에서 나와야 한다). 준비 순서(예산 상한 → 서버에서 분석 켜기 → 실측 계정과 동의 → 팀 스냅 → 크레딧 → 돌리기 → 집계 · 채점)와 집계
      `deploy/aws/measure.sql` 은 [deployment-aws.md](./deployment-aws.md) "실측". 아래는 첫 계획의 문장이다 — 개발 환경에서만 `MOVIE_RECOMMENDATION_ENABLED=true`, 계획 §4.1 의 카테고리를
      채운 팀 스냅으로 분석 → 추천 → 앱 병합까지 확인하고, 드러난 결함을 고친다. 2026-09-29 첫 실행은 스냅 4건
      (에뮬레이터 1 · 휴대폰 3)이라 품질·모델 비교의 근거가 되지 못한다(progress 2026-09-29 "실제 모델로 스냅 분석 · 템플릿 추천 첫 실행").
      개념 매칭의 실측은 같은 표본으로 A-6 "개념 매칭의 실측 확인"이 맡는다

**2026-09-29 옵트인 결정**: 법무 검토 전에도 **분석에 동의한 사용자에게는** 켤 수 있다(ANA-5·REC-4,
[결정 문서](./decisions/snap-content-analysis.md) §6.1). 동의 기록·서버 집행·앱의 동의 화면·약관 초안 반영은
같은 날 들어갔다(progress 2026-09-29 "스냅 분석 옵트인 동의"). 그래서 생산 활성화를 막는 것은 법무 검토가 아니라
위의 팀 스냅 실측과 아래 운영 모델 고정이다. 분석 고지의 법무 확정(동의 문구 포함)은 여전히 필요하지만 켜는
조건이 아니며, D-2 "분석 고지"에서만 관리한다.

- [ ] **운영 모델 고정** — `OPENAI_VISION_MODEL` 기본값 `gpt-5.6-luna` 는 잠정값이다.
      실제 스냅으로 모델을 비교해 고정한다
- [ ] **품질·단가 기준선** — 요약 사실성·핵심 사물/행동 포함률·환각 비율·`usableForEdit`
      정확도는 사람이 채점해야 한다. 처리시간·토큰·실패율·모델별 비교는 `video_analyses`
      테이블 집계로 나온다 (결정 문서 §9.3, 집계 쿼리는 계획 §4.1)
- [ ] **분석 시점 재결정** — 첫 추천이 후보 분석이 끝날 때까지 기다리는 원인이다. 현행 "추천 요청
      시점"은 단가 실측 없이 정해졌으므로(결정 문서 §3), 기준선 단가로 현행 / 외출 확정 시 선분석 /
      업로드 직후 전량 중 하나를 고른다(계획 §4.2). 바꾸면 스펙 ANA-1 을 먼저 고치고 결정 문서 §3 을 갱신한다

**기준선이 나오면 정할 것**(추천 상한 REC-3 의 재조정은 A-6): 스냅당 단가 상한 ·
프레임 수(현재 최대 4)·`OPENAI_IMAGE_DETAIL`(현재 low) 재탐색 여부 ·
유사 프레임 제거 임계값(`DUPLICATE_HAMMING_THRESHOLD`) 적정성 — 실제 스냅에서 4장이
2장으로 줄어드는 비율을 `frame_timestamps_ms` 로 확인한다 · 출력 토큰을 줄이는 프롬프트 v2
(`VIDEO_ANALYSIS_PROMPT_VERSION` 올림)와 키의 rate limit 이 허락하는 `VIDEO_ANALYSIS_CONCURRENCY`.

**후속 기능**: 대주제 기반 자동 스냅 선택은 **A-6** 으로 열렸다(2026-08-19).
`usableForEdit=true` 인 분석 결과를 점수화해 슬롯을 채우는 경로다.

**계획 문서의 보관**: 실측(위 "팀 스냅 30~100편으로 실측")이 끝나면
[plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md)를 archive 로 보낸다 — §4.1 의
실측 절차는 [decisions/snap-content-analysis.md](./decisions/snap-content-analysis.md) §9.3 으로, 아직 시작하지 않은 2~5단계는
이 항목과 A-6 의 체크박스로 옮긴다(4단계 관심사는 2026-10-13 에 끝났다. 2026-10-09 결정 — 실측 결과가 2단계 이후 결정의 입력이라 그때까지 둔다).

### A-4. 스냅 서버 원천 전환의 미결 항목 · iOS 출시 전 목록

[decisions/snap-source-of-truth.md](./decisions/snap-source-of-truth.md) 에서 결정을 마쳤으나 남은 판단:

- [ ] 위치(`place`) 정보의 서버 저장 여부 — 프라이버시/약관 검토 선행. 함께 볼 것: 원본 파일 자체에 휴대폰이 적은 GPS 태그가 있고,
      **배포본(렌디션)은 그 태그를 그대로 옮긴다**(ffmpeg 이 전역 메타데이터를 복사한다). 배포본은 같은 계정의 기기만 받는다. 무비 결과물에서는
      2026-10-07 에 지웠다(E-17)
- [ ] 비로그인 사용자의 스냅 지위 (현행: 업로드 워커가 로그인 시에만 동작)
- [ ] egress 비용 실측 후 렌디션 기본 다운로드 정책 재평가

로컬 파일은 최종적으로 캐시가 되지만 **켜는 것은 렌디션·동기화가 실기기에서 검증된 뒤로 연기**했다
(SNAP-14, [local-copy-after-upload.md](./decisions/local-copy-after-upload.md)) — 그때까지 기기 파일이 원천이다.
선행이던 렌디션(2단계)과 reconcile(3단계)은 Android 실기기 검증까지 끝났다([닫은 항목](#닫은-항목)). 남은 것:

- [ ] **`앱`** **촬영 스냅 치수 실측의 실기기 확인** — 촬영 스냅이 파일에서 회전 반영 치수를 읽게 한
      변경(2026-09-12)은 단위 테스트와 `swiftc -parse` 로만 확인했다. Android dev build 에서 세로·가로 촬영
      각각 저장된 `width`·`height`·`orientation` 과 기존 스냅의 백필(`SnapMetadataBackfill`)을 확인하면 닫힌다
- [ ] **`앱`** **되돌리기의 다른 기기 반영**(SNAP-20 `구현됨(토스트의 되돌리기가 다른 기기에 반영되는 것은 아직 보지 못했다)`) — 모든 기기에서 삭제가
      다른 기기에서도 사라지는 것, 최근 삭제에서 되살리면 두 기기에 다시 나타나는 것, 지울 때 빠진 무비의 컷이 돌아오지 않는 것은 2026-10-09
      휴대폰 + 에뮬레이터(AWS 서버)에서 확인했다(progress 2026-10-09 "휴대폰과 에뮬레이터로 — 다른 기기 · 삭제 · 업로드 전 무비"). 토스트의 `되돌리기` 는 지운 기기에서 스냅을 돌려놓았지만, 다른 기기가 그사이 동기화하지
      않아 그쪽에서 사라졌다 돌아오는 것은 보지 못했고, 지운 기기에서 처음 재생할 때 받아 오는 화면도 3초 파일이라 잡지 못했다. 다른 기기가 삭제를
      받은 뒤 `되돌리기` 를 누르면 그 기기에 다시 나타나는지 본다 — 기기에만 있는 동작이 아니라 에뮬레이터 두 대로도 된다(H-15).
      **완료 조건**: 통과하면 SNAP-20 의 괄호를 지운다
- [ ] **전환을 켤 때 함께 볼 것**: 로컬이 캐시가 되는 순간 서버 만료(SNAP-9, 15일)가 곧 영상의
      소멸이 된다. 보관 기간·구독 연장과 **같은 자리에서** 판단한다. 사용자가 고르는 "이 기기에서만 삭제"는
      2026-09-29 에 들였고(SNAP-19, [snap-album-save-and-device-delete.md](./decisions/snap-album-save-and-device-delete.md)),
      여기 남은 것은 앱이 **스스로** 기기의 파일을 지우는 전환이다. 그때는 자동 앨범 저장(SNAP-18)의 기본값(꺼짐)도
      다시 본다 — 앨범의 사본이 사용자의 유일한 영구 사본이 된다

이 기기에서만 지운 스냅의 만료(SNAP-19 ⑤)는 F "2026-10-21 ~ 24 휴대폰 확인"에 있다.

**iOS 출시 전** — 1차 운영 배포는 Android 만이라 지금은 대상이 아니다(2026-09-27 오너). iOS 에서만 남은 확인은 이 목록에만 둔다.
iPhone 실기기와 유료 Apple Developer 계정이 생기면 본다. **완료 조건**: 각 항목을 iOS 빌드(실기기가 필요한 것은 iPhone)에서 통과하고,
해당 스펙 라벨(SNAP-3 · SNAP-15 · ACC-1 등)을 고친다.

- [ ] **iPhone 에서 찍은 스냅이 Android 에서 재생되는지** — 아이폰 원본은 HEVC/HDR 이라 다른 기기는 렌디션(H.264/SDR)으로 재생하는데, 그
      변환은 워커 계약 테스트(합성 HDR10)로만 확인됐다 — 2026-09-15 스트레스 검증의 아이폰 영상은 H.264 였고,
      **실제 아이폰 HEVC·돌비비전 원본으로 돌린 적이 없다**(F 의 돌비비전 항목과 같은 공백). iPhone 실기기가
      생기면 iPhone 촬영 → Android 도착·재생, 그리고 그 반대를 확인한다. iOS 시뮬레이터에서 받은 사본의 재생은 확인했다
- [ ] **iOS 실기기 검증 절차 문서** — 아직 없는 문서다(`apps/mobile/docs/workflows/ios-device-verification.md`). 오너에게
      iOS 기기가 없어 쓰지 못했다. 그때까지는 시뮬레이터 절차로 대신하고 실기기 미검증을 밝힌다([apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md)
      §Verification). **완료 조건**: iPhone 실기기가 생기면 절차를 써서 `apps/mobile/AGENTS.md` 의 문서 표에 넣고 §Verification 의
      대체 문장을 지운다
- [ ] **앨범 저장의 iOS 확인** — "추가만" 사진 권한 질문과 보관함 저장, 거절한 뒤의 `설정에서 권한 켜기`.
      앱이 사진 전체 접근을 요청하지 않아도 App Store 정적 검사가 `NSPhotoLibraryUsageDescription` 을 요구하는지도
      본다(지금은 두 문구를 모두 넣었다)
- [ ] **갤러리 영상 잘라내기(iOS 네이티브 트림, SNAP-3)** — iOS 는 빌드한 적이 없다(SNAP-3 의 괄호,
      [기능 문서](../apps/mobile/docs/features/snap-extract.md)). iOS 빌드로 확인하고 SNAP-3 의 괄호를 지운다
- [ ] **iOS 테스터 앱** — 설치 배포(ad hoc · TestFlight)에 유료 Apple Developer 계정이 필요하고 번들 ID 가
      `com.anonymous.snaplyapp` 이다. 아이폰 테스터가 있으면 계정부터 정한다(B-8 에서 옮김)
- [ ] **iOS 광고(C-6 의 iOS 몫)** — ATT 동의 흐름(맞춤 광고 · 동의 정책은 D-2), iOS AdMob App ID · 광고 단위 · SKAdNetwork 설정,
      iOS 에서의 SSV 수신과 크레딧 지급
- [ ] **Apple 로그인**(ACC-1 의 `보류`) — iOS 에서 Google 로그인을 내면 App Store 심사 지침 4.8 이 개인정보 조건을 갖춘 다른 로그인
      (Apple 로그인 등)을 함께 요구한다
- [ ] **정크 저널 화면의 iOS 확인**(A-15) — 오프셋 그림자 · 잘린 종이 조각의 그림자 · 회전한 글자 · 새 글꼴(Gaegu · D2Coding)이 iOS 에서
      Android 와 같게 그려지는지, 터치 48dp 를 iOS 에서도 유지할지([decisions/junk-journal-design-system.md](./decisions/junk-journal-design-system.md) §다시 볼 때)

### A-6. 템플릿 기반 스냅 자동 추천 — 앱·백엔드 완료, 생산 활성화 대기

템플릿으로 무비를 시작할 때 슬롯에 들어갈 스냅을 분석 결과 기반으로 고른다. A-3의 후속 항목이며
방향·기각안은 [decisions/template-snap-recommendation.md](./decisions/template-snap-recommendation.md).

**2026-08-19 완료 (1·2·3단계)**: 서버 카탈로그·추천 API·앱 연동까지 전부 구현됐다.
현행 요구는 [specs/template-and-recommendation.md](./specs/template-and-recommendation.md),
앱 동작은 [모바일 기능 문서](../apps/mobile/docs/features/movie-templates.md),
검증 내역은 progress 2026-08-19 "무비 템플릿 카탈로그 서버 이관" · "템플릿 스냅 추천 API — 규칙 기반 점수화".

**남은 것**
- [ ] **활성화**: `MOVIE_RECOMMENDATION_ENABLED` 는 **기본 꺼짐**이다. 켜는 조건은 A-3 과 같다 —
      팀 스냅 실측과 운영 모델 고정(A-3). 2026-09-29 옵트인 결정으로 법무 검토(D-2)는 켜는 조건에서 빠졌고,
      켜도 분석에 동의한 사용자에게만 돈다(REC-4). 켜지 않으면 추천 경로에서 분석이 돌지 않는다
- [ ] **상한 값 재조정**: 추천 상한(REC-3, [specs/template-and-recommendation.md](./specs/template-and-recommendation.md) — 추천 1회당 후보 수
      포함)은 잠정값이다. A-3 의 단가 실측이 나오면 `apps/api/src/services/recommendation/recommendation-policy.ts` 의 숫자만 바꾼다.
      상한 재조정은 이 항목에서만 관리한다
- [x] **개념 매칭의 실측 확인** — 2026-10-26 운영 분석 28건으로 쟀고, 기준을 못 넘은 v2 를 v3 으로 고쳤다(오탐 34 → 1 · 놓침 40 → 6, 예전 규칙 7 · 45 —
      progress 2026-10-26 "개념 매칭 실측과 사전 v3"). 아래는 원래 문장이다. 2026-10-13 키워드 매칭을 부분 문자열에서 개념 사전 매칭으로 바꿨다(A-13 1단계, progress 2026-10-13 "개념 사전 확정").
      계획([archive/content-vocabulary.md](./archive/content-vocabulary.md))의 순서는 실측(§5.4) 뒤 도입이었지만, 온톨로지 착수 순서에 따라 실측보다
      먼저 들였다 — 고른 사례(오탐 16 · 미탐 12)는 모두 고쳐졌지만 모델이 실제로 내는 값에서 얼마나 맞는지는 모른다. A-3 의 팀 스냅 실측에
      [archive/content-vocabulary.md](./archive/content-vocabulary.md) §5.4 를 얹어 필드별 사전 안 비율 · 규칙별 오탐 · 놓친 쌍 · 사전 밖 값 상위를 잰다.
      개념 매칭 실측의 원천은 이 항목이다 — A-13 · A-14 는 이 결과를 가리킨다.
      **완료 조건**: 개념 매칭의 오탐이 부분 문자열보다 적고 놓친 쌍이 많지 않음을 확인하고, 사전 밖 값 상위로 사전을 고친다(버전을 올린다).
      기준을 못 넘으면 사전과 규칙을 고친다
- [ ] **개념 매칭 재실측(다른 표본 · 사람 채점)** — 2026-10-26 v3 은 몽골 여행 28건을 보고 고친 사전을 같은 28건으로 Claude 가 채점한 값이다.
      도시 · 카페 · 음식 스냅이 섞인 다른 외출로 다시 재고, 사람이 채점한다. 남은 약점: 노을이 topics 에만 적히면 objects 힌트가 놓친다, 머리가
      아닌 낱말을 보는 정규화 ③(`나무 선반` → 나무), 상위 0 이라 `이동` 만 적힌 걷기를 놓친다. 채점 스크립트는 progress 의 방법을 따른다
- [ ] **추천이 쓰이는 곳 결정** — 지금은 템플릿 슬롯에만 쓰인다. 선택지와 권장은
      [plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md) §4.3.
      **2026-09-28**: 고른 스냅으로 AI 편집 초안을 만드는 쓰임(§4.3 (b)를 넓힌 것)이 오너 결정으로 열렸다 — A-11.
      남은 것은 그 밖의 쓰임((c) 스튜디오의 선제 제안 등)이다.
      2026-08-31 개발자 회의의 "AI 추천 프로젝트"([meetings/2026-08-31-dev-sync.md](./meetings/2026-08-31-dev-sync.md) §5)가
      이 항목의 확장인지 별개 기능인지도 여기서 함께 정한다. A-3 의 실측 뒤에 정한다

**후속 후보(아직 열지 않음)**: `다른 조합`(같은 템플릿에 다른 외출 제안). 템플릿 카드의 순서는 2026-10-15 에 정했다(다 채울 수 있는 것이 앞, 묶음 안은 취향 순 —
progress 2026-10-15 "템플릿 카드를 취향 순으로").

### A-7. 트렌드 숏폼 편집 — 타임라인 스펙 v3

현행 편집은 컷 + 프리셋 색보정 한 줄이 전부라, 틱톡·릴스형 브이로그가 요구하는
**비트 그리드 · 레이어 · 키프레임**을 `editSpec` v2 가 표현하지 못한다. 오픈소스를 더 붙여도
스펙이 "0.48초에 컷, 이 좌표에 스티커 300ms pop-in"을 담지 못하면 전달할 방법이 없다.
층별 설계·오픈소스 선정·라이선스 판정은
[plans/trend-editing-pipeline.md](./plans/trend-editing-pipeline.md),
스펙 v3 의 확정 결정은 [decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md).

**진행 상황**: 스펙 v3 의 설계 결정이 확정됐고 공유 어휘 사전 3종(앵커 · 스테이지·시드 · 재생성 무효화)이
구현·검증됐다(progress 2026-08-20 "앵커 어휘 사전 + 워커 빌드 컨텍스트 루트 통일" ~ "재생성 무효화 규칙 — 표가 아니라 데이터로"). 2026-10-01 에는 v3 의 `timeline`(컷 · 경계별 전환)만
먼저 들어가 무비 생성이 `edit-v3` 큐로 렌더한다(A-11, [progress.md](./progress.md) 2026-10-01 "경계별 전환의 렌더") —
색보정·음악은 아직 v2 프리셋(`stylePreset`)이 정한다. 두 스키마 초안(editSpec v3 · 에셋 팩 매니페스트)은
2026-10-03 main 에 들어왔다([닫은 항목](#닫은-항목)). **아래 미결은 그대로다** — 사전과 초안은 계약을 고정한
것이지 파이프라인을 구현한 것이 아니다.

v3 는 **Movie export 에 붙인다** — `POST /edit-jobs` 는 2026-10-11 에 없앴으므로
([decisions/movie-export-policy.md](./decisions/movie-export-policy.md) ⑤) 붙일 곳은 하나다.

**막힌 이유**: 선행 결정 둘(번인 자막·워터마크)과 음원·스티커 조달이 열려 있다.

- **번인 자막 전환은 FE 계약 변경** — 단어 단위 애니메이션은 ASS/libass 로만 되고, 그러면
  현행 mov_text 소프트 자막이 번인으로 바뀐다. 현행 동작("플레이어에서 켜야 보인다")은 계약
  `captions` 설명([`contract/movies.ts`](../packages/shared-types/src/contract/movies.ts))과
  MOV-9 가 안내한다. 새 라이브러리는 0이지만 **결정 문서가 선행**이다. 단어 타임스탬프 → ASS 문서 생성(`karaoke` · `pop`)과 번들 한글 글꼴은
  렌더 경로 밖에 먼저 들어갔다(`apps/ai-worker/src/pipeline/ass_caption.py`, progress 2026-10-20 "단어 단위 ASS 자막과 번들 한글 글꼴") — 번인으로 정하면
  남는 것은 whisper 의 `word_timestamps` 호출 · `ass` 필터 합성(`ass.filter_arg`) · 계약 변경이다. BGM 컷편집 무비의 글은 자막이 아니라 텍스트 액센트다(A-19)
- **워터마크 결정이 레이어 설계 입력** — A-2에서 넣기로 하면 v3 `layers` 가 표현해야 한다
- **BGM 은 9곡 — `calm`(감성) 곡이 없다** — 2026-10-27 Pixabay 9곡을 운영 버킷에 올렸다(`daily` 3 · `upbeat` 6, progress 2026-10-27). 그 전까지는 매니페스트가
  비어 운영 무비에 음악이 없었다. 감성 스타일(`calm`)은 아직 0곡이라 그 무비는 곡 없이 렌더된다. 확보는 F 의 "실BGM 기준 whisper 자막 인식 재확인"의 선행이기도 하다
- **스티커 에셋도 없다** — 배치 코드가 있어도 아트가 없으면 검증할 게 없다

**결정할 것**

- [ ] 번인 자막으로 전환할 것인가 — [decisions/subtitle-rendering.md](./decisions/subtitle-rendering.md)(미결).
      어느 쪽이든 앱에서 자막을 켤 길이 없어 MOV-9 가 `부분`이다 — 소프트 유지면 앱에 스위치를, 번인이면 계약 변경을 함께 한다
- [ ] BGM 을 어디서 확보할 것인가(AI 생성 음원 포함)와 예산 — [decisions/bgm-sourcing.md](./decisions/bgm-sourcing.md)(미결). **공모전 기간은 무료 라이선스
      라이브러리에서 스타일별 3곡씩 9곡으로 잠정 결정**(2026-10-15) — 정식 조달은 공모전 뒤
- [ ] **공모전용 9곡 반영** — 2026-10-27 9곡을 올렸지만 스타일별 3곡이 아니라 `daily` 3 · `upbeat` 6 · `calm` 0 이다(사용자가 고른 보컬 · 빠른 비트 위주) —
      남은 것: `calm` 곡 올리기(3곡 — 로파이 · 칠합 재즈 · 감성 피아노 — 2026-10-28 골라 받아 둠, 사용자가 서버 셸로 올린다), 원본 소리와 섞는 무비(ASMR)의 볼륨 확인 — 음원만 쓰는 무비는 2026-10-28 운영에서 곡이 깔리고 잘 들리는 것을 봤다(progress 2026-10-28). 처음 계획: 곡 고르기(오너 · 팀, 곡마다 출처 · 약관 URL · 확인일 기록) → 버킷 `assets/bgm/` 에 매니페스트와 함께 올리기
      ([deployment-aws.md](./deployment-aws.md) "BGM 곡 올리기") → 실제 곡으로 볼륨(지금 0.25 고정) 확인. 워커가 버킷에서 받아 오는 것과 곡을 무비마다 고정하는 것은
      2026-10-15 에 넣었다(progress 2026-10-15 "BGM 을 버킷에서 받고 무비마다 고정한다"). 끝나면 에이전트 `pick_music`(A-12)을 무드 태그로 이을 수 있다
- [ ] `bgm_tracks` 스키마 신설 — `schema.prisma` 는 공유 파일이라 [team.md](./team.md) §2·§3 적용
- [ ] **BGM 덕킹** — 원본 소리가 나는 동안 BGM 을 낮춘다(`sidechaincompress`, [plans/trend-editing-pipeline.md](./plans/trend-editing-pipeline.md) §6.3). 지금 BGM 은
      고정 0.25 배로 섞인다(`pipeline/music.py`). 실제 BGM 으로 들어 봐야 값을 정할 수 있어 BGM 조달과 함께 한다
- [ ] 스티커를 어디서 확보할 것인가(디자이너 커미션 여부와 스타일 방향) —
      [decisions/sticker-asset-sourcing.md](./decisions/sticker-asset-sourcing.md) 결정 1(미결)
- [ ] 스티커를 어떤 경로로 등록·관리할 것인가(관리자 페이지 도입 여부) — 같은 문서 결정 2(미결)
- [ ] **세이프 에어리어 실측값** — 상단 약 10%·하단 약 20%·우측 버튼 레일은 추정치라 실기기 캡처가
      필요하다. 값은 스펙이 아니라 버전드 팩에 둔다([edit-spec-v3.md](./decisions/edit-spec-v3.md) §1 V3-B3)
- [ ] **에셋 라이선스에 영구(perpetual) 조항을 필수로 걸 것인가** — 근거는 **다시 만들기가
      계속 가능하다**는 것이다([movie-cleanup-after-export.md](./decisions/movie-cleanup-after-export.md):
      프로젝트는 보존되고 유료로 다시 생성한다). 라이선스가 만료돼 에셋 서빙을 멈추면 사용자는 예전
      프로젝트를 **돈을 내고도** 다시 만들 수 없게 된다. 구독형 BGM 라이선스(Epidemic·Uppbeat 등)는 대개 "구독 기간 중
      제작한 콘텐츠는 이후에도 사용 가능" 구조지만, **만료 후 재렌더가 "기존 콘텐츠 사용"인지
      "신규 제작"인지**가 계약서마다 다를 수 있다. 법률 판단이 필요하고 스키마로는 풀리지 않는다.
      조달 단계에서 **"신규 배포 중단 / 기존 저작물 유지" 분리 조항**을 협상 항목으로 올린다.
      이 조항이 확보되면 팩 상태를 셋(`experimental → active → deprecated`)으로 줄이고
      `retired` 를 법적 차단 전용으로 좁힌다([edit-spec-v3.md](./decisions/edit-spec-v3.md) §2 V3-C2)
- [ ] **닫히지 않은 어휘를 사전 파일로** — v3 초안은 `accents[].kind` · `reason.code` · `userEdits.locked` 의 자리만 두고 값을 닫지 않았고,
      에셋 매니페스트의 `platform` 허용 집합과 무드 태그 집합도 아직 사전 파일이 없다(파일을 몇 개로 묶을지도 미결 —
      [plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md) §0). 전환 `kind` 와
      컷 `role` 은 사전으로 닫혔다([`transition-vocabulary.json`](../packages/shared-types/src/transition-vocabulary.json) ·
      [`cut-role-vocabulary.json`](../packages/shared-types/src/cut-role-vocabulary.json), 2026-10-01)
- [ ] **자막 켜기(`intent` 변경)의 무효화 축** — 자막을 켜면 `overlays.captions` 를 무효화하는 것에 더해 whisper 를 다시 돌려야 하는데, whisper 는
      스테이지가 아니라 분석 리더라 시드 `attempt` 축 밖이다. 무효화 사전에 이 액션이 없다([plans/edit-spec-v3.md](./plans/edit-spec-v3.md) §4)
- [ ] **컷 타이밍의 기준을 컷마다** — 결정 V3-B6(`beatLength` 가 기준)은 사용자가 자른 컷과 음악 없는 무비를
      다루지 못한다. 사용자가 자른 컷은 ms, AI 가 정한 컷은 음악이 있을 때 비트가 기준이다
      ([auto-edit-draft.md](./decisions/auto-edit-draft.md) §2.4). 사용자 수정을 값별 주인으로 표현할지,
      v3 초안의 `userEdits` 로 표현할지도 함께 정한다(같은 문서 §2.2)

- [ ] **v3 의 정본 모양** — 2026-10-01 에 들어간 `editSpecV3Schema`([`contract/edit-jobs.ts`](../packages/shared-types/src/contract/edit-jobs.ts))는
      컷에 `videoId` 를 직접 두고 최상위 `stylePreset` 을 쓰지만, 초안([plans/edit-spec-v3.md](./plans/edit-spec-v3.md))은
      `clipId` → `source.clips` · `intent.styleBundleId` 다. 확정 때 어느 쪽으로 맞출지 정한다
- [ ] **끝낸 무비를 구성 그대로 다시 만들 때의 재현** — 무료 "만료 후 재생성"은 2026-09-09 에 폐기됐다(MOV-16 · MOV-19 —
      다시 만들기는 유료 새 생성). 그래서 [decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md) §5 · §6 과 무효화 사전의
      `expired-regenerate`(시드 `attempt` 유지 → 같은 결과) 행이 쓰일 곳을 잃었다. 구성을 바꾸지 않고 다시 만들 때
      (a) `attempt` 를 유지해 같은 결과를 낼지(MOV-14 의 재현 약속과 맞다) (b) "다시 생성"처럼 `attempt` 를 올릴지 정하고,
      사전 행과 그 `note`(`packages/shared-types/src/invalidation-vocabulary.json` — 폐기된 전제인 storage-and-subscription-policy §3
      을 아직 근거로 든다)를 고치거나 지운다. E-5(BGM 재현성)와 함께 본다
- [ ] **팩을 긴급 차단(`retired`)할 때 사용자에게 무엇을 보일지** — [plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md) §12

**완료 조건**: 위 선행 결정·조달 확정 → `editSpec` v3 확정(계약 `editSpecSchema` 와 `openapi.json` 을 같은
변경에서 갱신하고, `parseEditSpec` 이 모르는 스펙을 v1 `일상` 으로 삼키는 폴백을 거절로 바꾼다 —
[decisions/edit-spec-v3.md](./decisions/edit-spec-v3.md) §1 V3-A1) → `bgm_tracks`(비트 그리드는 2026-10-21 에 곡 옆 캐시로 먼저 들어왔다 — `pipeline/beat_grid.py`, 컷을 비트에 맞추는 데는 아직 안 쓴다) →
1단계(출력 옵션 · ASS 자막 · VAD 무음 컷 · 비트 스냅) 구현 → 계약·골든 프레임 테스트 위에서
e2e 실검증.

**의존**: A-2(해상도·워터마크) · E-5.

### A-8. 카카오 로그인 — 서비스 완성 후 인증 추가 계획

**왜 막혀 있는지**: 오너 결정(2026-09-24)으로 서비스 기능을 먼저 완성하고 인증 수단은 그 뒤에
늘린다. 앱 구현은 한 번 해 봤다가 되돌렸다 — 닫힌 PR
[#32](https://github.com/vlog-studio/snaply-backend/pull/32)(커밋 `a2ee3d6`)에 그대로 남아 있어,
재개할 때 참고하거나 가져다 쓰면 된다.

조사로 확인된 사실(재개 시 다시 조사하지 않아도 되는 것):

- Supabase Auth 에 **내장 `kakao` 프로바이더**가 있어 커스텀 OIDC 가 필요 없다. 앱은 Google 과 같은
  PKCE 흐름(`signInWithOAuth({ provider: 'kakao' })`)을 타고, 백엔드는 사용자를 `supabase_uid` 로만
  식별하므로 서버 변경이 없다.
- Supabase 는 카카오에 **`account_email` 동의항목을 항상 요청**한다(끄는 옵션 없음 —
  `supabase/auth` 의 `internal/api/provider/kakao.go`). 항목이 없으면 카카오가 KOE205 로 거부한다.
  `account_email` 은 **비즈 앱**에서만 쓸 수 있으므로 비즈 앱 전환(사업자 정보, 또는 본인인증 기반
  개인 개발자 비즈 앱)이 선행 조건이다. 이메일을 선택 동의로 두고 Supabase 에서
  **Allow users without an email** 을 켜면 이메일을 거부한 사용자도 로그인된다.
- 버튼은 [카카오 로그인 디자인 가이드](https://developers.kakao.com/docs/ko/kakaologin/design-guide)
  규격을 따른다: 라벨 `카카오 로그인`(`카카오로 시작하기`는 카카오싱크 전용), 배경 `#FEE500`, 검정 심볼,
  검정 85% 라벨, 다른 로그인 버튼보다 약하게 보이면 안 된다. 심볼은 공식 리소스를 쓴다.
- Supabase 는 **같은 인증 이메일일 때만** identity 를 합친다 — 이메일을 동의하지 않은 카카오 사용자가
  Google 로도 로그인하면 계정이 둘이 된다. 병합 정책을 같이 정해야 한다.

**완료 조건**: 카카오 앱 비즈 앱 전환 → Kakao Developers 설정(REST API 키·Client Secret·Redirect URI
`https://<project-ref>.supabase.co/auth/v1/callback`·카카오 로그인 ON·동의항목) → Supabase Kakao 프로바이더
활성화 → 앱 버튼 추가(#32 참고) → 개발 빌드에서 실제 로그인 확인 → 스펙 ACC-1 갱신.

### A-11. AI 편집 초안 — 구현됨, 문턱값 실측 남음

고른 스냅 여러 개로 AI 가 고칠 수 있는 무비 초안을 만든다(MOV-21·MOV-22). 범위와 규칙은
[decisions/auto-edit-draft.md](./decisions/auto-edit-draft.md)(상한 · 미업로드 포함은 §5, 편집 툴의 기준과 v1 범위는 §6), 고르고 자르는 규칙은
[decisions/edit-director.md](./decisions/edit-director.md), 전환은 [decisions/transition-director.md](./decisions/transition-director.md).
구현 · 실기기 확인은 [닫은 항목](#닫은-항목) A-11.

**막힌 이유**: 거르기·중복 문턱값(`DRAFT_THRESHOLDS`)이 잠정값이다 — 합성 클립과 개발 DB 의 실제 스냅 6개로만 잡았고,
어둡고 흐린 시험 스냅으로 다시 정해야 한다([edit-director.md](./decisions/edit-director.md) §2.1 · §2.2).

- [ ] **거르기·중복의 문턱값** — 실제 스냅의 신호 분포로 어둠·흐림·해시 거리 문턱값을 정해
      [edit-director.md](./decisions/edit-director.md) §2 를 고친다. 이때 점수·거르기의 `quality` 에 밝기를 넣을지도 정한다 —
      지금은 선명도(`log1p(sharpness)`)만 쓰고 밝기는 어둠 문턱값에만 쓴다(같은 문서 §4)
- [ ] **컷 역할을 선택 단계 밖으로 싣기** — 선택 단계(`apps/api/src/services/edit-director.ts`)가 컷마다 역할을 정하지만([edit-director.md](./decisions/edit-director.md) §6), v1 에서 결과를 바꾸는
      것은 `hook`·`closer` 의 컷 길이뿐이다. 가운데 컷의 역할(`establish`·`detail`·`action`)과 그것을 위한 움직임 순위는 계산만 되고
      제안 응답에도 무비에도 실리지 않는다. editSpec 의
      `timeline.cuts[].role`(역할 어휘 [`cut-role-vocabulary.json`](../packages/shared-types/src/cut-role-vocabulary.json))로 싣거나
      (무비에 역할을 저장해야 한다), 쓸 곳이 생기기 전까지 가운데 컷의 계산을 걷어 낼지 정한다. 쓸 곳의 후보로 템플릿 슬롯에도 같은
      역할을 붙여 점수 계산(`apps/api/src/services/recommendation/score-slots.ts`)을 함께 쓰는 안이 있다 — 템플릿은 정해진 역할 순서,
      초안은 AI 가 고른 역할 순서가 된다. 지금 슬롯도 대부분 들어간다(출발 · 도착 → `establish`, 가게 · 메뉴판 · 음료 → `detail`,
      한 컷 → `hook`, 돌아오는 길 · 마무리 → `closer`). 역할 판정을 개념 `roleAffinity` 로 바꾸는 제안(A-13 후속 후보)과 함께 정한다.
      **완료 조건**: 역할을 `timeline.cuts[].role` 로 싣거나 가운데 컷 계산을 걷어 내기로 정해 [edit-director.md](./decisions/edit-director.md) §6 에 적는다

**완료 조건**: 문턱값이 실측으로 정해져 결정 문서 §2 가 고쳐지면 MOV-21 이 `구현됨` 이 된다.

**완료 조건에 넣지 않는 후속**: "다시 편집"은 v1 에 두지 않았다([auto-edit-draft.md](./decisions/auto-edit-draft.md) §5).
붙일 때는 시드 `attempt` 를 올려 `ai` 값만 다시 고른다.

**의존**: 컷 타이밍의 기준(A-7 "컷 타이밍의 기준을 컷마다")과 역할을 싣는 `timeline.cuts[].role`(A-7 editSpec v3).
분석을 쓰는 부분은 A-3 의 활성화 조건과 분석 동의(REC-4)를 따른다.

### A-12. AI 편집 에이전트 — 잠정값 실측 · 음악/스타일 툴 남음

AI 편집 초안을 LLM 에이전트가 계획하고 기존 디렉터를 툴로 부른다. 초안은 하루 3회 무료, 그 뒤 1회 20크레딧(2026-10-13 결정 —
[decisions/ai-edit-agent.md](./decisions/ai-edit-agent.md), 스펙 MOV-25 · CRD-9 · MOV-21). 착수 순서는
[archive/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 6 · 7단계. 운영 API 는 분석 워커와 같은 시크릿의
`OPENAI_API_KEY` 로 공모전 기간에도 켜져 있다(2026-10-13 오너 — 그 키의 예산 상한은 D-6).

**진행**: 구현 내역은 [닫은 항목](#닫은-항목) A-12.

**완료 조건**:

- [ ] `pick_style`(MOV-25) — 선행(스타일 기본값, PRF-3)은 2026-10-13 에 끝남 — 착수할 수 있다
- [ ] `pick_music`(MOV-25) — A-7 "공모전용 9곡 반영" 뒤. 그 전에 BGM 태그(`calm` / `upbeat` / `daily`, V3-D6)와 내용 사전의 `moods` 6개 중
      무엇으로 고를지 정한다
- [ ] **잔액 부족 문구의 앱 확인** — 비용 표시와 유료 차감은 에뮬레이터에서 봤다(progress 2026-10-13 "초안 과금 에뮬레이터 확인"). 잔액이 20 아래인
      계정에서 `크레딧이 모자라요. 자동 편집 1번에 20크레딧이 필요해요.` 와 `이 스냅으로 새 무비` 를 본다(테스트로는 고정돼 있다)
- [ ] **컷 수 상한과 업로드 전 스냅** — 에이전트가 `maxCuts` 를 검사 없이 들어가는 스냅(업로드 전이거나 신호가 없는 것) 수보다 낮게 주면
      업로드되지 않은 스냅도 빠진다(`apps/api/src/services/edit-director.ts` 의 `directDraft` — 규칙 초안도 그런 스냅이 10개를 넘으면 같다).
      [auto-edit-draft.md](./decisions/auto-edit-draft.md) §5 · MOV-21 의 "미업로드 스냅도 넣는다"와 맞는지 정한다
- [ ] **잠정값 실측** — 숫자는 모두 `apps/api/src/services/edit-agent/agent-policy.ts` 에 있다: 재시도 상한(`EDIT_AGENT_MAX_RETRIES` 2) · 시간 상한
      (`EDIT_AGENT_TIME_LIMIT_MS` 20초) · 왕복 상한(`EDIT_AGENT_MAX_TURNS` 8) · 분석 상한(`EDIT_AGENT_ANALYSIS_LIMIT` 12) · 분위기 배율
      (`EDIT_AGENT_MOOD_BOOST` 2) · 에이전트 모델. 초안 1회의 호출 수 · 토큰 · 지연 · 폴백 비율을 재서 결정 문서 §5.1 의 추정을 실측으로 바꾼다.
      지금까지의 표본은 분석 미동의 계정 · 스냅 4개뿐이다(progress 2026-10-13 "에이전트 운영 확인" · "분위기 id 를 툴에 목록으로"). 분석에 동의한
      계정 · 스냅 10개 이상으로 더 모은다(A-14 와 같은 표본). 운영 값은 `movie_drafts.plan->'usage'` 로 모은다
- [ ] 무료 3회 · 20크레딧 값을 실측 단가와 크레딧 판매가(A-2 · C-1)로 다시 본다

**의존**: A-13(개념 · 취향) · A-3(분석 활성화 — 분석 툴은 동의한 사용자에게만).

### A-13. 온톨로지 개인화 — 잠정값 남음

스냅 내용과 사용자 취향을 같은 개념 체계로 표현하고, 취향을 행동에서 배워 추천 · 템플릿 순서 · AI 편집 초안에 반영한다(2026-10-13 결정 —
[decisions/ontology-personalization.md](./decisions/ontology-personalization.md), 스펙 PRF-1~PRF-4). 착수 순서는
[archive/agentic-ontology-rollout.md](./archive/agentic-ontology-rollout.md) §1 의 1 · 2 · 4 · 5 · 8단계.

**진행**: 구현 내역은 [닫은 항목](#닫은-항목) A-13. 3단계(관심사)는 2026-10-13 에 끝났다(닫은 항목 A-9). AI 편집 초안에의 반영(MOV-25)은
A-12 의 에이전트가 한다.

**남은 막힘**: 사전 밖 비율을 재는 실측은 A-6 "개념 매칭의 실측 확인"이 맡는다(A-3 의 팀 스냅 실측에 얹힌다).

**완료 조건**:

- [ ] **잠정값** — 신호 강도(0.3 · 0.5 · 1.0 · −0.5 · ±0.5) · 학습률(0.2) · 감쇠 반감기(30일) · 상위 전파 비율(0.5) · 관심사 가중
      (`TASTE_INTEREST_WEIGHT` 0.5, progress 2026-10-13 "관심사")을 시연 데이터로 다시 본다.
      숫자는 `apps/api/src/services/taste/taste-policy.ts` 하나에 있다 — 반영 쪽(추천 항 0.1 · 전환 배율 2^w · 분위기 1.5배 · 관계 비율 0.5 ·
      템플릿 순서 문턱 0.01 · 스타일을 권하는 문턱 0.15)도 같은 파일이다. 바꾸면 `TASTE_POLICY_VERSION` 을 올린다. 관계 값(`typicallyAt` · `evokes` · `suits`)과 `moods` 6개도 같이 본다.
      스타일을 권하는 규칙은 다른 스타일을 권하는 계정으로 확인한다 — 지금까지는 일상 쪽 계정에서만 봐 권하는 스타일과 기본값을 가르지 못했다
      (progress 2026-10-13 "취향이 권하는 스타일")

**후속 후보(완료 조건 아님)**:

- (제안) **컷 역할에 `roleAffinity`** — edit-director §6 의 역할 판정을 개념 `roleAffinity` 로 바꾼다. `EDIT_DIRECTOR_VERSION` 을 올린다.
  A-11 "컷 역할을 선택 단계 밖으로 싣기"와 함께 정한다([archive/content-vocabulary.md](./archive/content-vocabulary.md) §6 의 5)
- (제안) **분석 모델이 개념을 고른다** — 구조화 출력 enum 으로 고르게 해 정규화와 필드 혼동을 없앤다. 대가는 분석 재실행과 사전 밖 값이
  보이지 않게 되는 것. A-6 실측으로 사전 밖 비율이 낮아진 뒤 검토한다(같은 문서 §3 · §6 의 6)

**의존**: A-3(내용 개념은 분석이 있어야 생긴다).

### A-14. 공모전 발표 · 보고서의 검증 지표 — 측정 전

공모전 결과 보고서("결과 및 성과" — 객관적 데이터)와 발표의 검증 장에 넣을 숫자다. Agentic(A-12) · Ontology(A-13)를 구현한 결과를 세 숫자로
보인다. 이 항목은 **무엇을 어떻게 잴지**만 정하고, 재는 일 자체가 다른 항목에 있으면 그 항목을 가리킨다.

**왜 막혀 있는지**: 표본이 없다 — 에이전트 운영 기록은 분석 미동의 계정 · 스냅 4개 초안 몇 건뿐이고(progress 2026-10-13 "에이전트 운영 확인"
· "분위기 id 를 툴에 목록으로"), 개념 매칭의 실데이터 실측은 A-6 "개념 매칭의 실측 확인"을 기다린다.

**표본**: 분석에 동의한 계정, 스냅 10개 이상인 외출 여러 개로 AI 편집 초안 **20회 이상**. 템플릿 추천도 같은 스냅으로 돌린다.

**완료 조건** — 아래를 재서 [progress.md](./progress.md)에 숫자 · 표본 · 날짜와 함께 기록한다:

- [x] **추천 정확도(Ontology)** — 2026-10-26: ② 운영 분석 28건에서 예전 규칙 오탐 7 · 놓침 45, 사전 v2 34 · 40, 고친 v3 1 · 6(progress 2026-10-26
      "개념 매칭 실측과 사전 v3" — 같은 표본으로 고치고 잰 값이라 A-6 재실측이 남았다) — 두 가지로 나눠 적는다. ① 고른 사례: 부분 문자열 매칭의 오탐 16 · 미탐 12 가 개념 매칭에서 0 이 됐다
      (`recommendation-score.test.ts`, progress 2026-10-13 "개념 사전 확정" — 이미 잼, 고른 사례라는 단서를 붙인다). ② 실제 분석값: A-6
      "개념 매칭의 실측 확인"의 규칙별 오탐 · 놓친 쌍 수를 그대로 쓴다
- [x] **AI 편집 초안 시간과 성공률(Agentic)** — 2026-10-26 실측 20회(progress 2026-10-26 "공모전 지표 실측") — `movie_drafts` 의 `mode` · `plan` 집계로 낸다: 요청부터 응답까지의 지연(중앙값 · 90번째 백분위),
      에이전트 성공률(`agent` ÷ (`agent` + `fallback`)), 검토 첫 통과율과 평균 재시도 수, 초점 개념이 컷에 들어간 비율. 앱에서 `편집하는 중…` 이 보인
      시간도 몇 회 손으로 잰다. A-12 "잠정값 실측"과 같은 표본을 쓴다
- [x] **AI 편집 1회 실제 비용** — 2026-10-26 실측 20회. 모델 단가는 같은 날 OpenAI 공식 가격표에서 확인했다(progress 2026-10-26) — 에이전트 토큰(`movie_drafts.plan` 의 사용량)과 그 초안이 요청한 분석의 토큰(`video_analyses.input_tokens` ·
      `output_tokens`)에 모델 단가를 곱해 원으로 환산한다(환율을 함께 적는다). 결정 문서 [ai-edit-agent.md](./decisions/ai-edit-agent.md) §5.1 의
      추정(15~20원)과 비교한다
- [ ] **직접 편집 시간(비교 기준)** — **2026-10-26 오너: 공모전에는 재지 않는다.** 발표 · 보고서는 외부 자료(University of Florida IFAS Extension,
      「Video Editing」 WC126, 2024 — 전문 편집자 기준 완성 1분에 최소 1시간)를 문제 제기 근거로만 쓰고, 조건(전문가 · PC)이 달라 Snaply 실측과
      나란히 비교하지 않는다. 아래 실측은 선택이다 — 팀원 2명 이상이 같은 클립 8개를 시중 편집 앱으로 직접 편집해 완성까지 걸린 시간을 잰다. AI 편집 초안 +
      손보기 시간과 나란히 적는다
- [ ] (선택) **개인화 효과** — 취향이 쌓인 계정과 새 계정에서 초안 뒤 사용자가 지운 컷 수 · 바꾼 전환 수를 비교한다. 표본이 작으면 발표에 쓰지 않는다

**의존**: A-3(분석 활성화와 팀 스냅) · A-6("개념 매칭의 실측 확인") · A-12("잠정값 실측").

### A-15. `앱` 정크 저널 리디자인 — 구현과 캔버스에 없는 화면

앱 화면을 정크 저널 시안으로 바꾼다(2026-10-17 결정 — [decisions/junk-journal-design-system.md](./decisions/junk-journal-design-system.md)).
현행 토큰 · 공용 컴포넌트의 대응과 시안만으로 정해지지 않던 여섯 가지는 정해졌다([plans/junk-journal-redesign.md](./plans/junk-journal-redesign.md)).
화면별 모습은 캔버스 [Snaply 정크 저널 전체 화면](https://claude.ai/artifact/7SURcRJRzVowNeB7WVeFye)(보드 103개)에 있다 — 로그인 · 가입 ·
비밀번호 재설정 · 계정 복구, 스튜디오, 스냅 탭 · 플레이어 · 삭제 · 최근 삭제 · 스냅 더 넣기, 촬영 · 녹화 보관함 · 영상에서 가져오기, 자동 편집 ·
생성 거절, 무비 편집, 완성 · 감상 · 감상 오류 · 정리 · Instagram 게시, 무비 탭 · 템플릿 상세, 나 탭과 설정 하위 · 크레딧(광고 켜짐 · 운영) · 계정 삭제.

**왜 막혀 있는지**: 화면 모습 때문에 막힌 곳은 없다. 캔버스에 아직 없는 것은 아래뿐이고, 구현할 때 캔버스의 규칙으로 정한다.

- 알림 설정의 OS 권한 거부 행(알림 · 위치의 `설정에서 권한 켜기`)
- SNS 연결 복귀 화면(`/sns/connected` · `/sns/error`의 스피너)
- 무비 화면의 컷 파일 로딩 · 실패(`cut-files-stage`)와 감상 모드의 결과물 로딩
- 게시 결과 토스트, 스냅 삭제 실패 토스트
- 앱 아이콘 · Android 알림 아이콘(네이티브에 구워지는 브랜딩 — 스플래시는 캔버스에 있다)
- 밤 모습 — 밤 보드가 있는 것은 로그인 · 스튜디오 · 스냅 둘러보기 · 무비 탭 · 편집 · 만드는 중 · 축하 · 나 탭뿐이고, 시트 · 설정 하위 · 오류
  상태는 `theme` 속성만 있다

**완료 조건**:

- [x] **토큰 이식** — `apps/mobile/src/shared/ui/theme/theme.ts` 와 `themed-text.tsx` 를 대응표대로 바꾸고 글꼴을 바꾼다(Gaegu · D2Coding 추가,
      Pretendard 500 · 800 제거 — [앱 글꼴](../apps/mobile/docs/workflows/app-branding-and-native-config.md#app-font) 절차). cookbook §14 를 같이 고친다.
      2026-10-18 끝 — progress 2026-10-18 "정크 저널 1단계 — 토큰 · 글꼴 · 글자 역할". 기기에서 본 것은 아직 없다(새 글꼴은 빌드가 있어야 보인다)
- [x] **공용 컴포넌트** — 대응표 §5 의 "겉모습" · "새로" 행. 2026-10-19 끝 — 목록은 cookbook §14
- [x] **화면** — 2026-10-19 끝(progress 2026-10-19 "정크 저널 2단계"). 캔버스대로 화면마다 바꾼다. 앱과 달라도 캔버스를 따른다(통일성 우선 — 결정 문서 §결정). 캔버스가 지금 앱과 다르게 그린 곳 —
      녹화 보관함의 시스템 알림 두 개를 어두운 시트로, 스냅 탭 첫 로딩의 스케치 자리 표시, 생성 거절 안내를 머리 아래 띠로, 로그인 · 재설정 화면의
      제목 하나, 선택 바의 삭제 글자 동작 — 과 사용자에게 보이는 라벨 · 구조가 바뀌는 곳은 기능 문서를 같이 고친다
- [ ] **글자 크기 확대** — 시스템 글꼴 1.3배 · 2배에서 종이 조각(테이프 라벨 · 입장권 버튼 · 탭 스텁)이 넘치지 않는지 확인한다. 2026-10-19
      에뮬레이터(EAS tester `a7389f7e`)에서 본 화면 — 스튜디오 · 스냅 · 선택 모드 · 무비 탭 · 감상 · ⋯ 시트 · 편집 · 나 탭 · 계정 삭제 — 에는 넘치는
      조각이 없었다(2배에서 스튜디오 첫 카드의 수치가 오른쪽 끝에 붙는 정도). 고정 크기 그림 안의 글자에는 상한을 둔다(`maxFontSizeMultiplier` — 나 탭
      주간 링의 요일 · 이니셜과 가격 원판 숫자, 고른 스냅의 순번 원판, 무비 컷 인스펙터의 사유 글자 — [결정 21](./decisions/junk-journal-design-system.md#출시-점검에서-더한-규칙)).
      같은 날 main 위 출시 점검 브랜치의 dev 빌드에서 360dp 1.3배 · 2배로 나 탭 · 설정 하위 · 스냅 탭 · 선택 바 · 촬영 · 최근 삭제를 보고, 한 줄로
      묶여 말줄임표 없이 잘리던 값을 줄바꿈으로 고쳤다(cookbook §14). 남은 것은 아래 '기기 확인'의 못 본 화면을 1.3배 · 2배로도 보는 것
- [ ] **기기 확인** — Android 에뮬레이터 · 휴대폰에서 낮 · 밤 · 동작 줄이기. 2026-10-19 에뮬레이터(API 35, EAS tester `a7389f7e`)에서 스튜디오 · 스냅 ·
      선택 모드 · 무비 탭 · 감상 · ⋯ 시트 · 편집 · 나 탭 · 계정 삭제를 낮 · 밤 · 동작 줄이기로 봤고, 그 뒤 고친 점선 리더 · 종이 무늬 길이는 다음
      빌드(`21da7cd1`)에서 확인했다. 계정 삭제 확인 화면의 `소셜 연결이 모두 끊겨요` 줄(H-16)을 보고 ACC-8 라벨의 괄호를 지웠다. 같은 날 main 위 출시 점검 브랜치의
      dev 빌드(`npx expo prebuild --clean` 뒤, 에뮬레이터 API 35)에서 촬영 화면 · 최근 삭제 · 설정 하위(알림 · 앨범 저장 · 소셜 연결 · 크레딧 · 관심사 ·
      스냅 분석) · 없는 주소 화면 · 체리 스플래시를 보고, 동작 줄이기를 켠 채 처음 연 앱에서 네 탭이 모두 그려지는 것과 360dp 폭(1배 · 1.3배 · 2배)을
      확인했다. 생성된 네이티브 설정에 minSdk 28 · 대화면 옵트아웃 속성 · 낮 · 밤 창 바탕이 들어간 것도 봤다(progress 2026-10-19 "main 위 출시 점검
      수정의 에뮬레이터 확인"). 남은 것 — 기기에서 아직 보지 못한 화면(로그인 · 가입 · 비밀번호 재설정 · 새 비밀번호 · 계정 복구, 녹화 보관함 · 영상에서
      가져오기, 무비 화면 전부(이 개발 계정에 무비가 없었다) · 만드는 중 · 생성 거절 띠, 템플릿 상세, 스냅 더 넣기, 스냅 플레이어, 스냅 탭 첫 로딩
      스케치, 오류 화면, 시트(닉네임 · 위치 알림 · 분석 동의 · 전환 · 상세 · 이름 바꾸기 · Instagram 게시 · 완성 확인 · 스냅 삭제)), 세션 복원까지
      스플래시가 머무는 것, 종이 창 바탕이 실제로 비치는 순간(화면 전환 · 키보드), 600dp 이상 화면의 세로 고정, 이용약관 · 개인정보 처리방침
      링크(ACC-12 — 나 탭 `이용약관` 행이 브라우저를 여는 것까지 봤다. 문서가 앱 안 브라우저에 그려지는지, 로그인 안내문의 두 링크, TalkBack 이
      링크로 읽는지 본 뒤 라벨의 괄호를 지운다), 밤의 크레딧 `+N`(내역이 있는 계정), 3버튼 내비게이션 기기에서 촬영 · 가져오기 · 스냅 플레이어의
      바 글리프, 로그아웃 · 비밀번호 복구 · 삭제 유예 상태에서 앱이 꺼진 채 연 없는 주소 링크의 `돌아가기`, 일하는 동안 선택 바 티켓이 줄을 지키는
      것(370~394dp). 휴대폰에서 낮 · 밤 · 동작 줄이기. iOS 확인은 iOS 출시 전에 한다(A-4)
- [x] **앱 크기** — 2026-10-19 tester APK 158.2MB(progress 2026-10-19)

**후속 후보(완료 조건 아님)**:

- **탭 제목의 랜섬 조각 — 글자 윤곽 SVG** — 지금은 캔버스 TabTitles 보드의 잡지 글꼴 대신 내장 글꼴로 그린다([결정 12](./decisions/junk-journal-design-system.md#구현하며-더한-선택)).
  보드와 [대응표 §2](./plans/junk-journal-redesign.md#2-글자)대로 글자 윤곽을 SVG 로 넣으면 대신 쓰는 글꼴을 뺀다(글꼴 파일은 넣지 않는다). `완성!` 은
  완성 축하와 함께
- (제안) **peel 모션** — 대응표 §4. 삭제 · 닫기에 0.4초 떼어 냄
- (제안) **완성 축하** — 시안의 `완성!` 화면은 지금 앱에 없는 새 동작이다. 넣으려면 [specs/movie.md](./specs/movie.md)와 기능 문서
  `apps/mobile/docs/features/movie.md` 부터 고친다


### A-17. `앱` 넓은 화면 · 가로 배치 — targetSdk 37 전에

앱은 세로 전용이고(`orientation: portrait`), Android 16 은 짧은 변이 600dp 이상인 화면(폴드 안쪽 화면 · 태블릿)에서 세로 고정을 무시한다. 첫 출시는
Android 의 임시 옵트아웃(`apps/mobile/plugins/with-large-screen-portrait-lock.js`)으로 Android 15 처럼 세로로 고정해 레터박스로 보인다
([decisions/android-release-config.md](./decisions/android-release-config.md), 2026-10-19). 이 옵트아웃은 앱이 API 37 을 겨누면 더 듣지 않는다.

**완료 조건**: targetSdkVersion 을 37 로 올리기 전에 넓은 화면을 정한다 — 탭 바와 선택 바를 `MaxContentWidth` 로 가두고, 촬영 · 영상에서 가져오기 ·
무비 화면을 Pixel Fold 또는 Pixel Tablet 에뮬레이터의 가로에서 본 뒤 옵트아웃을 뺀다. 결정 문서의 "다시 볼 때"를 고친다.

### A-16. `앱` 촬영 리마인더 · 하루 빈도 — 나중에 붙일 기능

알림 화면(`/settings/notifications`, `apps/mobile/src/pages/me/ui/me-notifications-page.tsx`)의 `촬영 리마인더` · `하루 빈도` 는 `준비 중` 자리 행이다
(2026-09-24 오너 결정 — 알림을 보낼 스케줄러가 없어 스위치를 두면 오지 않는 알림을 약속하게 된다). 2026-10-18 오너가 **나중에 붙여야 하는 기능**으로 정했다
(H-17 을 여기로 옮김). 자동으로 스냅을 모으는 길이 없어 이것이 앱이 먼저 촬영을 권하는 유일한 넛지다(기능 문서 me.md ·
[product-concept.md](./decisions/product-concept.md) §3).

**지금 있는 것**: 화면의 두 자리 행, `features/notification-settings` 저장소의 `reminderWindows` · `reminderFrequency` 와 훅(`useReminderWindows` ·
`useReminderFrequency` — 아무 화면도 읽지 않는다, 기기에만 있는 값). 스펙 요구 · 스케줄러 · 알림 종류는 없다.

**정할 것**:

- [ ] **요구(스펙)** — [specs/notifications.md](./specs/notifications.md)에 새 NTF 요구: 언제(시간대 · 요일), 하루 몇 번, 기본값(알림 결정
      [notification-preferences.md](./decisions/notification-preferences.md)의 "기본은 꺼짐"), 조용한 시간과의 관계, 오늘 이미 찍었으면 보내지 않는지
- [ ] **어디서 보내나** — 기기의 로컬 알림(서버 없이, 기기 하나) 또는 서버 푸시(계정 단위 · 여러 기기는 B-2). 설정을 계정에 둘지(다른 알림처럼
      `GET`/`PATCH /auth/me`) 기기에 둘지. 결정 문서로 남긴다
- [ ] **구현** — 고른 쪽의 스케줄러 · 설정 저장 · 화면(자리 행을 실제 컨트롤로) · 기능 문서 me.md · 계약(서버에 두면)

**완료 조건**: 스펙 요구가 `구현됨` 이 되고, 알림 화면의 두 행이 실제로 동작하며 에뮬레이터에서 알림이 온다(휴대폰 수신은 F).

### A-18. 20컷 무비 — 공모전 서버 렌더 실측 · 테스터 새 APK

무비의 컷 상한이 10 → 20, AI 편집 초안에 넘기는 스냅이 30 → 40개가 됐다(2026-10-20, [product-concept.md](./decisions/product-concept.md) §8 ·
MOV-5 · MOV-21). 서버 · 워커 · 앱의 상한과 테스트는 바뀌었고, 워커 이미지에서 합성 스냅으로 20컷을 렌더했다(progress 2026-10-20 "무비 컷 상한 20 · AI 편집 초안 입력 40").
에뮬레이터 확인은 같은 날 끝났다 — 거기서 찾은 작업 조회의 10컷 상한(E-61)도 고쳤다(progress 2026-10-20 "20컷 무비 · 40개 초안의 에뮬레이터 확인").
남은 것은 둘이다.

- [x] **`서버` 공모전 서버 렌더 실측** — 2026-10-26, 휴대폰 영상에서 가져온 스냅 20개(3초 · 60초 무비): 렌더 435초 · `ai-worker` 최고 973MiB(progress 2026-10-26) — main 배포 뒤, 휴대폰 스냅 20개로 만든 무비의 렌더 시간 · `ai-worker` 메모리. 로컬 실측에서 옮긴 추정(약 5분,
      제한 600초 안 · 하루 약 90편 · 컷 잇기 약 2.0GB)과 맞는지 [deployment-aws.md](./deployment-aws.md#용량-2026-10-11-실측)에 적는다. 제한 시간에
      가까우면 `EDIT_TIMEOUT_SECONDS` 를 다시 본다. 2026-10-22 배포부터 보통 경로에도 묶음 결합(E-64)과 회전 정보 바로잡기(A-20 — 회전 정보 있는
      원본마다 약 0.8초)가 들어가 있다 — 이 실측이 두 변경의 운영 사양 값(메모리 · 시간)도 겸한다
- [ ] **`서버` 최대 길이 무비의 렌더 시간** — 2026-10-26 실측은 3초 스냅 20개(60초)로 435초였다. 길이에 비례하면 5초 스냅 20개(100초)는
      약 720초로 그때 제한(600초)을 넘어, 2026-10-27 `EDIT_TIMEOUT_SECONDS` 를 900초로 올렸다([aws-contest-server.md](./decisions/aws-contest-server.md)
      2026-10-27). 5초 스냅 20개로 재고, 900초에 가까우면 제한 시간 · 최대 길이 · 렌더 속도 중 무엇을 바꿀지 다시 정한다.
      재면 MOV-5 라벨의 괄호를 지운다
- [ ] **`앱` 테스터에게 새 APK 배포** — E-61 수정이 공모전 서버에 배포된 **뒤에** 한다. 지금 테스터 폰의 옛 앱(`MovieSnapLimit = 10`)은 쓸 수 있는
      스냅 11개 이상으로 AI 초안을 받으면 서버가 11컷 이상을 돌려줘 `unreachable` 로 실패한다. 반대로 수정이 배포되기 전에 새 앱으로 11컷 이상 무비를
      만들면 95% 에서 멈춘다. 절차는 [deployment-aws.md](./deployment-aws.md#8-테스터-앱) §8(Gradle release 또는 EAS `tester` 프로필).
      E-61 수정은 2026-10-20 배포(Deploy `1864534`)로 나갔다. 다만 지금 main 의 앱은 무비 화면에 레시피 칩(`편집 · …`, MOV-28)을 조건 없이 보여 준다 —
      이 빌드를 내면 테스터가 레시피를 쓴다. 그 전에 E-65 · E-66 과 A-20 의 곡 업로드 · 제한 시간을 정하거나, 칩을 숨긴 빌드를 낸다. 2026-10-27 — E-65 · E-66 을 닫았고 곡 9개를 올렸다(감성 `calm` 은 0곡). 남은 것은 제한 시간과 빌드 · 배포(Expo `dayomi` 프로젝트에 로그인한 사람). 2026-10-27 — 제한 시간을 900초로 올렸고, 테스터 버전은 회사 Play Console 내부 테스트로 낸다(2026-10-30 까지). 패키지 `com.dweax.snaply` · 업로드 키 서명은 넣었고, Firebase 앱 등록 · 업로드 키 · 번들 1.0.0(1) 빌드까지 했다(progress 2026-10-27 "Play 내부 테스트용 번들 1.0.0(1) 빌드"). 남은 것은 Play 앱 서명 약관 동의(계정 관리자 권한 필요 — 회사 개발자에게 문의 중) · 내부 테스트 업로드 · 테스터 초대([deployment-aws.md](./deployment-aws.md) §8 "Google Play 내부 테스트로 내기")

**완료 조건**: 서버 실측이 progress 에 기록되고(이때 MOV-5 라벨의 괄호를 지운다) 테스터에게 새 APK 가 배포된다.

---

### A-19. `서버` 텍스트 액센트 · 이모지 스티커 — 결과물에 붙는다(꺼짐), 구성 고정 · 피사체 위치 남음

BGM 컷편집 무비에 컷의 내용에 맞는 의성어 · 감탄 · 키워드와 이모지 스티커를 박자에 맞춰 붙인다(MOV-27 `부분`). 결정 ·
세 층(사전 · 에이전트 · 생성)의 관계는 [decisions/text-accent-stickers.md](./decisions/text-accent-stickers.md)(결정(잠정) — **미디어/편집 트랙 담당 검토 전**).
2026-10-20 에 사전과 워커 엔진, 2026-10-21 에 BGM 비트 그리드와 결과물 연결이 들어갔다(progress 2026-10-21 "BGM 비트 그리드 · 액센트를 결과물에 굽는다").
**붙일지는 무비 설정 `decorations`(글자 · 이모지 · 얼굴)가 정한다**(2026-10-29, 결정 문서 §9) — classic 무비의 기본값은 셋 다 꺼짐이다. 앱의 고르는 화면과 실기기 확인은 A-22.

- [ ] **고른 결과를 구성에 고정** — 지금은 렌더할 때마다 다시 고른다(같은 입력이면 같은 결과). 분석을 다시 하거나 사전을 바꾸면 다시 만든 무비의 글이
      바뀐다(MOV-14). editSpec v3 에 `overlays`(글 · 출처 · 자리 · 시각 · 이모지)를 두고 처음 만들 때 채워 다음부터 그대로 굽는다 — 정본 모양은 A-7 과 함께
- [ ] **classic 무비의 기본값 켜기** — 지금 classic 무비는 꾸밈 기본값이 셋 다 꺼짐이다(레시피 사전 `classic.decorations`). 켜기 전에 실제 스냅(분석 동의 계정)으로
      무비를 몇 편 만들어 보고, 처리 시간(스티커 트랙 굽기 + 한 번 더 인코딩 — 편집 상한 §2.3)과 결과를 본다
- [ ] **층 b — 에이전트 툴** — AI 편집 에이전트([`edit-agent.ts`](../apps/api/src/services/edit-agent/edit-agent.ts))에 `pick_accents` 툴: 컷마다 사전 후보
      id 를 고르거나 쉰다. 결과는 초안 계약(`movie-drafts`)에 실어 앱이 보여 주고 고칠 수 있게(MOV-22 와 같은 주인 규칙)
- [ ] **층 c — 생성: 실측과 연결** — 생성 코드는 있다(`pipeline/accent_writer.py`, progress 2026-10-20 "층 c — 생성 글 · 이모지 풀"). 남은 것:
      ① **실제 분석 summary 로 실측** — 지어낸 장면 8개로는 한 번 쟀다(progress 2026-10-20 "층 c — 생성 글 · 이모지 풀" — 버림 0 · 입력 1,209/출력 610 토큰 · 8.4초).
        실제 스냅의 분석 결과(분석 동의 계정)로 여러 편을 돌려 문구 품질 · 버려지는 비율 · 비용을 보고 켤지 정한다. 8초 지연은 ②와 함께 본다
      ② 어디서 부를지 — 초안 시점(API, 에이전트와 함께 — 앱이 보고 고칠 수 있다)인지 생성 시점(워커)인지. 어느 쪽이든 결과는 스펙에 고정(MOV-14)
      ③ 금칙어 목록의 주인과 보강 절차, 쓰인 생성 글의 집계 → 검토 → 사전 반영(트렌드 루프)
- [ ] **내용 개념의 빈자리** — 컷편집 영상에 흔한 점프 · 달리기 · 강아지 · 웃음 같은 개념이 content-vocabulary 에 없어 매칭이 안 된다. 개념을 더하면
      `contentVocabularyVersion` 이 올라 추천 재사용 키가 바뀐다([ontology-personalization.md](./decisions/ontology-personalization.md)) — 그 영향과 함께 정한다
- [ ] **에셋 라이선스 확인** — 글꼴 넷은 OFL. Noto Emoji `v2.047` 은 `LICENSE`(OFL)와 README("이미지는 Apache 2.0")가 어긋난다
      ([assets/stickers/README.md](../apps/ai-worker/assets/stickers/README.md)) — 둘 다 상업 사용 · 재배포를 허용하지만 출시 전 법무 확인. 에셋 팩 매니페스트가
      오면 버킷으로 옮긴다([sticker-asset-sourcing.md](./decisions/sticker-asset-sourcing.md)).
      **seukku.cc 그림 411개(`sk-*`, 2026-10-29 개발용으로 넣음)는 라이선스 미확인**이다 — 헬로키티 등 캐릭터 · 상표와 남의 밈 문구가 섞여 있다.
      공개 저장소 · 운영 워커에 들어가 있으므로 출시(외부 공개) 전에 사용 허락을 확인하거나 빼고 사전(`byConcept`)에서도 지운다
- [ ] **앱 미리보기** — 편집 화면에서 액센트를 보이려면 TS 쪽 사전 로더와 같은 배치 규칙이 필요하다(지금은 워커만 읽는다)

**품질 개선**(2026-10-29 코드 조사 — 아래 경로는 `apps/ai-worker/src/pipeline/`). 순서는 1묶음(겹침 · 대비 · 반복)을 먼저 하고, 실제 스냅으로
무비 몇 편을 만들어 전후를 비교한 뒤 2묶음(리듬 · 밀도) → 3묶음(화질 · 위치)으로 간다. 흰 띠 맞춤(`pad_white`, MOV-8)의 휘도 측정은
2026-10-29 에 들어갔다(`accent_inputs.luma_grid`) — 아래 대비 항목은 그 뒤에 남은 것이다.

1묶음 — 지금 눈에 띄게 깨지는 것
- [ ] **글 크기를 재서 놓기** — `text_accent.text_box`(`text_accent.py:211`)가 글자당 고정 비율(한글 0.95em)과 10% 여유로 크기를 어림한다. 기울임(12°)
      · 등장 배율(stamp 190% · shake 160% · pop 118%, `accent_render.py:64`) · 그림자를 넣지 않아 글이 안전 영역을 넘거나 스티커와 겹친다. 번들 글꼴로
      실제 크기를 재고(PIL `ImageFont`) 최대 배율에서 회전한 상자로 놓는다
- [ ] **겹침 검사의 대상** — 막는 상자가 피사체와 바로 앞 액센트뿐이다(`text_accent.py:249` · `280`). 화면에 남은 앞 컷의 스티커 · 타이틀 · 타임스탬프 ·
      프리즈 라벨 · 얼굴 스티커를 넣는다. 타임스탬프(`title_card.py:96`, x 0.08 · y 0.76)는 왼쪽 아래 빈자리(`freezone.bottomLeft`)와 겹친다
- [ ] **밝은 배경 · 흰 띠에서의 대비** — 감탄 · 키워드 라벨 상자는 대비 검사를 건너뛴다(`accent_fit.py:75`). 대비 규칙은 채움과 선을 바꿀 뿐 선 자체가 보이는지는
      보지 않는다(`emotional` `FF5FA2` · `calm` `FFF4D6` 이 밝은 장면에서 약하다). 스티커는 테두리 없이 원본 그대로라(2026-10-29) 밝은 배경에서 옅은 그림이 묻힐 수 있고,
      타이틀(TitleBig · CineBig · Stamp)은 외곽선이 없다(`title_card.py:42`)
- [ ] **글이 보이는 순간의 휘도** — 휘도를 컷 가운데 프레임 한 장으로 잰다(`accent_stage.py:77`). 글은 움직임이 가장 큰 박자에 나타나므로 그 시각의 프레임으로 잰다
- [ ] **키워드 반복** — 키워드 대체 글(`text_accent._keyword`, `text_accent.py:176`)은 쿨다운을 보지 않아 같은 장소의 컷마다 같은 `#카페` 가 붙는다.
      같은 글 거르기는 간격(`gapMs`)이 있을 때만 돈다(`density.py:47`)

2묶음 — 리듬과 밀도
- [ ] **스티커를 박자에** — 스티커는 컷 시작부터 반 박자씩 띄워 나온다(`sticker.py:108`). 글처럼 비트 그리드(`accent_fit.timing`)에 맞춘다. 곡이 없으면 박자가 고정 500ms(`accent_stage.py:27`)
- [ ] **효과음을 글과 같은 시각에** — 동작 소리는 움직임 정점(없으면 컷의 30%), 나머지는 컷 시작 +80ms 다(`sfx.py:78`). 글이 나타나는 시각 · 박자에 맞추고,
      보통 경로에서도 효과음 동안 BGM 을 낮춘다(지금은 레시피 경로만 — `accent_stage.py:119`)
- [ ] **밀도** — classic 무비는 `max` · `gapMs` 가 없어 컷마다 글 1개 + 스티커 1~3개가 붙는다(`density.py:39`, `sticker.py:83`). 무비당 상한과 최소 간격을 정한다
- [ ] **움직임의 종류** — 사라짐은 90ms 페이드 · 축소 하나(`accent_render.py:53`), 스티커 등장은 `ease_out_back` 하나(`sticker_render.py:62`)다

3묶음 — 화질과 위치
- [ ] **스티커 떨림과 테두리** — 매 프레임 BILINEAR 로 다시 줄이고 돌리며 위치를 정수 픽셀로 맞춰(`sticker_render.py:109`) 작은 스티커가 떨리고 floatUp · popBob 이
      계단처럼 움직인다. 512px 기준 14px 테두리는 190~260px 로 줄면 5~6px 다. 목표 크기로 미리 그리고 소수 픽셀 위치로 합성한다. 얼굴이 크면 512px 원본을 키운다(`sticker_render.py:102`)
- [ ] **얼굴 스티커의 기울기 · 지연** — 랜드마크를 버려(`face.py:105`) 고개를 기울여도 스티커가 서 있고, 10fps 검출 + 3프레임 이동평균(`face.py:22` · `28`)이라
      100~200ms 늦게 따라간다. 있는 `anchor.face_roll_degrees` 를 쓰고 지연을 줄인다. 검출 입력이 세로 360x640 고정이다(`face.py:113`)
- [ ] **원본 → 화면 좌표 하나로** — 분석의 피사체 상자는 2026-10-29 부터 `subject.to_screen` 이 맞춤 방식 · 레터박스 띠대로 옮긴다. 남은 것은 앵커의
      원본 정규화 좌표(`anchor.py`)와 매치컷 피사체(`trend_edit._subject_box`)가 따로 옮기는 것 — 둘도 `subject.placed` 로 모은다
- [ ] **스티커 트랙의 한 번 더 인코딩** — qtrle 트랙을 굽고 libx264 crf 20 으로 다시 인코딩한다(`sticker_render.py:127`, `accent_stage.py:129`). "운영에서 켜기"의
      처리 시간과 함께 화질 손실도 본다 — 결합 단계에서 한 번에 얹을 수 있는지
- [ ] **가로 · 정사각 출력** — 오버레이 화면이 1080x1920 고정이다(`layout.py:11`, `ass.py:15`, `sticker_render.py:132`). 지금 API 는 세로만 내므로 다른 비율을 들일 때(product-concept §7) 함께 한다

4묶음 — 모양(2026-10-29 사용자 요청 — "흰 테두리 · 글꼴이 올드하다")
- [ ] **이모지 늘리기** — 먼저 한다. 비교 샘플(현재 · Pretendard + Fluent Emoji 3D · Paperlogy + 테두리만 제거)에서 효과보다 Noto 이모지 그림 자체가
       문제로 보였다. 사전(`accent-vocabulary.json` `stickers`)의 이모지 후보를 늘리고 그림 세트를 고른다(라이선스 확인 — Fluent Emoji 는 MIT)
- [ ] **글꼴 · 스티커 꾸밈 교체**(보류) — 이모지를 늘린 뒤 다시 비교한다. 후보: 굵은 외곽선(9~22px, `categories`) → 없음 · 부드러운 그림자, 감탄 · 키워드는
       둥근 상자, 글꼴 Black Han Sans · Jua · Do Hyeon → Pretendard · Paperlogy(OFL). 스티커의 흰 칼선 · 그림자는 2026-10-29 에 먼저 없앴다(원본 그대로). 외곽선을 빼면 밝은
       배경에서 대비가 약해지므로 1묶음의 대비 항목과 함께 한다
- [ ] **시네마틱 컷별 멘트를 LLM 으로** — 지금은 분석 낱말을 그대로 쓴다(trend-recipes.md §16). 층 c 실측 때 `accent_writer` 방식으로 문장을 짓고 구성에 고정할지 본다

**완료 조건**: 공모전 서버에서 BGM 무비를 만들면 결과물에 액센트와 스티커가 붙고(피사체를 가리지 않음), 같은 구성으로 다시 만들면 같은 결과가
나오며, MOV-27 의 괄호에서 빠진 것이 지워진다.

---

### A-20. `서버` `앱` 트렌드 숏브이로그 레시피 — 무비마다 고르고(12개) AI 컷 무비는 레시피가 컷까지 고른다, 손본 무비의 컷 · 변형 · 레퍼런스 따라 하기가 남음

레퍼런스 릴스와 사용자 설계를 따라 숏브이로그 스타일을 레시피(포맷 = 전략 묶음)로 둔다(MOV-28 `부분`). 결정 · 근거는
[decisions/trend-recipes.md](./decisions/trend-recipes.md) §1~§12(결정(잠정) — **미디어/편집 트랙 담당 검토 전**), 구현은 progress 2026-10-22 의 트렌드 레시피 항목들.
지금: 사용자가 앱에서 레시피를 고르고(`movie.recipe`), 컷을 전부 AI 가 정한 무비(`autoCuts`)는 워커가 `trend_edit.render` 로 컷 · 순서 · 효과 · 음원 · 글 · 효과음까지
한 번에 만든다. 손본 무비는 소리 · 타이틀 · 글 · 효과음만.

- [ ] **손본 무비에도 컷 구간 · 순서 · 효과를 레시피로** — 컷 구간 · 경계를 정하는 일이라 AI 초안(API edit-director)이 정하고 초안 · editSpec 계약에 실어야 한다
      (속도 · 램프 · 프리즈 · 매치 줌 초점 · 분할 · 레터박스 — EDL 이 그 모양의 출발점). 사용자가 자른 컷 · 고른 전환은 덮지 않는다(trimOwner · MOV-22).
      편집 화면 미리보기가 같은 효과를 그려야 한다 — whip · zoom · spin · glitch · shake · 램프 · 프리즈는 전환 어휘 밖이라 어휘 · TS 해석 픽스처를 함께(MOV-22)
- [ ] **EDL 저장 · 빠른 다시 만들기** — 지금 EDL(`Result.edl`)은 워커 로그에만 남는다. 분석 결과(후보 · 경계 특징)를 캐시하고 EDL 을 저장하면 다시 만들기를 계획
      단계부터 몇 초 안에 돌릴 수 있다(사용자 설계의 4단계)
- [ ] **변형 2~3개 중 고르기 · 피드백 학습** — 지금은 다시 만들 때마다 다른 변형(작업 시드)이다. 한 번에 여러 개를 만들어 고르게 하려면 크레딧 · 결과물 보관 ·
      앱 화면을 정하고, 고른 쪽 · 수정 기록으로 연결 점수 가중치 · 효과음 매칭을 조정한다. '안정 ↔ 실험' 슬라이더(temperature), 포맷 블렌딩도 여기서
- [ ] **레퍼런스 따라 하기("이 느낌으로") 앱 흐름** — 엔진은 있다(`reference.to_recipe`, `analyze-reference.py --recipe`). 앱에서 영상을 올리고, 서버가 분석해
      즉석 레시피를 무비에 붙이는 업로드 · 저장(특징값만 — 원본은 남기지 않음) · 계약 · 화면
- [ ] **트렌드 패턴 발견 · 포맷 등록** — 수집 방법과 1단계 도구는 정했다(trend-recipes §13 — yt-dlp 자동 수집, 운영 비사용, 원본 삭제,
      `reference-corpus.py` 의 수집 · 정규화 · 특징 · 커버리지 · k-means 군집 · 레시피 초안). 남은 것: 틱톡 · 인스타그램 계정 · 영상 URL 찾기(해시태그
      목록은 yt-dlp 로 못 읽고 봇 차단 우회는 하지 않는다), 수백 편 수집과 첫 리포트(2026-10-25 쇼츠 135편은 보정 전 컷 검출로 재서 버린다 —
      다시 받아야 한다, 영어 일반 태그 #vlog · #dailyvlog 는 원테이크 바이럴이 섞여 뺀다), 인스타 게시물 일부의 영상 요청 403, 커버되지 않은 군집의 초안을
      샘플 스냅으로 렌더해 검토 · 등록, 클러스터를 VLM 으로 설명 · 이름, 구성 패턴(n-gram), 못 재는 축(배속 · 프리즈 · 분할 · 글 · 효과음) 측정, 워터마크 마스킹,
      레퍼런스에 내용 개념(온톨로지 태그) 붙이기
- [ ] **무거운 모델로 정확도 올리기** — 피사체(SAM 마스크 · 분석의 피사체 상자 — A-19), 장면 유사도(CLIP), 효과음 검색(CLAP 임베딩 — 사전에 없는 장면에 소리).
      지금은 얼굴(YuNet) · 색 대비 눈에 띄는 영역 · 온톨로지 태그 · 키워드라 흰 종이를 피사체로 잡거나 소리가 없는 컷이 있다. GPU 워커 분리와 함께
- [ ] **LLM 이 상위 시퀀스 중 흐름 고르기** — 빔 서치가 낸 상위 몇 개 중 첫 컷(훅) · 마무리가 좋은 것을 고르고 자막을 쓴다. 비용 · 지연을 실측하고 켤지 정한다
- [ ] **텍스트 스토리형 포맷** — 큰 자막이 주인공인 포맷. 음성 인식 · 대본 생성이 필요하다
- [ ] **열린 온톨로지 키우기** — 개념 사전에 맞지 않은 분석 낱말을 모아 자주 나오면 새 개념 후보로(content-vocabulary 의 판 · 추천 재사용 키 영향과 함께 —
      decisions/ontology-personalization.md). 레퍼런스에서 찾은 전환 패턴을 `motion-link-vocabulary.json` 규칙으로 올리기. 편집 사전(효과음 · 의성어 ·
      움직임 · 레시피)은 2026-10-22 온톨로지 내보내기에 엮었다(trend-recipes §12) — 개념 쪽에서 소리를 고르는 일(분위기 → 효과음 등)에 쓸지는 아직
- [ ] **촬영 시각의 시간대** — 하루 타임스탬프는 서비스 기준 시간대(KST)로 쓴다. 사용자 · 촬영지 시간대를 알면 그것으로
- [ ] **얼굴 스티커 동의 · 끄기** — 얼굴을 찾는 일(서버 안, 프레임을 밖으로 보내지 않음)을 분석 동의와 같은 선에서 다룰지, 무비마다 끌 수 있게 할지. 오검출 ·
      놓침을 실제 스냅으로 더 재기(샘플 8장에서 오검출 0 · 뒤돌거나 가린 얼굴은 놓침). 얼굴 찾기는 스티커만이 아니다 — 회전 정보 바로잡기(`orient.py`)가
      분석 동의와 상관없이 회전 정보 있는 모든 원본에서 돈다(보통 경로 포함). 같은 선에서 정한다
- [ ] **타이틀 문구** — 2026-10-28 부제 · 장소를 무비 전체에서 고르게 바꿨다(같은 문자열 → 내용 개념 → 기본값, trend-recipes §15). 남은 것: 사용자가 바꾼
      무비 이름을 쓸지(계약 · 앱 변경), 생성할지
- [ ] **말소리 브이로그를 말 단위로** — `talk-vlog` 는 안정 구간으로 잘라 말 중간에서 끊길 수 있다. 스냅 신호의 말소리 구간(VAD)으로 컷 끝을 맞춘다
- [ ] **레퍼런스 커버리지를 넓은 말뭉치로 다시** — 2026-10-28 레시피 셋으로 직접 고른 10편 커버리지가 20 → 90% 지만 같은 10편으로 값을 맞췄다(trend-recipes §15)
- [ ] **음원 · 효과음 · 모델 라이선스 · 팩 이관** — 트렌드 레시피에 고른 Pixabay 곡 9개는 2026-10-27 운영 버킷에 올렸다(progress 2026-10-27,
      출처 · 약관 URL · 확인일은 매니페스트에). 효과음 19개(`assets/sfx/README.md`) ·
      YuNet(MIT, `assets/models/README.md`) 출시 전 법무 확인, 에셋 팩 매니페스트가 오면 버킷으로
- [ ] **운영에서 실측** — 실제 스냅(분석 동의 계정)으로 레시피마다 몇 편: 처리 시간(빠른 컷은 8GB 데모 환경에서 20컷 231초 — 운영 사양에서 다시), 결과, 효과 비율,
      회전 정보 바로잡기(`orient.py`)의 오판 — 샘플 40개 중 1개를 돌렸고 오판은 없었다. 얼굴이 옆으로 누운 채 찍힌 영상 같은 반례를 더 본다.
      2026-10-22 dev 스냅 12개(얼굴 4)로 다시 쟀다(progress 2026-10-22 "묶음 결합의 소리 · 영상 싱크와 회전 정보 바로잡기 실측") — 정상 원본 오판 0, 잘못 붙은
      회전 정보는 얼굴 있는 4개 중 3개를 바로잡고 1개를 놓쳤다. YuNet 이 누운 얼굴도 잡아서 오판을 막는 것은 1.5배 여유뿐이다 — 실제 메신저 파일 · 옆모습 · 가린
      얼굴로 더 잰다. 바로잡기는 보통 경로에도 돌아 회전 정보 있는 원본마다 약 0.8초(20개면 약 17초)가 든다 — 받아들일지, 레시피 무비에만 돌릴지 정한다.
      제한 시간도 본다: 레시피 경로가 실패하면 보통 경로를 처음부터 다시 돌리는데 둘이 같은 `EDIT_TIMEOUT_SECONDS`(900초 — 2026-10-27 600초에서 올림) 안에 있다 — 늦게 실패한
      레시피 무비는 보통 경로까지 끝내지 못하고 시간 초과로 실패할 수 있다

**완료 조건**: 공모전 서버에서 사용자가 레시피를 고르면, 손본 무비든 AI 컷 무비든 레시피대로 컷 · 효과가 정해지고 편집 화면에서 미리 보며 고칠 수 있고,
MOV-28 괄호의 빠진 것이 지워진다.

### A-21. `앱` 무비의 맞춤 방식(흐린 배경 · 검정 띠 · 흰 띠) 고르기 — 서버는 됐다, 앱 화면 남음

비율이 다른 원본의 남는 자리를 무비마다 고른다(MOV-8 `부분`, 2026-10-29 — [product-concept.md](./decisions/product-concept.md) 머리의 후속 결정).
서버는 무비의 `fitMode`(`blur_background` · `pad_black` · `pad_white`)를 저장해 생성 때 그 값으로 렌더하고, 흰 띠 위의 글은 대비 규칙이 띠 색으로
판단한다(`pipeline/accent_inputs.py`). 앱은 이 값을 보내지 않아 모든 무비가 흐린 배경이다.

- [ ] **편집 화면의 고르기** — 스타일 · 레시피 시트 옆에 둘지, 이름(사용자 어휘)을 무엇으로 할지 정하고 `PATCH /movies/{id}` 로 보낸다
- [ ] **미리보기** — 지금 스튜디오 무대는 `contentFit="cover"` 라 가로 원본이 잘려 보인다(`apps/mobile/src/pages/movie/ui/cut-player.tsx`). 고른 방식대로
      띠 · 흐린 배경을 그려야 고른 것을 판단할 수 있다
- [ ] **레시피 무비와의 관계를 화면에** — 컷을 전부 AI 가 정한 레시피 무비는 레시피의 화면 틀을 따라 이 값을 쓰지 않는다(MOV-8). 그때 고르기를 숨길지 · 안내할지

**완료 조건**: 앱에서 고르고 미리 본 방식으로 결과물이 나오는 것을 실기기에서 보고, MOV-8 의 괄호를 지운다.

### A-22. `앱` 무비의 꾸밈(글자 · 이모지 · 얼굴 스티커) 켜고 끄기 — 앱 화면 들어감, 실기기 확인 남음

무비마다 글자 · 이모지 · 얼굴 스티커를 각각 켜고 끈다(MOV-27 `부분`, 2026-10-29 — [text-accent-stickers.md](./decisions/text-accent-stickers.md) §9).
서버는 무비의 `decorations`(`{ text, emoji, face }`)를 저장해 생성 때 그 값만 따르고, 무비를 만들거나 레시피를 바꾸면 레시피의 기본값으로 채운다.
2026-10-30 앱에 편집 화면의 꾸밈 칩 · 시트가 들어갔다(progress 2026-10-30 "앱에서 꾸밈 켜고 끄기") — 실기기에서 결과물을 본 적은 아직 없다.

- [x] **편집 화면의 켜고 끄기** — 칩 줄의 꾸밈 칩이 세 스위치 시트를 연다(레시피 시트는 15줄이라 그 아래 두면 화면 밖). 레시피를 바꾸면 앱도 서버처럼
      새 레시피의 기본값으로 되돌린다(기본값 사본은 사전과 테스트로 맞춘다) — 2026-10-30
- [x] **다시 만들기 안내** — 완성된 무비의 꾸밈 시트에 "다시 만들 때 적용돼요. 컷·순서·음악은 그대로예요." 크레딧과 완성본이 사라지는 것은
      다시 만들기의 확인(`RemakeConfirm`, MOV-23)이 그대로 묻는다(앱은 값을 모르므로 숫자는 적지 않는다) — 2026-10-30
- [ ] **실기기 확인** — 아래 완료 조건

**완료 조건**: 앱에서 글자를 끄고 이모지만 켠 무비를 만들어, 이모지만 붙은 결과물을 실기기에서 보고 MOV-27 괄호의 A-22 언급을 지운다.

---

### A-23. `앱` `서버` 촬영 코치 — 편집하기 좋은 스냅을 찍게 돕는다, 결정만

목표는 편집하기 좋은 스냅을 찍게 만드는 것이다(SNAP-21 ~ 24 `결정·미구현`). 결정 · 근거 · 획일화를 피하는 원칙은
[decisions/capture-coach.md](./decisions/capture-coach.md)(결정(잠정), 2026-10-28). A-20 의 "촬영 가이드" 항목을 여기로 옮겼다.
1 · 2단계는 모델을 부르지 않고 `expo-camera` 를 그대로 쓴다.

- [ ] **1단계 — 뷰파인더 안내(SNAP-21)** — 품질 · 다양성 문구와 끄기. 문구는 [ux-writing.md](../apps/mobile/docs/ux/ux-writing.md) 어휘로,
      얼마나 자주 · 언제(녹화 전 · 연속 촬영 사이) 보일지는 기기에서 써 보고 정한다. 촬영 화면 기능 문서
      [capture-flow.md](../apps/mobile/docs/features/capture-flow.md) 갱신
- [ ] **2단계 — 편집에서 빠질 스냅 알리기(SNAP-22)** — `video_signals`(렌디션 작업이 업로드 뒤 계산)를 편집기의 `DRAFT_THRESHOLDS` 와 같은 값으로
      판정한다. 판정을 서버에 둘지(응답에 싣기 — 계약 · `openapi.json` · api-spec 변경) 앱에 둘지, 업로드 · 렌디션이 끝나기 전에 뷰파인더를 떠난
      사용자에게 어디서(라이브러리의 스냅) 알릴지 정한다. 중복은 10분 안 · 해시 거리 기준(edit-director §2.2)을 그대로
- [ ] **3단계 — 편집 스타일을 고르고 찍기(SNAP-23)** — 뷰파인더의 스타일 고르기, 레시피별 동작 안내 문구(레시피 사전에 둘지). 촬영 가이드(격자 +
      앞 컷 겹쳐 보기, "가장 최근 스냅" 규칙)는 코드가 있다([capture-coach.md](./decisions/capture-coach.md) §4.1)
  - [ ] **촬영 가이드 실기기 확인** — Android 에뮬레이터에서는 확인함(2026-10-30: 켜기 · 격자 · 두 문구 · 찍은 직후 앞 컷이 겹침). 실기기에서 앞 컷 마지막 장면이 뽑히는지, 겹친 장면이 미리보기와 같은 자리에 오는지
        (전면 카메라 좌우 반전 포함), 밝은 장면에서 격자가 보이는지. 켜짐 상태는 화면을 나가면 꺼진다 — 기억할지 써 보고 정한다
  - [ ] **AI 앞 컷 해석(SNAP-25) 지연 · 단가 · 동의 문구** — 2026-10-30 에뮬레이터에서 동의한 계정으로 안내 한 줄 · 점선 상자가 뜨는 것은
        확인했다. 응답이 약 8초였던 것은 추론을 꺼 모델 응답이 약 2초 · 한 번에 약 $0.00008 이 됐다(capture-coach §6, 2026-10-30) — 에뮬레이터 요청은
        서버에서 약 2.6초. 남은 것: 실기기에서 다시 잰다. 스냅 분석 동의 시트 문구는 "컷에 넣을 스냅을 고르는 데만 쓴다"고 해서 촬영 중 안내(결과를 보여 줌)를 말하지 않는다 —
        출시 전에 문구를 맞춘다(snap-content-analysis 후속 결정). 안내 문구의 길이 · 말투가 [ux-writing.md](../apps/mobile/docs/ux/ux-writing.md) 에 맞는지 몇 장면으로 확인
  - [ ] **장면 판단 · 실시간 추적(SNAP-26)** — 녹화 전 정지 사진으로 장면을 판단해 구도 규칙 고르기(`gpt-6-luna`), 카메라를
        `react-native-vision-camera` 로 바꾸고 기기 안 모델로 피사체 상자 추적 · 일치 막대([capture-coach.md](./decisions/capture-coach.md) §6)
  - [ ] **기울기 표시** — 자이로(`expo-sensors`)로 폰 기울기를 보여 주기. 네이티브 의존성이라 개발 빌드를 다시 만들어야 한다
  - [ ] **앞 컷 규칙 더하기** — 아래 상황은 기기에서 써 본 뒤 필요한 것만 규칙으로 더한다. 더할 때 SNAP-23 과 §4.1 을 같이 고친다
    - [ ] 오래된 스냅은 앞 컷으로 쓰지 않기 — 시간 기준(예: 편집기의 중복 기준과 같은 10분)은 써 보고 정한다
    - [ ] 사용자가 녹화 라이브러리에서 앞 컷을 직접 고르기
    - [ ] 앞 컷으로 쓰던 스냅을 지웠을 때 다음 후보로 넘어갈지 · 앞 컷 없음으로 둘지
    - [ ] 기기에서 원본을 지운 스냅(SNAP-19)을 앞 컷으로 쓰기 — 저장할 때 마지막 장면 썸네일을 남겨 둘지
- [ ] **3단계 — 촬영 의도를 남기고 편집기가 우대(SNAP-24)** — 짝 스냅(겹쳐 보며 이어 찍은 앞 컷)은 2026-10-30 에 들어갔다: 앱이 기억해
      등록 때 보내고(`linedUpWithClientId`), 레시피 편집의 순서 고르기가 짝에 0.3 을 더한다(capture-coach §4.2). 남은 것: **빔 서치 포맷에서는
      효과가 없다** — 실제 영상 5개 · 시드 20번에서 짝이 붙은 횟수가 cinematic 5 → 20 · whip-montage 3 → 20 인데 fast-cut 은 7 → 5 였다
      (빔은 걸음 점수를 평균 내고 온도로 흔들며, 목표 길이를 채우면 스냅을 다 쓰지 않고 끝나 둘이 함께 뽑히지 않기도 한다 — 2026-10-30).
      빔에서 짝을 어떻게 우대할지 정한다(짝을 한 후보로 묶기 등). 실제 무비에서 짝이 붙는지 기기로 확인하고 0.3 을 조정, 의도 없는 스냅의 결과가 나빠지지 않는지 같은 스냅 묶음으로 비교, 고른 스타일 · 안내한 동작은
      스타일 고르기가 생길 때, 예전 보통 경로 · 레퍼런스 편집에도 짝을 줄지
- [ ] **보류 — 흔들림 경고** — 자이로(`expo-sensors`, 지금 의존성에 없다)로 녹화 중 흔들림을 알릴지. 노출 · 초점은 `expo-camera` 로 프레임을 못 읽어
      2단계가 대신한다
- [ ] **보류 — 세그멘테이션 윤곽 고스트** — 3단계 겹쳐 보기로 부족하다고 판명될 때만. 카메라를 `react-native-vision-camera` 또는 네이티브 모듈로 바꿔야 한다
- [ ] **보류 — VLM 촬영 피드백**(샷 리스트 자동 체크 · 재촬영 제안 · 인식 자막) — [snap-content-analysis.md](./decisions/snap-content-analysis.md)
      §2(결과 비노출) · §3(요청 시점 분석) · §6.1(동의) 을 바꾸는 별도 결정이 먼저다. A-3 단가 실측 뒤

**완료 조건**: SNAP-21 ~ 24 가 `구현됨` 이 되고, 촬영 의도를 남긴 스냅 묶음과 남기지 않은 묶음으로 만든 무비를 비교해 의도 없는 쪽이 나빠지지 않았음을
progress 에 남긴다.

---

## B. 개발 합의 필요 (A·B 트랙 공동 소유)

### B-2. FCM 멀티 디바이스

`users.fcm_token` 이 **단일 컬럼**이라 기기 하나만 등록된다. 새 기기로 로그인하면
이전 기기 토큰을 덮어쓴다(`POST /auth/fcm-token` 이 항상 덮어쓰기).
`users` 테이블은 [team.md](./team.md) 상 **공동 소유**라 스키마 변경에 양쪽 합의가 필요하다.
별도 `user_devices` 테이블로 빼는 것이 자연스럽다.

**결정할 것**: 멀티 디바이스 지원 여부, 지원 시 발송 팬아웃 방식(`sendEachForMulticast`), 무효 토큰 정리 범위.

**2026-10-11 결정 — 공모전 동안은 단일 기기를 유지한다.** 테스터는 대개 폰 한 대로 쓰고, 기기를 바꾸면 마지막에 앱을 연 기기가
받는다(NTF-5). 지원하려면 공동 소유인 `users` 스키마부터 바꿔야 해서 공모전(2026년 11월까지 —
[aws-contest-server.md](./decisions/aws-contest-server.md) 2026-10-11 덧붙임) 뒤로 미룬다.

**완료 조건**: 공모전 뒤(2026-11~) 위 세 가지를 정한다. 지원하면 `user_devices` · 팬아웃 · 무효 토큰 정리를 넣고 NTF-5 를 고치고,
지원하지 않으면 NTF-5 의 "단일 기기"를 확정으로 바꿔 닫는다.

### B-5. API 계약 스키마 우선 — 남은 다듬기

계약 원천 통일(1~5단계)은 끝났다([닫은 항목](#닫은-항목)) — 결정과 기각한 대안은
[decisions/api-contract-schema-first.md](./decisions/api-contract-schema-first.md). 모바일 `shared/api`와
`packages/shared-types`는 [team.md](./team.md) §2의 공유 surface라 변경에 양 트랙 합의가 필요하다.

- [ ] 엔티티 경계의 Zod 를 계약 스키마의 **파생**(`videoSchema.pick(...)` 등)으로 바꾸기. 계약 패키지가
  앱 **런타임** 번들에 들어가므로 Metro 가 `dist`(또는 `react-native` export 조건으로 `src`)를 해석하는지,
  Jest 가 워크스페이스 심링크 밖 ESM 을 변환하는지 한 엔티티로 먼저 확인한다. 지금은 타입만 쓰고
  경계 스키마는 `apiRequest`의 할당 가능성 규칙으로 계약과 대조한다
- [ ] `openapi.json`의 `*Input` 사본 스키마 — type provider 가 입력/출력 레지스트리를 둘 다 내는 동작.
  무해하지만 Swagger 가독성을 위해 upstream 옵션이 생기면 끈다
- [ ] **모바일 응답 검증 범위** — 앱은 경계 Zod 로 자기가 쓰는 필드만 검증한다
  ([api-contract-integration.md](../apps/mobile/docs/workflows/api-contract-integration.md) "Zod validation policy").
  그보다 엄격한 필드 단위 검증이 필요한 응답이 있는지는 정해지지 않았다. **완료 조건**: 대상 응답(없음 포함)을
  정하고 그 문서의 정책 절에 반영한다

### B-9. main 에 PR 없이 바로 push 할 수 있다 — main 반영 규칙과 브랜치 보호

2026-10-22 트렌드 레시피 작업(`f751e5b` ~ `ca9599f` — 워커 · API · DB 마이그레이션 · 앱)이 PR 없이 main 에 바로 push 돼, 리뷰 없이 운영에 배포됐다.
[team.md](./team.md) §4 는 브랜치 · PR 을 나누는 단위만 말하고 main 직접 push 를 막는 규칙이 없다. GitHub 의 main 에도 브랜치 보호와 ruleset 이 없다
(2026-10-22 확인). 리뷰 없이 운영이 바뀔 수 있다(CI 를 거치지 않은 배포는 2026-10-24 E-68 로 막았다). 2026-10-24 오너: 개발 단계 동안은 보류한다.

**완료 조건**: 두 트랙이 main 반영 규칙(PR 필수 여부 · 리뷰 · CI 통과 · 문서만 바꾼 커밋의 예외)을 정해 team.md §4 에 적고, 정한 대로 GitHub 브랜치
보호를 건다.

---

## C. 외부 크리덴셜/승인 대기

### C-1. 스토어 상품 등록(크레딧 팩, 구독은 A-2 뒤) → IAP 구매·웹훅 검증

**막힌 이유**: 백엔드 구현은 끝났다(progress 2026-08-14 "크레딧 결제 구현 + Stripe·구독 제거"). 남은 것은
저장소 밖 설정이다 — 크레딧 묶음의 수량·가격(A-2)이 확정되지 않아 양 스토어에 consumable
상품을 등록할 수 없고, App Store Connect / Play Console / RevenueCat 프로젝트 설정도 아직 없다.

**등록 시 맞춰야 할 것**: 스토어 상품 ID는
[`credit-policy.ts`](../apps/api/src/services/billing/credit-policy.ts)의 `CREDIT_PACKS.productId`와
**글자 그대로 일치**해야 한다. 어긋나면 웹훅이 지급량을 못 찾아 500으로 떨어진다(재시도로 복구는 된다).
RevenueCat 웹훅 URL은 `POST /billing/webhook/revenuecat`, Authorization 헤더 값은
`REVENUECAT_WEBHOOK_AUTH_TOKEN`과 같아야 한다. 앱의 RevenueCat SDK 는 `app_user_id` 를
**Snaply `User.id` 로 고정**해야 웹훅이 지급 대상을 찾는다(앱에는 아직 SDK 가 없다).

**완료 조건**: A-2에서 크레딧 묶음 확정 → `credit-policy.ts` 값 교체 → 양 스토어 consumable 상품 등록 →
RevenueCat 프로젝트·웹훅 URL 설정 → 앱에 구매 화면과 RevenueCat SDK, 무비 생성 화면에 누르기 **전의** 잔액과 100크레딧 비용
(CRD-4 `부분`의 빠진 것 — 지금 비용은 부족할 때 402 안내로만 드러난다) → sandbox 구매 → 웹훅 수신 → 크레딧 지급 →
같은 트랜잭션 웹훅 재전송 시 중복 지급 없음까지 한 번 통과하면 닫힌다.

**구독 상품은 A-2 결정 뒤다.** 무엇을 팔지(용량인지 보관 기간인지)부터 미확정이다(A-2, CRD-7).
팔기로 정해지면 크레딧 팩(consumable)과 별도로 **auto-renewable subscription**
(Apple Subscription Group / Google base plan)으로 등록한다
([decisions/storage-and-subscription-policy.md](./decisions/storage-and-subscription-policy.md) §5).
그때 sandbox 검증에 갱신·해지·만료·결제실패 전이가 추가되며, 앱 쪽에는
**"구매 복원(Restore Purchases)" 버튼**이 필수다(Apple App Review 3.1.2(a) — 누락 시 리젝).

### C-2. 틱톡 받은함 실물 미도착

**막힌 이유**: 업로드 API 는 성공(`SEND_TO_USER_INBOX` / `error.code=ok`)을 반환하는데
사용자 앱에 알림이 오지 않는다. 3회 시도 모두 동일.

**진단의 벽**: `user.info.basic` 스코프가 재인증 후에도 부여되지 않아
(`/v2/user/info/` → `scope_not_authorized`) **어느 계정에 전달됐는지 확인할 수단이 없다.**
받은함 내용을 조회하는 API 도 없다.

**다음 확인 순서**
1. Sandbox → Scopes 에 `user.info.basic` 이 실제로 켜져 있는지 → `Apply changes`
2. TikTok 앱에서 기존 앱 연결 해제 후 재인증 (기존 승인 재사용을 막아야 새 동의가 뜬다)
3. 동의 화면에 권한이 **두 개** 표시되는지 확인
4. 부여되면 `/v2/user/info/` 로 계정 확정 → 그 계정의 **받은 편지함(알림)** 확인
   (초안/Drafts 가 아니다 — 알림을 탭해야 편집 화면으로 들어간다)

계정이 확정되면 "계정 불일치"인지 "Sandbox 가 실제 전달을 하지 않음"인지 갈린다.
조사 기록은 [archive/progress-integrations-2026-08.md](./archive/progress-integrations-2026-08.md)의
"틱톡 — API 는 성공, 실물 미확인 (2026-08-10)" 절, 콘솔 쪽 대처는 [sns-setup.md](./sns-setup.md) §3 "틱톡 트러블슈팅".

**완료 조건**: 받은함 알림 도착 확인. 또는 Sandbox 제약임이 확인되면 심사 통과 후 재검증. 닫으면 틱톡 받은함에 남겨 둔 초안 3건
(이 항목의 유일한 증거물이라 지금은 지우지 않는다)을 지운다.
2026-08-31 개발자 회의에서 테스트 계정으로 "영상 업로드 정상 동작"이 보고됐으나 받은함 실물 도착까지
확인한 것인지는 기록에 없다 — 참석자에게 재확인하고, 확인됐다면 이 항목을 닫고
[progress.md](./progress.md)에 기록한다.

### C-3. 틱톡 `video.publish` 심사 → 직접 게시 전환

**현재**: `video.upload`(받은함) 방식. 사용자가 틱톡 앱에서 마무리해야 게시되고,
응답에 `requiresUserAction: true` 가 실린다.

**완료 조건**: 앱 심사로 `video.publish` 승인 → `TIKTOK_SCOPES` 값만 바꾼다(로컬은 `apps/api/.env`, 서버는 시크릿)
```bash
TIKTOK_SCOPES=user.info.basic,video.publish
```
이 값은 코드 기본값이기도 하다 — 심사 전에는 `user.info.basic,video.upload` 를 **명시해야** 받은함 방식이 된다
([sns-setup.md](./sns-setup.md) §3 "틱톡 스코프"). 엔드포인트는 코드가 자동 분기한다(`/inbox/video/init/` → `/video/init/`).
`requiresUserAction` 이 응답에서 사라지므로 **모바일 안내 문구도 함께 정리**해야 한다
([api-spec.md](./api-spec.md) SNS 연동 절).

**공모전 서버에서 켜려면**(B-8 에서 옮김): 버킷이 퍼블릭 차단이고 CloudFront 가 없어 미디어 호스트의 URL prefix 검증(D-3) 파일을 둘 곳이 없다.
공모전 시연에 필요하면 인프라에 CloudFront(또는 검증 경로 공개)를 요청하거나 아래 `FILE_UPLOAD` 로 간다.
켤 때는 콘솔의 리디렉션 URI `https://snaply-api.dweaxai.com/sns/tiktok/callback` · `/legal/` prefix 검증(`SITE_VERIFICATION_*`)과
키(`TIKTOK_*` · `TIKTOK_REDIRECT_URI`)를 시크릿에 넣는다([deployment-aws.md](./deployment-aws.md) §2). 앱에는 틱톡 연결 진입점이 아직 없다
(`준비 중`, SNS-8).

**대안 후보(미결정)**: 영상 바이트를 우리가 직접 올리는 `FILE_UPLOAD` 방식 — 틱톡이 우리 URL 에서 영상을
가져가지 않으므로 URL prefix 소유권 검증(D-3)이 필요 없어진다. 클라이언트 구현이 추가로 필요하고, 지금은
`PULL_FROM_URL` 만 구현돼 있다(`apps/api/src/services/sns/tiktok.client.ts`).

### C-6. AdMob 콘솔 설정 → 보상형 광고 지급 실검증

**현재**: 백엔드, 앱 SDK/provider, Android AdMob 앱·광고 단위·SSV URL 설정은 끝났다
(2026-08-19 — 구현 상세는 [모바일 기능 문서](../apps/mobile/docs/features/credits-and-rewarded-ads.md),
**미결 상태·완료 조건의 원천은 이 항목이다**).
그러나 Snaply의 공개 Play 스토어 등록이 없어 AdMob 앱 검토를 통과할 수 없고, 자체 광고 단위가
`no-fill`을 반환한다. Google 공개 테스트 단위는 Snaply의 SSV URL을 갖지 않아 크레딧 지급을
검증할 수 없다.

**출시·검증 전에 남은 것**
- SSV 콜백 URL은 **`GET {고정 도메인}/billing/webhook/admob`** — 쿼리 파라미터를 임의로 덧붙이지
  않는다(서명 대상이 쿼리스트링 원문이다). 고정 도메인은 D-1에 걸려 있다.
- 생성된 광고 단위 ID를 `ADMOB_SSV_ALLOWED_AD_UNITS`(쉼표 구분)에 넣어야 한다. **비어 있으면
  모든 콜백이 거절된다** — 지급 경로를 "설정 안 함 = 전부 허용"으로 열지 않기 때문이다.
  **형식이 확정되지 않았다**: Google 문서의 `ad_unit` 설명은 "AdMob ad unit ID" 인데 예시값은
  `2747237135` 같은 숫자다(전체 형식 `ca-app-pub-…/2747237135` 가 아니다). 숫자 부분과 전체
  형식을 **둘 다 넣고 시작**한 뒤, 첫 지급이 통과하면 실제로 온 값을 `ad_rewards.ad_unit` 에서
  확인해 정리한다. 거절 시에도 수신한 `ad_unit` 을 기록하므로 로그 없이 판정할 수 있다.
- 앱의 `customData = nonce`, `userId = ssvUserId` 배선은 완료됐다. 변경 시 이 계약을 유지한다.
- 보상량 20·한도 5는 확정됐다(A-2). 콘솔 설정이 끝날 때까지 `AD_REWARD_ENABLED=false`다.
- Google UMP 동의 흐름을 앱에 넣는다 — 맞춤 광고를 쓸지 · 동의를 어떻게 받을지는 D-2 "맞춤 광고 · 동의(UMP · ATT) 정책"이 정한다.
  iOS 쪽(ATT · iOS AdMob App ID · 광고 단위 · SKAdNetwork · iOS 수신)은 A-4 "iOS 출시 전".
- App Store Connect 개인정보와 Play Console 광고·데이터 안전성 신고를 실제 SDK 수집 범위와 맞춘다.

**완료 조건**: 공개 스토어 등록 → AdMob 앱 검토 통과 → 운영 도메인·allowlist·동의 흐름 주입 →
등록한 테스트 기기에서 자체 광고 단위 시청 → 실제 SSV 수신 → 크레딧 지급 → 같은 트랜잭션
재전송 시 중복 지급 없음까지 통과하면 닫힌다.

**켠 뒤**(완료 조건 아님, D-5 에서 옮김): 광고 보상 세션(`ad_rewards`)의 만료는 **조회 시점에만** 확정돼
([ad-reward-credits.md](./decisions/ad-reward-credits.md) §4-1) 다시 오지 않는 사용자의 `pending` 행이 쌓인다(사용자당 하루 최대 288행 —
"진행 중 1개 + TTL 300초"). 크레딧이 아니라 행만 늘고 상태를 잘못 읽게 하지는 않는다(그 사용자가 다시 오면 그 자리에서 확정된다).
실사용 규모에서 문제가 되면 고아 pending 영상 정리(`npm run videos:purge-pending -w apps/api`, progress 2026-08-12 "고아 pending 영상 정리 배치")와
같은 방식의 배치를 붙인다. `AD_REWARD_ENABLED=false` 인 동안은 행이 생기지 않는다.

### C-8. Meta 앱 검수 — 제출했고 결과를 기다린다

**막힌 이유**: Meta 앱 "Snaply"(ID 1828326745016512)가 개발 모드라 **앱 역할에 테스터로 넣은 Instagram 계정만** 연결된다(SNS-8). 고급 액세스는 앱
검수로 받고, 권한을 검수에 추가하려면 비즈니스가 **Tech Provider** 여야 한다(비즈니스 인증 · 액세스 인증 · 앱 검수, 되돌릴 수 없음).

**2026-10-12 진행한 것**: 앱 소유권을 회사 비즈니스 포트폴리오 **주식회사 디윅스**(ID 854066407728755, 비즈니스 인증 완료)로 옮기고, 회사가 액세스
인증(Tech Provider)을 마쳤다. 이어서 `instagram_business_basic` · `instagram_business_content_publish` 두 권한으로 **앱 검수를 제출했다**(권한별 사용
설명 · 시연 영상 · 데이터 처리 · 검수자 지침 · APK · 검수 전용 계정). 제출 내용은 progress 2026-10-12 "Meta 앱 검수 제출". 결과가 나올 때까지 테스터가
아닌 사람은 "Instagram 앱에서 올리기"로 올린다 — [decisions/instagram-app-handoff.md](./decisions/instagram-app-handoff.md).

**남은 것**: ① 검수 결과 확인 — 반려되면 사유에 맞춰 고쳐 다시 낸다. 개인정보처리방침이 "법률 검토 전 초안"이라 반려 사유가 될 수 있다(D-2) ② 검수 전용
계정의 완성 무비는 2026-11-11 에 만료된다 — 그때까지 결과가 없으면 무비를 다시 만들어 둔다 ③ 승인 뒤 테스터가 아닌 계정으로 연결 · 게시를 확인한다.

**완료 조건**: 두 권한의 고급 액세스가 승인되고, 테스터가 아닌 계정이 연결 · 게시되는 것을 본다. 그때 SNS-8 의 "테스터만" 문장을 고친다.

---

## D. 운영 전환 시

### D-1. 고정 도메인

현재 로컬 검증은 cloudflared 임시 터널(`*.trycloudflare.com`)을 쓴다.
**재시작하면 주소가 바뀌고, 그때마다 인스타·틱톡 콘솔의 리디렉션 URI 와
URL prefix 소유권 검증을 다시 등록해야 한다.**

`snaply.com` / `snaply.co` 는 제3자 소유이고 Cloudflare 가 아니라 named tunnel 을 쓸 수 없다
(NS: linode.com). 보유 도메인이 생기면 쓸 절차: [local-tunnel.md](./local-tunnel.md) §6.

**2026-10-08 — 공모전 기간에는 채워졌다.** AWS 공모전 서버([decisions/aws-contest-server.md](./decisions/aws-contest-server.md))가 ALB 뒤에서
`https://snaply-api.dweaxai.com` 으로 바깥에서 닿는다. 콜백 · 웹훅 · 검수에 쓸 HTTPS 주소가 생겼으므로
그 기간에는 cloudflared 임시 터널이 필요 없다. "웹훅 연동"이 어느 웹훅을 뜻하는지는
[decisions/sns-webhook-scope.md](./decisions/sns-webhook-scope.md)(미결)에서 정한다 — 도메인 작업은 그 답과 무관하다.

**그래서 아직 열려 있다**: 이 주소는 **공모전이 끝나면 내려간다**([aws-contest-server.md](./decisions/aws-contest-server.md) 2026-10-11 덧붙임 —
운영은 2026년 11월까지). 콘솔에 등록한 리디렉션 URI 와
URL prefix 소유권 검증은 주소가 바뀌면 다시 등록해야 하므로, 서버가 내려가기 전에 **계속 쓸 도메인**을
정해 두어야 한다. 또 이 서버에는 CloudFront 가 없고 버킷이 퍼블릭 차단이라 **미디어 호스트 주소는 아직 없다**
(C-3 "공모전 서버에서 켜려면").

**완료 조건**: 공모전과 무관하게 유지되는 도메인이 정해지고, 그것이 `CLOUDFRONT_DOMAIN` /
`S3_PUBLIC_ENDPOINT` 의 실제 값이 된다.

### D-2. 법률 문서 정식화

`apps/api/src/routes/legal.ts` 의 약관·개인정보처리방침은 **코드 기준으로 실제 수집 항목을 정확히 기술했지만
법률 검토를 받지 않은 출시 전 초안**이다(페이지 상단에도 표기). 아직 출시 전이므로 약관 "개정" 절차
(사전 공지·재동의)는 필요 없다 — 정식 문서화에 합친다. 남은 것:

- [ ] **분석 고지** — 동의 문구와 함께 확정한다. 2026-09-29 옵트인 결정으로 생산 활성화의 조건은 아니게 됐다
      (동의한 사용자에게만 돈다 — [snap-content-analysis.md](./decisions/snap-content-analysis.md) §6.1)
  - 사업자·모델 확정 (지금 문서는 OpenAI 전제, `OPENAI_VISION_MODEL` 은 잠정값 — A-3 "운영 모델 고정")
  - [ ] **계약 문구 대조와 DPA 체결** — 보유 기간·학습 이용은 공개 문서로만 확인했다. ZDR 승인을
    받으면 보관 기간을 "없음" 으로 바꿀 수 있다
  - [ ] **Apple·Google 취급의 법무 확인** — 우리가 직접 보내지 않아 표가 아니라 문장으로 관계만 적었다
  - [ ] **Sentry 보관 기간** — 요금제(무료 30일 / 유료 90일)가 정해지면 좁힌다
  - [ ] **별도 동의가 필요한가**(법무 판단) — 2026-09-29 결론을 기다리지 않고 옵트인을 먼저 들이기로 했다
    ([snap-content-analysis.md](./decisions/snap-content-analysis.md) §6.1). "고지로 충분하다"로 나오면 동의의
    기본값을 그때 다시 정하고, "필요하다"로 나오면 동의 문구만 검토 결과에 맞춘다
- [ ] **맞춤 광고 · 동의(UMP · ATT) 정책** — 2026-10-11 처리방침에 광고를 넣으면서 **지금의 앱 동작 그대로** 적었다: 광고 보기를 누를 때
      AdMob SDK 가 처음 켜지고, 맞춤 광고를 끄는 옵션도 동의(UMP) 화면도 없이 기본값으로 요청하며 보상 확인용 사용자 id 를 싣는다.
      맞춤 광고를 쓸지, 동의를 어떻게 받을지 정하고 처리방침의 "보상형 광고" 문단을 함께 맞춘다. 앱(`features/watch-reward-ad`)의 구현은
      C-6(UMP)과 A-4 "iOS 출시 전"(ATT), 스토어 신고(App Store 개인정보 · Play 데이터 안전성)는 C-6

**완료 조건**: 법무 검토를 거친 정식 문서로 교체하고 페이지 상단의 "출시 전 초안" 배너를 걷는다.

### D-3. URL prefix 소유권 검증 재등록

운영 도메인(D-1)이 정해지면 틱톡 URL prefix 소유권 검증을 그 호스트로 다시 등록한다. 검증할 prefix 두 곳
(API 호스트 `/legal/` · 미디어 호스트 `/snaply-dev/`)과 서빙 방식·서명 발급 단위의 실측은
[sns-setup.md](./sns-setup.md) §3 "URL prefix 소유권 검증". 운영에서 CloudFront 도메인 하나로 합쳐지면
검증도 한 번으로 줄어든다. 운영에서도 **검증 파일 경로만은 익명 읽기**여야 한다 — 개발용
`npm run dev:public-bucket -w apps/api` 는 로컬 MinIO 전용이라(`S3_ENDPOINT` 없으면 실행 거부) 운영에서는 쓰지 않는다.

**완료 조건**: 운영 도메인에서 필요한 prefix 가 검증되고, 그 도메인의 영상 URL 로 PULL_FROM_URL 업로드가
`403 URL ownership` 없이 통과한다.

### D-6. 운영 OpenAI 키의 사용 한도 · 예산 상한

AI 편집 에이전트가 2026-10-13 부터 공모전 서버에서 서버 시크릿의 `OPENAI_API_KEY` 로 돈다(progress 2026-10-13 "에이전트 운영 확인").
분석 워커도 같은 시크릿을 읽는다. 로컬과 다른 키라는 것은 확인했지만(닫은 항목 B-8), 그 키에 사용 한도 · 예산 상한을 걸었다는 기록은
저장소에 없다 — 테스터가 늘거나 에이전트 루프가 새면 비용이 막히지 않는다. A-3 의 팀 스냅 실측도 이 키로 돌아 그 전에 건다
([deployment-aws.md](./deployment-aws.md) "실측" 1. 예산 상한). rate limit 등급은 A-3.

**완료 조건**: 운영 키가 어느 OpenAI 프로젝트의 키인지 확인하고, 그 프로젝트에 예산 상한을 걸어 [deployment-aws.md](./deployment-aws.md) §2 에 적는다.

---

## E. 코드 결함 / 판단 필요

### E-5. BGM 곡이 스펙에 핀으로 남지 않는다 — 라이브러리 곡 수가 바뀌면 같은 무비의 곡이 바뀐다

곡은 무비 id 와 스타일 태그로 고른다 — 버킷 매니페스트에서 받은 그 태그의 곡을 이름순으로 놓고 `sha256("{movieId}:music:{tag}")` 로 하나를 고르므로
(`music.pick_track`, [`apps/ai-worker/src/pipeline/music.py`](../apps/ai-worker/src/pipeline/music.py), progress 2026-10-15 "BGM 을 버킷에서 받고 무비마다
고정한다") 같은 무비는 컷을 바꿔 다시 만들어도 같은 곡이지만, 버킷의 곡이 늘거나 줄면 같은 구성의 무비가 다른 곡을 받는다 — MOV-14 는 같은 구성이면
같은 결과를 요구하고, A-7 의 비트 싱크가 들어오면 컷 지점까지 달라진다.

**완료 조건**: 선택된 트랙 ID·난수 시드를 `editSpec` 에 핀으로 남기고, 재생성이 같은 산출물을
내는 것을 테스트로 고정한다. 트랙 ID 를 가지려면 `bgm_tracks` 가 필요하므로 A-7 과 함께 간다.

### E-64. 메모리가 적은 환경에서 무비 결합 단계가 메모리 부족으로 죽는다 — 운영 사양 실측 남음

2026-10-21 샘플 스냅으로 무비를 만들다 찾았다. 9컷 · zoompunch 3곳인 무비의 `editor._join_segments` 가 ffmpeg 헤더를 쓴 뒤 메시지 없이 끝났다 — 8GB Docker VM(다른
컨테이너가 떠 있어 남은 메모리 약 1.6GB)에서 강제 종료로 본다. 결합은 컷 전부를 한 번에 입력으로 열고, zoompunch 마다 1080x1920 을 RGB 로 바꾸는 `zoompan` 을 돈다.
zoompunch 를 flash 로 바꿔도 6 · 7 · 9컷 무비가 모두 같은 단계에서 죽었다 — zoompunch 만의 문제가 아니라 결합 단계 전체(컷 전부를 동시에 디코딩 + x264 기본
스레드 수만큼의 프레임 버퍼)의 메모리다. 인코딩 속도도 0.1~0.3배속이었다. ffmpeg 스레드만 줄이면(입력마다 디코더 1 · 인코더 2 · 필터 2) 같은 무비가 통과했다 — 메모리라는 근거다.
운영(공모전 서버)의 메모리 · 컷 수 상한(MAX_EDIT_CLIPS)에서도 같은 일이 날 수 있다.

2026-10-22: ②의 '결합을 나눠 하기'를 넣었다 — 9컷 이상이면 바로 넘김 경계에서 8개씩 묶어 잇고 묶음끼리 다시 인코딩 없이 이어 붙인다(`editor.join_groups`,
progress 2026-10-22 "트렌드 레시피"). 32컷 샘플이 같은 8GB VM 에서 통과했는지는 그 항목에 있다. 운영 사양 실측은 남았다.
묶음 결합은 보통 경로의 9~20컷 무비에도 걸린다. 그 소리 · 영상 싱크를 쟀고 묶음 경계에서 밀리지 않았다 — 기존 단일 결합과 같은 컷의 차이가 대부분 한 프레임 안
(progress 2026-10-22 "묶음 결합의 소리 · 영상 싱크와 회전 정보 바로잡기 실측"). 메모리는 그때 재지 않았다.
2026-10-26 공모전 서버에서 20컷 무비(3초 스냅 · 일상 · classic)의 `ai-worker` 최고는 973MiB 였다(progress 2026-10-26 "공모전 지표 실측") — zoompunch 가 여러 번인
무비 · 레시피 무비는 아직 재지 않았다. 원인이 오류에 남지 않던 것(①)은 2026-10-27 에 고쳐 닫았다 — 메모리 부족으로 죽으면 이제 오류 끝에 `SIGKILL` 이 남는다.

**완료 조건**: ② 상한 컷 수 · zoompunch 여러 번인 무비를 운영 서버 사양에서
돌려 메모리를 재고, 넘치면 스레드 수를 정하거나 결합을 나눠 하거나(앞에서부터 묶어 이어 붙이기) zoompan 을 가벼운 방식(crop+scale 시간식)으로 바꾼다.

### E-30. 앱을 연 직후 첫 저장이 20~30초 걸린 적이 있다 — 재현되지 않음

2026-10-12 에뮬레이터(테스터 빌드 `3e7039f`, AWS 서버)에서 앱을 막 열거나 다시 가져온 직후의 닉네임 저장이 두 번 20~30초 걸렸다. 서버의
`PATCH /auth/me` 는 12ms 였다. 계측 빌드(요청 · `getSession()` · 보안 저장소 읽기 시간을 logcat 에 남김)로 **복귀 직후와 완전 종료 뒤 시작 직후를
다시 재현해 봤지만 둘 다 0.06~0.12초**였다. 앱 안에서 요청 전에 기다리는 길은 `getSession()` 의 보안 저장소 읽기뿐이고, 시작 때 요청 9개가 동시에
읽으며 요청마다 0.3~0.7초를 쓰는 것이 측정됐다 — 이것은 고쳤다(어댑터의 메모리 캐시, progress 2026-10-12 "보안 저장소 읽기를 한 번으로").
20~30초는 서버 도착까지의 시간이라 네트워크 연결 대기도 들어 있다. 그때 에뮬레이터를 막 켜 네트워크 상태가 바뀌던 중이라, 끊긴 연결에 보낸 요청이
시간 초과 뒤 다시 나간 것으로 본다(확정 아님).

**완료 조건**: 휴대폰에서 앱을 연 직후 · 다시 가져온 직후 · 와이파이↔데이터 전환 직후 저장해 보고, 수 초를 넘지 않으면 닫는다. 넘으면 그때 계측을
다시 넣는다(이번 계측 코드는 커밋하지 않았다).

### E-58. 앱에 크래시 보고가 없다

앱은 그리다 던진 오류를 화면으로 받는다 — `src/app/_layout.tsx` 가 내보내는 `ErrorBoundary`(`_app/routes` 의 `RootErrorBoundary`)가 오류 카드와
`다시 시도` 를 그린다(2026-10-19). 그러나 무엇이 왜 던졌는지는 어디에도 남지 않는다. 서버는 Sentry 로 5xx 를 보고하지만(`apps/api/src/lib/sentry.ts`)
앱에는 보고 경로가 없어, 테스터 기기의 크래시는 테스터가 말해 주지 않으면 모른다.

**완료 조건**: 앱 크래시 보고를 정한다 — 붙이면(Sentry React Native 또는 Firebase Crashlytics — 이미 Firebase 를 쓴다) 오류 경계와 처리되지 않은
예외가 보고되는 것을 에뮬레이터로 확인하고 기능 문서 app-shell-and-navigation.md 에 적는다. 붙이지 않으면 그 이유를 결정 문서로 남긴다.

### E-59. 오프라인 콜드 스타트에서 스플래시가 오래 머물 수 있다 — 재보지 않음

콜드 스타트는 세션이 복원될 때까지 스플래시를 남긴다(2026-10-19 — OS 창 색이 보이던 틈을 없앴다). 접근 토큰이 만료된 채 오프라인으로 열면 Supabase 의
토큰 갱신이 재시도 간격을 늘리며 기다려, 복원이 끝날 때까지 스플래시가 길게(약 25초까지 — 코드로 짐작, 재지 않음) 남을 수 있다.

**완료 조건**: 에뮬레이터에서 토큰이 만료된 계정(마지막 사용 뒤 1시간 넘게)으로 비행기 모드 콜드 스타트를 재본다. 수 초를 넘으면 스플래시를 잡는
시간에 상한을 두고(그 뒤에는 저장된 세션으로 화면을 연다) 기능 문서 app-shell-and-navigation.md 를 고친다.

---

## F. 남은 실검증

앱 동작은 Android 에뮬레이터 확인으로 "실기기 미검증"을 지운다(H-15, 2026-10-16). 여기 남은 휴대폰 확인은 기기에만 있는 것(푸시 수신 · 권한 ·
카메라 · 앨범 · 다른 앱 열기)이고, iOS 는 A-4 "iOS 출시 전"에 있다.

- [ ] **SNS 업로드를 로컬 터널로 실키 재검증** — Instagram 의 실제 키 게시는 2026-10-11 공모전 서버에서 S3 presigned GET 으로 통과했다
      (progress 2026-10-11 "앱에서 Instagram 에 연결하고 무비를 게시한다"). 남은 것은 로컬 터널 경로(`apps/api/scripts/dev-tunnel.sh` ·
      [local-tunnel.md](./local-tunnel.md) §6 — `S3_PUBLIC_ENDPOINT` 가 MinIO 의 공개 주소)와 틱톡이다. 기동 경고는 서명 호스트를
      보도록 고쳤다(E-21). C-2 · D-3 와 같은 자리에서, 터널의 `S3_PUBLIC_ENDPOINT` 로 인스타 · 틱톡 업로드가 400 없이 통과하는지 본다.
      **완료 조건**: 둘 다 400 없이 통과한다
- [ ] **돌비비전 실물 원본으로 HDR 경로 확인** — 스트레스 검증(2026-09-15)의 HDR 수정은 합성 HDR10 으로만
      확인했다. 실제 DV 원본이 생기면 편집 결과물과 렌디션 모두 다시 확인한다(아이폰 원본은 A-4 "iOS 출시 전"과
      같은 공백)
- [ ] 실BGM 기준 whisper 자막 인식 재확인 (현재는 dev BGM 기준으로만 확인) — 실BGM 이 아직 없다(A-7 BGM 조달)
- [ ] **`앱`** **2026-10-21 ~ 24 휴대폰 확인: 스냅 만료 예고 수신과 탭(NTF-8) · 만료 뒤 이 기기에만 남은 스냅의 "만료됨"(SNAP-19 ⑤)** —
      2026-10-09 휴대폰(Galaxy S22 Ultra, 공모전 서버)에서 이 기기에서만 지운 Mac mini 스냅이 2026-10-24 에 만료된다. 2026-10-21 · 10-23
      KST 10시에 오는 만료 예고 푸시를 받고, 탭하면 라이브러리가 곧 사라질 스냅을 앨범 저장용으로 골라 둔 채 열리는지 본다(앱이 꺼진 상태에서
      탭한 경우 포함, E-36). 푸시는 그 계정으로 마지막에 앱을 연 기기 하나로 간다(B-2). 10-24 뒤에는 그 스냅이 "만료됨"이 되고 볼 수 없는지
      본다. Android 10 이하 기기가 있으면 앨범 저장의 저장소 권한 질문도 본다(완료 조건 아님).
      **완료 조건**: 예고가 통과하면 NTF-8 괄호의 "스냅 만료 예고"를 지우고, 만료가 통과하면 SNAP-19 의 괄호를 지운다
      (SNAP-17 · 18 은 닫았다)
- [ ] **`앱`** **위치 알림(geofence)의 휴대폰 수신**(NTF-4 `부분`) — 서버 발송 파이프라인과 미등록 토큰의 자동 정리는 실크리덴셜로, 무비 완성
      푸시의 휴대폰 수신(앱이 뒤 · 꺼짐 · 앞)은 2026-10-09 에 확인했다(progress 2026-10-09 "휴대폰 실기기 확인 — 알림 · 정리 · 앨범"). 위치 알림만
      기기 토큰으로 geofence 진입부터 수신까지 한 번에 본 적이 없다(C-4 에서 옮김). 위치 알림을 켠 계정으로 geofence 진입 보고 → 서버 쿨다운 ·
      quiet hours 판정 → 휴대폰 푸시 수신을 한 번 통과하고, 실패하면 Firebase · 서버 로그를 함께 남긴다. 아래 권한 안내와 같은 자리에서 본다.
      **완료 조건**: 통과하면 NTF-4 를 `구현됨` 으로 바꾼다
- [ ] **`앱`** **위치 알림 권한 안내의 휴대폰 확인**(NTF-7 `구현됨(위치 알림의 권한 안내는 실기기 미검증)`) — 위치 권한은 기기에만 있는
      동작이다. 무비 완성 알림의 권한 안내는 2026-10-09 휴대폰에서 확인했다(progress 2026-10-09 "휴대폰 실기기 확인 — 알림 · 정리 · 앨범").
      휴대폰에서: 위치 알림을 켠 계정으로, 위치 "항상 허용"이 없는 기기에서 알림 설정을 열면 "기기 설정에서 위치를 항상 허용해야 받을 수
      있어요"와 `설정에서 권한 켜기` 가 뜬다. **완료 조건**: 통과하면 NTF-7 의 괄호를 지운다
- [ ] **무비 음량의 실물 확인**(E-35) — 선형 이득 + 오버샘플링 리미터 + 다시 재 보정은 합성 신호(워커 이미지)로만 확인했다. 배포 뒤
      테스터 앱에서 말소리가 든 실제 스냅으로 무비를 만들어 결과물의 통합 음량(−14 ±0.5 LUFS)과 트루 피크(−1.5dB 이하)를 재고, 파열음이
      눌린 소리가 귀에 거슬리지 않는지 들어 본다. 2026-10-14 공모전 서버에서 에뮬레이터로 만든 무비(말소리 비슷한 합성 클립 두 개 + BGM)는
      −14.51 LUFS · TP −2.22 dBTP 로 허용의 끝이었다 — 실제 스냅으로는 아직 재지 않았다. **완료 조건**: 두 값이 맞고 들어서 문제가 없다
- [ ] **`앱`** **무비 결과물 만료 예고의 휴대폰 수신**(NTF-10 `구현됨(예고 푸시의 수신 · 탭은 실기기 미검증)`) — 푸시 수신은 기기에만 있는 동작이다. 예고는 결과물이
      27일 지나야 나가 아직 기기에서 본 적이 없다(progress 2026-10-11 "끝내지 않은 무비의 만료를 알린다"). 2026-10-11 에 테스트 계정 B 로 완성한
      무비들(무비 알림 켬)이 2026-11-07 무렵 D-3 을 지난다 — 그 계정으로 마지막에 앱을 연 기기(B-2)에 KST 10시 예고가 오는지, 한 편이면 탭이 그
      무비를 여는지, 여러 편이면 한 알림으로 묶이는지 본다. 감상 화면과 카드가 그 사흘 동안 남은 날을 세는지(MOV-16)도 같은 자리에서 본다 — 앱
      동작이라 에뮬레이터로도 된다. **완료 조건**: 수신 · 탭 · 묶음이 통과하면 NTF-10 의 괄호를 지운다
- [ ] **`앱`** **Instagram 앱 넘기기의 휴대폰 확인**(SNS-8 `구현됨(Instagram 앱으로 넘기기는 실기기 미검증)`) — 연결 · 게시 · 게시 뒤 정리는 에뮬레이터에서
      봤다(앱 동작 — H-15). 남은 것은 다른 앱을 여는 것이다: 에뮬레이터에는 Instagram 앱이 없어 "Instagram 앱에서 올리기"는 웹으로 열리는
      것까지만 봤다(progress 2026-10-12 "Meta 앱을 회사로 옮기고, Instagram 앱으로 넘겨 올리기를 더했다"). Instagram 앱이 깔린 휴대폰에서
      넘기기가 앱의 카메라 화면을 열고 앨범에 방금 저장한 무비가 보이는지 본다. **완료 조건**: 통과하면 SNS-8 의 "실기기 미검증"을 지운다
- [ ] **Meta 삭제 요청의 실제 확인**(E-39) — 해제 · 계정 교체 때 지우기와 계정 ID 없는 연동 거절은 테스트로만 봤다. 배포 뒤 공모전 서버에서
      테스터 계정으로 Instagram 을 연결해 한 편 게시하고, 앱에서 연결 해제 → 그 게시 이력의 게시물 ID 가 비었는지, 이어 Instagram 설정에서 데이터
      삭제를 요청해 200 과 확인 코드가 오는지 본다. **완료 조건**: 둘 다 맞다

---

## G. 정리 필요 (일회성)

- [ ] **공모전 종료 때 시험 데이터 정리** — 공모전 서버에 확인용으로 남긴 것: 테스트 계정 B 의 무비(`무비 10-14 (2)` · `(3)` 과 에뮬레이터
      앨범 사본 — progress 2026-10-15 "에뮬레이터로 앱 한 바퀴", `무비 10-11 (4)` · `(5)` — progress 2026-10-11 "실패 카드의 거절 안내와 실패 알림"),
      검수 계정의 확인용 초안 무비(`무비 10-13 …` — progress 2026-10-13 "에이전트 운영 확인" · "초안 과금 에뮬레이터 확인" · "취향이 권하는 스타일").
      지금 지우지 않는 이유: 10-11 무비는 F 의 무비 결과물 만료 예고 확인(2026-11-07 무렵)에 쓰이고, 검수 계정의 완성 무비(`무비 10-12`)는 C-8 이
      끝날 때까지 둔다. **완료 조건**: 공모전이 끝날 때 위 무비를 지운다(검수 계정의 완성 무비는 C-8 이 닫힌 뒤)

---

## H. 작은 판단 — 문서 · 규칙 · 문구

문서 감사 · 리뷰에서 나온, **규칙이나 문서를 어느 쪽으로 맞출지만 정하면 되는** 작은 판단이다 — 고르는 쪽에 따라 문서만 고치거나 작은
코드 변경이 따른다. 각 항목에 배경 · 선택지 · 권장(있으면) · 완료 조건을 적었다. 정하면 해당 문서(와 필요한 경우 코드 · 테스트)를 고치고 닫는다.

---

## 닫은 항목

닫힌 항목의 한 줄 색인이다 — 같은 일을 다시 올리지 않기 위해 둔다. 구현·검증 내역은
[progress.md](./progress.md)(지난달은 `archive/progress-YYYY-MM.md`)의 같은 날짜 항목이 원천이다.

- **A-1** 무비 서버 엔티티 · CRUD · export — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티"
- **A-1** 스냅 15일 · 결과물 30일 만료 정리 배치(툼스톤, 만료 → 실삭제 2단계) — 2026-09-09 → progress 2026-09-09 "보관 기간 만료 정리 배치"
- **A-1** 무비 완성 알림의 FCM 전환 — 2026-09-11 → progress 2026-09-11 "무비 완성 알림의 서버 전환"
- **A-1** e2e 를 앱과 같은 무비 경로로 — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"(실제 아이폰 영상은 2026-09-15 "스트레스 실검증")
- **A-1** 앱의 무비 서버 전환 · 끝내기 버튼 · 로컬 완료 알림 제거 · 모바일 기능 문서 — 2026-09-12 → progress 2026-09-12 "무비 서버 전환 · 끝내기 · 완료 알림 정리"
- **A-1** 푸시 탭 라우팅 — 2026-09-12 → progress 2026-09-12 "알림 탭 라우팅"(실기기 확인은 A-1 "서버 전환 실기기 검증" ③)
- **A-1** 스냅 목록의 만료 표시 — 2026-09-27 → progress 2026-09-27 "스냅이 기기와 재설치를 넘어 보인다"
- **A-1** `POST /edit-jobs` 폐기 — 2026-10-11, route · 계약 · Swagger 를 지우고 테스트를 무비 경로로 옮겼다(결정 ⑤ "한 버전 공존 후 폐기") → progress 2026-10-11 "`POST /edit-jobs` 를 없앴다"
- **A-1** 결과물 만료 안내 — 2026-10-11, 완성 알림 본문에 30일 · 감상 화면에 날짜(마지막 3일은 남은 날수) · 무비 알림을 켠 사용자에게 D-3 예고(NTF-10) → progress 2026-10-11 "끝내지 않은 무비의 만료를 알린다"
- **A-1** 서버 전환 실기기 검증(① 업로드 뒤 초안 · ② 편집 PATCH · ③ 완성 푸시 · ④ 끝내기 · ⑤ 재설치 · ⑥ 계정 전환) — 2026-10-11, 마지막 ⑥ 을 에뮬레이터에서 화면 · 푸시(E-28 수정 빌드) 모두 확인하고 정리 뒤 다시 만들기의 크레딧도 봤다. MOV-2 · 17~19 · NTF-5 · 6 의 표기를 지우고(MOV-18 의 SNS 자동 판정은 같은 날 인스타 게시에서 봤다) NTF-8 은 남은 부분만 남겼다 → progress 2026-10-11 "서버 전환 실기기 검증을 마쳤다"
- **A-19** 피사체 상자 — 스냅 분석에 프레임별 피사체 상자(프롬프트 v2), 글 · 이모지를 피사체 옆에 — 2026-10-29 → progress 2026-10-29 "분석의 피사체 상자로 꾸밈을 피사체 옆에"
- **A-2** 광고 보상 정책 값(20크레딧 · 일일 5회 · 쿨다운 300초 · 세션 TTL 300초) — 2026-08-18 → progress 2026-08-18 "광고 보상 세션 수명·포기" · "광고 보상 정책 값 확정 — 20크레딧 · 일일 5회" · "광고 보상 쿨다운 300초 확정" · [ad-reward-credits.md](./decisions/ad-reward-credits.md) §7
- **A-2** 스냅 만료 예고 리드타임(D-3 · D-1, KST 10시) — 2026-09-09 → [expiry-notice-schedule.md](./decisions/expiry-notice-schedule.md) · progress 2026-09-09 "SNS 게시 자동 끝내기 · 만료 예고 알림"
- **A-3** 분석 고지의 보유 기간 · 학습 이용 확인과 국외 이전 표의 수탁자 — 2026-08-19 → progress 2026-08-19 "약관·개인정보처리방침의 분석 고지 초안"
- **A-4** 삭제 유예 기간 30일(계정 삭제에 먼저 적용) — 2026-08-12 → [account-deletion.md](./decisions/account-deletion.md) · progress 2026-08-12 "계정 삭제 기능"
- **A-4** `capturedAt` 전달 · 저장(SNAP-10) — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티"
- **A-4** 2단계 ingest 렌디션 — 2026-09-09 → progress 2026-09-09 "배포 렌디션 워커"
- **A-4** 촬영 스냅 해상도 하드코딩 해소(앱) — 2026-09-12 → progress 2026-09-12 "촬영 스냅 해상도 하드코딩 해소"(실기기 확인은 A-4 에 남음)
- **A-4** reconcile 착수 전 제품 결정 셋 — 2026-09-27 → [snap-sync-across-devices.md](./decisions/snap-sync-across-devices.md)
- **A-4** 3단계 reconcile(구현 · Android 실기기 검증) — 2026-09-27 → progress 2026-09-27 "스냅이 기기와 재설치를 넘어 보인다" · "스냅 reconcile 실기기 검증"
- **A-4** 무비 컷의 `unavailable` 에 사유가 없다(SNAP-12) — 2026-10-07 → progress 2026-10-07 "무비 컷이 사라진 사유를 싣는다"
- **A-4** 스냅 휴지통(삭제 유예) — 2026-10-07 → [decisions/snap-trash.md](./decisions/snap-trash.md) · progress 2026-10-07 "지운 스냅을 보관 기간이 끝날 때까지 되살린다"(실기기 확인은 A-4 에 남음)
- **A-4** 자동 앨범 저장의 휴대폰 확인(SNAP-18 `구현됨`) — 2026-10-09 → progress 2026-10-09 "휴대폰 실기기 확인 — 알림 · 정리 · 앨범"
- **A-4** 다른 기기의 스냅 앨범 저장(SNAP-17 `구현됨`) · 최근 삭제의 삭제 · 되살리기 · 빠진 컷(SNAP-20) — 2026-10-09 → progress 2026-10-09 "휴대폰과 에뮬레이터로 — 다른 기기 · 삭제 · 업로드 전 무비"
- **A-4** 만료 전에 앨범 저장을 권하기 — 2026-10-12, 선택 모드의 여러 개 저장과 예고 알림 연결(곧 사라질 스냅을 골라 둔 채 연다, 문구에 앨범 저장)로 했다. 모아 보기 화면은 두지 않았다 → progress 2026-10-12 "만료 전에 앨범 저장을 권한다"
- **A-5** FE-BE 연동 범위 · 일정 확정 — 2026-09-02, 필요 없어 닫음(같은 개발자가 FE·BE 를 함께 맡게 됐다)
- **A-7** CI 의 ffmpeg 설치(골든 프레임 · ffprobe 계약 테스트) — 2026-09-15 → progress 2026-09-15 "산출물 계약 테스트와 CI 의 ffmpeg"
- **A-7** 스티커 팩 매니페스트 스키마와 editSpec v3·에셋 매니페스트 초안의 남은 개정 — 2026-10-03, 2026-08-20 에 개정된 초안이 미병합 브랜치에서 main 에 들어왔다 → [plans/edit-spec-v3.md](./plans/edit-spec-v3.md) · [plans/asset-pack-manifest.md](./plans/asset-pack-manifest.md) §5 · §9(들일 때 `prefer` 가 남지 않고(`ref`), anchor 어휘가 매니페스트 §9 로 떨어져 `defaultAnchor` 가 없으며, editSpec §10.3 이 `resolved.xy` 를 범위 무제약으로 적는 것을 확인했다. 결정 V3-A1~V3-D8 은 초안에서 대응하는 서술을 찾는 정도로 대조했다)
- **A-7** 편집 워커 동시성 — 2026-10-11, 렌더가 2 vCPU 를 다 써서 동시성 1 을 유지한다 → [decisions/aws-contest-server.md](./decisions/aws-contest-server.md) 2026-10-11 덧붙임
- **A-7** 편집 경로의 기본 처리(회전 검증 · 컷별 음량 · 마이크로 페이드 · `loudnorm` · `+faststart` · CRF · 클립 간 색 맞춤) — 2026-10-12 → progress 2026-10-12 "편집 결과물의 기본 처리" · "컷 사이 색 맞춤" (BGM 덕킹은 A-7 BGM 조달과 함께)
- **A-9** 닉네임 수정 화면 · 아바타 — 2026-10-12, 나 탭의 이름을 눌러 닉네임을 고친다(`features/edit-nickname`). 아바타는 보여 줄 곳 · 업로드 경로가 없어 만들지 않는다(관심사는 A-9 에 남음) → progress 2026-10-12 "닉네임을 고칠 수 있다"
- **A-9** 관심사(서버 — 주제 18개 · `GET /interest-topics` · `interests` 검증 · 취향의 관심사 행, 앱 — 나 탭 행 · 관심사 화면, 에뮬레이터 확인) — 2026-10-13 → progress 2026-10-13 "관심사" · "관심사 에뮬레이터 확인"
- **A-10** 진행 중인 생성을 사용자당 하나로(MOV-11 — 유지하기로 하고 서버 · 앱에 구현, 실기기 확인은 F) — 2026-10-09 → progress 2026-10-09 "무비는 한 번에 하나씩 만든다"
- **A-10** 앱 안 피드 · 재생성 버전 · 무비 길이 — 2026-10-12, 피드 없음 · 버전 없음(다시 만들기 전에 한 번 묻는다) · 최대 50초 → [product-concept.md](./decisions/product-concept.md) §7 · progress 2026-10-12 "제품 결정 셋 — 피드 · 버전 · 길이"
- **A-10** 출력 비율 — 2026-10-12, 세로 9:16 하나로 두고 MOV-8 을 `구현됨` 으로 닫았다(필요해지면 1:1 부터) → [product-concept.md](./decisions/product-concept.md) §7 · progress 2026-10-12 "제품 결정 셋 — 피드 · 버전 · 길이"
- **A-11** 경계별 전환(MOV-22) — 전환 어휘 · 무효화 액션 `cut-trim`·`transition-edit` · 무비 계약의 경계별 전환과 주인 · editSpec v3 렌더(`edit-v3` 큐) · AI 의 전환 규칙 · 편집 화면의 선택과 미리보기 · 실기기 확인 — 2026-10-01 → progress 2026-10-01 "Android 실기기에서 영상 두 개를 겹친 `crossfade`" ~ "경계별 전환 실기기 확인"
- **A-11** 컷 역할 사전(`cut-role-vocabulary.json`, TS·워커 로더와 정합성 테스트) — 2026-10-01 → progress 2026-10-01 "컷 역할 사전"
- **A-11** 무비 계약: 컷 구간의 주인(`trimOwner`) — 2026-10-01 → progress 2026-10-01 "무비 계약: 컷 구간의 주인"
- **A-11** 로컬 신호 reader(밝기 · 흐림 · 프레임 해시 · 움직임 · VAD 발화 → `video_signals`) — 2026-10-01 → progress 2026-10-01 "스냅 로컬 신호"
- **A-11** 초안 제안 API 와 선택 단계(`POST /movie-drafts`, edit-director) — 2026-10-01 → progress 2026-10-01 "편집 초안 제안 API"
- **A-11** 앱의 진입 경로와 흐름(스튜디오 `스냅 골라 자동 편집`, 에뮬레이터 확인) — 2026-10-01 → progress 2026-10-01 "앱: 자동 편집" · "자동 편집 에뮬레이터 확인"
- **A-11** 실기기 확인(초안 → 구간·전환 수정 → 생성한 결과물이 편집 화면과 같다) — 2026-10-01 → progress 2026-10-01 "자동 편집 실기기 확인"
- **A-11** 초안의 vision 분석 — 2026-10-13, 에이전트의 `analyze_snaps` 로 붙었다 → progress 2026-10-13 "AI 편집 에이전트"
- **A-12** 에이전트(6단계 — 툴 · 검토 · 재시도 · 계획 저장 · 폴백 · 시간 상한)와 운영 첫 확인(실제 모델로 `agent` 모드) — 2026-10-13 → progress 2026-10-13 "AI 편집 에이전트" · "에이전트 운영 확인"
- **A-12** 초안 과금(7단계 — 무료 3회 · 20크레딧 예약과 환불 · `GET /movie-drafts/allowance` · 앱 비용 표시 · 잔액 부족 처리) — 2026-10-13 → progress 2026-10-13 "초안 과금". 앱 확인은 A-12 에 남김
- **A-12** 에이전트가 전환을 고른다(`pick_transitions` 로 분위기를 정하고 초안으로 만든 무비의 `movies.mood` 로 AI 경계의 비중을 바꾼다 — 계약 · 앱 변경 없음) — 2026-10-13 → progress 2026-10-13 "에이전트가 전환을 고른다"
- **A-13** 스타일 기본값에 취향 반영(PRF-3 — 프로필 `recommendedStyle`, 앱은 새 무비의 스타일을 정할 근거가 없을 때 쓴다) — 2026-10-13 → progress 2026-10-13 "취향이 권하는 스타일"
- **A-13** 개념 사전 확정(1단계 — 현행 고정 테스트 · `content-vocabulary.json` 과 `moods` · 개념 매칭 · 힌트 마이그레이션 · 재사용 키의 사전 버전) — 2026-10-13 → progress 2026-10-13 "개념 사전 확정"
- **A-13** 관계 `typicallyAt` · `evokes` · `suits` 와 정합성 테스트(2단계) — 2026-10-13 → progress 2026-10-13 "개념 사이의 관계"
- **A-13** 취향 프로필(4단계 — `user_tastes` · 신호 수집 · 갱신 · 상위 전파 · 시간 감쇠 · 동의 철회 · 계정 삭제 파기, 개인정보처리방침 고지) — 2026-10-13 → progress 2026-10-13 "취향 프로필". 관심사 해제의 파기는 A-9
- **A-13** 취향 반영(5단계 — 템플릿 순서 · 추천 가중 · AI 전환, 재사용 키의 취향 규칙 버전) — 2026-10-13 → progress 2026-10-13 "취향 반영". 스타일 기본값은 앱 변경이 필요해 남김
- **A-13** 발표용 내보내기(8단계 — OWL/Turtle · 그래프 페이지, `npm run ontology:export`) — 2026-10-13 → progress 2026-10-13 "발표용 온톨로지 내보내기"
- **B-1** 사내 서버 가동 — 2026-10-09 접음(AWS 공모전 서버 B-8 로 대체) → progress 2026-10-09 "사내 서버를 접고 배포 대상을 AWS 하나로"
- **B-3** `AuthUser.email` 추가 — 2026-10-11, 추가하지 않고 닫았다. 결제 고객 생성(Checkout)이 IAP 전환으로 사라져 이메일이 필요한 기능이 없다. 필요한 기능이 생기면 공동 소유 합의(`plugins/auth.ts`)로 다시 연다 → progress 2026-10-11 "개발 합의 항목 정리 — B-2 · B-3 · B-4"
- **B-4** `notification_logs` 보관 정책 — 2026-10-11, 위치 알림 이력만 7일 뒤 만료 정리 배치(04:00, ④)가 지운다(`GEOFENCE_LOG_RETENTION_DAYS`). 만료 예고 이력은 같은 예고를 두 번 보내지 않는 근거라 지우지 않는다 → progress 2026-10-11 "개발 합의 항목 정리 — B-2 · B-3 · B-4"
- **B-5** API 계약 스키마 우선 1~5단계 — 2026-09-05 → progress 2026-09-05 "API 계약을 스키마 우선으로 — Zod 계약 패키지" · [api-contract-schema-first.md](./decisions/api-contract-schema-first.md)(남은 다듬기는 B-5)
- **B-6** 알림 설정의 서버 반영(서버) — 2026-09-15 → progress 2026-09-15 "알림 설정이 서버에 닿는다"
- **B-6** 앱의 알림 설정을 서버에 쓰기(서버가 원천 · 위치 · 무비 기본 꺼짐) — 2026-10-07 → progress 2026-10-07 "알림 설정은 계정에 있다"
- **B-7** 트랙 소유 표에 새 모듈 배정 — 2026-10-09, 만든 사람 · 고쳐 온 사람의 커밋 이력으로 트랙과 담당을 정해 [team.md](./team.md) §1 표에 모두 넣었다 → progress 2026-10-09 "문서 전수 정리 · constitution 확정 · 팀 분담"
- **B-8** `OPENAI_API_KEY` 를 로컬 개발 키와 분리 — 2026-10-09, 서버와 로컬이 서로 다른 키인 것을 확인하고 규칙으로 적었다([deployment-aws.md](./deployment-aws.md) §2) → progress 2026-10-09 "서버와 로컬의 OpenAI 키를 나눠 둔다"
- **B-8** 테스터 앱 빌드 — 2026-10-09, Galaxy S22 Ultra 에서 도메인으로 업로드 → 편집 → 재생 → progress 2026-10-09 "AWS 서버로 휴대폰에서 업로드 → 편집 → 재생"
- **B-8** 테스터 크레딧 — 2026-10-09, 공모전 서버 가입 보너스 500(CRD-8) · 중복 지급 경합 수정 · 시크릿 반영 → progress 2026-10-09 "공모전 서버의 가입 보너스(CRD-8) · 중복 지급 경합 수정" · "가입 보너스를 서버에서 켰다"
- **B-8** DB 복구 리허설과 절차 · 용량 실측 — 2026-10-11, 별도 DB 에 최근 덤프를 부어 운영과 대조하고 실제 되돌리기 순서를 [deployment-aws.md](./deployment-aws.md) §5 에, 유휴 · 렌더 중 CPU · 메모리와 하루 렌더 한도(약 350편)를 §6 에 적었다 → progress 2026-10-11 "DB 복구 리허설 · 용량 실측"
- **B-8** 수명 · 백업의 사각 — 2026-10-11, 운영은 2026년 11월까지, S3 영상 백업은 두지 않기로 했다 → [decisions/aws-contest-server.md](./decisions/aws-contest-server.md) 2026-10-11 덧붙임 · progress 2026-10-11 "공모전 서버의 기간 · 백업 · 편집 동시성"
- **B-8** SNS 연동 켜기(인스타그램) — 2026-10-11, Meta 앱 · 테스터 계정 · 시크릿을 갖추고 앱에 연결 · 게시를 만들어 에뮬레이터에서 실제 릴스 게시까지 봤다. 틱톡은 B-8 "TikTok 게시"에 남았다 → progress 2026-10-11 "앱에서 Instagram 에 연결하고 무비를 게시한다"
- **B-8** AWS 공모전 서버 가동 — 2026-10-16 닫음(완료 조건 — main 머지의 자동 배포 · 배치 · 테스터 폰의 업로드 → 편집 → 재생 — 은 2026-10-11 DB 복구 리허설까지 채워졌다). iOS 테스터 앱은 A-4 "iOS 출시 전", TikTok 게시는 C-3 으로 옮김 → progress 2026-10-08 "AWS 공모전 서버 첫 배포" · 2026-10-09 "AWS 서버로 휴대폰에서 업로드 → 편집 → 재생" · 2026-10-11 "DB 복구 리허설 · 용량 실측"
- **C-4** FCM 실기기 수신 — 2026-10-16, 무비 완성 푸시를 휴대폰에서 앱이 뒤 · 꺼짐 · 앞일 때 모두 받았다. 남은 위치 알림(geofence)의 수신은 외부 크리덴셜이 아니라 F 로 옮김 → progress 2026-10-09 "휴대폰 실기기 확인 — 알림 · 정리 · 앨범"
- **C-5** Meta 앱 검수용 URL 2개(승인 취소 콜백 · 데이터 삭제 요청) — 2026-10-11, 계정은 남기고 Instagram 에서 받은 데이터만 지운다(SNS-9). 콘솔에 등록하고 Instagram 앱에서 Snaply 를 제거해 실제 요청으로 연동이 지워지는 것까지 봤다 → progress 2026-10-11 "Meta 의 연결 해제 · 데이터 삭제 요청"
- **C-7** 회사 OpenAI API 키 발급 — 2026-09-29 → progress 2026-09-29 "실제 모델로 스냅 분석 · 템플릿 추천 첫 실행"(남은 확인 중 사용 한도 · rate limit 은 A-3, 운영 키 분리는 B-8 로 옮김)
- **D-2** 법률 문서 문의처 — 2026-10-11, `LEGAL_CONTACT_EMAIL` 을 `snaply@dweax.com` 으로(쉼표로 여러 주소를 받게 했다) → progress 2026-10-11 "법률 문서의 문의처"
- **D-2** 법률 문서의 광고 · 보관 기간 — 2026-10-11, 처리방침에 보상형 광고(수집 항목 · 위탁 · 국외 이전)와 스냅 15일 · 결과물 30일 · 최근 삭제 · 앨범 사본을, 약관에 광고 보상과 영상 보관을 넣었다(보관 일수는 정책 상수에서 읽는다) → progress 2026-10-11 "법률 문서에 광고와 보관 기간"
- **D-2** AWS 리전 확정 · 데이터베이스 위탁 서술 — 2026-10-11, 리전 `ap-northeast-2`(서울) · CloudFront 없음을 확인해 "영상은 국외 이전 아님"을 확정하고, 처리방침의 Supabase 를 인증만으로 좁히고 데이터베이스를 AWS 행에 합쳤다 → progress 2026-10-11 "처리방침의 데이터베이스는 서울"
- **D-4** 개발 버킷 익명 읽기 정책(운영의 검증 파일 경로 익명 읽기) — 2026-09-28 D-3 에 합침
- **D-5** 만료된 광고 보상 세션 정리 배치 — 2026-10-16 C-6 에 합침(`AD_REWARD_ENABLED=false` 라 행이 쌓이지 않아 켤 때 볼 일이다)
- **E-1** 만료 시각을 모르는 인스타 토큰의 코드 대응 — 2026-09-15 → progress 2026-09-15 "만료 시각을 모르는 SNS 연동"(재연동은 G)
- **E-2** `S3_PUBLIC_ENDPOINT` 기동 경고 — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"
- **E-3** S3 삭제 실패분 정리 배치 — 2026-09-09 → progress 2026-09-09 "보관 기간 만료 정리 배치" ③
- **E-4** 빌드한 이미지의 스모크 검사(빌드 → 스모크 → 푸시) — 2026-09-11 → progress 2026-09-11 "이미지 스모크 검사 · e2e 무비 경로 전환"
- **E-6** 낡은 Prisma 클라이언트 프리체크 — 2026-09-09 → progress 2026-09-09 "촬영 시각 저장 · 무비 서버 엔티티" ②
- **E-7** MinIO 커뮤니티 이미지의 수명 — 2026-10-10, 대체 서버로 바꾸지 않고 **소스 빌드 미러를 유지**한다(운영은 S3 라 MinIO 는 로컬 · CI 만 쓴다). 미러 빌드가 깨지거나 운영에서 MinIO 를 다시 쓰게 되면 다시 연다. GHCR 패키지는 비공개로 둔다 → progress 2026-10-10 "MinIO 는 소스 빌드 미러를 유지한다" · "MinIO 미러 패키지는 비공개로 둔다"
- **E-8** 영상 삭제·정리가 자기 소유 객체만 지운다 — 2026-09-27 → progress 2026-09-27 "영상 삭제가 자기가 소유한 객체만 지운다"
- **E-9** 무비 생성의 402 가 부족분 숫자를 싣지 못한다 — 2026-10-03 → progress 2026-10-03 "무비 생성의 402 가 부족분 숫자를 싣는다"
- **E-10** 재생 화면의 길이 표시가 라이트 테마에서 거의 보이지 않는다 — 2026-10-07 → progress 2026-10-07 "재생 화면은 테마와 상관없이 어둡다"
- **E-11** `scripts/analysis-run.mjs` 가 떠 있는 분석 워커를 못 본다 — 2026-10-07 → progress 2026-10-07 "Python 워커가 Node 에서 보인다"
- **E-12** 배포본(렌디션)이 촬영 시각을 잃는다 — 2026-10-07 → progress 2026-10-07 "배포본이 촬영 시각을 싣는다"
- **E-13** 신호를 한 번 못 계산한 스냅은 다시 계산되지 않는다 — 2026-10-03 → progress 2026-10-03 "끝난 신호 작업을 다시 적재한다"
- **E-14** 서버에서 사라진 스냅 하나가 편집 초안 전체를 막는다 — 2026-10-03 → progress 2026-10-03 "서버가 쓸 수 없는 스냅을 따로 알린다"
- **E-15** 앱이 편집 초안의 스냅 상한(`max`)을 읽지 않는다 — 2026-10-03 → progress 2026-10-03 "편집 초안의 스냅 상한을 서버에서 배운다"
- **E-16** 대표 프레임 하나를 못 뽑으면 중복 비교의 위치가 어긋난다 — 2026-10-02 → progress 2026-10-02 "대표 프레임 해시의 자리"
- **E-17** 결과물이 원본의 위치 태그를 싣는다(무비 결과물에서 지움 — 배포본은 A-4 위치 항목으로) — 2026-10-07 → progress 2026-10-07 "무비 결과물이 찍은 곳을 싣고 나가지 않는다"
- **E-18** 지운 스냅의 분석 결과가 남는다(ANA-3, 개인정보처리방침과 다름) — 2026-10-09 → progress 2026-10-09 "지운 스냅의 분석 결과를 지운다"
- **E-19** RLS 정책이 없는 테이블 다섯 개(`user_consents` · `video_signals` · `movie_recommendations` · `movie_recommendation_items` · `movie_drafts`) — 2026-10-10, (a) 다른 테이블과 같은 모양의 조회 정책을 더하고 새 테이블 규칙을 [team.md](./team.md) §3 에 넣었다 → progress 2026-10-10 "RLS 정책이 없던 테이블 다섯 개"
- **E-20** 사내 서버 오버레이만 바꾼 머지는 배포되지 않는다 — 2026-10-09 사내 서버 경로를 지우면서(`docker-compose.prod.yml` 삭제) 사라졌다 → progress 2026-10-09 "사내 서버를 접고 배포 대상을 AWS 하나로"(낡은 머리 주석은 G)
- **E-21** SNS 업로드 준비 경고가 실제 업로드 주소를 보지 않는다(서명 호스트로 판정 · 터널 스크립트가 `S3_PUBLIC_ENDPOINT` 를 출력, 실키 재검증은 F) — 2026-10-10 → progress 2026-10-10 "SNS 업로드 준비 경고가 서명 호스트를 본다"
- **E-22** `API_HOST_PORT` 가 환경변수 원천에 없다 — 2026-10-09 → progress 2026-10-09 "`API_HOST_PORT` 를 환경변수 원천에 선언한다"
- **E-23** 같은 동작의 권한 버튼 라벨이 둘이다(촬영 화면을 `설정에서 권한 켜기` 로) — 2026-10-09 → progress 2026-10-09 "촬영 화면의 권한 버튼 라벨을 맞춘다"
- **E-24** 보드 · 그리드의 `다시 시도` 가 거절을 말하지 않는다(카드에 거절의 첫 문장을 띄움, 실기기 확인은 F) — 2026-10-09 → progress 2026-10-09 "실패한 무비 카드가 다시 시도의 거절을 말한다"
- **E-25** 알림이 앱의 알림 채널을 쓰지 않는다(채널 하나로 — 서버 푸시 · 로컬 알림 모두 `default`) — 2026-10-09 → [notification-preferences.md](./decisions/notification-preferences.md) · progress 2026-10-09 "모든 알림을 앱의 채널 하나로 보낸다"
- **E-26** 다른 기기에서 만든 무비의 완성 시각이 그 기기가 알게 된 시각이다(작업의 `completedAt` 을 쓴다 — 계약 변경 없음) — 2026-10-09 → progress 2026-10-09 "무비의 완성 시각은 서버가 기록한 작업 종료 시각이다"
- **E-27** 편집 큐의 재시도가 실제로는 재시도하지 않는다(일시적 실패는 큐의 다음 시도에 맡기고 마지막에만 실패 · 환급 확정, 원본 없음 · 시간 초과는 바로 확정) — 2026-10-10 → progress 2026-10-10 "일시적 실패는 워커가 다시 시도한다"
- **E-28** 계정을 바꾼 기기로 이전 계정의 푸시가 간다(앱은 로그아웃할 때 기기 토큰을 폐기 · 서버는 등록한 토큰을 다른 계정에서 지움, 기기 확인은 A-1 ⑥) — 2026-10-11 → progress 2026-10-11 "계정을 바꾼 기기에 이전 계정의 푸시가 간다"
- **E-29** 로그아웃해도 알림창에 이전 계정의 알림이 남는다(로그아웃할 때 이 앱의 알림을 알림창에서 걷는다, 에뮬레이터에서 FCM 이 띄운 완성 알림이 걷히는 것을 봤다) — 2026-10-11 → progress 2026-10-11 "로그아웃하면 알림창의 알림도 걷는다"
- **E-31** 인스타그램 연결 해제 · 데이터 삭제 콜백이 서명을 보기 전에 본문 크기의 제곱만큼 걸린다(본문 16KB 상한 · multipart 를 한 번만 훑음) — 2026-10-13 → progress 2026-10-13 "인스타그램 삭제 콜백이 큰 본문에 멈추지 않는다"
- **E-32** API 테스트가 개인 `.env` 의 OpenAI 키로 편집 에이전트의 실제 모델을 부른다(테스트 설정이 키를 빈 값으로 박음) — 2026-10-13 → progress 2026-10-13 "API 테스트가 개인 OpenAI 키로 실제 모델을 부르지 않는다"
- **E-33** 만들지 못한 무비에도 결과물 만료 예고가 간다(완성된 결과물만 고름) — 2026-10-13 → progress 2026-10-13 "만들지 못한 무비에는 결과물 만료 예고를 보내지 않는다"
- **E-34** 컷 시작의 마이크로 페이드가 효과 없다(리미터의 미리보기 지연 — 컷의 첫 5ms 가 무음이고 소리가 그 뒤에 페이드 없이 시작, `latency=1`) — 2026-10-14 → progress 2026-10-14 "컷 시작의 페이드와 무비 전체 음량을 바로잡는다"
- **E-35** 무비 전체 음량이 말소리에서 loudnorm 동적 모드로 돌아가 −14 LUFS 에 못 미친다(선형 이득 + 4배 오버샘플링 리미터 + 다시 재 보정) — 2026-10-14 → progress 2026-10-14 "컷 시작의 페이드와 무비 전체 음량을 바로잡는다"
- **E-36** 앱이 꺼진 상태에서 만료 예고를 탭하면 곧 사라질 스냅이 골라지지 않는다(마감 시각의 저장소까지 기다리고 빈 답은 확정하지 않음) — 2026-10-14 → progress 2026-10-14 "남은 기간 표시 셋 — 예고로 연 라이브러리 · 무비 카드 · 마지막 날"
- **E-37** 무비 카드의 남은 날이 탭을 띄워 둔 동안 움직이지 않는다(한 시간마다 · 앱으로 돌아올 때 시계를 다시 읽음) — 2026-10-14 → progress 2026-10-14 "남은 기간 표시 셋 — 예고로 연 라이브러리 · 무비 카드 · 마지막 날"
- **E-38** 반나절 남은 것이 "1일 뒤"로 보인다(남은 날을 달력의 날짜로 세어 `오늘` · `내일` · `N일 뒤`, 카드는 `오늘까지`) — 2026-10-14 → progress 2026-10-14 "남은 기간 표시 셋 — 예고로 연 라이브러리 · 무비 카드 · 마지막 날"
- **E-39** Meta 의 연결 해제 · 데이터 삭제 요청이 맞는 값을 지우지 못한다(앱에서 먼저 해제하면 아무것도 못 지우고, 다른 계정으로 바꿔 연결하면 이전 계정 값까지 지우며, 프로필 조회가 실패한 연동은 앱 범위 ID 라 요청과 맞지 않았다 — 해제 · 계정 교체 때 지우고, 계정 ID 를 못 얻으면 연동하지 않음, 옛 값은 데이터 마이그레이션) — 2026-10-14 → progress 2026-10-14 "Instagram 삭제 요청이 정확히 그 계정의 값을 지운다"
- **E-40** 보안 저장소 읽기가 한 번 실패하면 앱을 다시 켤 때까지 로그아웃된 것처럼 보인다(실패한 읽기를 "세션 없음"으로 기억하지 않음) — 2026-10-14 → progress 2026-10-14 "앱의 작은 결함 넷 — 세션 읽기 · 앨범 저장 문구 · 오프라인 넘기기 · ⋯ 시트"
- **E-41** 여러 스냅 앨범 저장이 하나도 못 했을 때 "스냅 0개를 앨범에 저장했어요"라고 한다 — 2026-10-14 → progress 2026-10-14 "앱의 작은 결함 넷 — 세션 읽기 · 앨범 저장 문구 · 오프라인 넘기기 · ⋯ 시트"
- **E-42** 오프라인에서 Instagram 앱으로 넘기기가 완성된 무비에 "아직 완성된 무비가 없어서"라고 한다(공유처럼 `unresolved` 를 가림) — 2026-10-14 → progress 2026-10-14 "앱의 작은 결함 넷 — 세션 읽기 · 앨범 저장 문구 · 오프라인 넘기기 · ⋯ 시트"
- **E-43** ⋯ 시트에서 Instagram 앱으로 넘긴 뒤 돌아오면 ⋯ 메뉴가 열려 있다(넘기기 전용 콜백으로 시트를 닫음) — 2026-10-14 → progress 2026-10-14 "앱의 작은 결함 넷 — 세션 읽기 · 앨범 저장 문구 · 오프라인 넘기기 · ⋯ 시트"
- **E-44** 오프라인으로 앱을 켜면 나 탭의 이름 · 크레딧이 연결이 돌아와도 돌아오지 않는다(expo-network 로 연결 복구를 알아 낡은 조회를 다시 부르고, 앱 복귀 때는 실패한 조회와 크레딧 잔액을 다시 부름) — 2026-10-15 → progress 2026-10-15 "오프라인으로 켠 뒤 연결이 돌아오면 다시 읽는다"
- **E-45** 만료 예고의 선점이 엉성하다(해제 실패를 삼키고, 동시에 돈 배치가 둘 다 보냄 — 이번 실행이 넣은 행만 보내고 해제 실패를 보고) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-46** 밀린 예고가 남은 날을 실제보다 길게 말한다(실제 마감일까지 달력의 날짜로 세고, 두 창이 함께 밀리면 가까운 쪽만) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-47** Meta 서명 요청을 다시 보내도 받아들인다(발급 24시간이 지나면 거절) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-48** 음량 · 색 측정이 렌더와 다른 트랙을 볼 수 있고 실패가 로그에 남지 않는다 — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-49** HDR 원본의 색 측정과 색 맞춤이 원본 해상도로 돈다(측정 3초 컷 1.15초 → 0.26초) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-50** 색 맞춤이 밝은 부분을 자르고 밤 컷을 낮처럼 밝힌다(밝은 쪽 기준 제한 · 밤 컷 밝기 유지 · 아주 어두운 컷은 기준에서 뺌) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-51** 마지막 손질이나 BGM 합성이 실패하면 무비 전체가 실패한다(그것 없이 완성) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-52** 워커 음량 측정이 `loudnorm` 이라 비싸다(`ebur128` 로 — 컷 10개 무비의 측정 1.6~3.0초 → 0.5~0.9초, 값 차이 0.15 LU 안) — 2026-10-16 → progress 2026-10-16 "음량을 ebur128 로 잰다"
- **E-53** 공유 · Instagram 넘기기가 겹쳐 돌 수 있다 — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-54** 앨범 저장 중에 선택을 바꾸거나 나갈 수 있다 — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-55** 일반 선택의 앨범 저장이 무비 한도 10개에 걸린다(선택은 제한 없이, 무비 버튼만 10개) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-56** 닉네임 시트가 완료 키로 두 번 저장할 수 있다 — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **E-57** `npm run media:e2e` 의 이메일 로그인이 `SUPABASE_ANON_KEY` 만 읽는다(`SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY` 로 — 가짜 Supabase 로 네 경우 확인, 로컬 실행 로그인 · 업로드 통과) — 2026-10-18 → progress 2026-10-18 "media:e2e 가 publishable 키로 로그인한다"
- **E-68** 배포가 CI 를 기다리지 않는다 — 2026-10-24, Deploy 맨 앞에 같은 커밋의 CI 성공을 기다리는 `wait-for-ci` 잡(`deploy-aws` 가 기다린다) → progress 2026-10-24 "배포가 CI 를 기다린다"
- **F** HDR · 장시간 · 10클립 스트레스 실검증 — 2026-09-15 → progress 2026-09-15 "스트레스 실검증과 HDR 색 태그 결함"(돌비비전 실물은 F 에 남음)
- **F** 한 번에 하나씩 만들기의 실기기 확인(MOV-11 `구현됨`) · 다른 기기에서 지운 스냅의 컷 표시(SNAP-12) — 2026-10-09 → progress 2026-10-09 "휴대폰과 에뮬레이터로 — 다른 기기 · 삭제 · 업로드 전 무비"
- **F** 워커 쪽 취소 중단 · 실패 환급 — 2026-10-09, 로컬 실워커로 취소는 다음 진행률 갱신에서 멈추고 환급 1회, 실패는 `failed` · 환급 1회 → progress 2026-10-09 "워커 쪽 취소 중단 · 실패 환급 실검증"(재시도 문제는 E-27)
- **F** 실패 카드의 거절 안내 · 무비 실패 알림의 탭(MOV-12 · NTF-8) — 2026-10-11, 에뮬레이터 · AWS 서버에서 워커를 멈춘 사이 스냅을 지워 `SOURCE_UNAVAILABLE` 실패를 만들고 확인 → progress 2026-10-11 "실패 카드의 거절 안내와 실패 알림"
- **F** 남은 기간 표시의 휴대폰 확인(SNAP-13 `구현됨`) — 2026-10-16, 앱 동작이라 에뮬레이터 확인으로 지운다(H-15) → progress 2026-10-16 "문서 정리 3차 — 감사와 정리"
- **G** Firebase 서비스 계정 키 로테이션(루트 키 파일 없음 확인 포함) — 2026-08-11 → progress 2026-08-11 "Firebase 서비스 계정 키 로테이션"
- **G** 틱톡 Sandbox `client_key` 이력 노출 — 2026-08-11 제거하지 않기로 판정 → [sns-setup.md](./sns-setup.md) §3 "Sandbox client_key 의 이력 노출"
- **G** 낡은 코드 주석 · 설명(배포 잡 머리말 · 분석 동의 철회 설명 · `AdReward.status` · Redis 머리말 · `media-cleanup.mjs` · 만료 예고 시각 · 앱의 딥링크 처리 · `.prettierignore`) — 2026-10-09 → progress 2026-10-09 "낡은 코드 주석 · 설명을 고친다"
- **G** 인스타 연동 재연동(`token_expires_at` 이 `null` 인 옛 연동) — 2026-10-11, 그 연동이 있던 사내 서버는 접었고(B-1) 로컬 개발 DB 에도 없다. 공모전 서버의 연동은 새로 맺어 60일 만료 시각이 있다 → progress 2026-10-14 "main 리뷰의 문서 정리"
- **G** 자동 편집 실기기 확인에 쓴 시험 데이터 — 2026-10-12, 로컬 개발 DB 에 10월 1일 무비 · 크레딧 기록이 없다(그 뒤 DB 가 다시 만들어졌다). 지울 것이 없어 닫았다 → progress 2026-10-12 "작은 것 넷 — 스냅 보관 기한 · 무비 카드 남은 날 · lint 경고 · 시험 데이터"
- **G** 스냅 만료의 "3일"이 세 곳에 따로 있다(스냅 엔티티의 `SnapExpiryCountdownDays` 하나로) — 2026-10-15 → progress 2026-10-15 "main 리뷰에서 남은 결함 열하나"
- **G** 인스타 테스트 릴스 정리 — 2026-10-11 게시 확인 때 올린 릴스까지 오너가 앱에서 지웠다(틱톡 받은함 초안은 C-2 완료 조건으로 옮김) → progress 2026-10-11 "앱에서 Instagram 에 연결하고 무비를 게시한다"
- **H-1** UX 문구 규칙의 범위(금지어는 버튼 · 질문 · 컨트롤 라벨에만, `카메라 닫기`, 템플릿 힌트의 `장면` 허용) — 2026-10-10 → progress 2026-10-10 "UX 문구 규칙의 범위를 좁힌다"
- **H-2** 결정이 끝난 결정 문서의 제목(결정을 말하는 제목으로) — 2026-10-10 → progress 2026-10-10 "결정이 끝난 결정 문서의 제목을 바꾼다"
- **H-3** `movie-snap-expiry-exemption.md` 의 형식(잠정 결정 유지 + 결정 기록 표, 인덱스는 결정 완료로) — 2026-10-10 → progress 2026-10-10 "만료 예외 결정 문서에 결정 기록을 채운다"
- **H-4** 테스트의 한국어 문자열 이스케이프 관례(리터럴 · 이스케이프 둘 다 허용) — 2026-10-10 → progress 2026-10-10 "테스트의 한국어는 리터럴도 된다"
- **H-5** 배포 문서 두 개를 합칠지 — 2026-10-09 사내 서버를 접으며 `docs/deployment.md` 가 보관돼 [deployment-aws.md](./deployment-aws.md) 하나가 됐다 → progress 2026-10-09 "사내 서버를 접고 배포 대상을 AWS 하나로"
- **H-6** 모바일 로컬 개발 문서의 환경 프로필(지금 Mac 을 기본으로, 구형 프로필은 표에) — 2026-10-10 → progress 2026-10-10 "모바일 로컬 개발 문서를 지금 Mac 에 맞춘다"
- **H-7** 모바일 런타임 에셋의 위치 규칙(이미지 · 폰트는 루트 `assets`, `@/assets/*`) — 2026-10-10 → progress 2026-10-10 "모바일 에셋은 루트 assets 에 둔다"
- **H-8** `runOnJS` 와 `scheduleOnRN`(`scheduleOnRN` 으로 통일 — Reanimated 4 가 `runOnJS` 를 폐기 예정으로) — 2026-10-10 → progress 2026-10-10 "워크릿에서 JS 로 넘길 때는 scheduleOnRN 을 쓴다"
- **H-9** ONBOARDING 의 "모노레포 통합 이전에 분기한 브랜치" 절(한 줄로) — 2026-10-10 → progress 2026-10-10 "ONBOARDING 의 통합 전 브랜치 절을 걷는다"
- **H-10** 결정 문서의 결정 ID 가 백로그 ID 와 같은 모양이다(`V3-A1` 꼴로) — 2026-10-10 → progress 2026-10-10 "editSpec v3 결정 ID 에 접두를 붙인다"
- **H-11** `env-management.md` 의 "후속 연계" 절(헤더 배너로) — 2026-10-10 → progress 2026-10-10 "env-management 의 후속 연계를 배너로 옮긴다"
- **H-12** 모바일 UX 문서 체계의 두 군데(guardrails 유지, 목표 문장은 philosophy 하나로) — 2026-10-10 → progress 2026-10-10 "UX 목표 문장을 하나로 맞춘다"
- **H-13** 모바일 기능 문서의 상태 라벨 두 개와 앱 맵 순서 — 2026-10-11, 스냅 추출은 `Partial` 유지(에뮬레이터 확인만, 실기기 · iOS 미검증) · 서버 추천(Stage 2)은 `Not implemented`(dormant) · 앱 맵은 `root-layout.tsx` 선언 순서 유지 → progress 2026-10-11 "기능 문서 상태 라벨 정리"
- **H-14** 백로그 A-1 ② 의 통과 판정(통과 유지 — 오너 확인) — 2026-10-10 → progress 2026-10-10 "A-1 ② 의 통과를 유지한다"
- **H-15** "실기기 미검증"을 지우는 기준 — 2026-10-16, (b) 앱 동작은 Android 에뮬레이터 확인으로 지우고 기기에만 있는 것(푸시 수신 · 권한 · 카메라 · 앨범 · 다른 앱 열기)만 휴대폰을 기다린다. iOS 는 A-4 "iOS 출시 전" → progress 2026-10-16 "문서 정리 3차 — 감사와 정리"
- **H-16** 계정 삭제 화면이 SNS 연결 해제를 말하지 않는다 — 2026-10-18, (a) 한 줄 더함(`소셜 연결이 모두 끊겨요` · `되돌려도 다시 연결해야 해요`, ACC-8 — 에뮬레이터 확인은 A-15 빌드) → progress 2026-10-18 "H-16 ~ 18 판단"
- **H-17** 촬영 리마인더 · 하루 빈도의 `준비 중` 행 — 2026-10-18, 나중에 붙일 기능으로 정해 A-16 으로 옮김(자리 행은 그대로) → progress 2026-10-18 "H-16 ~ 18 판단"
- **H-18** 앱이 무비 1편 값 100 을 상수로 안다 — 2026-10-18, (a) 상수로 둔다(CRD-1 을 바꾸면 앱도 함께 낸다 — 크레딧 기능 문서, A-2 · C-1 때 다시 본다) → progress 2026-10-18 "H-16 ~ 18 판단"
- **E-60** 앱이 켜진 채 없는 주소 링크를 열고 돌아갈 때의 Android 크래시 — 2026-10-19, 없는 주소 화면이 자기 내비게이터로 돌아가게 했다(에뮬레이터 세 탭 × 5회) → progress 2026-10-19 "없는 주소 화면에서 돌아갈 때의 크래시"
- **A-18** `앱` 에뮬레이터 확인(20컷 타임라인 · 21번째 안내 · 40개 초안 · 20컷 생성) — 2026-10-20 → progress 2026-10-20 "20컷 무비 · 40개 초안의 에뮬레이터 확인"
- **E-61** 11컷 이상 무비의 생성이 앱에서 끝나지 않았다(`GET /edit-jobs/{id}` 응답의 컷 상한이 10) — 2026-10-20, 계약의 상한을 `MOVIE_CLIP_MAX` 로 → progress 2026-10-20 "20컷 무비 · 40개 초안의 에뮬레이터 확인"
- **E-62** 무비의 `스냅 더 넣기` 에서 `이 무비에 넣기` 를 누르면 Android 앱이 멈췄다 — 2026-10-20, 컷을 넣고 한 프레임 뒤에 무비로 돌아간다(에뮬레이터 16회) → progress 2026-10-20 "스냅 넣기 확인 뒤의 Android 크래시"
- **E-65** 레시피 무비는 다시 만들 때마다 결과가 달라 MOV-14 와 어긋났다 — 2026-10-27, 시드를 무비 + 구성(편집 스펙)으로 — 같은 구성이면 같은 편집(MOV-28 을 고침, 새 변형 고르기는 A-20) → progress 2026-10-27 "레시피 무비를 다시 만들면 같은 편집"
- **E-66** AI 컷 레시피 무비의 `render` 가 기억하는 컷이 결과물 파일의 컷과 달랐다 — 2026-10-27, 레시피가 컷을 고른 렌더는 컷 목록을 '모름'으로 남겨 되돌리기 · 편집 뒤 달라짐 안내를 끈다(파일의 편집은 컷 목록으로 표현할 수 없다 — 같은 스냅 여러 번 · 배속 · 분할). 파일의 구성을 편집 화면에 보이는 일은 A-20 '손본 무비에도 컷 구간 · 순서 · 효과를 레시피로' · 'EDL 저장' → progress 2026-10-27 "레시피 무비를 다시 만들면 같은 편집"
- **E-67** 사용자가 '기본(classic)'을 골라도 워커의 `MOVIE_RECIPE` 가 이겼다 — 2026-10-22, `MOVIE_RECIPE` 를 없앰(스펙에 없으면 classic) → progress 2026-10-22 "워커 기본 레시피를 없애고 액센트 플래그를 classic 무비에"
- **H-19** `TEXT_ACCENTS_ENABLED` 가 classic 무비만 막는다 — 2026-10-22, (a) 플래그는 classic 무비만 켜고 끈다로 MOV-27 · env-spec · `.env.example` 문구를 맞춤 → progress 2026-10-22 "워커 기본 레시피를 없애고 액센트 플래그를 classic 무비에"
- **E-63** 스냅 분석이 목록 항목 7개 이상으로 `SCHEMA_INVALID` 실패했다(샘플 32개 중 2개) — 2026-10-27, 넘치면 거절하지 않고 앞의 6개만 남긴다(프롬프트 · 프롬프트 버전은 그대로) → progress 2026-10-27 "스냅 분석의 넘친 목록은 앞의 6개만"
- **E-64 ①** ffmpeg 실패의 원인이 진행 표시줄에 밀려 오류에 남지 않았다 — 2026-10-27, ffmpeg 를 `-nostats` 로 돌리고 종료 코드 · 신호(메모리 부족의 `SIGKILL`)를 오류 끝에 붙인다(편집 · 렌디션 · 효과음 · 액센트 · 스티커 트랙). 운영 사양 메모리 실측(②)은 E-64 에 남음 → progress 2026-10-27 "ffmpeg 실패의 원인이 오류에 남는다"
- **E-69** API 통합 테스트가 가끔 `Connection is closed` 로 실패해 배포를 막았다 — 2026-10-30, 큐를 공유 Redis 연결의 초기화가 끝난 뒤에 닫게 했고(2026-10-27) 그 뒤 CI 24회가 모두 첫 실행에 통과하고 이 오류를 내지 않았다(원인은 추정, 다시 나면 새 항목) → progress 2026-10-27 "큐를 연결 초기화가 끝난 뒤에 닫는다" · progress 2026-10-30 "API 통합 테스트의 처리되지 않은 Redis 오류가 CI 24회에서 다시 나지 않았다"
