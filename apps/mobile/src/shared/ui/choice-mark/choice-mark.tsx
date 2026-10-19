import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Shadows, useTheme } from '@/shared/ui/theme';

/**
 * The marks of a choice (the design system's `jj-check` · `jj-radio`) — drawn
 * only; the row around them is the control and carries the role and state. A
 * check is a square sticker with a red-ink tick; a radio is a round button
 * with a dashed seam and a red-ink tick when chosen (the canvas's
 * `M2.5 7.4l3 3 6-6.4` — a cross on a radio reads as "not this"). Where the
 * order of picks means something, a numbered price sticker marks the pick
 * instead.
 */
export function CheckMark({ checked }: { checked: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.check,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.fieldLine,
          boxShadow: Shadows.paper(theme.shadowInk),
        },
      ]}
    >
      {checked ? (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M5 12.5l4.5 4.5L19 7"
            stroke={theme.cherryInk}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );
}

export function RadioMark({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.radio,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: selected ? theme.text : theme.fieldLine,
          boxShadow: Shadows.paper(theme.shadowInk),
        },
      ]}
    >
      <View style={[styles.seam, { borderColor: theme.border }]} />
      {selected ? (
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Path
            d="M2.5 7.4l3 3 6-6.4"
            stroke={theme.cherryInk}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2deg' }],
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seam: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
