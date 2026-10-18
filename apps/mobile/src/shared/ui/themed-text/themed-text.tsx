import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor, Typography, useTheme } from '@/shared/ui/theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'heading'
    | 'xsmall'
    | 'small'
    | 'smallBold'
    | 'bodySm'
    | 'barTitle'
    | 'data'
    | 'dataSm'
    | 'subtitle'
    | 'eyebrow'
    | 'edge'
    | 'note'
    | 'button'
    | 'link'
    | 'linkPrimary';
  themeColor?: ThemeColor;
};

export function ThemedText({
  selectable = true,
  style,
  type = 'default',
  themeColor,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      selectable={selectable}
      style={[
        styles.base,
        { color: theme.text },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'heading' && styles.heading,
        type === 'xsmall' && styles.xsmall,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'bodySm' && styles.bodySm,
        type === 'barTitle' && styles.barTitle,
        type === 'data' && styles.data,
        type === 'dataSm' && styles.dataSm,
        type === 'subtitle' && styles.subtitle,
        type === 'eyebrow' && styles.eyebrow,
        type === 'edge' && styles.edge,
        type === 'note' && styles.note,
        type === 'button' && styles.button,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        themeColor && { color: theme[themeColor] },
        style,
      ]}
      {...rest}
    />
  );
}

// Each variant is a step of `Typography` plus the things that make it a role —
// family, weight, letter spacing, casing. No variant writes a size or a leading
// of its own: those belong to the scale, and a role that needs different ones
// needs a new step there instead. Three families, each with one job (root
// docs/plans/junk-journal-redesign.md §2): sans for body and controls, mono
// (D2Coding) for data, hand (Gaegu) for titles. Only 400 and 700 exist.
const styles = StyleSheet.create({
  // Pretendard GOV under every role, so a variant declares a family only to
  // leave it. Callers' `style` still lands after this, and after the variant.
  base: { fontFamily: Fonts.sans },
  xsmall: { ...Typography.xsmall, fontWeight: 700 },
  small: { ...Typography.small, fontWeight: 400 },
  smallBold: { ...Typography.small, fontWeight: 700 },
  // The body of sheets, notices and confirmations (decision 7).
  bodySm: { ...Typography.bodySm, fontWeight: 400 },
  default: { ...Typography.body, fontWeight: 400 },
  // A pushed screen's header title. A screen name is not a handwritten title.
  barTitle: { ...Typography.barTitle, fontWeight: 700 },
  // Handwriting is for titles only — a section, a sheet, an empty state, an
  // error — and never below 22px (decision 5). Text that is not a title takes a
  // sans role even when it is large.
  heading: { ...Typography.heading, fontFamily: Fonts.hand, fontWeight: 700 },
  subtitle: { ...Typography.subtitle, fontFamily: Fonts.hand, fontWeight: 700 },
  title: { ...Typography.title, fontFamily: Fonts.hand, fontWeight: 700 },
  // The receipt voice: a value, a count, a duration, a meta line. D2Coding
  // carries Hangul, so a data line may mix Korean and digits in one face.
  data: { ...Typography.data, fontFamily: Fonts.mono, fontWeight: 400 },
  dataSm: { ...Typography.xsmall, fontFamily: Fonts.mono, fontWeight: 400 },
  // A printed header strip (`GUEST CHECK`) — data, set in capitals.
  eyebrow: {
    ...Typography.xsmall,
    fontFamily: Fonts.mono,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // A stamped mark — `REC`, a ticking `12s`, a bare count. The same face as
  // `eyebrow`; `uppercase` only touches Latin.
  edge: {
    ...Typography.xsmall,
    fontFamily: Fonts.mono,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // A small state, count or duration that names a unit ("스냅 3개", "7.8초").
  // It is data, so it is mono.
  note: { ...Typography.xsmall, fontFamily: Fonts.mono, fontWeight: 400 },
  button: { ...Typography.body, fontWeight: 700 },
  // A text button is ink, not red — red is the main action (cherry). The pink
  // highlighter under it is the text-button component's, not the role's.
  link: { ...Typography.small, fontWeight: 700 },
  linkPrimary: { ...Typography.small, fontWeight: 700 },
});
