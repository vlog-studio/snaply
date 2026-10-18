import { Platform } from 'react-native';

// The junk-journal world (root docs/decisions/junk-journal-design-system.md):
// paper and ink, pastel sticker colours, and cherry as the one action colour.
// The role names are the app's own and stay stable across the redesign; each
// maps onto a token of the design system (root docs/plans/junk-journal-redesign.md
// §1 — the source of these values). Where one old role split by use, the text
// half has its own role: `primary` is the cherry *fill*, `cherryInk` its text;
// `ai` is the lavender *line and text*, `aiFill` its fill.
//
// **Sticker colours keep their value at night** (pink, butter, kraft, …), so
// text on them is always `stickerInk`, never `text` — `text` turns light at
// night and would vanish on butter.
const lightPalette = {
  text: '#2B2B2B', // ink
  background: '#FBF4E6', // paper
  backgroundElement: '#FFFDF7', // sheet — a card over paper
  // No token of its own in the design system — selection is tape, a cherry
  // edge or a sticker there. This is the faded-paper tone for the few rows that
  // still mark a choice with a ground, until each moves to its own look.
  backgroundSelected: '#D9CBB5', // paper-edge
  textSecondary: '#6B6357', // ink-muted — 5.41 on paper; do not go lighter
  tabInactive: '#2B2B2B', // ink on the kraft tab bar
  border: '#D9CBB5', // paper-edge — decoration only (1.46 on paper)
  fieldLine: '#6B6357', // a line that is the control — field underline, check box
  primary: '#D7263D', // cherry — fills only (4.53 as text on paper, 2.56 at night)
  onPrimary: '#FFFFFF', // on-cherry — 16px bold and up
  cherryInk: '#B81E33', // cherry as text, icon, line
  ai: '#5B4A91', // lavender-ink — AI as line and text
  aiFill: '#D9CCF2', // lavender — AI as fill, with `stickerInk` on top
  lumen: '#5B4A91', // lavender-ink (the old cold-axis text)
  media: '#0E0B08', // behind video: frames, viewfinder
  warmSurface: '#FFF1A8', // butter — standing notices, with `stickerInk` text
  danger: '#B81E33', // cherry-ink — error text. A delete is kraft + VOID, not red
  amber: '#D8B48C', // kraft — warm secondary fill
  stickerInk: '#2B2B2B', // text on any sticker colour, both schemes
  // Sticker fills — the same at night.
  pink: '#F8C8D4',
  mint: '#BFE8D9',
  butter: '#FFF1A8',
  lavender: '#D9CCF2',
  sky: '#C9E2F7',
  receiptGreen: '#DCEBD2',
  kraft: '#D8B48C',
  // Masking tape — a sticker colour at 85%.
  tapePink: '#F8C8D4D9',
  tapeMint: '#BFE8D9D9',
  tapeButter: '#FFF1A8D9',
  tapeSky: '#C9E2F7D9',
  tapeLavender: '#D9CCF2D9',
  // Paper patterns — only the paper-ground component draws these.
  paperGrid: '#FDE7EE',
  gridLine: '#F6BCCB',
  ruleLine: '#CFE0F5',
  marginLine: '#F2A7B3',
  navy: '#1F3A68', // data text — secondary ticket label
  receiptBlue: '#255A9B', // receipt values
  ribbon: '#3B2A1E', // the timeline's ground
  tabbar: '#D8B48C', // kraft by day
  shadowInk: 'rgba(60, 40, 30, 0.18)',
} as const;

const darkPalette = {
  ...lightPalette,
  text: '#F3E7CF',
  background: '#3D3028',
  backgroundElement: '#4A3B31',
  backgroundSelected: '#5A4A3E',
  textSecondary: '#B8AC98',
  tabInactive: '#F3E7CF',
  border: '#5A4A3E',
  fieldLine: '#B8AC98',
  cherryInk: '#FF8A96',
  ai: '#C8B6F2',
  lumen: '#C8B6F2',
  danger: '#FF8A96',
  paperGrid: '#43332B',
  gridLine: '#5A4434',
  ruleLine: '#5A4A3E',
  marginLine: '#7A4A4E',
  navy: '#9CC3F0',
  receiptBlue: '#9CC3F0',
  ribbon: '#2E2118',
  // Kraft stays a sticker colour at night; the bar takes a dark kraft of its
  // own so no light band is left under a dark screen (decision 3).
  tabbar: '#6B5238',
  shadowInk: 'rgba(0, 0, 0, 0.45)',
} as const;

