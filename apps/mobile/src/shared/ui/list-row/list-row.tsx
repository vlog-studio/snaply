import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { DottedRule } from '@/shared/ui/paper';
import { Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * A line of a receipt (the design system's `jj-row`): an icon, a name, a
 * dotted leader to the value in receipt figures, and a chevron when the line
 * opens somewhere. Pressed, the line is highlighted pink. A row that carries a
 * control of its own (a toggle) passes it as `trailing` and no `onPress`.
 *
 * A value with no room beside its name (large system text on a narrow phone)
 * moves whole to its own line, right-aligned, and the leader fills the first.
 */
export function ListRow({
  icon,
  name,
  sub,
  value,
  trailing,
  onPress,
  accessibilityLabel,
  divider = true,
  style,
}: {
  icon?: ReactNode;
  name: string;
  /** A second line under the name — a state, an explanation. */
  sub?: ReactNode;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** The rule under the line; the last line of a receipt drops it. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const body = (pressed: boolean) => (
    <>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.copy}>
        <View style={styles.line}>
          <ThemedText style={[styles.name, pressed && { color: theme.stickerInk }]}>
            {name}
          </ThemedText>
          <DottedRule color={theme.backgroundSelected} style={styles.leader} />
          {value ? (
            <ThemedText type="data" style={[styles.value, pressed && { color: theme.stickerInk }]}>
              {value}
            </ThemedText>
          ) : null}
        </View>
        {sub}
      </View>
      {trailing}
      {/* Held, the row is a sticker colour in both schemes: its ink is sticker ink. */}
      {onPress ? (
        <DoodleIcon
          name="chevronRight"
          size={20}
          color={pressed ? theme.stickerInk : theme.textSecondary}
        />
      ) : null}
    </>
  );
  const rowStyle = [
    styles.row,
    divider && { borderBottomWidth: 1, borderBottomColor: theme.ruleLine },
    style,
  ];

  if (!onPress) return <View style={rowStyle}>{body(false)}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: theme.pink }]}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Sizes.touchMin + 4,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  icon: { width: 28, alignItems: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  name: { flexShrink: 1 },
  leader: { transform: [{ translateY: 6 }] },
  // `textAlign` too: a value longer than a line of its own wraps there, and
  // on Android its box then spans the line, leaving `marginLeft: 'auto'` no
  // room to push it right.
  value: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
});
