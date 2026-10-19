import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type AccessibilityRole } from 'react-native';

import { DoodleIcon, type DoodleIconName } from '@/shared/ui/doodle-icon';
import { DottedRule, PaperPiece } from '@/shared/ui/paper';
import { Shadows, Sizes, Spacing, useTheme, type ThemeColor } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type RowIconName = keyof typeof Ionicons.glyphMap;

/**
 * The rows' icons drawn in the journal's own hand where the canvas has one;
 * the rest stay the vector glyph, in ink.
 */
const DoodleFor: Partial<Record<RowIconName, DoodleIconName>> = {
  'ticket-outline': 'coin',
  'notifications-outline': 'bell',
  'contrast-outline': 'moon',
  'scan-outline': 'eye',
  'images-outline': 'picture',
  'heart-outline': 'heart',
  'link-outline': 'link',
};

/**
 * One settings line on the receipt (the design system's `jj-row`): an icon in
 * ink, the title, and — on the 나 root's summary rows — a dotted leader to the
 * read-out in receipt figures. A read-out with no room beside its title (large
 * system text on a narrow phone) moves whole to its own line under it.
 * Detail rows keep the read-out as a second line under the title, so a
 * blocked-permission explanation is never cut mid-sentence. With `onPress` it
 * is a navigation line (pink while pressed, everything on it in sticker ink,
 * since pink keeps its value at night) that a screen reader hears with its
 * read-out — "크레딧, 400 크레딧", the state the line exists to show; without,
 * a static line whose `right` node (a switch, a button) carries the
 * interaction.
 */
export function SettingRow({
  icon,
  title,
  sub,
  subColor = 'textSecondary',
  subLines,
  right,
  chevron,
  emphasized,
  onPress,
  accessibilityRole = 'button',
  accessibilityLabel,
}: {
  icon?: RowIconName;
  title: string;
  sub?: string;
  subColor?: ThemeColor;
  /**
   * The 나 root's summary rows pass 1: the read-out is one receipt figure at
   * the end of the title's line, or alone on the next line when it does not
   * fit there. Detail rows leave it unset — the read-out is a second line
   * under the title, so a blocked-permission explanation is never cut
   * mid-sentence.
   */
  subLines?: number;
  right?: React.ReactNode;
  /** The chevron at the end of a line that opens somewhere, after `right`. */
  chevron?: boolean;
  /** The title in bold ink — an act on the account, which is not red. */
  emphasized?: boolean;
  onPress?: () => void;
  /** `link` for a line that opens a page outside the app. */
  accessibilityRole?: Extract<AccessibilityRole, 'button' | 'link'>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const summary = subLines === 1;
  const content = (pressed: boolean) => (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          {DoodleFor[icon] ? (
            <DoodleIcon
              name={DoodleFor[icon]}
              size={22}
              color={pressed ? theme.stickerInk : theme.text}
            />
          ) : (
            <Ionicons color={pressed ? theme.stickerInk : theme.text} name={icon} size={20} />
          )}
        </View>
      ) : null}
      <View style={styles.rowCopy}>
        <View style={[styles.line, summary && styles.summaryLine]}>
          <ThemedText
            type={emphasized ? 'button' : 'default'}
            style={pressed ? { color: theme.stickerInk } : undefined}
          >
            {title}
          </ThemedText>
          {summary ? (
            <>
              <DottedRule color={theme.backgroundSelected} style={styles.leader} />
              {sub ? (
                // Not clamped: clamped beside the title, Android cut a read-out
                // mid-word with no ellipsis (`자동 저`, `연결된 계정 없` at 1.3×
                // on a 360dp phone). Wrapping moves it down instead.
                <ThemedText
                  type="data"
                  style={[styles.value, pressed && { color: theme.stickerInk }]}
                >
                  {sub}
                </ThemedText>
              ) : null}
            </>
          ) : null}
        </View>
        {sub && !summary ? (
          <ThemedText
            type="small"
            themeColor={subColor === 'danger' ? 'cherryInk' : subColor}
            style={pressed && { color: theme.stickerInk }}
          >
            {sub}
          </ThemedText>
        ) : null}
      </View>
      {right}
      {chevron ? (
        <DoodleIcon
          name="chevronRight"
          size={20}
          color={pressed ? theme.stickerInk : theme.textSecondary}
        />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? (sub ? `${title}, ${sub}` : title)}
        onPress={onPress}
        style={({ pressed }) => [styles.settingRow, pressed && { backgroundColor: theme.pink }]}
      >
        {({ pressed }) => content(pressed)}
      </Pressable>
    );
  }
  return <View style={styles.settingRow}>{content(false)}</View>;
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
  summaryLine: { flexWrap: 'wrap' },
  value: { flexShrink: 1, marginLeft: 'auto' },
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
