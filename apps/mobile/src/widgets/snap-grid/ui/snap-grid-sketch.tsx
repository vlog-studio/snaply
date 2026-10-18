import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';

/** Two days of sketched prints: six, then three — a library's shape, not its size. */
const SketchDays = [6, 3] as const;
const SketchTilts = [-0.5, 1, -1.5, 1.5, -1, 0.5, -2, 2, 0] as const;
const Columns = 3;

/**
 * What the snap grid looks like before the library has read itself back from
 * disk: the day sections and prints sketched in dashed pencil, so the grid's
 * shape is there on the first frame instead of an empty page that then fills.
 * One status for screen readers (불러오는 중…); the sketch itself is hidden.
 */
export function SnapGridSketch() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const gridWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.five * 2;
  const cellWidth = Math.floor(gridWidth / Columns);
  const sketch = { borderColor: theme.textSecondary };

  let tiltIndex = 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="불러오는 중…"
      style={styles.sketch}
    >
      {SketchDays.map((count, day) => (
        <View key={day} style={styles.day} importantForAccessibility="no-hide-descendants">
          <View style={styles.dayHead}>
            <View style={[styles.mark, styles.label, sketch]} />
            <View style={[styles.mark, styles.meta, sketch]} />
          </View>
          <View style={styles.grid}>
            {Array.from({ length: count }, (_, index) => {
              const tilt = SketchTilts[tiltIndex++ % SketchTilts.length];
              return (
                <View key={index} style={[styles.cell, { width: cellWidth }]}>
                  <View
                    style={[
                      styles.mark,
                      styles.print,
                      sketch,
                      { transform: [{ rotate: `${tilt}deg` }] },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sketch: { gap: Spacing.five },
  day: { gap: Spacing.two },
  dayHead: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Dashed pencil at half strength.
  mark: { borderWidth: 2, borderStyle: 'dashed', opacity: 0.55 },
  label: { width: 64, height: 22, transform: [{ rotate: '-2deg' }] },
  meta: { width: 72, height: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.one },
  cell: { padding: Spacing.one },
  print: { aspectRatio: 1 / 1.2 },
});
