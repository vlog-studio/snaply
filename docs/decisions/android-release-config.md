# Android 첫 출시 설정 — 최소 Android 9, 대화면에서도 세로 고정, 라우트 사이트맵 끄기

**작성일**: 2026-10-19
**상태**: 결정 — 최소 Android 9(API 28), Android 16 대화면에서도 세로 고정(임시 옵트아웃), Expo Router 라우트 사이트맵 끄기
**원천**: Android 앱의 최소 버전 · Android 16 대화면의 화면 방향 · 라우트 사이트맵을 이렇게 정한 이유. 설정 위치 · 생성되는 네이티브 파일 · 확인 방법은
[app-branding-and-native-config.md](../../apps/mobile/docs/workflows/app-branding-and-native-config.md#android-platform-settings)다
**출처**: 2026-10-19 출시 점검(오너 결정 — minSdk 28 · 대화면 세로 고정 · 사이트맵 끄기) · [backlog.md](../backlog.md) A-15
**관련 문서**: [junk-journal-design-system.md](junk-journal-design-system.md) ·
[app-shell-and-navigation.md](../../apps/mobile/docs/features/app-shell-and-navigation.md) · [deployment-aws.md](../deployment-aws.md) §8

## 무엇을 정했나

1. **최소 Android 버전은 9(API 28)다.** `expo-build-properties` 의 `android.minSdkVersion: 28`. Android 7.0~8.1 기기는 앱을 설치할 수 없다.
2. **Android 16 대화면에서도 세로 고정을 유지한다.** 앱 전체(`<application>`)에 Android 의 임시 옵트아웃
   `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` = `true` 를 선언한다(`apps/mobile/plugins/with-large-screen-portrait-lock.js`).
   폴드 안쪽 화면 · 태블릿에서도 Android 15 처럼 세로 화면 그대로 양옆을 비워(레터박스) 띄운다.
3. **Expo Router 의 라우트 사이트맵(`/_sitemap`)을 끈다.** `snaplyapp://_sitemap` 은 다른 없는 주소처럼 앱의 `페이지를 찾을 수 없어요` 화면으로 간다.
   개발 빌드에서도 사이트맵이 사라진다.

## 왜

- **최소 버전** — 정크 저널의 종이 조각은 단단한 그림자(번짐 없는 오프셋)로 바닥에서 떠 보이는데, 그 그림자는 `boxShadow`
  (`Shadows.paper`)다. React Native 는 바깥 `boxShadow` 를 API 28 부터만 그린다(`MIN_OUTSET_BOX_SHADOW_SDK_VERSION`). 최소 버전이
  React Native 기본값 24 이면 Android 7.0~8.1 에서 그림자가 소리 없이 빠지고, 테두리 없는 버터색 띠(`NoticeBand`) · 토스트는 종이 바탕과
  거의 구분되지 않는다. 그 버전의 사용자는 적고 첫 출시는 공모전 테스터 APK 라, 화면을 하나로 맞추는 쪽을 골랐다.
- **대화면** — 앱은 targetSdk 36 이다(React Native 의 버전 카탈로그). Android 16 은 targetSdk 36 앱에 대해 가장 짧은 변이 600dp 이상인 화면에서
  `screenOrientation` · `resizeableActivity` · 화면비 제한을 무시한다([Android 16 동작 변경](https://developer.android.com/about/versions/16/behavior-changes-16#ignore-orientation)).
  그러면 세로로만 그린 앱이 돌아가고 늘어난다 — 탭 바 입장권은 화면 폭만큼 벌어지고, 촬영 · 가져오기 · 무비 화면은 가로에서 본 적이 없다. 첫 출시
  범위에 가로 · 넓은 화면 레이아웃은 없다. 앱 전체에 거는 이유는 라이브러리의 화면(광고 등)도 Android 15 와 같게 두기 위해서다.
- **사이트맵** — 사이트맵은 모든 라우트를 나열하는, 영어로 된 Expo Router 의 기본 화면이다. 없는 주소는 이제 앱의 화면(`+not-found`)이
  받는다. 옵션은 개발 · 출시 빌드를 가르지 않으므로 개발 빌드의 사이트맵도 함께 포기한다.

## 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| 최소 버전 24 유지 + 버터색 띠 · 토스트에 1dp 테두리 | 그림자를 잃는 조각은 띠 · 토스트만이 아니다(종이 · 폴라로이드 · 스티커 단추 · 오류 카드 · 탭 바 입장권 · 촬영 원반). 테두리는 두 곳만 메우고, 낮은 버전에서만 다른 화면을 남긴다 |
| 대화면 대응 — 탭 바 · 선택 바를 `MaxContentWidth` 로 묶고 폴드 · 태블릿 에뮬레이터에서 가로까지 확인 | 첫 출시(테스터 APK) 전에 모든 화면을 가로로 볼 시간이 없다. 옵트아웃은 targetSdk 37 에서 효과가 없어지므로 이 작업은 미뤘을 뿐 없어지지 않는다 |
| 옵트아웃을 `MainActivity` 에만 | 앱 화면은 그것 하나라 결과는 같고, 라이브러리 화면만 Android 16 의 새 동작을 받게 된다. 앱 전체가 "Android 15 와 같게"를 한 번에 말한다 |
| 사이트맵을 두고 개발 빌드에서만 보이게 | 옵션이 빌드 종류를 가르지 않고, 사이트맵은 라우트 파일을 그대로 나열해 숨길 항목을 고를 수 없다 |

## 다시 볼 때

- **targetSdk 를 37 로 올리기 전** — 옵트아웃이 더는 듣지 않는다. 그 전에 넓은 화면 · 가로 레이아웃이 있어야 한다.
- **minSdk** — Android 9 미만 지원 요구가 생기면 대안 1(테두리)과 함께 다시 본다. React Native 가 낮은 버전에서 바깥 그림자를 그리게 되어도 다시 본다.
