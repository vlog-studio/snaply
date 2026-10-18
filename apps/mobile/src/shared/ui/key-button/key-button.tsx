import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { DoodleIcon, type DoodleIconName } from '@/shared/ui/doodle-icon';
import { OpacityDisabled, Shadows, Sizes, useTheme } from '@/shared/ui/theme';

export type KeyButtonProps = Omit<PressableProps, 'children'> & {
  icon: DoodleIconName;
  accessibilityLabel: string;
  /** The key's cap colour: pink for play, sky for the edit history. */
  tone?: 'mint' | 'sky' | 'butter' | 'pink';
};

/**
 * A transport control as a typewriter key (the design system's `jj-key`): a
 * cap of sticker colour with a deep bottom edge that the press pushes down.
 * For play and the edit history beside a stage — controls that are pressed
 * over and over, so they feel like keys rather than tickets.
 */
export function KeyButton({ icon, tone = 'mint', disabled, style, ...props }: KeyButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      style={(state) => [
        styles.key,
        {
          backgroundColor: theme[tone],
          boxShadow: Shadows.paper(theme.shadowInk),
          borderBottomWidth: state.pressed ? 1 : 4,
          transform: [{ translateY: state.pressed ? 3 : 0 }],
          opacity: disabled ? OpacityDisabled : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <DoodleIcon name={icon} size={20} color={theme.stickerInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: {
    minWidth: 52,
    minHeight: Sizes.touchMin,
    borderWidth: 1,
    borderColor: 'rgba(43,43,43,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
