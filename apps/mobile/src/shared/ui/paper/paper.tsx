import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Polygon, Rect } from 'react-native-svg';

import { Sizes, useTheme, type ThemeColor } from '@/shared/ui/theme';

export type PaperKind = 'ruled' | 'grid' | 'plain';

/**
 * The page a screen is drawn on (the design system's `jj-page`): ruled
 * notebook paper with a margin line, pink grid paper (`grid` — the snap
 * picking screens), or plain paper. Put it as the first child of a screen's
 * scroll content with the content's own height, so the lines scroll with what
 * is written on them. Decoration — hidden from screen readers and touches.
 */
export function PaperGround({
  kind = 'ruled',
  style,
}: {
  kind?: PaperKind;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const ground = kind === 'grid' ? theme.paperGrid : theme.background;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: ground }, style]}
    >
      {kind === 'plain' ? null : (
        <Svg width="100%" height="100%">
          <Defs>
            {kind === 'ruled' ? (
              <Pattern id="rule" width={8} height={Sizes.rulePitch} patternUnits="userSpaceOnUse">
                <Line
                  x1={0}
                  x2={8}
                  y1={Sizes.rulePitch - 0.5}
                  y2={Sizes.rulePitch - 0.5}
                  stroke={theme.ruleLine}
                  strokeWidth={1}
                />
              </Pattern>
            ) : (
              <Pattern id="rule" width={16} height={16} patternUnits="userSpaceOnUse">
                <Line x1={15.5} x2={15.5} y1={0} y2={16} stroke={theme.gridLine} strokeWidth={1} />
                <Line x1={0} x2={16} y1={15.5} y2={15.5} stroke={theme.gridLine} strokeWidth={1} />
              </Pattern>
            )}
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#rule)" />
          {kind === 'ruled' ? (
            <Rect x={Sizes.marginX - 1} y={0} width={2} height="100%" fill={theme.marginLine} />
          ) : null}
        </Svg>
      )}
    </View>
  );
}

type TapeColor = Extract<
  ThemeColor,
  'tapePink' | 'tapeMint' | 'tapeButter' | 'tapeSky' | 'tapeLavender'
>;

/**
 * A strip of masking tape (the design system's `jj-tape`): translucent, its
 * ends torn in a zigzag, a few degrees off. It holds a paper piece to the page
 * — place it absolutely over the piece's top edge or a corner. Decoration.
 */
export function Tape({
  color = 'tapePink',
  width = 64,
  height = 18,
  tilt = -4,
  style,
}: {
  color?: TapeColor;
  width?: number;
  height?: number;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const w = width;
  const h = height;
  // The zigzag of a torn end, as a share of the strip.
  const points = [
    [0.03 * w, 0],
    [0.97 * w, 0],
    [w, 0.2 * h],
    [0.96 * w, 0.4 * h],
    [w, 0.6 * h],
    [0.96 * w, 0.8 * h],
    [0.98 * w, h],
    [0.02 * w, h],
    [0, 0.8 * h],
    [0.04 * w, 0.6 * h],
    [0, 0.4 * h],
    [0.04 * w, 0.2 * h],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { position: 'absolute', width: w, height: h, transform: [{ rotate: `${tilt}deg` }] },
        style,
      ]}
    >
      <Svg width={w} height={h}>
        <Polygon points={points} fill={theme[color]} />
      </Svg>
    </View>
  );
}

/**
 * A fixed tilt for an item, from its id — the same item leans the same way on
 * every render and every screen (root docs/plans/junk-journal-redesign.md §3).
 * `max` is the design system's tilt step for the kind of piece: 3 for paper,
 * 2 for a thumbnail, 1.5 for a control, 0 for a stage that holds video.
 */
export function tiltFor(id: string, max: number): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  // −max … +max in steps of a tenth of a degree.
  const steps = Math.round(max * 10) * 2 + 1;
  return ((((hash % steps) + steps) % steps) - Math.round(max * 10)) / 10;
}
