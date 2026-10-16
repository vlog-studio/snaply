# Local development and testing

## Verification surfaces (read first)

A change is verified on three surfaces, each answering a different question:

1. **Automated checks** (`npm run verify`, [below](#automated-checks)) — JavaScript logic and rendered interaction contracts. Always run first.
2. **Android emulator and iOS Simulator** — the agent's on-device verification path: screens render, navigation and interaction flows work, the app talks to the backend. Boot them, drive them, and capture screenshots yourself using the procedures below (a dev build on the Android emulator, Expo Go on the iOS Simulator — [Expo Go limitations](#expo-go-limitations) explains the split). The first launch is Android-only, so **app behavior verified on the Android emulator counts as verified**. The web build (`npm run web`) is not a reference runtime; do not use it as evidence.
3. **The owner's phone** — only behavior that exists on a device and not in the emulator: push receipt, the OS permission prompts as shipped, real camera capture, album (media-library) writes, and opening another app. When a change touches one of these, do not claim it verified: say what you verified on the emulator, and list the device-only steps and expected results as a **separate manual-check section in your report** for the owner. If the owner has the phone attached and asks you to drive it, [`android-device-verification.md`](android-device-verification.md) is the toolkit — confirm it with `adb devices` and target it with `-s <serial>` (or `ANDROID_SERIAL`); never assume it is the only device.

iOS checks wait for the iOS launch; the iOS Simulator is still evidence, but say that a change was not verified on iOS hardware ([AGENTS.md § Verification](../../AGENTS.md#verification)).

**Metro belongs to whoever started it.** `expo run:android` and the dev client attach to any server already on port 8081, so a Metro process that dies quietly (a backgrounded process tied to a shell or a timeout) takes the device session with it. Reuse a Metro the owner already runs when one is up (`curl -s http://localhost:8081/status`); when you start one yourself, run it as a persistent process that outlives the shell that launched it, and never free port 8081 without asking.

## Automated checks

Run the automated gate ([AGENTS.md § Verification](../../AGENTS.md#verification)) before device or simulator verification:

```bash
npm run verify
```

The individual scripts for running one gate at a time (`npm run lint`, `npm run typecheck`, `npm test`, …) are listed in `package.json`'s `scripts`. What to test and how to write it is in [`writing-unit-tests.md`](writing-unit-tests.md).

Jest and React Native Testing Library validate JavaScript logic and rendered interaction contracts; they do not replace iOS and Android verification for camera, permissions, file-system, animation, or other native behavior.

## Environment

The development machine, an Apple silicon Mac mini (2026-09), with Expo CLI 57.x. The command examples below use these names.

| Platform | Setup |
| --- | --- |
| iOS | Xcode 27 (Swift 6.4) + iOS 27 simulators, device `iPhone 17` (402×874 pt). No CocoaPods, so there is no local native iOS build (`npm run ios`) here: iOS runs in Expo Go ([below](#ios-simulator--expo-go)), and a native iOS build goes through [EAS Build](#full-native-verification--eas-build-cloud-dev-build). There is no `Simulator.app`: open the device window with `open /Applications/Xcode.app/Contents/Applications/DeviceHub.app` |
| Android | SDK at `~/Library/Android/sdk`, image `system-images/android-35/google_apis/arm64-v8a`, AVD **`snaply_api35`** — written by hand under `~/.android/avd/`, since this SDK has no cmdline-tools (`avdmanager`). Android runs a dev build ([below](#android-emulator--dev-build)) |
| Expo Go (iOS) | Not in the CLI's cache — download the SDK 57 client ([below](#first-time-expo-go-install)) |

## iOS Simulator — Expo Go

Expo Go is the iOS path on this machine ([Environment](#environment)). Android does not use it ([Expo Go limitations](#expo-go-limitations)); the Android emulator runs a dev build ([below](#android-emulator--dev-build)).

```bash
xcrun simctl boot "iPhone 17"; open /Applications/Xcode.app/Contents/Applications/DeviceHub.app
npm start -- --go                                        # Metro in Expo Go mode
xcrun simctl openurl "iPhone 17" "exp://127.0.0.1:8081"
```

Pressing `i` in the Metro terminal opens the app on the booted simulator; the `openurl` line is the non-interactive equivalent, and the simulator asks to confirm opening it in Expo Go (tap 열기).

### First-time Expo Go install

Expo Go must be present on the simulator before the app can open, and it only needs installing once per simulator. The CLI has no cached client here, so download the SDK 57 one named by Expo's versions API — the tarball holds the *contents* of the app, so extract it into an `Expo Go.app` directory:

```bash
URL=$(curl -s https://api.expo.dev/v2/versions | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).sdkVersions["57.0.0"].iosClientUrl))')
mkdir -p "/tmp/expo-go/Expo Go.app" && curl -sL "$URL" | tar -xz -C "/tmp/expo-go/Expo Go.app"
xcrun simctl install "iPhone 17" "/tmp/expo-go/Expo Go.app"
```

After install, Expo Go stays on the simulator across sessions; just re-run `npm start -- --go` and reopen the app.

### Driving the simulator

`xcrun simctl` cannot inject touches: drive taps and swipes with the iOS Simulator tool the session provides, in device points (`iPhone 17` is 402×874). Confirm each interaction with `xcrun simctl io "iPhone 17" screenshot <path>`. To bypass permission dialogs during automation, grant them directly: `xcrun simctl privacy booted grant camera host.exp.Exponent` (same for `microphone`).

### Expo Go limitations

**Expo Go no longer boots this app on Android** (verified 2026-07-23 on the Android emulator): the app imports `expo-notifications` at startup (`_app/providers` push-token registrar → `shared/lib/notifications/local.ts`), and on Android Expo Go that import throws a fatal `Uncaught Error: expo-notifications: Android Push notifications … removed from Expo Go with the release of SDK 53` before anything renders. Android verification therefore requires a dev build: `npm run android` for the emulator, `npm run android:device` for a connected physical device. iOS Expo Go is unaffected.

Only native modules bundled in Expo Go work, and `expo-dev-client` configuration is ignored. Config-plugin options (e.g. `expo-camera`'s) may differ from a real build, and the native modules Expo Go lacks are absent: `@react-native-firebase/messaging` and `react-native-google-mobile-ads` load lazily and fall back to inert behavior with a dev warning, and the local `modules/video-trim` module (`VideoTrim`) is missing, so push registration, rewarded ads, and snap-extract trimming cannot be verified there. When a feature depends on such modules, verify it on the Android dev build or with EAS Build instead.

Reanimated `entering` presets never start on iOS in Expo Go; the rule, `FadeInView`, and the splash exception are in [animations and gestures](../frameworks/animations-and-gestures.md#prefer-runtime-shared-value-animations-over-enteringexiting-presets).

## Android emulator — dev build

Boot the emulator, then build, install, and open the dev build with `npm run android` (`expo run:android`):

```bash
~/Library/Android/sdk/emulator/emulator -avd snaply_api35 -no-snapshot-save &
# wait until the emulator reports boot complete:
until ~/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | grep -q 1; do sleep 3; done
npm run android
```

Once the dev build is installed, a later session needs only Metro in dev-build mode — `npm run dev:mobile` from the monorepo root (it rebuilds the shared contract package first), or `npm start -- --dev-client` here — and the app opened on the emulator.

If physical Android devices are also connected over adb, target the emulator explicitly with `-s emulator-5554`; a bare `adb shell` errors with "more than one device".

## Reload, dev menu, screenshots

- Code changes hot-reload via Fast Refresh.
- Reload: `r` in the Metro terminal reloads every connected app; on the device, `Cmd+R` (iOS Simulator) or `R` `R` (Android emulator).
- Dev menu: `m` in the Metro terminal; on the device, `Cmd+D` or Device → Shake (`Ctrl+Cmd+Z`) in the iOS Simulator, `Cmd+M` in the Android emulator.
- Capture screens to confirm a change rendered:
  ```bash
  xcrun simctl io "iPhone 17" screenshot /tmp/ios.png
  ~/Library/Android/sdk/platform-tools/adb -s emulator-5554 exec-out screencap -p > /tmp/android.png
  ```

## Installing an APK on a physical Android device — `scripts/install-android-device.sh`

`npm run android:device:install` installs the already-built debug APK (the dev client) on the attached physical device without re-running `expo run:android`; `npm run android:device:release` builds the release APK with Gradle (`gradlew app:assembleRelease`) and installs it the same way. Both are `scripts/install-android-device.sh` (`--help` lists the options: `--variant`, `--build`, `--apk`, `--pair`, `--connect`, `--no-launch`, `--reverse-only`). What the script does, so an agent does not redo it by hand:

- **Device selection.** Emulators are skipped; one phone listed under both its `adb connect` and mDNS serials counts once (grouped by `ro.serialno`). More than one physical device → it lists them and asks for `ANDROID_SERIAL`, which also targets an emulator explicitly.
- **adb server without Local Network access.** When no device appears but macOS Bonjour sees `_adb-tls-connect`, it restarts the adb server once ([`android-device-verification.md`](android-device-verification.md)). The restart drops every device's reverses.
- **Stale APK check.** A build through the script writes `app-<variant>.apk.native-inputs`, a hash of the installed dependency versions, `app.json`, `plugins/`, and `modules/`. A mismatch warns that the APK may lack a native module the bundle imports; an APK built by `expo run:android` has no stamp and gets a note instead. File mtimes are not used — a checkout or rebase touches them.
- **Reverses and launch.** It reverses 8081 (debug only) plus the ports of `EXPO_PUBLIC_API_BASE_URL` (`apps/mobile/.env`) and `S3_PUBLIC_ENDPOINT` (`apps/api/.env`) when those point at `localhost`/`127.0.0.1`. It then deep-links the dev client onto Metro when `:8081/status` answers, or starts `MainActivity`.
- **`--reverse-only`** (`npm run android:device:reverse`) skips the APK and only re-applies the reverses (8081 included, since it cannot tell which build is installed). The root `npm run dev:up` calls it after bringing up the local infrastructure and before starting the API.
- **Release builds block `http://`.** Expo sets `usesCleartextTraffic` only in the debug manifest, so on a release build Android refuses every plain-`http://` request before it leaves the phone — uploads fail at once and the backend logs nothing, while `adb shell curl` from the phone still succeeds (the shell is not subject to it). With `--variant release` the script warns before building when `EXPO_PUBLIC_API_BASE_URL` or `S3_PUBLIC_ENDPOINT` is `http://`. Verify against a local backend with the debug build.
- **Signature mismatch** (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) stops with the uninstall command; it never uninstalls on its own, since that deletes the app's local data.

The release APK embeds the JS bundle, so it runs without Metro — use it to hand a device a self-contained build or to verify near-production behavior. The Expo prebuild template signs release builds with the debug keystore, so no signing setup is needed, and it overwrites an installed debug build in place.

The release path builds with Gradle directly rather than through `expo run:android --variant release`. When `merge<Variant>Resources` fails on corrupted incremental state (`merged.dir/values*.xml (No such file or directory)`), the script clears that state and retries once; it also recreates `android/local.properties` and runs `expo prebuild` when the generated `android/` folder is missing.

Release builds need more Gradle daemon memory than the template default (`-Xmx2048m -XX:MaxMetaspaceSize=512m`): `lintVitalAnalyzeRelease` fails with a Metaspace OOM. The local config plugin `plugins/with-gradle-jvmargs.js` (registered in `app.json`) raises this to `-Xmx4096m -XX:MaxMetaspaceSize=1024m` via `withGradleProperties`, so the fix survives `prebuild --clean`. Do not hand-edit `android/gradle.properties` for this; change the plugin.

## Full native verification — EAS Build (cloud dev build)

A dev client built in the cloud carries every native module without a local native build — the only native iOS route on this machine ([Environment](#environment)). **`eas.json` has no `development` profile; add one (`developmentClient: true`, and `ios.simulator: true` for a simulator build) before using this path.** Install the result on the simulator or emulator and connect Metro with `npm run dev:mobile` from the monorepo root. It requires a free Expo account; `eas login` must be performed by the user (account authentication).

### Tester build against the AWS contest server — `tester` profile

`eas.json` defines one profile, `tester`: an internal-distribution Android APK whose `EXPO_PUBLIC_API_BASE_URL` is `https://snaply-api.dweaxai.com`. Build it with `npx --yes eas-cli@24.12.1 build --profile tester --platform android` from this directory; the result is an install link that any Android tester can open. The Supabase client values are not in `eas.json` (the repository is public) but in the EAS project's `preview` environment variables, and they must name the same Supabase project as the server. Setup, credits, and the server side are in the root [`docs/deployment-aws.md`](../../../../docs/deployment-aws.md) §8.

- EAS signs the APK with its own keystore, so it does not install over a local debug build (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`); uninstall first.
- `eas init` (or any EAS command that links the project) rewrites `app.json` with the resolved config — plugin-derived permissions and `extra`. Keep only `owner` and `extra.eas.projectId` and revert the rest; the config plugins stay the source of truth.
- Without a device, the emulator is enough to check upload → edit → playback: `adb install` the APK on `snaply_api35` ([Environment](#environment)) and push test clips into `/sdcard/DCIM/Camera` (create the folder first) for the `가져오기` flow. The emulator's back camera is `emulated`, so capture also runs; real camera capture is a check for the owner's phone ([Verification surfaces](#verification-surfaces-read-first)).

## Notes

- `ios/` and `android/` are git-ignored (managed workflow). A `prebuild` may generate `ios/`; do not commit it.
- To stop: Android — `adb -s emulator-5554 emu kill`; iOS — `xcrun simctl shutdown "iPhone 17"`. Never free port 8081 without asking (see [Verification surfaces](#verification-surfaces-read-first)): the Metro on it may be the one the owner started for their own device session.
