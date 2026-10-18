import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Polygon, Rect } from 'react-native-svg';

import { Sizes, useTheme, type ThemeColor } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

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

export type PaperEdge = 'cut' | 'tornBottom' | 'tornTop' | 'deckle';

/**
 * A piece of paper on the page (the design system's `jj-paper`, and the
 * receipt and Guest Check strips' torn edges): sheet-coloured, a short hard
 * shadow, a fixed lean. `cut` has a straight edge and a paper-edge outline;
 * the torn and deckled edges are drawn as their own outline and cast the
 * shadow along it. The children sit on the paper and do not lean with a
 * rotated parent's touch box — only the drawn paper rotates; pass `tilt` from
 * `tiltFor` for an item, or a small fixed value for a fixed block.
 */
export function PaperPiece({
  children,
  edge = 'cut',
  tilt = 0,
  fill,
  style,
}: {
  children?: ReactNode;
  edge?: PaperEdge;
  tilt?: number;
  /** The paper's colour; `backgroundElement` (sheet) by default. */
  fill?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const face = fill ?? theme.backgroundElement;
  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (!size || size.width !== width || size.height !== height) setSize({ width, height });
      }}
      style={[tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null, style]}
    >
      {size ? (
        <Svg
          width={size.width + 1}
          height={size.height + 2}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Polygon
            points={edgePoints(edge, size.width, size.height, 1, 2)}
            fill={theme.shadowInk}
          />
          <Polygon
            points={edgePoints(edge, size.width, size.height, 0, 0)}
            fill={face}
            stroke={edge === 'cut' ? theme.border : undefined}
            strokeWidth={edge === 'cut' ? 1 : 0}
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** The design system's edge clip-paths, as polygons over a `w`×`h` piece. */
function edgePoints(edge: PaperEdge, w: number, h: number, dx: number, dy: number): string {
  const px = (x: number) => x * w + dx;
  const py = (y: number) => y + dy;
  let points: [number, number][];
  switch (edge) {
    case 'tornBottom': {
      const tear = [
        1, 0.96, 0.91, 0.85, 0.79, 0.73, 0.66, 0.6, 0.53, 0.47, 0.4, 0.33, 0.27, 0.2, 0.14, 0.08,
        0.03, 0,
      ];
      const lift = [6, 0, 5, 0, 4, 0, 6, 0, 4, 0, 6, 0, 4, 0, 6, 0, 4, 0];
      points = [
        [px(0), py(0)],
        [px(1), py(0)],
        ...tear.map((x, index): [number, number] => [px(x), py(h - (lift[index] ?? 0))]),
      ];
      break;
    }
    case 'tornTop': {
      const tear = [
        0, 0.04, 0.1, 0.17, 0.23, 0.3, 0.37, 0.44, 0.51, 0.58, 0.65, 0.72, 0.79, 0.86, 0.93, 1,
      ];
      const drop = [4, 0, 5, 1, 6, 0, 4, 1, 6, 0, 5, 1, 6, 0, 4, 1];
      points = [
        ...tear.map((x, index): [number, number] => [px(x), py(drop[index] ?? 0)]),
        [px(1), py(h)],
        [px(0), py(h)],
      ];
      break;
    }
    case 'deckle': {
      const top = [0, 0.08, 0.2, 0.33, 0.47, 0.6, 0.74, 0.88, 1];
      points = [
        ...top.map((x, index): [number, number] => [px(x), py(index % 2 === 0 ? 2 : 0)]),
        ...[1, 0.9, 0.76, 0.62, 0.48, 0.34, 0.2, 0.08, 0].map((x, index): [number, number] => [
          px(x),
          py(h - (index % 2 === 0 ? 2 : 0)),
        ]),
      ];
      break;
    }
    default:
      points = [
        [px(0), py(0)],
        [px(1), py(0)],
        [px(1), py(h)],
        [px(0), py(h)],
      ];
  }
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * A row of punched holes along a sheet's top edge — the ground showing
 * through the page. Place it as a child of the sheet; it positions itself.
 */
export function PunchedHoles({ count = 12 }: { count?: number }) {
  const theme = useTheme();
  return (
    <View pointerEvents="none" style={holeStyles.holes}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[holeStyles.hole, { backgroundColor: theme.background }]} />
      ))}
    </View>
  );
}

const holeStyles = StyleSheet.create({
  holes: {
    position: 'absolute',
    top: 8,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hole: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 1 },
});

/**
 * A dotted rule — a receipt's leader, a "또는" divider. Drawn, not a border:
 * Android draws a one-sided dotted border solid.
 */
export function DottedRule({
  color,
  thickness = 2,
  style,
}: {
  color: string;
  thickness?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={thickness}
      style={[{ flex: 1, minWidth: 12 }, style]}
    >
      <Line
        x1={thickness / 2}
        x2="100%"
        y1={thickness / 2}
        y2={thickness / 2}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`0.01 ${thickness * 2}`}
      />
    </Svg>
  );
}

/**
 * A name written by hand on a torn label taped to the page (the design
 * system's `jj-titlelabel`) — the heading of a screen about one named thing,
 * a template or a movie.
 */
export function TitleLabel({
  children,
  tape = 'tapeMint',
  tilt = -1,
  style,
}: {
  children: string;
  tape?: TapeColor;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ alignSelf: 'flex-start', marginTop: 8 }, style]}>
      <Tape color={tape} width={48} height={16} tilt={3} style={labelStyles.tape} />
      <PaperPiece edge="tornBottom" tilt={tilt} style={labelStyles.face}>
        <ThemedText type="subtitle" accessibilityRole="header">
          {children}
        </ThemedText>
      </PaperPiece>
    </View>
  );
}

const labelStyles = StyleSheet.create({
  tape: { position: 'absolute', top: -8, alignSelf: 'center', zIndex: 2 },
  face: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 10 },
});
