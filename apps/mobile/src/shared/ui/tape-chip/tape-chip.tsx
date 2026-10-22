import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Sizes, Spacing, useTheme, type ThemeColor } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type TapeChipColor = Extract<
  ThemeColor,
  'tapeButter' | 'tapeMint' | 'tapePink' | 'tapeSky' | 'tapeLavender'
>;

/**
 * The smoky strip a tape is stuck on over live video: the `media` near-black
 * at 60%, kept literal like every scrim drawn over video (cookbook §14). Cream
 * ink on it holds about 5:1 over a white wall. The canvas draws this strip as
 * a 14% cream wash (`.cp-tape--smoke`, `.cp-dur-off`), which reads only over
 * its own dark mock viewfinder: over a bright scene its cream ink fell to about
 * 1.1:1, and dark ink on it to about 1:1 over a dark one.
 */
export const TapeSmoke = 'rgba(14, 11, 8, 0.6)';

export type TapeChipProps = Omit<PressableProps, 'children'> & {
  label: string;
  /**
   * A tape colour, or `smoke` — an unpicked chip over video: a dark smoky
   * strip (`TapeSmoke`) in the scheme's `text`. It belongs on a screen pinned
   * to the dark palette over video (`ThemeScope scheme="dark"`), where `text`
   * is cream.
   */
  color?: TapeChipColor | 'smoke';
  /** Degrees off level; a chip is stuck on by hand. */
  tilt?: number;
};

/**
 * A word on a strip of masking tape (the design system's `jj-tapechip`): a
 * small action stuck onto a surface — over video, in a row of options. Its
 * tape colour can say where the action stands (butter to do, mint done, pink
 * to retry). A chip that only reads is disabled and keeps its colour: the
 * label is then a status, not a refusal.
 */
export function TapeChip({
  label,
  color = 'tapeButter',
  tilt = 1.5,
  style,
  ...props
}: TapeChipProps) {
  const theme = useTheme();
  // Sticker colours keep their value at night, so their ink is always
  // `stickerInk`; only the smoke over video takes the light ink.
  const fill = color === 'smoke' ? TapeSmoke : theme[color];
  const ink = color === 'smoke' ? theme.text : theme.stickerInk;
  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => [
        styles.chip,
        {
          backgroundColor: fill,
          opacity: state.pressed ? 0.8 : 1,
          transform: [{ rotate: `${tilt}deg` }],
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <ThemedText selectable={false} type="smallBold" style={{ color: ink }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    minHeight: 32,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'center',
  },
  chip: {
    minHeight: Sizes.touchMin,
    paddingHorizontal: Spacing.four + Spacing.half,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * A status written on tape — not a press target: a counter, a stage read-out.
 * `fill` is any ground (a tape colour, kraft, `TapeSmoke` over video);
 * the ink stays dark unless `ink` says otherwise.
 *
 * It is not a live region: a label that reruns every second (the REC
 * countdown) must not be read out on each tick, and a screen that wants a
 * change announced wraps the label in one.
 */
export function TapeLabel({
  children,
  fill,
  ink,
  tilt = -1,
  style,
}: {
  children: ReactNode;
  fill: string;
  ink?: string;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.label,
        { backgroundColor: fill, transform: [{ rotate: `${tilt}deg` }] },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <ThemedText
          selectable={false}
          type="dataSm"
          style={{ color: ink ?? theme.stickerInk, fontWeight: 700 }}
        >
          {children}
        </ThemedText>
      ) : (
        children
      )}
    </View>
  );
}
