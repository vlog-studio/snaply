import { Pressable, StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/shared/lib/datetime';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { StickerButton } from '@/shared/ui/sticker-button';
import { TextButton } from '@/shared/ui/text-button';
import { Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { Cut } from '../model/use-movie-cuts';

/** The leading ✕ as drawn — narrower than a sticker, since it dismisses the row. */
const ReleaseWidth = 32;
const ReleaseHeight = 40;
/** Grows the ✕ to the 48dp touch minimum (decision 4) without widening the row. */
const ReleaseHitSlop = {
  top: (Sizes.touchMin - ReleaseHeight) / 2,
  bottom: (Sizes.touchMin - ReleaseHeight) / 2,
  left: (Sizes.touchMin - ReleaseWidth) / 2,
  right: (Sizes.touchMin - ReleaseWidth) / 2,
};

/**
 * How far a dead cut's reason follows the system text size. Its column is
 * about 116dp on a 360dp phone, and up to 1.25× the whole sentence — 빼 주세요
 * included — still breaks onto the two lines the row has.
 */
const ReasonTextScaleMax = 1.25;

export type CutInspectorProps = {
  cut: Cut;
  index: number;
  count: number;
  /** False for the last remaining cut: a movie must keep at least one. */
  canRemove: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onResetTrim: (index: number) => void;
  /** Lets the cut go, which brings the generate button back to this slot. */
  onDeselect: () => void;
};

/**
 * The selected cut's controls: where it sits, and the way out.
 *
 * A dead cut — its snap expired or deleted — reads its reason and what to do
 * about it instead of its position and length, on the two lines the column
 * has: this row is the one place that says why a run was refused, so 빼 주세요
 * must not be cut off (on one line beside 컷 n/N, a 360dp phone showed 보관
 * 기…). It needs no 전체 사용 slot, since a dead cut cannot be reset, and its
 * number is on the clip it is held from and in every button's name.
 *
 * One inspector for whichever cut the strip has picked, instead of one row of
 * controls per cut. It renders in the footer's action slot, standing in for
 * the generate button while a cut is held — the slot's height never changes,
 * so selecting and releasing a cut cannot make the stage above jump. That slot
 * is one button tall, which is why the read-out rides beside the position on
 * a single line instead of under it. The cut's *length* is not set here — the
 * trim handles live on the selected clip in the timeline itself — the
 * inspector reads the result out and offers `전체 사용` to drop a trim. Order
 * is changed with ◀ ▶ rather than by dragging: two buttons are reachable
 * one-handed, work with assistive touch, and need no gesture arbitration; a
 * drag strip can replace them later without changing what is committed.
 *
 * Two things about the row's edges (2026-08-13). Removing a cut is a **trash**
 * icon, not the ✕ it used to be: ✕ closes things everywhere else in the app, so
 * the one control here that destroys something was wearing the app's dismiss
 * sign. And the row now opens with that dismissal for real — the leading ✕ lets
 * the cut go, which is what puts the generate button back in this slot. Letting
 * go was previously only a tap on the strip's empty space, which is a thing to
 * know rather than a thing to see, and it is the way back to the screen's own
 * next step.
 */
export function CutInspector({
  cut,
  index,
  count,
  canRemove,
  onMove,
  onRemove,
  onResetTrim,
  onDeselect,
}: CutInspectorProps) {
  const theme = useTheme();
  const number = index + 1;
  const missing = cut.snap === undefined;
  const isTrimmed = cut.ref.trim !== undefined;
  const isFirst = index === 0;
  const isLast = index === count - 1;

  const moveButton = (direction: -1 | 1) => {
    const disabled = direction === -1 ? isFirst : isLast;
    return (
      <StickerButton
        icon={direction === -1 ? 'chevronLeft' : 'chevronRight'}
        accessibilityLabel={`컷 ${number} ${direction === -1 ? '앞으로' : '뒤로'}`}
        disabled={disabled}
        onPress={() => onMove(index, direction)}
      />
    );
  };

  return (
    <View style={styles.inspector}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="컷 선택 해제"
        hitSlop={ReleaseHitSlop}
        onPress={onDeselect}
        style={({ pressed }) => [styles.release, { opacity: pressed ? 0.6 : 1 }]}
      >
        <DoodleIcon name="close" size={20} color={theme.textSecondary} />
      </Pressable>

      <View style={styles.meta}>
        {missing ? (
          <ThemedText
            type="small"
            themeColor="cherryInk"
            numberOfLines={2}
            maxFontSizeMultiplier={ReasonTextScaleMax}
          >
            {cut.gone === 'expired'
              ? '보관 기간이 끝났어요 · 빼 주세요'
              : '스냅이 삭제됐어요 · 빼 주세요'}
          </ThemedText>
        ) : (
          <>
            <View style={styles.metaLine}>
              <ThemedText type="smallBold">
                컷 {number}/{count}
              </ThemedText>
              <ThemedText
                type="small"
                numberOfLines={1}
                themeColor="textSecondary"
                style={styles.readout}
              >
                사용 {formatSeconds(cut.usedSec)}
              </ThemedText>
            </View>
            {/* The slot keeps its height when the action is absent, so the row
                — and the stage above, sized by what this zone leaves over —
                does not move as playback crosses trimmed and untrimmed cuts.
                A text button (the canvas's `jj-textbtn`), not cherry ink:
                cherry ink is how an error reads, and this is an action. */}
            <View style={styles.resetSlot}>
              {isTrimmed ? (
                <TextButton
                  label="전체 사용"
                  accessibilityLabel={`컷 ${number} 전체 사용`}
                  onPress={() => onResetTrim(index)}
                />
              ) : null}
            </View>
          </>
        )}
      </View>

      <View style={styles.tools}>
        {moveButton(-1)}
        {moveButton(1)}
        {/* Taking a cut out is ink, not red: red is the main action. */}
        <StickerButton
          icon="trash"
          accessibilityLabel={`컷 ${number} 빼기`}
          disabled={!canRemove}
          onPress={() => onRemove(index)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inspector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  // Narrower than a bordered tool and unbordered: it dismisses the row rather
  // than acting on the cut, and the row is one button tall for every occupant.
  release: {
    width: ReleaseWidth,
    height: ReleaseHeight,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  meta: { flex: 1, minWidth: 0, gap: Spacing.half },
  metaLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  readout: { flexShrink: 1 },
  // One text button's line (`link` 14/20), reserved always. Its words keep
  // their own width, so the highlighter does not run across the column.
  resetSlot: { minHeight: 20, justifyContent: 'center', alignItems: 'flex-start' },
  tools: { flexDirection: 'row', gap: Spacing.one + Spacing.half },
});
