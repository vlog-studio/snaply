import { StyleSheet, View } from 'react-native';

import { isAiArranged, type Movie } from '@/entities/movie';
import { formatDateTime, formatSeconds } from '@/shared/lib/datetime';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { ListRow } from '@/shared/ui/list-row';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { Toggle } from '@/shared/ui/toggle';

export type DetailSheetProps = {
  visible: boolean;
  movie: Movie;
  /** How long the cut list plays — what the target length reports. */
  totalSec: number;
  /** False while a job owns the movie; the settings become a read-out. */
  canEdit: boolean;
  onChangeArranger: (locked: boolean) => void;
  onClose: () => void;
};

/**
 * Everything about the movie that is not a cut and not the look: who owns the
 * cut order, and the read-outs — 비율, 목표 길이, and, once there is a render,
 * when it was finished.
 *
 * **자동 자막 is not offered (2026-08-07)** and **배경 음악 is not offered
 * (2026-08-13)**, for one reason: `POST /edit-jobs` takes neither a subtitle
 * switch this build can send nor a track id at all — the pipeline picks the
 * music from the style preset. A control that cannot reach the run decides
 * nothing, and a picker whose result the finished movie contradicts is worse
 * than no picker. `Movie.captions` and `Movie.bgm` are still stored (movies
 * carry them, and a real per-movie choice would land back on them) but nothing
 * reads them, so both are gone rather than shown as settings the user cannot
 * act on. The look is still chosen — and since the preset picks the track, the
 * 스타일 sheet is where the music is decided today.
 *
 * Every control writes straight through — nothing here is staged, so the sheet
 * can be opened, flipped, and dismissed without a save step.
 *
 * 순서 고정 lives here rather than beside the timeline because it is a rule
 * about the *next generation*, not about a cut: whether the run may re-arrange
 * what the strip shows. Rearranging a cut by hand already turns the lock on;
 * the switch exists so the order can be handed back.
 */
export function DetailSheet({
  visible,
  movie,
  totalSec,
  canEdit,
  onChangeArranger,
  onClose,
}: DetailSheetProps) {
  const isLocked = !isAiArranged(movie);

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="세부 설정">
      <View style={styles.sheet}>
        <ThemedText type="subtitle" accessibilityRole="header">
          세부
        </ThemedText>

        {/* Receipt lines: a name, a dotted leader, the figure. */}
        <View>
          <ListRow
            name="순서 고정"
            // A read-out of which order wins, not an explanation of the
            // switch: the two states differ in outcome, and the outcome is the
            // only part the user cannot see from the toggle itself.
            sub={<ThemedText type="data">{isLocked ? '지금 순서' : '찍은 시각 순'}</ThemedText>}
            trailing={
              <Toggle
                accessibilityLabel="컷 순서 고정"
                disabled={!canEdit}
                value={isLocked}
                onValueChange={onChangeArranger}
              />
            }
          />
          <ListRow name="비율" value={movie.ratio} />
          {/* When the movie was last finished. It reads out here rather than on
              the screen, where a whole row under the title bought one date. */}
          <ListRow
            name="전체 길이"
            value={`컷 합계 (${formatSeconds(totalSec)})`}
            divider={movie.render !== undefined}
          />
          {movie.render ? (
            <ListRow name="완성" value={formatDateTime(movie.render.renderedAt)} divider={false} />
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.three },
});
