import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { Fonts } from '@/shared/ui/theme';

/**
 * One cut-out letter: the paper it was cut from, its ink, a face, a size, a
 * lean and a nudge up or down, and the scissor cut (`cut`, an index into
 * `Cuts`). The values are the canvas's ("탭 제목 · 한 글자씩 오려 붙인 조각");
 * every pairing of paper and ink there is 4.5:1 or better.
 */
type Piece = {
  ch: string;
  paper: string;
  ink: string;
  face: keyof typeof Faces;
  size: number;
  tilt: number;
  nudge?: number;
  cut: number;
  edge?: boolean;
};

/**
 * The canvas cuts its letters from five magazine faces. Until their outlines
 * are drawn as SVG (root docs/plans/junk-journal-redesign.md §2 — the faces
 * are not to be shipped as fonts), each piece takes the embedded family
 * nearest in spirit: the heavy gothics bold sans, the brush and the serif
 * Gaegu, the monospace D2Coding.
 */
const Faces = {
  gothic: { fontFamily: Fonts.sans, fontWeight: 700 },
  brush: { fontFamily: Fonts.hand, fontWeight: 700 },
  mono: { fontFamily: Fonts.mono, fontWeight: 700 },
} as const;

/** Scissor cuts — each a slightly skewed quadrilateral, as a share of the piece. */
const Cuts: [number, number][][] = [
  [
    [0.03, 0],
    [1, 0.06],
    [0.96, 1],
    [0, 0.93],
  ],
  [
    [0, 0.08],
    [0.92, 0],
    [1, 0.88],
    [0.06, 1],
  ],
  [
    [0.06, 0.03],
    [1, 0],
    [0.94, 0.96],
    [0, 1],
  ],
  [
    [0, 0],
    [0.97, 0.1],
    [1, 1],
    [0.04, 0.9],
  ],
  [
    [0.1, 0],
    [1, 0.04],
    [0.9, 1],
    [0, 0.84],
  ],
  [
    [0, 0.12],
    [0.88, 0],
    [1, 1],
    [0.12, 0.94],
  ],
];

/** Fixed per word: a tab's title never reshuffles between launches. */
const Words: Record<string, { pieces: Piece[]; backing?: { paper: string; cut: number } }> = {
  스튜디오: {
    pieces: [
      { ch: '스', paper: '#E9E4D6', ink: '#2B2B2B', face: 'gothic', size: 34, tilt: -6, cut: 0 },
      {
        ch: '튜',
        paper: '#3F5F8F',
        ink: '#FFFFFF',
        face: 'brush',
        size: 36,
        tilt: 4,
        nudge: 4,
        cut: 1,
      },
      {
        ch: '디',
        paper: '#FFF1A8',
        ink: '#1F3A68',
        face: 'mono',
        size: 28,
        tilt: -3,
        nudge: -2,
        cut: 2,
      },
      {
        ch: '오',
        paper: '#A84E6F',
        ink: '#FFFFFF',
        face: 'brush',
        size: 42,
        tilt: 7,
        nudge: 3,
        cut: 3,
      },
    ],
  },
  스냅: {
    pieces: [
      { ch: '스', paper: '#2B2B2B', ink: '#FFF1A8', face: 'gothic', size: 36, tilt: 5, cut: 4 },
      {
        ch: '냅',
        paper: '#F8C8D4',
        ink: '#2B2B2B',
        face: 'brush',
        size: 40,
        tilt: -5,
        nudge: 5,
        cut: 5,
      },
    ],
  },
  무비: {
    pieces: [
      { ch: '무', paper: '#D8B48C', ink: '#2B2B2B', face: 'gothic', size: 36, tilt: -4, cut: 2 },
      {
        ch: '비',
        paper: '#FFFDF7',
        ink: '#B81E33',
        face: 'brush',
        size: 44,
        tilt: 6,
        nudge: 2,
        cut: 0,
        edge: true,
      },
    ],
  },
  나: {
    // One letter, so an empty pink piece is pasted behind it for the collage.
    backing: { paper: '#F8C8D4', cut: 5 },
    pieces: [
      { ch: '나', paper: '#BFE8D9', ink: '#2B2B2B', face: 'gothic', size: 42, tilt: 6, cut: 1 },
    ],
  },
};

/**
 * A tab's title as a ransom note (the design system's `jj-ransom`): each
 * letter its own cut-out piece of paper. The tab title is the screen's one
 * emphasised word, so a tab screen uses no other ransom letters. The pieces
 * keep their colours at night, like stickers. Read as one word, a header.
 */
export function RansomTitle({ word, style }: { word: string; style?: StyleProp<ViewStyle> }) {
  const layout = Words[word];
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={word}
      style={[styles.row, style]}
    >
      {layout?.backing ? (
        <View style={styles.backing} pointerEvents="none">
          <Svg width={46} height={44}>
            <Polygon points={cutPoints(layout.backing.cut, 46, 44)} fill={layout.backing.paper} />
          </Svg>
        </View>
      ) : null}
      {(
        layout?.pieces ?? [
          { ch: word, paper: '#FFFDF7', ink: '#2B2B2B', face: 'gothic', size: 34, tilt: 0, cut: 0 },
        ]
      ).map((piece, index) => (
        <LetterPiece key={`${piece.ch}-${index}`} piece={piece} />
      ))}
    </View>
  );
}

function LetterPiece({ piece }: { piece: Piece }) {
  // The piece is sized from its letter: a square-ish block a little larger
  // than the glyph, so the cut has paper to bite into.
  const width = Math.round(piece.size * 1.25);
  const height = Math.round(piece.size * 1.3);
  return (
    <View
      style={[
        styles.piece,
        {
          width,
          height,
          marginTop: piece.nudge ?? 0,
          transform: [{ rotate: `${piece.tilt}deg` }],
        },
      ]}
    >
      <Svg width={width + 1} height={height + 2} style={StyleSheet.absoluteFill}>
        <Polygon points={cutPoints(piece.cut, width, height, 1, 2)} fill="rgba(60, 40, 30, 0.25)" />
        <Polygon
          points={cutPoints(piece.cut, width, height)}
          fill={piece.paper}
          stroke={piece.edge ? '#D9CBB5' : undefined}
          strokeWidth={piece.edge ? 1 : 0}
        />
      </Svg>
      <Text
        allowFontScaling={false}
        style={[Faces[piece.face], { fontSize: piece.size, lineHeight: height, color: piece.ink }]}
      >
        {piece.ch}
      </Text>
    </View>
  );
}

function cutPoints(cut: number, w: number, h: number, dx = 0, dy = 0): string {
  return (Cuts[cut] ?? Cuts[0]!).map(([x, y]) => `${x * w + dx},${y * h + dy}`).join(' ');
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingRight: 4, paddingBottom: 6 },
  piece: { alignItems: 'center', justifyContent: 'center', marginRight: -3 },
  backing: { position: 'absolute', left: -8, top: 6, transform: [{ rotate: '-12deg' }] },
});
