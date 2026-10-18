import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type AccessibilityRole } from 'react-native';

import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { DottedRule, PaperPiece } from '@/shared/ui/paper';
import { Shadows, Sizes, Spacing, useTheme, type ThemeColor } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type RowIconName = keyof typeof Ionicons.glyphMap;

/**
 * One settings line on the receipt (the design system's `jj-row`): an icon in
 * ink, the title, and — on the 나 root's summary rows, which clamp their
 * read-out to one line — a dotted leader to the read-out in receipt figures.
 * Detail rows keep the read-out as a second line under the title, so a
 * blocked-permission explanation is never cut mid-sentence. With `onPress` it
 * is a navigation line (pink while pressed); without, a static line whose
 * `right` node (a switch, a button) carries the interaction.
 */
export function SettingRow({
  icon,
  title,
  sub,
  subColor = 'textSecondary',
  subLines,
  right,
  onPress,
  accessibilityLabel,
}: {
  icon?: RowIconName;
  title: string;
  sub?: string;
  subColor?: ThemeColor;
  /**
   * Clamp for the read-out. The 나 root's summary rows pass 1 — a summary that
   * wraps is a summary that failed — and draw it as a receipt figure at the
   * end of the line; detail rows leave it unset so a blocked-permission
   * explanation is never cut mid-sentence.
   */
  subLines?: number;
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const summary = subLines === 1;
  const content = (pressed: boolean) => (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons color={pressed ? theme.stickerInk : theme.text} name={icon} size={20} />
        </View>
      ) : null}
      <View style={styles.rowCopy}>
        <View style={styles.line}>
          <ThemedText style={pressed ? { color: theme.stickerInk } : undefined}>{title}</ThemedText>
          {summary ? (
            <>
              <DottedRule color={theme.backgroundSelected} style={styles.leader} />
              {sub ? (
                <ThemedText
                  type="data"
                  numberOfLines={1}
                  style={[styles.value, pressed && { color: theme.stickerInk }]}
                >
                  {sub}
                </ThemedText>
              ) : null}
            </>
          ) : null}
        </View>
        {sub && !summary ? (
          <ThemedText type="small" themeColor={subColor === 'danger' ? 'cherryInk' : subColor}>
            {sub}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        style={({ pressed }) => [styles.settingRow, pressed && { backgroundColor: theme.pink }]}
      >
        {({ pressed }) => content(pressed)}
      </Pressable>
    );
  }
  return <View style={styles.settingRow}>{content(false)}</View>;
}

/** The chevron at the end of a line that opens somewhere. */
export function RowChevron() {
  const theme = useTheme();
  return <DoodleIcon name="chevronRight" size={20} color={theme.textSecondary} />;
}

/** The rule between two lines of one receipt. */
export function RowDivider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.ruleLine }} />;
}

/**
 * A group of settings lines as one receipt slip torn at the foot, its title —
 * when it has one — printed in the receipt's head in receipt blue.
 */
export function SettingsSection({ children, title }: React.PropsWithChildren<{ title?: string }>) {
  const theme = useTheme();

  return (
    <PaperPiece edge="tornBottom" tilt={-0.4} style={styles.section}>
      {title ? (
        <View style={[styles.sectionHead, { borderBottomColor: theme.receiptBlue }]}>
          <ThemedText type="eyebrow" style={{ color: theme.receiptBlue }}>
            {title}
          </ThemedText>
        </View>
      ) : null}
      {children}
    </PaperPiece>
  );
}

/**
 * One selectable option of a radio or checkbox group, so selection reads the
 * same way everywhere on the 나 screens — the theme-mode radio and the
 * interest checkboxes draw from it, and the reminder frequency should too
 * when it comes back from 준비 중. A tab of sheet paper; chosen, it is cherry
 * with white, pressed into the page.
 */
export function OptionPill({
  label,
  selected,
  onPress,
  role = 'radio',
  accessibilityLabel,
  flex,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: Extract<AccessibilityRole, 'radio' | 'checkbox'>;
  accessibilityLabel?: string;
  flex?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionPill,
        flex && styles.optionPillFlex,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          boxShadow: (selected || pressed ? Shadows.pressed : Shadows.paper)(theme.shadowInk),
        },
      ]}
    >
      <ThemedText
        selectable={false}
        type="smallBold"
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  settingRow: {
    minHeight: Sizes.touchMin + 4,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowIcon: { width: 28, alignItems: 'center' },
  rowCopy: { flex: 1, minWidth: 0, gap: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  leader: { transform: [{ translateY: 6 }] },
  value: { flexShrink: 1, maxWidth: '60%' },
  section: {
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
  },
  sectionHead: {
    borderBottomWidth: 1.5,
    paddingBottom: Spacing.one + Spacing.half,
    marginBottom: Spacing.one,
    alignItems: 'center',
  },
  optionPill: {
    minHeight: Sizes.touchMin,
    minWidth: 56,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionPillFlex: { flex: 1 },
});
