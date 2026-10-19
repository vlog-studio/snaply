import type { ExpoConfig } from 'expo/config';
import { AndroidConfig, type ConfigPlugin } from 'expo/config-plugins';
import { withAndroidRootViewBackgroundColor } from 'expo-system-ui/plugin/build/withAndroidRootViewBackgroundColor';

import { Colors } from '@/shared/ui/theme';

import { runAndroidMod } from './run-android-mod';
import withPaperWindowBackground from './with-paper-window-background';

const baseConfig = (): ExpoConfig => ({ name: 'Snaply', slug: 'snaply-app' });

// The AppTheme a fresh prebuild starts from.
const appThemeStyles = () => ({
  resources: {
    style: [
      {
        $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
        item: [{ $: { name: 'colorPrimary' }, _: '@color/colorPrimary' }],
      },
    ],
  },
});

async function nativeWindow(plugins: ConfigPlugin[]) {
  const config = plugins.reduce((next, plugin) => plugin(next), baseConfig());
  const colors = await runAndroidMod(config, 'colors', { resources: {} });
  const colorsNight = await runAndroidMod(config, 'colorsNight', { resources: {} });
  const styles = await runAndroidMod(config, 'styles', appThemeStyles());
  const appTheme = AndroidConfig.Styles.getStylesGroupAsObject(
    styles,
    AndroidConfig.Styles.getAppThemeGroup(),
  );
  const backgroundRef = appTheme?.['android:windowBackground'];
  const colorName = backgroundRef?.replace('@color/', '') ?? '';
  return {
    background: backgroundRef,
    day: AndroidConfig.Colors.getColorsAsObject(colors)?.[colorName]?.toLowerCase(),
    night: AndroidConfig.Colors.getColorsAsObject(colorsNight)?.[colorName]?.toLowerCase(),
  };
}

describe('withPaperWindowBackground', () => {
  // Prebuild applies expo-system-ui on its own, and its root-view color mod
  // deletes the window background when `android.backgroundColor` is unset — so
  // the paper must survive it whichever of the two runs last.
  it.each([
    [
      'registered before expo-system-ui',
      [withPaperWindowBackground, withAndroidRootViewBackgroundColor],
    ],
    [
      'registered after expo-system-ui',
      [withAndroidRootViewBackgroundColor, withPaperWindowBackground],
    ],
  ])('paints the native window the theme paper, day and night (%s)', async (_, plugins) => {
    const window = await nativeWindow(plugins);

    expect(window.background).toMatch(/^@color\//);
    expect(window.day).toBe(Colors.light.background.toLowerCase());
    expect(window.night).toBe(Colors.dark.background.toLowerCase());
  });

  it('refuses a different android.backgroundColor rather than overriding it silently', () => {
    const config = { ...baseConfig(), android: { backgroundColor: '#ffffff' } };

    expect(() => withPaperWindowBackground(config)).toThrow(/android\.backgroundColor/);
  });
});
