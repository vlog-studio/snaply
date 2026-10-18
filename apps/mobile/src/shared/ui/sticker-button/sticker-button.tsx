import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { DoodleIcon, type DoodleIconName } from '@/shared/ui/doodle-icon';
import { OpacityDisabled, Shadows, Sizes, useTheme } from '@/shared/ui/theme';

export type StickerButtonProps = Omit<PressableProps, 'children'> & {
  icon: DoodleIconName;
  accessibilityLabel: string;
  /** On — a toggle that is set, drawn in cherry with white. */
  selected?: boolean;
};

/**
 * An icon-only control as a round sticker (the design system's
 * `jj-button-sticker`): a disc of sheet paper with a dashed stitch inside its
 * edge and the short paper shadow, one doodle icon on it. For back, close and
 * the other controls that are a glyph alone. 48dp, the touch minimum.
 */
export function StickerButton({
  icon,
  selected = false,
  disabled,
  style,
  ...props
}: StickerButtonProps) {
  const theme = useTheme();
  const face = selected ? theme.primary : theme.backgroundElement;
  const ink = selected ? theme.onPrimary : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true, disabled: disabled === true } : undefined}
      disabled={disabled}
      style={(state) => [
        styles.disc,
        {
          backgroundColor: face,
          borderColor: selected ? theme.primary : theme.border,
          boxShadow: (state.pressed ? Shadows.pressed : Shadows.paper)(theme.shadowInk),
          opacity: disabled ? OpacityDisabled : 1,
          transform: [{ scale: state.pressed ? 0.97 : 1 }],
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <View
        pointerEvents="none"
        style={[styles.stitch, { borderColor: selected ? 'rgba(255,255,255,0.6)' : theme.border }]}
      />
      <DoodleIcon name={icon} size={22} color={ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: Sizes.touchMin,
    height: Sizes.touchMin,
    borderRadius: Sizes.touchMin / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stitch: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: Sizes.touchMin / 2 - 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
