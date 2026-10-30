import { StyleSheet, View } from 'react-native';

import {
  MovieDecorationOptions,
  MovieEditingOptions,
  movieDecorations,
  movieEditing,
  type Movie,
  type MovieStylePatch,
} from '@/entities/movie';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { ListRow } from '@/shared/ui/list-row';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { Toggle } from '@/shared/ui/toggle';

export type DecorationSheetProps = {
  visible: boolean;
  movie: Movie;
  /** False while a job owns the movie; the switches become a read-out. */
  canEdit: boolean;
  onChange: (patch: MovieStylePatch) => void;
  onClose: () => void;
};

/**
 * 글자 · 이모지 · 얼굴 스티커, each switched on or off for the next run (root
 * docs/specs/movie.md MOV-27, backlog A-22).
 *
 * A sheet of its own rather than rows under the recipe list: the recipe sheet is
 * fifteen rows long, and switches below it would sit off screen on a phone. Each
 * switch writes straight through like 순서 고정; nothing is staged.
 *
 * Under them sit the editing choices (MOV-29) — 말소리 and 장면 순서 — which
 * start off and, unlike the decorations, stay when the recipe changes. 장면
 * 순서 only acts on a movie whose order is the AI's; the server leaves a
 * locked order alone.
 *
 * The foot says the two things the switches cannot show. Picking another recipe
 * puts them back to that recipe's defaults (the server's rule, mirrored in the
 * store). And on a finished movie nothing changes until it is made again — the
 * paid run `RemakeConfirm` asks about — while the cuts, their order and the
 * music stay as they are.
 */
export function DecorationSheet({
  visible,
  movie,
  canEdit,
  onChange,
  onClose,
}: DecorationSheetProps) {
  const current = movieDecorations(movie);
  const editing = movieEditing(movie);

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="꾸밈 설정">
      <View style={styles.sheet}>
        <ThemedText type="subtitle" accessibilityRole="header">
          꾸밈
        </ThemedText>
        <View>
          {MovieDecorationOptions.map((option, index) => (
            <ListRow
              key={option.key}
              name={option.label}
              divider={index < MovieDecorationOptions.length - 1}
              trailing={
                <Toggle
                  accessibilityLabel={option.label}
                  disabled={!canEdit}
                  value={current[option.key]}
                  onValueChange={(on) =>
                    onChange({ decorations: { ...current, [option.key]: on } })
                  }
                />
              }
            />
          ))}
        </View>
        <ThemedText type="smallBold" accessibilityRole="header">
          편집
        </ThemedText>
        <View>
          {MovieEditingOptions.map((option, index) => (
            <ListRow
              key={option.key}
              name={option.label}
              divider={index < MovieEditingOptions.length - 1}
              trailing={
                <Toggle
                  accessibilityLabel={option.label}
                  disabled={!canEdit}
                  value={editing[option.key]}
                  onValueChange={(on) => onChange({ editing: { ...editing, [option.key]: on } })}
                />
              }
            />
          ))}
        </View>
        <ThemedText type="xsmall" themeColor="textSecondary">
          말소리는 말하는 부분의 목소리를 살리고 음악을 줄여요. 장면 순서는 AI가 순서를 정한
          무비에서 장소별로 묶고 가장 생생한 장면을 맨 앞에 둬요.
        </ThemedText>
        <ThemedText type="xsmall" themeColor="textSecondary">
          {movie.status === 'ready'
            ? '다시 만들 때 적용돼요. 컷·순서·음악은 그대로예요.'
            : '만들 때 적용돼요.'}{' '}
          편집 스타일을 바꾸면 꾸밈은 그 스타일의 기본값으로 돌아가요.
        </ThemedText>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.three },
});
