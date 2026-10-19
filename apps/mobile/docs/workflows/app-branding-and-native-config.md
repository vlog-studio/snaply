# App branding and native config (icon, name, splash, font, Android settings)

How to change app-level branding — the launcher **icon**, the display **name**, the **splash screen**, and the app **font** — and the [Android platform settings](#android-platform-settings) baked in beside them (minimum Android version, window background, large-screen orientation, the route sitemap), and how to make those changes actually appear on a device.

Read this whenever a task touches the app icon, app display name, splash screen, adaptive-icon colors, the embedded font family, the local config plugins in `plugins/`, or any other value that is baked into the native project rather than rendered by React at runtime.

## Mental model: this is a CNG (managed) project

`/ios` and `/android` are **git-ignored generated folders** (see `.gitignore` → "generated native folders"). This project uses Expo **Continuous Native Generation (CNG)**: the native projects are produced from configuration, not hand-edited and not committed.

The **source of truth** is:

- `app.json` — `expo.name`, `expo.icon`, `expo.ios`, `expo.android`, and the plugin configs (`expo-splash-screen`, `expo-font`, `expo-build-properties`, …).
- `plugins/` — the local config plugins `app.json` registers, for native settings no package plugin offers. Each is a CommonJS file using `expo/config-plugins`; a plugin with logic worth guarding has a co-located Jest test (`runAndroidMod` in `plugins/run-android-mod.ts` runs its mods over in-memory files).
- `assets/` — the image/`.icon` files those fields point to.

Consequences you must internalize:

- **Never edit files under `android/` or `ios/` to change branding.** Those edits are discarded the next time the native project is regenerated. Change `app.json` / `assets/` instead.
- The local `android/` and `ios/` folders can be **stale** — generated before a branding change and never regenerated. When they are stale, the emulator/simulator shows the *old* icon/name even though `app.json` is already correct. This is the single most common symptom (a "the icon didn't change" report).
- Icon, name, and splash are **build-time** resources. They are compiled into the app binary and **cannot be updated over-the-air (OTA)**. Seeing a change requires regenerating native code **and** rebuilding + reinstalling the app.
- **EAS Build re-runs prebuild in the cloud** from `app.json` + `assets/`. So a stale *local* native folder does not affect EAS builds — if the source config is correct, EAS produces the correct app. Regenerating locally only matters for local builds and local verification.

## Where each value lives

| Branding element | Source (edit here) | Generated native output (do not edit) |
| --- | --- | --- |
| Display name | `expo.name` in `app.json` | Android `strings.xml` → `app_name`; iOS `Info.plist` → `CFBundleDisplayName` |
| iOS icon | `expo.ios.icon` → `./assets/expo.icon` (Apple Icon Composer `.icon`) | `ios/<Name>/expo.icon`, `Images.xcassets/AppIcon.appiconset` |
| Android adaptive icon | `expo.android.adaptiveIcon` (`foregroundImage`, `backgroundImage`/`backgroundColor`, `monochromeImage`) | `res/mipmap-*/ic_launcher*.webp`, `res/mipmap-anydpi-v26/ic_launcher.xml` |
| Legacy/base icon | `expo.icon` → `./assets/images/icon.png` | included in generated icon sets |
| Splash screen | `expo-splash-screen` plugin config (`backgroundColor`, `image`, `imageWidth`) | Android `res/drawable-*/splashscreen_logo.png`, `colors.xml`; iOS `SplashScreen.storyboard`, `Images.xcassets` |
| App font | `expo-font` plugin config + the `.ttf` files in `assets/fonts/` | Android `res/font/xml_pretendard_gov.xml` + `res/font/*.ttf` + an `addCustomFont` call in `MainApplication.kt`; iOS `Info.plist` → `UIAppFonts` + a Resources build-phase entry per file |
| Minimum Android version | `expo-build-properties` plugin config → `android.minSdkVersion` | `android/gradle.properties` → `android.minSdkVersion` (read into `rootProject.ext.minSdkVersion`) |
| Android window background | `plugins/with-paper-window-background.js` | `res/values/colors.xml` and `res/values-night/colors.xml` → `activityBackground`; `res/values/styles.xml` → `AppTheme` `android:windowBackground` |
| Android 16 large-screen opt-out | `plugins/with-large-screen-portrait-lock.js` | `AndroidManifest.xml` → `<application>` `<property android:name="android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY">` |
| Route sitemap | `expo-router` plugin config → `sitemap` | not native: `extra.router` in the app config, which the build embeds (`expo-constants`) and Metro serves in development |

## App font

The app embeds **three families**, each with one job (root `docs/decisions/junk-journal-design-system.md`, decisions 2 and 5):

| Family (`Fonts` key) | Files in `assets/fonts/` | Weights | Job | License |
| --- | --- | --- | --- | --- |
| **Pretendard GOV** (`sans`) | `PretendardGOV-Regular.ttf`, `PretendardGOV-Bold.ttf` | 400, 700 | body text and every control | SIL OFL 1.1 — `OFL.txt` ([upstream package](https://github.com/orioncactus/pretendard/tree/main/packages/pretendard-gov)) |
| **D2Coding** (`mono`) | `D2Coding-Regular.ttf`, `D2Coding-Bold.ttf` | 400, 700 | data — counts, durations, meta, receipt values | SIL OFL 1.1 — `OFL-D2Coding.txt` (NAVER, [d2codingfont](https://github.com/naver/d2codingfont) release 1.3.2) |
| **Gaegu** (`hand`) | `Gaegu-Bold.ttf` | 700 | handwritten titles, 22px and up | SIL OFL 1.1 — `OFL-Gaegu.txt` ([Google Fonts](https://github.com/google/fonts/tree/main/ofl/gaegu)) |

Each license file ships beside the files as the OFL requires. All three are embedded at build time by the `expo-font` config plugin rather than loaded at runtime with `useFonts`, which is why there is no font gate in the root layout and no first-frame flash of a system face.

### Which weights are embedded, and why so few

Every face is large — Pretendard GOV ~5.5MB (23,410 glyphs), D2Coding ~4.2MB, Gaegu ~3MB — so only the weights a `ThemedText` role uses are embedded, and the type roles use only **400 and 700**. Pretendard 500 and 800 were dropped with the junk-journal redesign (2026-10-18, about 11MB) to make room for D2Coding and Gaegu, so the five files cost about 22.7MB against the four Pretendard weights' 21.7MB before. Upstream ships more; the others are not in the repo, so adding one means fetching it again from its source above.

A weight outside the embedded set resolves to the nearest face, and **600 lands exactly between 400 and 700**, a tie iOS breaks toward the lighter one — keep every style on 400 or 700. React Navigation's default header title weight is 600, which is why `root-layout.tsx` sets an explicit 700 in `headerTitleStyle`.

To add or drop a weight or a family: link/unlink it in **both** the `android.fonts[]` array (one entry per family, `fontDefinitions` per weight) and the `ios.fonts` array of the `expo-font` plugin in `app.json`, then prebuild and rebuild.

### One family name, both platforms

Styles say `fontFamily: Fonts.sans` / `Fonts.mono` / `Fonts.hand` and let `fontWeight` choose the face. Nothing names a single face like `'PretendardGOV-Bold'`. This works because of two separate mechanisms that happen to agree:

- **Android** — each `fontDefinitions` entry generates a `res/font/xml_<family>.xml` `<font-family>` mapping each `app:fontWeight` to a file, registered under the family name from the config (`ReactFontManager.getInstance().addCustomFont(this, "Pretendard GOV", …)`). The JS `fontFamily` string must match that config value **exactly**, spaces included.
- **iOS** — the plugin only lists the files in `UIAppFonts`; the family name comes from inside the font. CoreText groups faces by the **typographic family** (name ID 16) — `Pretendard GOV` and `D2Coding` in their files — and React Native then picks the face whose weight trait is closest to the requested one (`RCTFontWithFontProperties` in `RCTFontUtils.mm`). Gaegu has no name ID 16, but it embeds a single face whose legacy family (name ID 1) is `Gaegu`, so there is nothing to group. A family with several weights and no ID 16 would collapse its heavier weights onto Regular on iOS — check name ID 16 before adding one.

### Where the font reaches text, and where it does not

`ThemedText` applies the family per role (`sans` in its base style; the data roles and the title roles name `mono` and `hand`). Text outside `ThemedText` must name the family itself — currently `shared/ui/text-field` (a `TextInput`) and the `headerTitleStyle` in `root-layout.tsx`. Add a new one to that list, not a new font token. D2Coding carries Hangul, so a data line may mix Korean and digits in the mono face; the older rule that kept Hangul out of the mono roles went with the system monospace — see [cookbook §14 Consuming the design system](../conventions/cookbook.md#14-consuming-the-design-system).

The fonts cannot reach text the OS draws: permission dialogs, `Alert`, notifications, and the share sheet stay on the system font. Nor do they reach web, and that is settled rather than pending — the app ships to iOS and Android only, so no webfont is served and `npm run web` renders down the fallback stacks in `_app/styles/global.css`.

## Android platform settings

Four settings shape the Android app outside React. They were set together for the first release (2026-10-19); the reasons and the alternatives turned down are in the decision record [`android-release-config.md`](../../../../docs/decisions/android-release-config.md). All four take effect only in a **new build** — none is a JavaScript change. Three of them (all but the sitemap) live in generated `android/` files, so a local build from an existing `android/` leaves them out until a prebuild regenerates it ([pitfall](#known-pitfalls-all-observed-on-this-project)).

| Setting | Where | What it does | To see it |
| --- | --- | --- | --- |
| Minimum Android version **9 (API 28)** | `expo-build-properties` → `android.minSdkVersion: 28` (beside the iOS `useFrameworks` option) | Android 7.0–8.1 can no longer install the app. React Native draws an outset `boxShadow` only from API 28 (`MIN_OUTSET_BOX_SHADOW_SDK_VERSION`), and every paper scrap's hard shadow is one (`boxShadow: Shadows.paper(theme.shadowInk)`, [cookbook §14](../conventions/cookbook.md#14-consuming-the-design-system)), so below 28 those scraps lost it silently | prebuild + rebuild |
| Paper window background | `plugins/with-paper-window-background.js` | Paints the native window the theme's paper (`background`) — `#FBF4E6` in `values/`, `#3D3028` in `values-night/` — so what shows before React's first frame and on an Activity recreation is paper, not the OS's day/night grey. Night follows the **OS** scheme; `AppProviders` repaints the window from JavaScript for the in-app scheme | prebuild + rebuild |
| Large screens on Android 16 | `plugins/with-large-screen-portrait-lock.js` | Declares `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` = `true` on `<application>`, so the portrait lock still holds on screens 600dp or wider (Fold inner screen, tablets), letterboxed as on Android 15 | prebuild + rebuild |
| No route sitemap | `["expo-router", { "sitemap": false }]` | Expo Router stops generating `/_sitemap`, so `snaplyapp://_sitemap` lands on the app's not-found page instead of a list of every route. Development builds lose the sitemap too | release: rebuild; development build: restart Metro |

### Paper window background: why the plugin sets `android.backgroundColor`

`expo-system-ui` is installed, so prebuild applies its config plugin even though `app.json` does not list it. That plugin writes the same `activityBackground` color and `AppTheme` item from `android.backgroundColor` — and **deletes both** when that key is unset, which is why the generated `styles.xml` had no window background before. Which of two plugins' mods runs last depends on registration order, so instead of relying on it, `with-paper-window-background` sets `android.backgroundColor` to the day paper: both plugins then write the same values in either order (the plugin's test runs both orders). Do not set `android.backgroundColor` in `app.json`; the plugin throws if it differs. The night value has no `expo-system-ui` counterpart and comes only from the plugin. If the theme's `background` changes, change the plugin (its test compares it with `Colors`) and the `expo-splash-screen` `backgroundColor`s with it (`animated-splash-overlay.test.tsx` compares those). iOS is untouched (`ios.backgroundColor` stays unset).

### Large screens: the opt-out is temporary

Android 16 (API 36) ignores `screenOrientation`, `resizeableActivity`, `minAspectRatio` and `maxAspectRatio` on displays whose smallest width is at least 600dp for apps that target API 36 — this app does, through React Native's version catalog (`targetSdk = "36"`). The property is Android's documented opt-out ([behavior changes: Android 16](https://developer.android.com/about/versions/16/behavior-changes-16#ignore-orientation)). It is on the application rather than `MainActivity` so library activities keep their Android 15 behavior too. **It stops working once the app targets API 37**: a layout for wide screens has to exist before `targetSdkVersion` is raised to 37. Multi-window is unaffected — it was allowed before and still is.

### Verify without touching `android/`

The resulting native files can be read without a prebuild: `npx expo config --type introspect --json` (from `apps/mobile`) runs every plugin's mods in introspection mode and writes nothing. The results are under `_internal.modResults.android` — `gradleProperties` (`android.minSdkVersion`), `colors` / `colorsNight` (`activityBackground`), `styles` (`AppTheme` → `android:windowBackground`) and `manifest` (`manifest.application[0].property`) — and the router options under `extra.router`. Introspection starts from the existing `android/` files when they are there, so it shows what a prebuild would make of them. On a device: `adb shell dumpsys package com.anonymous.snaplyapp | grep minSdk` shows `minSdk=28` once the new build is installed.

## Standard procedure

### 1. Change the source config

Edit `app.json` and/or replace the asset files under `assets/`. Keep asset dimensions consistent with what they replace (e.g. Android adaptive foreground/background are 512×512, `icon.png` is 1024×1024).

Example — the 2026-07-20 rename + logo change:

```jsonc
// app.json → expo
"name": "Snaply",            // was "snaply-app"  → display name only
"slug": "snaply-app",        // leave slug alone (EAS project linkage)
```

Changing `expo.name` also renames the iOS Xcode project folder/target (e.g. `ios/snaplyapp/` → `ios/Snaply/`). The `bundleIdentifier` / `package` are **not** derived from `name` and stay unchanged.

### 2. Regenerate the native project

```bash
# Android
npx expo prebuild --clean --platform android

# iOS (file generation only; safe even where a local iOS *build* is impossible)
npx expo prebuild --clean --platform ios
```

Use `--platform` to regenerate one platform at a time so you don't disturb the other. `--clean` deletes and recreates the native folder — this is the reliable way to pick up branding changes (a non-`--clean` prebuild may not overwrite existing generated resources).

### 3. Rebuild and reinstall (to actually see the change)

Icon/name/splash are build-time, so reinstall is required:

```bash
# Android — the emulator; a connected phone takes `npm run android:device`
npm run android
```

iOS: the development Mac has no local native iOS build ([`local-development-and-testing.md` → Environment](local-development-and-testing.md#environment)), so verify iOS at the config level (step 4), or through an **EAS Build** — `eas.json` has only the Android `tester` profile, so add an iOS profile first ([EAS Build](local-development-and-testing.md#full-native-verification--eas-build-cloud-dev-build)).

### 4. Verify

- **Android** — open the launcher app drawer and confirm the icon art and the label. Non-interactively:
  ```bash
  adb -s emulator-5554 exec-out screencap -p > drawer.png   # inspect the icon
  adb -s emulator-5554 shell dumpsys package com.anonymous.snaplyapp | grep versionName
  cat android/app/src/main/res/values/strings.xml            # app_name should match expo.name
  ```
- **Android platform settings** — read the would-be native files with `npx expo config --type introspect --json` before building ([Verify without touching `android/`](#verify-without-touching-android)).
- **iOS** — without a local native build, the app icon **cannot be seen locally**: Expo Go renders *its own* icon regardless of this config. Verify by inspection instead:
  ```bash
  /usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" ios/<Name>/Info.plist   # expect the new name
  diff -rq assets/expo.icon ios/<Name>/expo.icon                                  # expect identical
  ```
  For a real visual check, produce an **EAS Build** (with the iOS profile step 3 calls for) and install it on a device/simulator.
- **Font** — the generated wiring is checkable without a build, and worth checking, because a font that fails to register does not error: text just renders in the system face.
  ```bash
  cat android/app/src/main/res/font/xml_pretendard_gov.xml            # one <font> per linked weight
  grep -n ReactFontManager android/app/src/main/java/com/anonymous/snaplyapp/MainApplication.kt
  /usr/libexec/PlistBuddy -c "Print :UIAppFonts" ios/Snaply/Info.plist   # one entry per linked weight
  ```
  On iOS the plugin references the files in place (`path = "../assets/fonts/…"`) rather than copying them under `ios/`, so an empty `find ios -name "*.ttf"` is expected, not a failure. On a device, compare a heading against Roboto/SF: Pretendard's Hangul is noticeably wider-set with flatter terminals.

## Known pitfalls (all observed on this project)

- **A Gradle build does not regenerate `android/`.** `./gradlew app:assembleRelease` (the tester APK in the root [`docs/deployment-aws.md`](../../../../docs/deployment-aws.md) §8) and `npm run android:device:release` (`install-android-device.sh --build`, which prebuilds only when `android/` is missing) compile whatever `android/` already holds. After a change to `app.json` or `plugins/`, run `npx expo prebuild --clean --platform android` first (then the `local.properties` step below), or the APK ships the old native settings — the splash, the minimum Android version, the window background and the large-screen opt-out (observed on the other redesign branch, 2026-10-19: its `android/` still had no `android.minSdkVersion` in `gradle.properties` and no `windowBackground` in `styles.xml`). Only what is embedded through `expo-constants` (`extra`, e.g. the sitemap option) reaches such a build. EAS builds prebuild in the cloud and are not affected.
- **`prebuild --clean` deletes `android/local.properties`.** The next Gradle build then fails with `SDK location not found`. Recreate it (or export `ANDROID_HOME`) before building:
  ```bash
  printf 'sdk.dir=%s/Library/Android/sdk\n' "$HOME" > android/local.properties
  ```
- **Splash config must include an `image`.** The generated `styles.xml` always references `@drawable/splashscreen_logo`. If the `expo-splash-screen` plugin has only a `backgroundColor` and no `image`, a clean prebuild produces no such drawable and the Android build fails resource linking:
  `error: resource drawable/splashscreen_logo ... not found`. This project uses `./assets/images/brand-glyph-cherry.png` (and `brand-glyph-cherry-dark.png` for the `dark` variant) at `imageWidth` 150. (A stale native folder can hide this — an old splash drawable lingers until the first clean prebuild.)
- **Android 12+ masks the splash icon to a circle, so a splash image whose art extends past its inscribed circle gets clipped.** The `expo-splash-screen` plugin maps to the system `windowSplashScreenAnimatedIcon`, which Android renders inside a circular mask (Google's safe zone is a 192dp-diameter circle within the 288dp icon canvas; some OEMs — e.g. Samsung One UI — mask even tighter). Compute the mark's bounding-circle factor (farthest content point from the canvas center ÷ half the canvas width) and keep `imageWidth × factor ≤ 192`. The junk journal moment-ring mark (`brand-glyph-cherry*.png`, from the canvas `Splash` board — the cherry ring with its sheet-colored sticker outline and hard shadow, turned −4°) has factor ≈ 1.0 (the outline round the dot reaches the canvas edge) → `imageWidth ≤ ~192`; this project uses **150**, within the mask. (The 2026-07 ember mark it replaced had factor ≈ 0.92; the earlier play-triangle mark had factor ≈ 1.22, which is what originally clipped at `imageWidth` 200.) Adjusting `imageWidth` — not editing the glyph asset — is the correct lever: the area outside the circle is the same `backgroundColor`, so the mask itself is invisible. This is a system splash, not the legacy full-screen splash — you cannot avoid the circular mask; the logo must fit inside it.
- **`expo run:android --device <name>` wants the AVD name, not the adb serial.** Passing `emulator-5554` errors with "Could not find device with name"; `adb -s emulator-5554 emu avd name` prints the name to pass.

## Related

- [`local-development-and-testing.md`](local-development-and-testing.md) — the development Mac's environment (no local native iOS build) and emulator/simulator boot.
- [`feature-development.md`](feature-development.md) — general implementation workflow and completion checklist.
