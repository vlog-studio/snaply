import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { OpacityDisabled, Shadows, Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type ModeTabProps = Omit<PressableProps, 'children'> & { label: string };

/**
 * A screen's mode switch (선택 / 취소) as a tab of sheet paper standing off the
 * page beside its title, a little askew, navy words on it. The press target is
 * the unrotated box, 48dp tall.
 */
export function ModeTab({ label, disabled, style, ...props }: ModeTabProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      style={(state) => [
        styles.tab,
        {
          backgroundColor: theme.backgroundElement,
          boxShadow: (state.pressed ? Shadows.pressed : Shadows.paper)(theme.shadowInk),
          opacity: disabled ? OpacityDisabled : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <ThemedText selectable={false} type="bodySm" style={[styles.label, { color: theme.navy }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    minHeight: Sizes.touchMin,
    minWidth: 64,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '1.5deg' }],
  },
  label: { fontWeight: 700 },
});
