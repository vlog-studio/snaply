import appConfig from '../app.json';

// The Android release settings of root docs/decisions/android-release-config.md
// live in app.json, which every branch edits; a merge that drops one leaves
// every other test green, so the settings are pinned here.
type PluginEntry = string | [string, Record<string, unknown>];

const plugins = appConfig.expo.plugins as PluginEntry[];
const pluginOptions = (name: string) =>
  plugins.find((plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) ? plugin[0] === name : false,
  )?.[1];

describe('the Android release config in app.json', () => {
  // React Native draws an outset boxShadow — every paper scrap's hard shadow —
  // only from API 28.
  it('installs on Android 9 (API 28) and up', () => {
    const android = pluginOptions('expo-build-properties')?.android as
      { minSdkVersion?: number } | undefined;

    expect(android?.minSdkVersion).toBe(28);
  });

  // Unknown links land on the app's own not-found page; the sitemap would list
  // every route on an English screen in every build.
  it('turns the route sitemap off', () => {
    expect(pluginOptions('expo-router')).toEqual({ sitemap: false });
  });

  // A plugin that is not registered never runs, however well its own test passes.
  it.each([
    './plugins/with-paper-window-background.js',
    './plugins/with-large-screen-portrait-lock.js',
  ])('registers %s', (plugin) => {
    expect(plugins).toContain(plugin);
  });
});
