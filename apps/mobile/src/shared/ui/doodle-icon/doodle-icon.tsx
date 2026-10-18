import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/shared/ui/theme';

/**
 * Hand-drawn line icons on a 24 grid (the design system's `jj-icon`): a 2px
 * marker stroke with round ends, no fill. Paths are the canvas's own
 * ("Snaply 정크 저널 전체 화면"); add a new one in the same hand rather than
 * reaching for a vector icon set — a crisp geometric glyph breaks the paper.
 */
const Paths = {
  // A crate with its lid lifted — the studio.
  studio:
    'M4 10h16v9.5c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1z M4.3 9.8L3.6 7.1 18.8 3l.6 2.6 M8.2 6l2.1 3 M12.6 4.8l2.1 3',
  // A stack of snaps.
  snaps: 'M5 7.5v12h11 M8 4.5h11.2v12.8H8z M8 13.8h11.2',
  // A camera — capture.
  camera: 'M4 8.6h3.1l1.5-2.6h6.8l1.6 2.6H20v10H4z M12 16.3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  // A strip of film — movies.
  movies:
    'M5.2 4h13.6v16H5.2z M9 4v16 M15 4v16 M5.2 8.2H9 M5.2 12H9 M5.2 15.8H9 M15 8.2h3.8 M15 12h3.8 M15 15.8h3.8',
  // A smiling face — me.
  me: 'M12 3.6c4.8 0 8.4 3.6 8.4 8.3s-3.7 8.6-8.5 8.6-8.3-3.9-8.3-8.6S7.2 3.6 12 3.6z M9.2 9.8v.8 M14.8 9.8v.8 M8.6 14.3c1.8 2.1 5 2.2 6.9 0',
  // A chevron pointing on.
  chevronRight: 'M9.6 6.1l6 5.9-6.1 6',
  chevronUp: 'M6 14.6l6-6.1 6 6',
  chevronDown: 'M6 9.4l6 6.1 6-6',
  chevronLeft: 'M14.4 6.1l-6 5.9 6.1 6',
  plus: 'M12 5.2v13.6 M5.2 12.1h13.6',
  minus: 'M5.2 12.1h13.6',
  coin: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z M14.8 9.6a3.2 3.2 0 1 0 0 4.9',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.6H4.4z M10 20.6h4',
  moon: 'M18.6 14.4A7.5 7.5 0 0 1 9.6 5.4a7.5 7.5 0 1 0 9 9z',
  eye: 'M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
  picture: 'M4.5 5.5h15v13h-15z M4.5 15l4.5-4.5 4 4 2.5-2.5 4 4',
  heart: 'M12 19.5s-7-4.3-7-9.4A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z',
  link: 'M10 14l4-4 M8.6 11.4l-2 2a3 3 0 0 0 4.1 4.1l2-2 M15.4 12.6l2-2a3 3 0 0 0-4.1-4.1l-2 2',
  trash: 'M5 7h14 M9.5 7V4.8h5V7 M6.6 7.1l1 12.4h8.8l1-12.4 M10.3 10.5l.3 6 M13.8 10.5l-.3 6',
  back: 'M19 12.3H5.6 M10.6 6.5L5 12.2l5.7 5.6',
  close: 'M6.5 6.3l11 11.2 M17.6 6.4L6.4 17.6',
  note: 'M9.5 17.2V5.6l9-1.9v11.6 M9.5 17.2a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0z M18.5 15.3a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0z',
  noteOff:
    'M9.5 17.2V5.6l9-1.9v11.6 M9.5 17.2a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0z M18.5 15.3a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0z M4 4.5l16 15',
  flip: 'M5 9.2A7.4 7.4 0 0 1 18.4 8 M19 14.8A7.4 7.4 0 0 1 5.6 16 M18.6 4.6v3.6H15 M5.4 19.4v-3.6H9',
  play: 'M7.6 5.2l11 6.9-11 6.7z',
  gallery: 'M3.8 7.6h12.6v11.6H3.8z M7.6 4.8h12.6v11.4 M3.8 16.2l3.8-3.6 3 2.6 2.2-1.8 3.6 3.2',
  scissors:
    'M6.6 9.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M6.6 20a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M8.7 8.1l10.9 9.7 M8.7 15.9l10.9-9.7',
  check: 'M5 12.6l4.2 4.2L19 6.9',
  pause: 'M8.6 5.5v13 M15.4 5.5v13',
  share: 'M12 15V4.6 M8 8.3l4-3.8 4 3.8 M6 11.5v8.1h12v-8.1',
  replay: 'M5.2 12a6.8 6.8 0 1 0 2-4.8 M4.6 4.4v3.8h3.8',
  undo: 'M8 6.8L4.5 10 8 13.3 M4.8 10h9.4a5 5 0 0 1 0 10H10',
  redo: 'M16 6.8l3.5 3.2-3.5 3.3 M19.2 10H9.8a5 5 0 0 0 0 10H14',
  pencil: 'M4.5 19.5l1-4.6L15.6 4.8l3.6 3.6L9.1 18.5z M13.6 6.8l3.6 3.6',
  more: 'M5.6 12h.8 M11.6 12h.8 M17.6 12h.8',
} as const;

export type DoodleIconName = keyof typeof Paths;

export function DoodleIcon({
  name,
  size = 24,
  color,
}: {
  name: DoodleIconName;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path
        d={Paths[name]}
        stroke={color ?? theme.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
