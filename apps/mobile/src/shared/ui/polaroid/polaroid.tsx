import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Shadows, useTheme } from '@/shared/ui/theme';
import { VideoFrame } from '@/shared/ui/video-frame';

export type PolaroidProps = {
  /** The frame's video; none draws an empty dashed frame. */
  uri?: string;
  /** A picture of the caller's own instead of the video's frame — a cover image. */
  picture?: ReactNode;
  /** `square` for thumbnails, `portrait` for a 9:16 frame. */
  shape?: 'square' | 'portrait';
  /** Paper around the picture, and the deeper bottom margin under it. */
  border?: number;
  foot?: number;
  /** What sits on the bottom margin — a duration, a caption. */
  footer?: ReactNode;
  /** Degrees — from `tiltFor` for an item; a stage that holds video stays 0. */
  tilt?: number;
  /** Drawn over the picture, clipped to it — a state tag in its corner. */
  overlay?: ReactNode;
  /** Drawn over the whole print, unclipped — tape on a corner, a pick number. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A snap or a movie as an instant photo (the design system's `jj-polaroid`):
 * a sheet-coloured frame, a deeper bottom margin, a hairline paper edge and the
 * short paper shadow, leaning by a fixed amount. The picture itself is the
 * near-black `media` ground with the frame drawn into it — video never
 * lightens. Decoration around content: it owns no press and no label.
 */
export function Polaroid({
  uri,
  picture,
  shape = 'square',
  border = 3,
  foot = 14,
  footer,
  tilt = 0,
  overlay,
  children,
  style,
}: PolaroidProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.frame,
        {
          padding: border,
          paddingBottom: 0,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          boxShadow: Shadows.paper(theme.shadowInk),
          transform: tilt ? [{ rotate: `${tilt}deg` }] : undefined,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.picture,
          { aspectRatio: shape === 'portrait' ? 9 / 16 : 1, backgroundColor: theme.media },
          uri || picture
            ? null
            : [styles.empty, { borderColor: theme.textSecondary, backgroundColor: 'transparent' }],
        ]}
      >
        {picture ?? (uri ? <VideoFrame uri={uri} /> : null)}
        {overlay}
      </View>
      <View style={[styles.foot, { height: foot }]}>{footer}</View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1 },
  picture: { width: '100%', overflow: 'hidden' },
  empty: { borderWidth: 1.5, borderStyle: 'dashed' },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
});
