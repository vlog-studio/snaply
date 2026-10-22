import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { OpacityDisabled, Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type TextButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  /**
   * `default` marks the words in pink. `delete` marks them in kraft — a delete
   * that is only a word (a list row's or a selection bar's 삭제): ink on kraft,
   * never red, because red is the main action.
   */
  tone?: 'default' | 'delete';
};

/** Grow a short line of text to the 48dp minimum without a taller row. */
const VerticalSlop = (Sizes.touchMin - 20) / 2;

/**
 * A text button (the design system's `jj-textbtn`): bold ink with a pink
 * highlighter stroke under the words. It is not red — red is the main action —
 * and on a sticker colour it stays dark ink in both schemes (`stickerInk`).
 * A disabled button drops the band, so its words sit on whatever is under it
 * and take that ground's own ink (`text`, faded) — sticker ink on night paper
 * would all but vanish. A notice or a post-it pins its contents to the day
 * scheme, so there that ink is dark too.
 * The row stays one text line tall; the press target reaches 48dp through
 * `hitSlop`, which a clipping ancestor still cuts on Android (cookbook §14).
 */
export function TextButton({
  label,
  tone = 'default',
  disabled,
  hitSlop,
  style,
  ...props
}: TextButtonProps) {
  const theme = useTheme();
  const band = tone === 'delete' ? theme.kraft : theme.pink;
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
          disabled ? { color: theme.text } : { color: theme.stickerInk, backgroundColor: band },
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
