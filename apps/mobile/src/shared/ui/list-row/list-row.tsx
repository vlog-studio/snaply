import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * A line of a receipt (the design system's `jj-row`): an icon, a name, a
 * dotted leader to the value in receipt figures, and a chevron when the line
 * opens somewhere. Pressed, the line is highlighted pink. A row that carries a
 * control of its own (a toggle) passes it as `trailing` and no `onPress`.
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
          <ThemedText style={pressed ? { color: theme.stickerInk } : undefined}>{name}</ThemedText>
          <View style={[styles.leader, { borderColor: theme.backgroundSelected }]} />
          {value ? (
            <ThemedText type="data" style={pressed ? { color: theme.stickerInk } : undefined}>
              {value}
            </ThemedText>
          ) : null}
        </View>
        {sub}
      </View>
      {trailing}
      {onPress ? <DoodleIcon name="chevronRight" size={20} color={theme.textSecondary} /> : null}
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
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  leader: {
    flex: 1,
    minWidth: 12,
    borderBottomWidth: 2,
    borderStyle: 'dotted',
    transform: [{ translateY: 4 }],
  },
});
