# Instagram 앱으로 넘겨 올리기 — Meta 검수 없이 누구나 Instagram 에 올리는 길

**작성일**: 2026-10-12
**상태**: 결정
**원천**: 앱 안의 Instagram 게시(API) 옆에 "Instagram 앱에서 올리기"를 둔 이유와, Meta 검수 · Tech Provider 를 지금 진행하지 않은 근거.
요구는 [specs/sns-sharing.md](../specs/sns-sharing.md) SNS-8, 앱 동작은 [apps/mobile/docs/features/movie.md](../../apps/mobile/docs/features/movie.md)
**관련 문서**: [backlog.md](../backlog.md) B-8 · C-8 · [sns-setup.md](../sns-setup.md) · [movie-cleanup-after-export.md](./movie-cleanup-after-export.md)(MOV-17)

---

## 배경 — 앱 안 게시는 테스터만 쓸 수 있다

앱의 "Instagram에 게시"는 Instagram API(Instagram 로그인)의 `instagram_business_basic` · `instagram_business_content_publish` 로 서버가 릴스를
올린다(SNS-8). Meta 앱 "Snaply"(ID 1828326745016512)는 개발 모드라, 고급 액세스를 받기 전에는 **앱 역할(관리자 · 개발자 · 테스터)에 등록된
Instagram 계정만** 연결할 수 있다. 게다가 계정은 프로페셔널(크리에이터 · 비즈니스)이어야 한다.

2026-10-12 고급 액세스를 받으려고 확인한 것:

| 확인 | 결과 |
|---|---|
| 앱 소유권 | 개인 계정 소유였던 앱을 회사 비즈니스 포트폴리오 **주식회사 디윅스**(ID 854066407728755, 비즈니스 인증 2026-09-29)로 옮겼다. 앱 ID · 시크릿 · 설정 · 테스터는 그대로다 |
| 권한을 앱 검수에 추가 | "To add a permission or feature to App Review, become a **Tech Provider**" — 비즈니스 인증 · **액세스 인증** · 앱 검수 세 단계이고, Tech Provider 지정은 **되돌릴 수 없다**(이후 추가 심사와 더 엄격한 데이터 접근 요건) |
| 같은 비즈니스의 "가게지기-운영" 앱 | 2026-10-01 에 `instagram_business_basic` · `instagram_business_manage_messages` 가 검수 승인됐지만, 지금은 `instagram_business_basic` 에 **"인증 필요"** 가 붙어 있고 그 화면이 "회원님의 비즈니스가 기술 제공업체임을 인증해주세요(액세스 인증, 검토 5일 이내)"를 요구한다 — 이 요건은 앱이 아니라 **비즈니스 단위**다 |

즉 **Tech Provider(액세스 인증) 없이는 검수도, 테스터가 아닌 사람의 연결도 안 된다.** 이것은 Meta 의 규칙이라 코드로 돌아갈 길이 없다.
Tech Provider 지정은 회사 비즈니스 계정에 영구히 붙고 다른 앱(가게지기)의 데이터 요건에도 영향을 주므로 회사 차원의 결정이 필요해, 지금은
진행하지 않았다(결정 대기 — backlog C-8).

## 결정 — "Instagram 앱에서 올리기"를 함께 둔다

목적이 "참가자가 무비를 Instagram 에 올리는 것"이라면 Meta 의 API 가 아니어도 된다. **무비를 기기 앨범에 저장하고 Instagram 앱을 연다.**
Instagram 의 작성 화면은 갤러리의 가장 최근 항목을 먼저 보이므로, 방금 저장한 무비를 골라 릴스 · 피드 · 스토리로 직접 올린다.

- **자리**: "Instagram에 게시" 시트(감상 화면 버튼 · ⋯ 시트의 단계) 안, 연결 단계와 게시 확인 단계 **모두의 아래**. 연결할 수 없는
  계정(개인 계정, 테스터가 아닌 계정)도 막다른 길이 없고, 연결된 사람도 Instagram 의 편집기를 쓰고 싶으면 고를 수 있다. 감상 화면에 버튼을
  하나 더 늘리지 않는다(공유 · Instagram에 게시 두 개로 충분하다).
- **문구**: "연결하지 않아도 올릴 수 있어요. 무비를 앨범에 저장하고 Instagram 앱을 열어요." 버튼 `Instagram 앱에서 올리기`, 저장 중
  `앨범에 저장하는 중…`. 사진 권한이 없으면 "무비를 앨범에 저장하려면 사진 권한이 필요해요.", 저장 실패는 "…저장하지 못했어요. 다시 시도해 주세요."
  — 둘 다 시트에 남고, Instagram 이 열리면 시트를 닫는다.
- **끝내기(MOV-17)**: 앨범에 저장된 순간 파일은 사용자의 것이 되므로, `공유` 와 같이 "정리하기"를 **권한다**(자동으로 끝내지 않는다 — 앱은
  Instagram 에 실제로 올렸는지 모른다).
- **열기**: `instagram://camera`, 안 되면 `https://www.instagram.com/`(설치돼 있으면 앱 링크로 앱이 열리고, 아니면 웹).

## 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| Tech Provider 를 바로 진행 | 되돌릴 수 없고 회사 비즈니스 전체(가게지기 포함)에 요건이 붙는다. 회사 결정이 먼저다 — 진행하면 앱 안 게시는 그대로 모든 사람에게 열린다 |
| 회사 계정의 다른 앱("snaply", ID 4597392613877362)으로 검수 | 예전에 Instagram 연동 개발에 쓰던 앱으로 보이지만(테스터 `gagejigi`), 같은 비즈니스라 Tech Provider 요건이 똑같고, 앱 ID · 시크릿 · 콘솔 설정 · 재연결을 모두 다시 해야 한다 |
| 참가자 전원을 테스터로 등록만 | 계정마다 초대 · 수락이 필요하고 프로페셔널 계정이어야 하며 등록 인원에 상한이 있다. 원하는 참가자에게는 계속 열어 둔다 |
| 시스템 공유 시트로 Instagram 을 고르게 | 지금의 `공유` 와 같은 동작이라 새 버튼의 의미가 없다. Instagram 을 바로 여는 것이 한 단계 짧다 |
| Instagram 앱을 지정해 파일을 넘기는 Android 인텐트(`com.instagram.android` + `EXTRA_STREAM`) | 새 네이티브 모듈이 필요하고(`expo-intent-launcher` 는 `Uri` 를 넘기지 못한다) iOS 에는 같은 길이 없다. 앨범 저장 + 앱 열기는 두 플랫폼에서 같은 코드다 |

## 다시 볼 때

회사가 Tech Provider(액세스 인증)를 받으면 앱 검수(권한 사용 설명 · 시연 영상 · 데이터 처리 질문)를 진행하고, 앱을 라이브로 바꾸면 앱 안 게시가
누구에게나 열린다(backlog C-8). 그때도 이 길은 남겨 둔다 — 개인 계정 사용자에게는 여전히 유일한 길이다.
