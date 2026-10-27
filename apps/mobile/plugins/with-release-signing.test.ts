import type { ExpoConfig } from 'expo/config';

import { runAndroidMod } from './run-android-mod';
import withReleaseSigning from './with-release-signing';

// The signing part of the app/build.gradle that `expo prebuild` writes (SDK 57).
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

type GradleFile = { contents: string; language: 'groovy'; path: string };

async function signed(contents: string) {
  const config = withReleaseSigning({ name: 'Snaply', slug: 'snaply-app' } satisfies ExpoConfig);
  const result = await runAndroidMod<GradleFile>(config, 'appBuildGradle', {
    contents,
    language: 'groovy',
    path: '/project/android/app/build.gradle',
  });
  return result.contents;
}

describe('withReleaseSigning', () => {
  it('signs release with the upload key named by Gradle properties, never a value in the repo', async () => {
    const contents = await signed(TEMPLATE);

    expect(contents).toContain("storeFile file(findProperty('SNAPLY_UPLOAD_STORE_FILE'))");
    expect(contents).toContain("keyPassword findProperty('SNAPLY_UPLOAD_KEY_PASSWORD')");
    expect(contents).toContain(
      "signingConfig findProperty('SNAPLY_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
  });

  // Without the key a release build still runs — the tester APK of root docs/deployment-aws.md §8.
  it('keeps the debug key for debug builds and for release builds without the key', async () => {
    const contents = await signed(TEMPLATE);

    expect(contents).toMatch(/debug \{\n\s*signingConfig signingConfigs\.debug\n/);
    expect(contents).toContain(': signingConfigs.debug');
  });

  it('changes nothing when prebuild runs over a file it already rewrote', async () => {
    const once = await signed(TEMPLATE);

    expect(await signed(once)).toBe(once);
  });

  it('fails prebuild when the template no longer has the debug-signed release', async () => {
    await expect(signed(TEMPLATE.replace('// Caution!', '// Note:'))).rejects.toThrow(
      'with-release-signing',
    );
  });
});
