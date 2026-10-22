import type { ExpoConfig } from 'expo/config';

import { runAndroidMod } from './run-android-mod';
import withLargeScreenPortraitLock from './with-large-screen-portrait-lock';

const OPT_OUT = 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY';

type Property = { $: Record<string, string> };
// The slice of a parsed AndroidManifest.xml this plugin reads and writes.
type Manifest = {
  manifest: {
    $: Record<string, string>;
    application?: { $: Record<string, string>; property?: Property[] }[];
  };
};

const manifest = (property?: Property[]): Manifest => ({
  manifest: {
    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
    application: [{ $: { 'android:name': '.MainApplication' }, ...(property && { property }) }],
  },
});

async function applicationProperties(contents: Manifest) {
  const config = withLargeScreenPortraitLock({
    name: 'Snaply',
    slug: 'snaply-app',
  } satisfies ExpoConfig);
  const result = await runAndroidMod(config, 'manifest', contents);
  return result.manifest.application?.[0]?.property ?? [];
}

describe('withLargeScreenPortraitLock', () => {
  it("declares Android 16's large-screen opt-out on the application", async () => {
    expect(await applicationProperties(manifest())).toEqual([
      { $: { 'android:name': OPT_OUT, 'android:value': 'true' } },
    ]);
  });

  it('keeps a single declaration when prebuild runs over a manifest that has one', async () => {
    const other = { $: { 'android:name': 'some.other.PROPERTY', 'android:value': 'x' } };
    const rerun = await applicationProperties(
      manifest([other, { $: { 'android:name': OPT_OUT, 'android:value': 'false' } }]),
    );

    expect(rerun).toEqual([other, { $: { 'android:name': OPT_OUT, 'android:value': 'true' } }]);
  });
});
