import type { ExpoConfig } from 'expo/config';
import type { ExportedConfig, Mod } from 'expo/config-plugins';

type AndroidModName = 'colors' | 'colorsNight' | 'styles' | 'manifest';

/**
 * Test helper: runs the chain of `android.<name>` mods the plugins applied to
 * `config` over in-memory file contents, the way prebuild runs them over the
 * parsed native files — without reading or writing `android/`.
 */
export async function runAndroidMod<T>(
  config: ExpoConfig,
  name: AndroidModName,
  modResults: T,
): Promise<T> {
  const mod = (config as ExportedConfig).mods?.android?.[name] as Mod<T> | undefined;
  if (!mod) throw new Error(`No plugin added an android.${name} mod`);
  const result = await mod({
    ...config,
    modResults,
    modRawConfig: config,
    modRequest: {
      projectRoot: '/project',
      platformProjectRoot: '/project/android',
      modName: name,
      platform: 'android',
      introspect: true,
    },
  });
  return result.modResults;
}
