import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/shared/ui/theme';

const DURATION = 600;

type AnimatedSplashOverlayProps = {
  /**
   * Whether the app under the overlay has something to show. Until it does,
   * the overlay stays as the static copy of the native splash: fading it
   * earlier uncovers an empty window, not the app.
   */
  ready: boolean;
};

export function AnimatedSplashOverlay({ ready }: AnimatedSplashOverlayProps) {
  // The native splash is handed over to this overlay as soon as it is laid
  // out — the two frames are identical — but the fade waits for `ready` too.
  const [nativeHidden, setNativeHidden] = useState(false);
  const [visible, setVisible] = useState(true);
  // The native splash follows the OS appearance (expo-splash-screen `dark`
  // variant), not the in-app theme mode, so the mirror must read the OS too.
  const systemScheme = useColorScheme();
  const isLight = systemScheme === 'light';
  const background = isLight ? Colors.light.background : Colors.dark.background;

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: { transform: [{ scale: 1 }], opacity: 1 },
    20: { opacity: 1 },
    70: { opacity: 0, easing: Easing.elastic(0.7) },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const mark = (
    <Image
      contentFit="contain"
      source={
        isLight
          ? require('@/assets/images/brand-glyph-cherry.png')
          : require('@/assets/images/brand-glyph-cherry-dark.png')
      }
      style={styles.glyph}
    />
  );

  return ready && nativeHidden ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={[styles.splashOverlay, { backgroundColor: background }]}
    >
      {mark}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        if (nativeHidden) return;
        void SplashScreen.hideAsync().finally(() => setNativeHidden(true));
      }}
      style={[styles.splashOverlay, { backgroundColor: background }]}
    >
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  // Must mirror the native splash exactly (expo-splash-screen in app.json):
  // the OS-scheme paper (`background`) + the cherry moment-ring mark (its
  // sticker outline in that scheme's sheet) at imageWidth 150, centered —
  // canvas `Splash`.
  glyph: { width: 150, height: 150 },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
