import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { ImageFrame } from '@/shared/ui/image-frame';
import { CheckMark } from '@/shared/ui/choice-mark';
import { Tape, tiltFor } from '@/shared/ui/paper';
import { Polaroid } from '@/shared/ui/polaroid';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { MovieSummary } from '../model/use-movie-shelf';
import { MovieFailureNotice } from './movie-failure-notice';
import { MovieStatusBadge, MovieStatusLabels } from './movie-status-badge';

export type MovieTileProps = {
  movie: MovieSummary;
  /** Tile width in points; the square cover takes the same value for height. */
  width: number;
  onPress: (movieId: string) => void;
  /** A long press starts acting on the movie; absent, a long press does nothing. */
  onLongPress?: (movie: MovieSummary) => void;
  /** Whether the grid is in selection mode — a tap selects instead of opens. */
  selecting?: boolean;
  /** Whether this movie is selected. Read only while `selecting`. */
  selected?: boolean;
};

/**
 * One movie in the movie tab's grid: an instant print of its cover — the
 * status tag on the picture, the length on the print's foot — and the title
 * beneath.
 *
 * The cover is the render's own thumbnail once a run has produced one — the
 * grid is cover art, and a finished movie's cover should be the movie rather
 * than the first thing that went into it. Everything else (a draft, a failed
 * run, a render made before covers were kept, a cover the OS has reclaimed)
 * draws the first cut's frame, which is why the fallback is a state rather than
 * a condition: a local file can vanish under the app, and only the load
 * failing says so.
 *
 * In selection mode a check mark joins the cover — opposite corner from the
 * status tag, so the two never collide — and a selected print takes a cherry
 * edge and a strip of pink tape, the same vocabulary as the snap grid's prints.
 */
export function MovieTile({
  movie,
  width,
  onPress,
  onLongPress,
  selecting = false,
  selected = false,
}: MovieTileProps) {
  const theme = useTheme();
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const coverImage = coverImageFailed ? undefined : movie.coverImageUri;
  const cover = movie.coverUris[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selecting ? { selected } : undefined}
      accessibilityLabel={`${movie.title} · ${MovieStatusLabels[movie.status]} · ${formatSeconds(movie.totalSec)}${movie.expiryCountdown ? ` · ${movie.expiryCountdown}` : ''}`}
      accessibilityHint={
        selecting
          ? '탭하면 선택하거나 해제해요'
          : onLongPress
            ? '탭하면 열고, 길게 누르면 선택돼요'
            : undefined
      }
      onPress={() => onPress(movie.id)}
      onLongPress={onLongPress ? () => onLongPress(movie) : undefined}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }, styles.tile]}
    >
      <Polaroid
        uri={cover}
        picture={
          coverImage ? (
            <ImageFrame uri={coverImage} onError={() => setCoverImageFailed(true)} />
          ) : undefined
        }
        border={5}
        foot={22}
        tilt={tiltFor(movie.id, 2)}
        style={[styles.print, selected && { borderColor: theme.primary, borderWidth: 2 }]}
        footer={
          <ThemedText
            selectable={false}
            type="dataSm"
            // The print's foot is a fixed strip of the picture: past 1.25× the
            // length's line is taller than it and was cut at the bottom.
            maxFontSizeMultiplier={1.25}
            style={{ color: theme.text }}
          >
            {formatSeconds(movie.totalSec)}
          </ThemedText>
        }
        overlay={
          <>
            <View style={styles.badge}>
              <MovieStatusBadge status={movie.status} />
            </View>
            {movie.progress !== undefined ? (
              <View style={[styles.track, { backgroundColor: 'rgba(14,11,8,0.55)' }]}>
                <View
                  style={[
                    styles.fill,
                    { backgroundColor: theme.ai, width: `${Math.round(movie.progress * 100)}%` },
                  ]}
                />
              </View>
            ) : null}
          </>
        }
      >
        {selected ? (
          <Tape color="tapePink" width={30} height={12} tilt={35} style={styles.pickTape} />
        ) : null}
        {selecting ? (
          <View style={styles.check}>
            <CheckMark checked={selected} />
          </View>
        ) : null}
      </Polaroid>
      <ThemedText type="bodySm" numberOfLines={1} style={styles.title}>
        {movie.title}
      </ThemedText>
      <View style={styles.dataLine}>
        <ThemedText type="dataSm" numberOfLines={1} style={styles.facts}>
          {`${movie.dateLabel} · 컷 ${movie.snapCount}`}
        </ThemedText>
        {movie.expiryCountdown ? (
          // Its own text beside the run that gives way, never the run's tail:
          // a date older than yesterday carries its year, and in a two-column
          // cell the ellipsis took the countdown first — for a user with
          // notifications off the card's only warning (MOV-16 ②). One line
          // still, so the tile keeps its neighbours' height.
          <ThemedText type="dataSm" themeColor="cherryInk" style={styles.countdown}>
            {` · ${movie.expiryCountdown}`}
          </ThemedText>
        ) : null}
      </View>
      {movie.status === 'failed' ? (
        <MovieFailureNotice
          movieId={movie.id}
          error={movie.error}
          snapCount={movie.snapCount}
          variant="tile"
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: Spacing.half },
  print: { marginBottom: Spacing.one + Spacing.half },
  title: { fontWeight: 700 },
  // Both texts take the data step's one leading, so they share a baseline.
  dataLine: { flexDirection: 'row' },
  facts: { flexShrink: 1 },
  countdown: { fontWeight: 700 },
  badge: {
    position: 'absolute',
    top: Spacing.one + Spacing.half,
    left: Spacing.one + Spacing.half,
  },
  pickTape: { position: 'absolute', top: -6, right: -10, zIndex: 2 },
  check: { position: 'absolute', top: Spacing.two, right: Spacing.two },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6 },
  fill: { height: '100%' },
});
