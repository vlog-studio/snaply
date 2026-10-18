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

export type TapeChipProps = Omit<PressableProps, 'children'> & {
  label: string;
  color?: TapeChipColor;
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
  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => [
        styles.chip,
        {
          backgroundColor: theme[color],
          opacity: state.pressed ? 0.8 : 1,
          transform: [{ rotate: `${tilt}deg` }],
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <ThemedText selectable={false} type="smallBold" style={{ color: theme.stickerInk }}>
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
 * `fill` is any ground (a tape colour, kraft, a smoke wash over video);
 * the ink stays dark unless `ink` says otherwise.
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
