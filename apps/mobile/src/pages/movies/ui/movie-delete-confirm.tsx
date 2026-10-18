import { StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { CheckStrip, CheckStripRow } from '@/shared/ui/check-strip';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import type { MovieSummary } from '@/widgets/movie-shelf';

export type MovieDeleteConfirmProps = {
  /** The movies the step talks about — the grid's current selection. */
  movies: MovieSummary[];
  onCancel: () => void;
  onConfirm: () => void;
};

/** How many of the selection are named before the rest fold into "외 N편". */
const NamedLimit = 3;

/**
 * Confirms deleting the selected movies, and says what stays. Content only,
 * drawn inside the sheet the movie grid opens over its selection.
 *
 * The reverse of the snap sheet: deleting a snap destroys the one thing every
 * movie built on it needs, so that sheet lists the damage — but a movie is only
 * a composition over snaps it never owned, so this step's job is reassurance,
 * naming what it takes and promising the originals survive. The one real loss
 * worth a warning of its own is a job in flight, which dies with the movie
 * that carries it.
 */
export function MovieDeleteConfirm({ movies, onCancel, onConfirm }: MovieDeleteConfirmProps) {
  const named = movies.slice(0, NamedLimit);
  const restCount = movies.length - named.length;
  const generatingCount = movies.filter((movie) => movie.status === 'generating').length;

  const confirmLabel = movies.length === 1 ? `${movies[0].title} 삭제` : `${movies.length}편 삭제`;

  return (
    <View style={styles.step}>
      <ThemedText type="subtitle" accessibilityRole="header">
        {movies.length === 1 ? '이 무비를 삭제할까요?' : `무비 ${movies.length}편을 삭제할까요?`}
      </ThemedText>

      <CheckStrip>
        {named.map((movie) => (
          <CheckStripRow key={movie.id}>
            <ThemedText type="bodySm" numberOfLines={1} style={styles.title}>
              {movie.title}
            </ThemedText>
            <ThemedText type="data">
              컷 {movie.snapCount} · {formatSeconds(movie.totalSec)}
            </ThemedText>
          </CheckStripRow>
        ))}
        {restCount > 0 ? (
          <CheckStripRow>
            <ThemedText type="data">외 {restCount}편</ThemedText>
          </CheckStripRow>
        ) : null}
      </CheckStrip>

      <ThemedText type="bodySm" themeColor="textSecondary">
        컷 구성과 완성된 무비가 함께 사라져요. 스냅은 그대로 남아요.
      </ThemedText>

      {generatingCount > 0 ? (
        <ThemedText type="small" themeColor="cherryInk">
          만드는 중인 무비도 함께 사라져요.
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <SnaplyButton
          variant="secondary"
          title="취소"
          accessibilityLabel="삭제 취소"
          onPress={onCancel}
          style={styles.action}
        />
        <SnaplyButton
          variant="danger"
          title="삭제"
          accessibilityLabel={confirmLabel}
          onPress={onConfirm}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: Spacing.three },
  title: { flex: 1, minWidth: 0, fontWeight: 700 },
  actions: { flexDirection: 'row', gap: Spacing.two + Spacing.half, marginTop: Spacing.one },
  action: { flex: 1 },
});
