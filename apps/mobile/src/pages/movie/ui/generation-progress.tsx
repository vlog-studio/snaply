import { StyleSheet, View } from 'react-native';

import { movieJobRatio, movieStyleLabel, type Movie } from '@/entities/movie';
import { editStepLabel } from '@/features/compose-movie';
import { PaperPiece, Tape } from '@/shared/ui/paper';
import { Reel } from '@/shared/ui/reel';
import { Fonts, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type GenerationProgressProps = {
  /** A movie a job owns; the page mounts this only while one does. */
  movie: Movie;
};

/**
 * The progress the user came back to see — how far the run is and what it is
 * doing — in the stage where the player otherwise sits, written as an order
 * slip taped to the page (the design system's receipt): the percentage in big
 * receipt figures beside a turning reel, the stage underneath, and what was
 * ordered at the foot. Leaving is expected and safe: the job belongs to the
 * movie, not to this screen (`MovieGenerationGate`), so the slip picks up where
 * it left off on the way back.
 *
 * **Both numbers are the backend's** (2026-08-07). The percentage is the one the
 * pipeline last published and the line under it is the stage it named — worded
 * by the app (`editStepLabel`), never the worker's raw log line (2026-09-24).
 * There is no local checklist: a list of steps paced here would eventually show
 * the wrong stage confidently, so the slip names only the one the backend did.
 *
 * Milestones are coarse (six over a whole run), so the figure holds still for
 * stretches. That is honest: nothing here knows how far into a stage the render
 * is, and interpolating would be inventing progress.
 */
export function GenerationProgress({ movie }: GenerationProgressProps) {
  const theme = useTheme();
  const isRunning = movie.status === 'generating' && movie.job !== undefined;
  if (!isRunning || !movie.job) return null;

  const percent = Math.round(movieJobRatio(movie.job) * 100);

  return (
    <View style={styles.slip}>
      <Tape color="tapeMint" width={40} height={14} tilt={-35} style={styles.tapeLeft} />
      <Tape color="tapePink" width={40} height={14} tilt={35} style={styles.tapeRight} />
      <PaperPiece edge="tornBottom" tilt={-0.8} style={styles.receipt}>
        <View style={[styles.head, { borderBottomColor: theme.receiptBlue }]}>
          <ThemedText
            type="eyebrow"
            importantForAccessibility="no"
            style={[styles.centerText, { color: theme.receiptBlue }]}
          >
            ORDER · 주문서
          </ThemedText>
        </View>
        <View style={styles.figureRow}>
          <Reel color={theme.ai} size={28} />
          <ThemedText
            accessibilityLabel={`만드는 중 ${percent}%`}
            accessibilityLiveRegion="polite"
            style={[styles.percent, { color: theme.text }]}
          >
            {percent}%
          </ThemedText>
        </View>
        <ThemedText type="barTitle" themeColor="ai">
          만드는 중…
        </ThemedText>
        <View style={styles.stepLine}>
          <ThemedText type="data" style={{ color: theme.text, fontWeight: 700 }}>
            {editStepLabel(movie.job.step)}
          </ThemedText>
          <ThemedText type="data" importantForAccessibility="no" style={{ color: theme.text }}>
            …
          </ThemedText>
        </View>
        <View style={[styles.foot, { borderTopColor: theme.receiptBlue }]}>
          <ThemedText type="dataSm" themeColor="textSecondary" style={styles.centerText}>
            컷 {movie.snapRefs.length} · {movieStyleLabel(movie.style)}
          </ThemedText>
        </View>
      </PaperPiece>
    </View>
  );
}

const styles = StyleSheet.create({
  slip: { width: 236, alignSelf: 'center' },
  tapeLeft: { position: 'absolute', top: -2, left: -14, zIndex: 2 },
  tapeRight: { position: 'absolute', top: -2, right: -14, zIndex: 2 },
  receipt: {
    paddingTop: Spacing.three + Spacing.half,
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  head: { borderBottomWidth: 1.5, paddingBottom: Spacing.one + Spacing.half },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  // The one big figure on the slip, in receipt type.
  percent: {
    fontFamily: Fonts.mono,
    fontWeight: 700,
    fontSize: 30,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  stepLine: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  foot: { borderTopWidth: 1.5, marginTop: Spacing.one, paddingTop: Spacing.two },
  centerText: { textAlign: 'center' },
});
