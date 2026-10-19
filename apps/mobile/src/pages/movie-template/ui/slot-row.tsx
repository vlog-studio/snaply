import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { ConfidenceKind, FilledSlot } from '@/features/fill-template';
import { formatSeconds, formatTimestamp } from '@/shared/lib/datetime';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { tiltFor } from '@/shared/ui/paper';
import { TextButton } from '@/shared/ui/text-button';
import { MaxContentWidth, Shadows, Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

export type SlotRowProps = {
  filled: FilledSlot;
  /** What `filled.confidence` measures. The row prints the number and says so out loud. */
  confidenceKind: ConfidenceKind;
  index: number;
  onShoot: (slotId: string) => void;
  onDrop: (slotId: string) => void;
  onRestore: (slotId: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
};

/**
 * Square on purpose, not 9:16 like the snap it samples. The frame is an
 * identifying glance, and matching the source ratio only bought 32dp of row
 * height that pushed the next scene off screen — the list has to be scannable as
 * an *order* of scenes, which costs more than a full-height crop is worth.
 * `VideoFrame` covers, so the middle of the shot survives.
 */
const FrameSize = 64;

/**
 * Each move and drop control is a whole 48dp target (decision 4), side by side
 * as on the canvas (TemplateDetail `td-ctrl`), so no target reaches into its
 * neighbour's. They were 28dp with a 10dp hitSlop, the arrows stacked 2dp apart:
 * the slops overlapped, the later sibling took the overlap, and 위로 was left
 * about 32×30dp. A slop also stops at its parent's edge on Android, so the size
 * is the view's own rather than a slop's.
 */
const ControlSize = Sizes.touchMin;
const ControlCount = 3;
const IconSize = 18;

/**
 * What the template screen leaves a row across: its gutters and the receipt's
 * own padding (`movie-template-page.tsx` `content` and `slots`).
 */
const RowInset = 2 * Spacing.five + 2 * Spacing.two;

/**
 * The least the slot's words need beside the controls at the normal text size:
 * the name and its percentage on one line (`돌아오는 길` · `52%`). The capture
 * time under them may wrap to a second line, which still fits beside the frame.
 */
const MinTextWidth = 120;

/**
 * Whether a filled row's controls take a line of their own under its words
 * rather than sitting beside them. Three 48dp targets take 144dp of the row; on
 * a narrow phone, or as the text grows, that would squeeze the slot's name to a
 * glyph or two, so there they move under the words instead of shrinking.
 */
export function controlsBelowText({ width, fontScale }: { width: number; fontScale: number }) {
  const rowWidth = Math.min(width, MaxContentWidth) - RowInset;
  const textWidth = rowWidth - FrameSize - 2 * Spacing.two - ControlSize * ControlCount;
  return textWidth < MinTextWidth * fontScale;
}

/**
 * One scene of the template: what to shoot, what the match put there, and the
 * controls that reorder or clear it.
 *
 * The label is the instruction and the line under it is the evidence — when the
 * snap was taken, and how sure the app is it belongs to the same outing. They are
 * kept visibly separate on purpose: the app has not looked at the picture and
 * must not read as though it has, so it reports a time and a percentage rather
 * than claiming the snap *is* a 골목.
 *
 * The percentage is printed bare. It sat behind `같은 외출 확신 NN%` and that
 * label, repeated down six rows that all score the same, cost more width than it
 * bought — visually, what the number measures belongs in the screen once, as the
 * column's own heading. It is **not** left unsaid: the number carries the meaning
 * in its accessibility label, where repeating it costs no width at all.
 * See `docs/features/movie-templates.md`.
 */
export function SlotRow({
  filled,
  confidenceKind,
  index,
  onShoot,
  onDrop,
  onRestore,
  onMove,
}: SlotRowProps) {
  const theme = useTheme();
  const below = controlsBelowText(useWindowDimensions());
  const { slot, snap, confidence, canMoveUp, canMoveDown } = filled;

  // Order first, then removal — the two things done to a row that already has
  // a snap. An empty row has nothing to move or clear, so it gets neither.
  const controls = snap ? (
    <View style={[styles.controls, below && styles.controlsBelow]}>
      <MoveButton
        label={`${slot.label} 위로`}
        icon="chevronUp"
        enabled={canMoveUp}
        onPress={() => onMove(index, -1)}
      />
      <MoveButton
        label={`${slot.label} 아래로`}
        icon="chevronDown"
        enabled={canMoveDown}
        onPress={() => onMove(index, 1)}
      />
      {confidence !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${slot.label} 컷 빼기`}
          onPress={() => onDrop(slot.id)}
          style={styles.control}
        >
          <DoodleIcon color={theme.textSecondary} name="close" size={IconSize} />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={[styles.row, { borderBottomColor: theme.ruleLine }]}>
      {snap ? (
        // `VideoFrame` absolute-fills its parent, so the frame's size has to live
        // on a wrapper — handing it to the component directly takes the thumbnail
        // out of the row's flow and the body then renders on top of it.
        <View
          style={[
            styles.frame,
            {
              borderColor: theme.backgroundElement,
              boxShadow: Shadows.paper(theme.shadowInk),
              transform: [{ rotate: `${tiltFor(snap.id, 2)}deg` }],
            },
          ]}
        >
          <VideoFrame uri={snap.uri} />
        </View>
      ) : (
        <View style={[styles.placeholder, { borderColor: theme.textSecondary }]}>
          <ThemedText selectable={false} type="xsmall" themeColor="textSecondary">
            비어 있음
          </ThemedText>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText type="bodySm" numberOfLines={1} style={styles.label}>
            {slot.label}
          </ThemedText>
          {confidence !== undefined ? (
            <ThemedText
              accessibilityLabel={`${confidenceLabel(confidenceKind)} ${Math.round(confidence * 100)}퍼센트`}
              selectable={false}
              type="data"
              style={styles.label}
            >
              {Math.round(confidence * 100)}%
            </ThemedText>
          ) : null}
        </View>

        {snap ? (
          // Free to wrap: beside the controls the capture time can outrun the
          // line, and a cut-off length is a lost fact. Two lines still fit
          // beside the frame.
          <ThemedText type="dataSm">
            {`${formatTimestamp(snap.capturedAt)} · ${formatSeconds(snap.durationSec)}`}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {slot.hint}
          </ThemedText>
        )}

        {snap === undefined || confidence === undefined ? (
          <View style={styles.actions}>
            {snap ? (
              <ThemedText
                selectable={false}
                type="xsmall"
                themeColor="cherryInk"
                style={styles.label}
              >
                방금 찍은 컷
              </ThemedText>
            ) : (
              <>
                <TextButton
                  label="지금 찍기"
                  accessibilityLabel={`${slot.label} 지금 찍기`}
                  onPress={() => onShoot(slot.id)}
                />
                {filled.isDropped ? (
                  <TextButton
                    label="되돌리기"
                    accessibilityLabel={`${slot.label} 되돌리기`}
                    onPress={() => onRestore(slot.id)}
                  />
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {below ? controls : null}
      </View>

      {below ? null : controls}
    </View>
  );
}

/**
 * What the column of numbers measures, in the fewest words that stay true.
 *
 * Neither reading is a claim about the picture: the app has not looked at it,
 * and the server that has is scoring a *position*, not naming a subject.
 */
export function confidenceLabel(kind: ConfidenceKind): string {
  return kind === 'slot-fit' ? '어울림' : '같은 외출일 가능성';
}

type MoveButtonProps = {
  label: string;
  icon: 'chevronUp' | 'chevronDown';
  enabled: boolean;
  onPress: () => void;
};

/** Kept drawn but dimmed when it cannot fire, so the controls never reflow. */
function MoveButton({ label, icon, enabled, onPress }: MoveButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={[styles.control, { opacity: enabled ? 1 : 0.3 }]}
    >
      <DoodleIcon color={theme.textSecondary} name={icon} size={IconSize} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A line of the receipt, ruled under.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 58,
    borderBottomWidth: 1,
    paddingVertical: Spacing.one + Spacing.half,
  },
  // A tiny print of the snap.
  frame: {
    width: FrameSize,
    height: FrameSize,
    borderWidth: 2,
    overflow: 'hidden',
  },
  placeholder: {
    width: FrameSize,
    height: FrameSize,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: Spacing.half, justifyContent: 'center' },
  label: { fontWeight: 700 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The percentage stays pushed to the far edge even though it is now bare.
    // Sitting flush against the label, `골목 70%` reads as "70% sure this is an
    // alley" — the one claim the match cannot make.
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  actions: { flexDirection: 'row', gap: Spacing.one, marginLeft: -Spacing.two },
  // Abutting, as on the canvas: the 48dp targets are the spacing.
  controls: { flexDirection: 'row', alignItems: 'center' },
  // Under the words they keep the row's end, where they sit beside them.
  controlsBelow: { alignSelf: 'flex-end' },
  control: {
    width: ControlSize,
    height: ControlSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