export const Colors = {
  light: lightPalette,
  dark: darkPalette,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The app's three families, each with a fixed role (root
 * docs/decisions/junk-journal-design-system.md, decisions 2 and 5):
 *
 * - `sans` — Pretendard GOV, body text and every control. Only 400 and 700 are
 *   embedded (each face is ~5MB), so a style asks for one of those two.
 * - `mono` — D2Coding 400 · 700, the receipt voice for data: counts, durations,
 *   meta lines. It carries Hangul, so a data line may mix Korean and digits in
 *   one face.
 * - `hand` — Gaegu 700, handwritten titles only, and never below 22px.
 *
 * All three are embedded natively by the `expo-font` plugin in `app.json`, not
 * loaded with `useFonts`, so they are there on the first frame. One family name
 * covers every weight on both platforms (Android: the plugin's font-family XML;
 * iOS: the typographic family inside the file), so `fontFamily` pairs with
 * `fontWeight` and no style names a single face. A weight outside the embedded
 * set resolves to the nearest face — keep to 400 and 700.
 *
 * The `web` branch is a courtesy for `npm run web`, not a product surface.
 */
export const Fonts = Platform.select({
  default: {
    sans: 'Pretendard GOV',
    mono: 'D2Coding',
    hand: 'Gaegu',
  },
  web: {
    sans: 'var(--font-body)',
    mono: 'var(--font-mono)',
    hand: 'var(--font-hand)',
  },
});

/**
 * The type scale — one entry per size step, each pairing a size with its
 * leading. `ThemedText` maps its `type` names onto these steps and adds only
 * what makes a role: family, weight, letter spacing, casing. Text that cannot
 * be a `ThemedText` (a `TextInput`, a glyph drawn over video) still takes its
 * size from here rather than inlining a literal.
 *
 * Nothing is smaller than 12px (the design system's floor). `data` is the
 * receipt line's own step; `bodySm` is the body of sheets, notices and
 * confirmations; `barTitle` is a pushed screen's header title (decision 7).
 * The handwritten steps start at `heading` (22px), the smallest size Gaegu is
 * used at. Every leading is a multiple of 2 and most of 4, so stacked text keeps
 * a rhythm.
 */
export const Typography = {
  xsmall: { fontSize: 12, lineHeight: 16 },
  data: { fontSize: 13, lineHeight: 20 },
  small: { fontSize: 14, lineHeight: 20 },
  bodySm: { fontSize: 15, lineHeight: 22 },
  body: { fontSize: 16, lineHeight: 24 },
  barTitle: { fontSize: 17, lineHeight: 24 },
  heading: { fontSize: 22, lineHeight: 28 },
  subtitle: { fontSize: 26, lineHeight: 32 },
  title: { fontSize: 32, lineHeight: 40 },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
  eight: 64,
} as const;

/**
 * Paper is cut, not rounded: every step is 0 (the design system's
 * `radius-cut`), and a shape's edge — torn, perforated, deckled — is the job of
 * the paper components. `pill` stays for things that are round objects in the
 * world: a button sticker, the capture disc, a price sticker, a reel. A chip or
 * a tag is a square of tape, not a pill. The steps are kept as names so a
 * screen's intent stays readable while each one moves to its paper component.
 */
export const Radius = {
  xsmall: 0,
  small: 0,
  medium: 0,
  large: 0,
  xlarge: 0,
  pill: 999,
} as const;

/**
 * Paper casts a short hard shadow — offset, no blur (`shadow-paper`), and less
 * when pressed (`shadow-pressed`). Read the colour from the theme's
 * `shadowInk`, which deepens at night.
 */
export const Shadows = {
  paper: (ink: string) => `1px 2px 0 ${ink}`,
  pressed: (ink: string) => `0 1px 0 ${ink}`,
} as const;

/**
 * Sizes of the design system that are not spacing. `touchMin` is 48dp — the
 * first release is Android (decision 4).
 */
export const Sizes = {
  touchMin: 48,
  ticketHeight: 48,
  captureDisc: 56,
  rulePitch: 24,
  marginX: 32,
} as const;

/** One opacity for every disabled control except the ticket button (decision 9). */
export const OpacityDisabled = 0.5;

export const MaxContentWidth = 680;
