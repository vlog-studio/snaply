const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require('expo/config-plugins');

// The Android window background is what shows wherever nothing is drawn: before
// React's first frame, and again whenever the Activity is recreated. Left to
// the theme it is the OS's own day/night grey. This paints it the theme's
// paper (`background` in src/shared/ui/theme/theme.ts) — day in values/, night
// in values-night/ — so it is paper from the first frame, before
// `AppProviders` repaints it from JavaScript (`expo-system-ui`
// `setBackgroundColorAsync`, which also covers an in-app scheme that differs
// from the OS's). The same pair is the splash's background in app.json.
const PAPER = { day: '#FBF4E6', night: '#3D3028' };

// The color name expo-system-ui uses for the same job.
const COLOR_NAME = 'activityBackground';

function setPaperColor(colors, value) {
  return AndroidConfig.Colors.assignColorValue(colors, { name: COLOR_NAME, value });
}

function setPaperWindowBackground(styles) {
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    parent: AndroidConfig.Styles.getAppThemeGroup(),
    name: 'android:windowBackground',
    value: `@color/${COLOR_NAME}`,
  });
}

module.exports = function withPaperWindowBackground(config) {
  // expo-system-ui is applied by prebuild on its own and writes this same color
  // and AppTheme item from `android.backgroundColor` — and deletes both when
  // that key is unset. Setting the key to the day paper makes it write what this
  // plugin writes, so the result does not depend on which mod runs last.
  const configured = config.android?.backgroundColor;
  if (configured && configured.toLowerCase() !== PAPER.day.toLowerCase()) {
    throw new Error(
      `with-paper-window-background owns android.backgroundColor (${PAPER.day}); remove "${configured}" from app.json.`,
    );
  }
  config.android = { ...config.android, backgroundColor: PAPER.day };

  config = withAndroidColors(config, (config) => {
    config.modResults = setPaperColor(config.modResults, PAPER.day);
    return config;
  });
  config = withAndroidColorsNight(config, (config) => {
    config.modResults = setPaperColor(config.modResults, PAPER.night);
    return config;
  });
  config = withAndroidStyles(config, (config) => {
    config.modResults = setPaperWindowBackground(config.modResults);
    return config;
  });
  return config;
};
