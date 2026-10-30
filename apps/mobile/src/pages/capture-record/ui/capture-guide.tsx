import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { CutSubject } from '../api/read-previous-cut';

// Faint enough that the live feed stays the thing being framed.
const GHOST_OPACITY = 0.35;

// The same cream as the viewfinder's focus frame, a step quieter.
const GRID_LINE = 'rgba(243,231,207,0.3)';
const SUBJECT_LINE = 'rgba(243,231,207,0.85)';

type Size = { width: number; height: number };

/**
 * Where a spot on a frame lands once the frame is cover-fitted into `area` —
 * the same fit the preview and the ghost use. The subject box is a square of
 * `size` × frame width around its centre, which is how the editor measures it.
 */
export function coverSubjectRect(subject: CutSubject, frame: Size, area: Size) {
  const scale = Math.max(area.width / frame.width, area.height / frame.height);
  const offsetX = (area.width - frame.width * scale) / 2;
  const offsetY = (area.height - frame.height * scale) / 2;
  const side = subject.size * frame.width * scale;
  return {
    left: offsetX + subject.cx * frame.width * scale - side / 2,
    top: offsetY + subject.cy * frame.height * scale - side / 2,
    width: side,
    height: side,
  };
}

/**
 * The framing guide drawn over the feed: the previous cut's closing frame as a
 * ghost, rule-of-thirds lines, and — when the AI read the previous cut — a
 * dashed box where its subject was. Decoration only — it never takes a touch.
 * The ghost is cover-fitted like the preview, so a subject lined up on it lands
 * where the previous cut had it.
 */
export function CaptureGuide({
  ghostUri,
  subject,
  frameSize,
}: {
  ghostUri?: string;
  subject?: CutSubject | null;
  /** The previous cut's display size, to place `subject` the way the ghost is fitted. */
  frameSize?: Size;
}) {
  const [area, setArea] = useState<Size>();
  const onLayout = ({ nativeEvent }: LayoutChangeEvent) =>
    setArea({ width: nativeEvent.layout.width, height: nativeEvent.layout.height });

  const subjectRect =
    subject && frameSize && area ? coverSubjectRect(subject, frameSize, area) : undefined;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={onLayout}
      testID="capture-guide"
    >
      {ghostUri ? (
        <Image
          source={{ uri: ghostUri }}
          contentFit="cover"
          style={[StyleSheet.absoluteFill, { opacity: GHOST_OPACITY }]}
          testID="capture-guide-ghost"
        />
      ) : null}
      <View style={[styles.vertical, { left: '33.33%' }]} />
      <View style={[styles.vertical, { left: '66.66%' }]} />
      <View style={[styles.horizontal, { top: '33.33%' }]} />
      <View style={[styles.horizontal, { top: '66.66%' }]} />
      {subjectRect ? (
        <View style={[styles.subject, subjectRect]} testID="capture-guide-subject" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  vertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: GRID_LINE,
  },
  horizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: GRID_LINE,
  },
  subject: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: SUBJECT_LINE,
  },
});
