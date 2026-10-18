import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * The sticker colours a tag comes in (the design system's `jj-tag`): `sheet`
 * for a quiet state, `sky` for work in progress, `mint` for done, `butter` for
 * a transfer, `pink` for a countdown, and `cherry` — white ink — for the one
 * thing that went wrong.
 */
export type TagTone = 'sheet' | 'sky' | 'mint' | 'butter' | 'pink' | 'cherry';

/**
 * A state written on a small square of sticker paper: a word, never a press
 * target. Sticker colours keep their value at night, so their ink does too.
 */
export function Tag({
  label,
  tone,
  style,
}: {
  label: string;
  tone: TagTone;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const fill = {
    sheet: theme.backgroundElement,
    sky: theme.sky,
    mint: theme.mint,
    butter: theme.butter,
    pink: theme.pink,
    cherry: theme.primary,
  }[tone];
  const ink =
    tone === 'cherry' ? theme.onPrimary : tone === 'sheet' ? theme.text : theme.stickerInk;
  return (
    <View style={[styles.tag, { backgroundColor: fill, borderColor: theme.border }, style]}>
      <ThemedText selectable={false} type="xsmall" style={{ color: ink }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start' },
});
