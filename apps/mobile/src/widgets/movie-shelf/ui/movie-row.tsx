import { Pressable, StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { tiltFor } from '@/shared/ui/paper';
import { Polaroid } from '@/shared/ui/polaroid';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { MovieSummary } from '../model/use-movie-shelf';
import { MovieFailureNotice } from './movie-failure-notice';
import { MovieStatusBadge, MovieStatusLabels } from './movie-status-badge';

export type MovieRowProps = {
  movie: MovieSummary;
  onPress: (movieId: string) => void;
};

const ThumbWidth = 52;
/** The progress strip's notches — one per tenth of the run. */
const ProgressSegments = 10;

/**
 * One movie on the studio board, as a line of a receipt: its first cut as a
 * small instant photo, its title, a status tag, a data line, and — while it
 * is being made — a strip of lavender notches. A line rather than a grid
 * tile, because the board is a to-do list — what it has to convey is state,
 * not cover art.
 */
export function MovieRow({ movie, onPress }: MovieRowProps) {
  const theme = useTheme();
  const filledSegments =
    movie.progress === undefined ? 0 : Math.round(movie.progress * ProgressSegments);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        movie.title,
        MovieStatusLabels[movie.status],
        `컷 ${movie.snapCount}`,
        movie.progress === undefined ? undefined : `${Math.round(movie.progress * 100)}%`,
        movie.expiryCountdown,
      ]
        .filter(Boolean)
        .join(' · ')}
      onPress={() => onPress(movie.id)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.ruleLine, backgroundColor: pressed ? theme.pink : undefined },
      ]}
    >
      <Polaroid
        uri={movie.coverUris[0]}
        tilt={tiltFor(movie.id, 2)}
        foot={12}
        style={styles.thumb}
      />

      <View style={styles.info}>
        <View style={styles.titleLine}>
          <ThemedText type="default" style={styles.title} numberOfLines={1}>
            {movie.title}
          </ThemedText>
          <MovieStatusBadge status={movie.status} />
        </View>
        <ThemedText type="data" numberOfLines={1}>
          컷 {movie.snapCount} · {formatSeconds(movie.totalSec)} · {movie.dateLabel}
        </ThemedText>
        {movie.expiryCountdown ? (
          <ThemedText type="dataSm" themeColor="cherryInk">
            {movie.expiryCountdown}
          </ThemedText>
        ) : null}
        {movie.progress !== undefined ? (
          // A job in flight is the one thing the board exists to show, so the
          // line carries its own strip rather than only a status word.
          <View style={styles.progress}>
            {Array.from({ length: ProgressSegments }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.segment,
                  {
                    borderColor: theme.ai,
                    backgroundColor: index < filledSegments ? theme.ai : undefined,
                  },
                ]}
              />
            ))}
            <ThemedText type="dataSm" style={styles.percent}>
              {Math.round(movie.progress * 100)}%
            </ThemedText>
          </View>
        ) : null}
        {movie.status === 'failed' ? (
          <MovieFailureNotice movieId={movie.id} error={movie.error} snapCount={movie.snapCount} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 84,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: 1,
  },
  thumb: { width: ThumbWidth },
  info: { flex: 1, minWidth: 0, gap: Spacing.one },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flexShrink: 1, fontWeight: 700 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segment: { width: 14, height: 9, borderWidth: 1.5 },
  percent: { marginLeft: Spacing.one },
});
