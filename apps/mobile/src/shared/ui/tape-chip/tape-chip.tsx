import { Pressable, StyleSheet, type PressableProps } from 'react-native';

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
  chip: {
    minHeight: Sizes.touchMin,
    paddingHorizontal: Spacing.four + Spacing.half,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
