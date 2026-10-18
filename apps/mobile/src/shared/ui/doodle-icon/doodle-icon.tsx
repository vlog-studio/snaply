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
