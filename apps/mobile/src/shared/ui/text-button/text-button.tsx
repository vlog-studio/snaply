import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { OpacityDisabled, Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type TextButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
};

/** Grow a short line of text to the 48dp minimum without a taller row. */
const VerticalSlop = (Sizes.touchMin - 20) / 2;

/**
 * A text button (the design system's `jj-textbtn`): bold ink with a pink
 * highlighter stroke under the words. It is not red — red is the main action —
 * and on a sticker colour it stays dark ink in both schemes (`stickerInk`).
 * The row stays one text line tall; the press target reaches 48dp through
 * `hitSlop`, which a clipping ancestor still cuts on Android (cookbook §14).
 */
export function TextButton({ label, disabled, hitSlop, style, ...props }: TextButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      hitSlop={
        hitSlop ?? {
          top: VerticalSlop,
          bottom: VerticalSlop,
          left: Spacing.two,
          right: Spacing.two,
        }
      }
      style={(state) => [
        { opacity: disabled ? OpacityDisabled : state.pressed ? 0.7 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <ThemedText
        selectable={false}
        type="link"
        style={[
          styles.label,
          { color: theme.stickerInk, backgroundColor: disabled ? undefined : theme.pink },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // RN text has no gradient ground, so the highlighter is the text's own
  // background — a flat band, which is what a marker stroke reads as here. Ink
  // stays dark because the band is a sticker colour in both schemes.
  label: { paddingHorizontal: 2 },
});
