import { Pressable, StyleSheet, View } from 'react-native';

import {
  MovieRecipeCatalog,
  movieRecipeOrDefault,
  type Movie,
  type MovieStylePatch,
} from '@/entities/movie';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { RadioMark } from '@/shared/ui/choice-mark';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type RecipePickerSheetProps = {
  visible: boolean;
  movie: Movie;
  /** False while a job owns the movie; the rows become a read-out. */
  canEdit: boolean;
  onChange: (patch: MovieStylePatch) => void;
  onClose: () => void;
};

/**
 * Whether every cut is still the edit draft's — the order and every window.
 * Only then does the server re-cut the movie by its recipe; a movie the user
 * has touched keeps its cuts (root docs/api-spec.md, 무비 · `recipe`).
 */
function cutsAreAllAi(movie: Movie): boolean {
  return (
    movie.arranger === 'ai' &&
    movie.snapRefs.length > 0 &&
    movie.snapRefs.every((ref) => ref.trimOwner === 'ai')
  );
}

/**
 * The editing recipe, picked from a sheet (root docs/specs/movie.md MOV-28).
 *
 * Rows rather than the style sheet's swatch cards: a recipe is told apart by
 * what it does to the cut, which takes a line of words, not a colour. Like the
 * style sheet, a row writes straight through and the sheet stays open — picking
 * is comparing. Under any recipe but `classic`, the foot says what it will
 * touch, because that depends on whose cuts these are, and the user cannot see
 * that rule anywhere else.
 */
export function RecipePickerSheet({
  visible,
  movie,
  canEdit,
  onChange,
  onClose,
}: RecipePickerSheetProps) {
  const theme = useTheme();
  // A movie stored before recipes existed has none; it is cut as `classic`.
  const current = movieRecipeOrDefault(movie.recipe);

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="편집 스타일 선택">
      <View style={styles.sheet}>
        <View style={styles.head}>
          <ThemedText type="subtitle" accessibilityRole="header">
            편집 스타일
          </ThemedText>
          <ThemedText type="data">1개 선택</ThemedText>
        </View>
        <View>
          {MovieRecipeCatalog.map((option) => {
            const selected = option.id === current;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !canEdit }}
                accessibilityLabel={`${option.label} · ${option.description}`}
                disabled={!canEdit}
                onPress={() => onChange({ recipe: option.id })}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomColor: theme.ruleLine,
                    backgroundColor: pressed ? theme.pink : 'transparent',
                    opacity: !canEdit && !selected ? 0.55 : 1,
                  },
                ]}
              >
                <View style={styles.rowText}>
                  <ThemedText selectable={false} type="smallBold">
                    {option.label}
                  </ThemedText>
                  <ThemedText selectable={false} type="xsmall" themeColor="textSecondary">
                    {option.description}
                  </ThemedText>
                </View>
                <RadioMark selected={selected} />
              </Pressable>
            );
          })}
        </View>
        {/* `classic` is the movie as it always was: nothing to explain. */}
        {current === 'classic' ? null : (
          <ThemedText type="xsmall" themeColor="textSecondary">
            {cutsAreAllAi(movie)
              ? 'AI가 고른 컷 그대로라, 만들 때 컷도 편집 스타일에 맞춰 다시 골라요.'
              : '손본 컷은 그대로 두고, 소리·타이틀·글·효과음만 편집 스타일을 따라요.'}
          </ThemedText>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.three },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  // A line of the note sheet: rule under it, pink when pressed.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
    minHeight: 52,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
