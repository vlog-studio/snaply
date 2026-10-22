import { useMemo, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

import { Sizes, useTheme, type ThemeColor } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

// Android draws every `Svg` through a bitmap the size of the view
// (react-native-svg's SvgView.drawOutput), and refuses to draw a bitmap past
// 100MB — the app crashes. At 1080px across that is about 9,000dp of height,
// a long snap library or a receipt of a hundred deleted snaps. So nothing here
// draws an `Svg` that grows with the content: the page's lines and a piece's
// body are plain views, whose fill costs the same however tall they are, and
// only a torn edge — a few dp deep — is a drawing.

export type PaperKind = 'ruled' | 'grid' | 'plain';

/** The side of a square of the pink grid (the design system's `jj-page--grid`). */
const GridPitch = 16;

/**
 * The page a screen is drawn on (the design system's `jj-page`): ruled
 * notebook paper with a margin line, pink grid paper (`grid` — the snap
 * picking screens), or plain paper. Put it as the first child of a screen's
 * scroll content with the content's own height, so the lines scroll with what
 * is written on them. Decoration — hidden from screen readers and touches.
 *
 * Each printed line is a 1dp view, laid down to the ground's measured height
 * (a screenful until it has been measured; the ground clips what runs past
 * its foot), so a page as long as a whole snap library is still no bitmap.
 */
export function PaperGround({
  kind = 'ruled',
  style,
}: {
  kind?: PaperKind;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const screen = useWindowDimensions();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ground = kind === 'grid' ? theme.paperGrid : theme.background;
  const pitch = kind === 'grid' ? GridPitch : Sizes.rulePitch;
  const lineColor = kind === 'grid' ? theme.gridLine : theme.ruleLine;
  const rows = kind === 'plain' ? 0 : Math.ceil((size?.height ?? screen.height) / pitch);
  const columns = kind === 'grid' ? Math.ceil((size?.width ?? screen.width) / pitch) : 0;

  // A line sits on the last dp of each pitch, as the design system's
  // repeating gradient prints it. Rebuilt only when the count changes, so a
  // screen re-rendering over its ground does not touch a thousand lines.
  const lines = useMemo(
    () => [
      ...Array.from({ length: columns }, (_, index) => (
        <View
          key={`column-${index}`}
          style={[
            groundStyles.column,
            { left: (index + 1) * pitch - 1, backgroundColor: lineColor },
          ]}
        />
      )),
      ...Array.from({ length: rows }, (_, index) => (
        <View
          key={`row-${index}`}
          style={[groundStyles.row, { top: (index + 1) * pitch - 1, backgroundColor: lineColor }]}
        />
      )),
    ],
    [columns, rows, pitch, lineColor],
  );

  const onLayout =
    kind === 'plain'
      ? undefined
      : (event: LayoutChangeEvent) => {
          const { width, height } = event.nativeEvent.layout;
          setSize((last) =>
            last && last.width === width && last.height === height ? last : { width, height },
          );
        };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[StyleSheet.absoluteFill, groundStyles.clip, { backgroundColor: ground }, style]}
    >
      {lines}
      {kind === 'ruled' ? (
        <View
          style={[
            groundStyles.margin,
            { left: Sizes.marginX - 1, backgroundColor: theme.marginLine },
          ]}
        />
      ) : null}
    </View>
  );
}

const groundStyles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  row: { position: 'absolute', left: 0, right: 0, height: 1 },
  column: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  margin: { position: 'absolute', top: 0, bottom: 0, width: 2 },
});

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
 *
 * The body — the paper and its shadow — is plain views, so a receipt holding
 * a long list costs what a short one does; only a torn or deckled band, a few
 * dp deep, is a drawing. A tear is cut to the piece's width alone, so it waits
 * for the first layout (the body is the whole box, a plain sheet, until then)
 * and a receipt growing by a row does not cut it again.
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
  const [width, setWidth] = useState<number | null>(null);
  const face = fill ?? theme.backgroundElement;
  const top = width === null ? undefined : Edges[edge].top;
  const bottom = width === null ? undefined : Edges[edge].bottom;
  const topDepth = top ? deepestBite(top) : 0;
  const bottomDepth = bottom ? deepestBite(bottom) : 0;
  return (
    <View
      onLayout={(event) => {
        const measured = event.nativeEvent.layout.width;
        setWidth((last) => (last === measured ? last : measured));
      }}
      style={[tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null, style]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* The body's shadow stops where a band's own shadow takes over, so no
            strip of it darkens twice. */}
        <View
          style={[
            pieceStyles.layer,
            {
              left: ShadowX,
              right: -ShadowX,
              top: top ? topDepth + BandOverlap : ShadowY,
              bottom: bottom ? bottomDepth + BandOverlap : -ShadowY,
              backgroundColor: theme.shadowInk,
            },
          ]}
        />
        {top && width !== null ? (
          <TornBand side="top" teeth={top} width={width} face={face} shadow={theme.shadowInk} />
        ) : null}
        {bottom && width !== null ? (
          <TornBand
            side="bottom"
            teeth={bottom}
            width={width}
            face={face}
            shadow={theme.shadowInk}
          />
        ) : null}
        {/* The body's paper, over the bands' inner BandOverlap dp: paper over
            the same paper, so the join never shows. */}
        <View
          style={[
            pieceStyles.layer,
            { left: 0, right: 0, top: topDepth, bottom: bottomDepth, backgroundColor: face },
            edge === 'cut' ? { borderWidth: 1, borderColor: theme.border } : null,
          ]}
        />
      </View>
      {children}
    </View>
  );
}

