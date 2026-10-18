import { StyleSheet, View } from 'react-native';

import type { MovieStatus } from '@/entities/movie';
import { Colors, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export const MovieStatusLabels: Record<MovieStatus, string> = {
  draft: '초안',
  generating: '만드는 중',
  ready: '완성',
  failed: '실패',
};

export type MovieStatusBadgeProps = {
  status: MovieStatus;
};

/**
 * Where a movie stands, as a tag (the design system's `jj-tag`): a square of
 * sticker colour with dark ink — 초안 sheet, 만드는 중 sky, 완성 mint — and the
 * one failure in cherry with white. Shared by the board row and the grid tile
 * so a status reads as the same word and colour wherever a movie is drawn.
 * Sticker colours keep their value at night, so the ink does too.
 */
export function MovieStatusBadge({ status }: MovieStatusBadgeProps) {
  const theme = useTheme();
  const { fill, ink } =
    status === 'failed'
      ? { fill: theme.primary, ink: theme.onPrimary }
      : status === 'generating'
        ? { fill: theme.sky, ink: theme.stickerInk }
        : status === 'ready'
          ? { fill: theme.mint, ink: theme.stickerInk }
          : { fill: Colors.light.backgroundElement, ink: theme.stickerInk };

  return (
    <View style={[styles.tag, { backgroundColor: fill, borderColor: theme.border }]}>
      <ThemedText selectable={false} type="xsmall" style={{ color: ink }}>
        {MovieStatusLabels[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
});
