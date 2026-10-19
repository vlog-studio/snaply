import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PunchedHoles } from '@/shared/ui/paper';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { Reel } from '@/shared/ui/reel';

export type SnapSelectionBarProps = {
  selectedCount: number;
  /** Snaps the target already holds — what the remaining room is measured against. */
  heldCount: number;
  /** The target movie's cap. */
  capacity: number;
  /** What the picks are headed for: `새 무비`, or an existing movie's title. */
  targetLabel: string;
  /** Wording of the confirming action, since the target decides it. */
  confirmLabel: string;
  /**
   * What the picking rules just refused, if anything. It shows here — pinned
   * where the thumb already is — because a message inserted at the top of the
   * scroll is off-screen for a user deep in the grid, and inserting it shifts
   * every cell under their finger.
   */
  notice?: string;
  onClear: () => void;
  onConfirm: () => void;
  /**
   * The confirm is waiting on the server (the edit draft asks before it opens a
   * movie): it shows that it is working and takes no second tap, and the picks
   * cannot be cleared or deleted under it.
   */
  busy?: boolean;
  /** The target cannot take these picks right now, for a reason `notice` gives. */
  confirmDisabled?: boolean;
  /**
   * Reports the bar's rendered height. The bar floats over the screen's scroll,
   * so the screen pads its content by exactly this much — a guessed constant is
   * wrong the moment the safe-area inset, the font scale, or the notice line
   * differs from the device it was measured on.
   */
  onHeight?: (height: number) => void;
  /**
   * Omitted where the screen does not own deletion: picking snaps *into* a
   * movie is not the place to delete originals out of the library.
   */
  onDelete?: () => void;
  /**
   * Saves the picks to the device's album (SNAP-17), beside 삭제. Omitted where
   * saving is the confirm itself, or not this screen's to offer.
   */
  onSaveToAlbum?: () => void;
  /** The confirm's ticket: cherry for a movie made by hand, lavender for the agent's edit. */
  tone?: 'primary' | 'ai';
};

/**
 * The selection mode's bottom bar: how many snaps are picked against the
 * target's remaining room, and what can be done with them.
 *
 * It reports the room rather than a bare count because the ten-snap cap is the
 * product's one hard constraint (MOV-5) and the moment it bites is here —
 * the user has to see why an eleventh pick is refused.
 */
export function SnapSelectionBar({
  selectedCount,
  heldCount,
  capacity,
  targetLabel,
  confirmLabel,
  notice,
  onClear,
  onConfirm,
  onDelete,
  onSaveToAlbum,
  onHeight,
  busy = false,
  confirmDisabled = false,
  tone = 'primary',
}: SnapSelectionBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const room = Math.max(capacity - heldCount, 0);
  const canConfirm = selectedCount > 0 && room > 0 && !busy && !confirmDisabled;
  const canChange = selectedCount > 0 && !busy;

  return (
    <View
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          boxShadow: `0 -2px 0 ${theme.shadowInk}`,
          paddingBottom: insets.bottom + Spacing.four,
        },
      ]}
    >
      <PunchedHoles />
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <ThemedText type="smallBold" themeColor="cherryInk" importantForAccessibility="no">
            !
          </ThemedText>
          <ThemedText type="small" themeColor="cherryInk" style={styles.noticeText}>
            {notice}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.counts}>
        <ThemedText type="bodySm" style={styles.count}>
          {selectedCount}개 선택
        </ThemedText>
        {/* Not clamped: with no room beside the count (large system text on a
            narrow phone) it moves to its own line, whole — clamped, Android
            cut its second line in half. */}
        <ThemedText
          type="data"
          themeColor={room === 0 ? 'cherryInk' : undefined}
          style={styles.room}
        >
          {/* A target holding nothing yet (a movie about to be created) has no
              fill to report — its one fact is the cap. */}
          {!Number.isFinite(capacity)
            ? targetLabel
            : heldCount > 0
              ? `${targetLabel} ${heldCount}/${capacity}${room === 0 ? ' · 가득 참' : ` · ${room}개 더`}`
              : `${targetLabel} · 최대 ${capacity}개`}
        </ThemedText>
      </View>

      {/* The word actions, then the ticket. With no room for the ticket's words
          on one line beside them (a 360dp phone, or large system text) the
          ticket takes its own full-width line instead of breaking its words a
          syllable at a time (`이 스냅으로 새 무 / 비`). */}
      <View style={styles.actions}>
        <View style={styles.wordActions}>
          {onDelete ? (
            <TextAction
              label="삭제"
              accessibilityLabel={`${selectedCount}개 스냅 삭제`}
              disabled={!canChange}
              danger
              onPress={onDelete}
            />
          ) : null}
          {onSaveToAlbum ? (
            <TextAction
              label="저장"
              accessibilityLabel={`${selectedCount}개 스냅 앨범에 저장`}
              disabled={!canChange}
              onPress={onSaveToAlbum}
            />
          ) : null}
          <TextAction
            label="해제"
            accessibilityLabel="선택 해제"
            disabled={!canChange}
            onPress={onClear}
          />
        </View>
        <SnaplyButton
          title={confirmLabel}
          accessibilityLabel={confirmLabel}
          variant={tone}
          busy={busy}
          disabled={!canConfirm && !busy}
          onPress={onConfirm}
          leading={
            busy ? (
              <Reel color={tone === 'ai' ? theme.stickerInk : theme.onPrimary} size={16} />
            ) : undefined
          }
          style={styles.confirm}
        />
      </View>
    </View>
  );
}

/**
 * A quiet word-only action of the bar, in ink. 삭제 is not red — cherry is the
 * main action — but ink over a kraft highlighter (the design system's
 * `sg-act--danger`, root docs/decisions/junk-journal-design-system.md): the
 * stroke is the text's own ground, as `TextButton` draws its pink one, and the
 * ink on it is `stickerInk` because kraft stays light at night. A disabled
 * action drops the stroke.
 */
function TextAction({
  label,
  accessibilityLabel,
  disabled,
  danger = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const highlighted = danger && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.textAction, { opacity: pressed ? 0.7 : 1 }]}
    >
      <ThemedText
        selectable={false}
        type="smallBold"
        themeColor={disabled ? 'textSecondary' : 'text'}
        style={
          highlighted
            ? [styles.highlighter, { color: theme.stickerInk, backgroundColor: theme.kraft }]
            : undefined
        }
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.five - Spacing.half,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two + Spacing.half,
  },
  notice: { flexDirection: 'row', gap: Spacing.one + Spacing.half, alignItems: 'flex-start' },
  noticeText: { flex: 1 },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  count: { fontWeight: 700 },
  room: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.two + Spacing.half,
    rowGap: Spacing.two,
  },
  wordActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
  textAction: {
    minHeight: Sizes.touchMin,
    minWidth: Sizes.touchMin,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlighter: { paddingHorizontal: 2 },
  // Grow only: a ticket that may also shrink is laid out from a zero basis
  // and never moves to its own line. `maxWidth` lets its words wrap once it
  // fills a line of its own.
  confirm: { flexGrow: 1, maxWidth: '100%' },
});