/** The paper's hard shadow, `shadow-paper` (1px 2px 0): no blur, down and to the right. */
const ShadowX = 1;
const ShadowY = 2;

/**
 * How far a torn band runs past its deepest tooth, under the body's paper.
 * At least `ShadowY`, so the shadow of the deepest tooth still ends inside it.
 */
const BandOverlap = ShadowY;

/**
 * One torn edge: where each tooth falls across the piece (0–1, in drawing
 * order — a top edge runs left to right, a bottom edge right to left) and how
 * far it bites into the paper from the edge, in dp.
 */
type Tear = readonly (readonly [across: number, bite: number])[];

const tear = (across: readonly number[], bites: readonly number[]): Tear =>
  across.map((x, index) => [x, bites[index] ?? 0] as const);

const deepestBite = (teeth: Tear) => Math.max(...teeth.map(([, bite]) => bite));

/** The design system's edge clip-paths, as the tears along a piece's top and bottom. */
const Edges: Record<PaperEdge, { top?: Tear; bottom?: Tear }> = {
  cut: {},
  tornBottom: {
    bottom: tear(
      [
        1, 0.96, 0.91, 0.85, 0.79, 0.73, 0.66, 0.6, 0.53, 0.47, 0.4, 0.33, 0.27, 0.2, 0.14, 0.08,
        0.03, 0,
      ],
      [6, 0, 5, 0, 4, 0, 6, 0, 4, 0, 6, 0, 4, 0, 6, 0, 4, 0],
    ),
  },
  tornTop: {
    top: tear(
      [0, 0.04, 0.1, 0.17, 0.23, 0.3, 0.37, 0.44, 0.51, 0.58, 0.65, 0.72, 0.79, 0.86, 0.93, 1],
      [4, 0, 5, 1, 6, 0, 4, 1, 6, 0, 5, 1, 6, 0, 4, 1],
    ),
  },
  deckle: {
    top: tear([0, 0.08, 0.2, 0.33, 0.47, 0.6, 0.74, 0.88, 1], [2, 0, 2, 0, 2, 0, 2, 0, 2]),
    bottom: tear([1, 0.9, 0.76, 0.62, 0.48, 0.34, 0.2, 0.08, 0], [2, 0, 2, 0, 2, 0, 2, 0, 2]),
  },
};

/**
 * The band along one torn edge — its teeth and `BandOverlap` dp of paper
 * behind them — with the shadow the teeth cast. A bottom band's drawing runs
 * `ShadowY` past the piece's foot to hold that shadow.
 */
function TornBand({
  side,
  teeth,
  width,
  face,
  shadow,
}: {
  side: 'top' | 'bottom';
  teeth: Tear;
  width: number;
  face: string;
  shadow: string;
}) {
  const depth = deepestBite(teeth) + BandOverlap;
  return (
    <Svg
      width={width + ShadowX + 1}
      height={side === 'top' ? depth : depth + ShadowY}
      style={side === 'top' ? pieceStyles.topBand : pieceStyles.bottomBand}
    >
      <Polygon points={bandPoints(side, teeth, width, depth, ShadowX, ShadowY)} fill={shadow} />
      <Polygon points={bandPoints(side, teeth, width, depth, 0, 0)} fill={face} />
    </Svg>
  );
}

/**
 * A band's outline as polygon points over a `width`-wide piece, `depth` dp
 * deep. (dx, dy) moves the teeth for the shadow; its straight inner side
 * stays on the band's inner edge, where the body's shadow takes over.
 */
function bandPoints(
  side: 'top' | 'bottom',
  teeth: Tear,
  width: number,
  depth: number,
  dx: number,
  dy: number,
): string {
  const tips = teeth.map(([across, bite]): [number, number] => [
    across * width + dx,
    (side === 'top' ? bite : depth - bite) + dy,
  ]);
  const inner: [number, number][] =
    side === 'top'
      ? [
          [width + dx, depth],
          [dx, depth],
        ]
      : [
          [dx, 0],
          [width + dx, 0],
        ];
  const points = side === 'top' ? [...tips, ...inner] : [...inner, ...tips];
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

const pieceStyles = StyleSheet.create({
  layer: { position: 'absolute' },
  topBand: { position: 'absolute', left: 0, top: 0 },
  bottomBand: { position: 'absolute', left: 0, bottom: -ShadowY },
});

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
  // The rule takes the room its row leaves (flex), and the drawing fills that
  // box — an SVG sized 100% on its own measures against the whole row.
  return (
    <View pointerEvents="none" style={[{ flex: 1, minWidth: 12, height: thickness }, style]}>
      <Svg width="100%" height={thickness}>
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
    </View>
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
