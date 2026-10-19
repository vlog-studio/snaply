const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// Android 16 (API 36) ignores `screenOrientation`, `resizeableActivity` and the
// aspect-ratio limits on displays whose smallest width is at least 600dp — a
// Galaxy Z Fold's inner screen, a tablet — for apps that target API 36, as this
// one does. The app is drawn for portrait only (`orientation` in app.json), so
// this declares Android's temporary opt-out on the whole application, which
// keeps the portrait lock (letterboxed) there as on Android 15. Android stops
// honoring it once the app targets API 37; the large-screen layout has to exist
// by then (docs/decisions/android-release-config.md).
// https://developer.android.com/about/versions/16/behavior-changes-16#ignore-orientation
const PROPERTY_NAME = 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY';

module.exports = function withLargeScreenPortraitLock(config) {
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const others = (application.property ?? []).filter(
      (property) => property.$['android:name'] !== PROPERTY_NAME,
    );
    application.property = [
      ...others,
      { $: { 'android:name': PROPERTY_NAME, 'android:value': 'true' } },
    ];
    return config;
  });
};
