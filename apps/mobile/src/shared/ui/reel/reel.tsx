import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion, useTheme } from '@/shared/ui/theme';

export type ReelProps = {
  /** Diameter in points. */
  size?: number;
  /** Ring and spoke colour; the muted ink by default, which reads on paper. */
  color?: string;
  accessibilityLabel?: string;
};

/** One turn of a cassette reel (the design system's `jj-reel`). */
const TurnMs = 1600;

// The shared-value writes live in module-level drivers, as in
// `bottom-sheet.tsx`: the React Compiler lint rejects `.value` writes in a
// component body.
function spin(turn: SharedValue<number>) {
  turn.value = withRepeat(withTiming(1, { duration: TurnMs, easing: Easing.linear }), -1, false);
}

function stop(turn: SharedValue<number>) {
  cancelAnimation(turn);
  turn.value = 0;
}

/**
 * The app's loading mark — a cassette reel turning in place, in place of the
 * platform spinner. With reduced motion it stands still: the reel itself says
 * "loading" without the turn.
 */
export function Reel({ size = 22, color, accessibilityLabel = '불러오는 중' }: ReelProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const turn = useSharedValue(0);
  const ink = color ?? theme.textSecondary;

  useEffect(() => {
    if (reducedMotion) {
      stop(turn);
      return;
    }
    spin(turn);
    return () => stop(turn);
  }, [reducedMotion, turn]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 360}deg` }],
  }));

  const spoke = Math.max(2, Math.round(size / 11));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: ink,
            borderWidth: Math.max(2, Math.round(size / 7)),
          },
          spinStyle,
        ]}
      >
        <View style={[styles.spoke, { width: spoke, backgroundColor: ink }]} />
        <View
          style={[
            styles.spoke,
            { width: spoke, backgroundColor: ink, transform: [{ rotate: '90deg' }] },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  spoke: { position: 'absolute', top: 2, bottom: 2 },
});
