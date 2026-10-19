import { Pressable, StyleSheet, View } from 'react-native';

import {
  MovieStyleCatalog,
  movieStyleOrDefault,
  type Movie,
  type MovieStylePatch,
} from '@/entities/movie';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Tape, tiltFor } from '@/shared/ui/paper';
import { Shadows, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type StylePickerSheetProps = {
  visible: boolean;
  movie: Movie;
  /** False while a job owns the movie; the cards become a read-out. */
  canEdit: boolean;
  onChange: (patch: MovieStylePatch) => void;
  onClose: () => void;
};

/**
 * The look, picked from a sheet.
 *
 * Each card writes straight through — a style is one tap, so there is nothing
 * to stage and no save button to explain. The sheet stays open after a pick:
 * choosing a look is comparing looks, and closing on the first tap would turn
 * comparison into three open-pick-reopen loops.
 */
export function StylePickerSheet({
  visible,
  movie,
  canEdit,
  onChange,
  onClose,
}: StylePickerSheetProps) {
  const theme = useTheme();
  // A movie stored by an older build can name a style this build dropped; the
  // card that would be selected then is the one it will actually be made with.
  const current = movieStyleOrDefault(movie.style);

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="스타일 선택">
      <View style={styles.sheet}>
        <View style={styles.head}>
          <ThemedText type="subtitle" accessibilityRole="header">
            스타일
          </ThemedText>
          <ThemedText type="data">1개 선택</ThemedText>
        </View>

        <View style={styles.grid}>
          {MovieStyleCatalog.map((option) => {
            const selected = option.id === current;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                // A radio reports `checked`; `selected` read the pick to
                // TalkBack as an unchecked radio.
                accessibilityState={{ checked: selected, disabled: !canEdit }}
                accessibilityLabel={`${option.label} · ${option.description}`}
                disabled={!canEdit}
                onPress={() => onChange({ style: option.id })}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                    borderWidth: selected ? 2 : 1,
                    boxShadow: Shadows.paper(theme.shadowInk),
                    transform: [{ rotate: `${tiltFor(option.id, 1.5)}deg` }],
                    opacity: !canEdit && !selected ? 0.55 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {selected ? (
                  <Tape color="tapePink" width={30} height={12} tilt={35} style={styles.pickTape} />
                ) : null}
                {/* Two flat tones rather than a gradient: the palette carries one
                    accent, and three looks need three identities of their own. */}
                <View style={styles.swatch}>
                  <View style={[styles.swatchHalf, { backgroundColor: option.swatch[0] }]} />
                  <View style={[styles.swatchHalf, { backgroundColor: option.swatch[1] }]} />
                </View>
                <ThemedText selectable={false} type="smallBold">
                  {option.label}
                </ThemedText>
                <ThemedText selectable={false} type="xsmall" themeColor="textSecondary">
                  {option.description}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  // Each look as an instant print: the swatch is the picture, the words its foot.
  card: {
    // Three per row, whatever the sheet width is.
    flexBasis: '30%',
    flexGrow: 1,
    gap: Spacing.half,
    padding: Spacing.one,
    paddingBottom: Spacing.two,
  },
  pickTape: { position: 'absolute', top: -6, right: -8, zIndex: 2 },
  swatch: {
    aspectRatio: 1,
    overflow: 'hidden',
    marginBottom: Spacing.one,
  },
  swatchHalf: { flex: 1 },
});
