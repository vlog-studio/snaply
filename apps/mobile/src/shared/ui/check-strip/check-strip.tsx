import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PaperPiece } from '@/shared/ui/paper';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * A strip torn off a guest check (the design system's `jj-check-strip`): a
 * head line ruled in receipt blue — the printed `GUEST CHECK` brand and a
 * figure, or a caption alone — over rows of figures. For a count, a total, a
 * list of what something touches: numbers on paper, not a card.
 */
export function CheckStrip({
  brand = false,
  head,
  children,
  tilt = -0.5,
  style,
}: {
  /** Prints `GUEST CHECK` at the left of the head line. */
  brand?: boolean;
  /** The head line's figure (a date) or caption. */
  head?: string;
  children?: ReactNode;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <PaperPiece edge="tornBottom" tilt={tilt} style={[styles.strip, style]}>
      <View style={[styles.head, { borderBottomColor: theme.receiptBlue }]}>
        {brand ? (
          <ThemedText
            type="eyebrow"
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ color: theme.receiptBlue }}
          >
            GUEST CHECK
          </ThemedText>
        ) : null}
        {head ? <ThemedText type="dataSm">{head}</ThemedText> : null}
      </View>
      {children}
    </PaperPiece>
  );
}

/** One line of a check strip: what, then its figure at the right. */
export function CheckStripRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  strip: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingBottom: Spacing.three,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottomWidth: 1.5,
    paddingBottom: 2,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.three,
  },
});
