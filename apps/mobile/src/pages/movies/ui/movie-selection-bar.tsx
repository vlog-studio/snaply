import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shareBlockMessage, type ShareBlock } from '@/features/share-movie';
import { PunchedHoles } from '@/shared/ui/paper';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type MovieSelectionBarProps = {
  selectedCount: number;
  /**
   * Why the one selected movie cannot be shared, if it cannot. Read only while
   * exactly one movie is selected — the 공유 action exists only then, the same
   * rule as the movie screen — and worded by the feature that owns the act, so
   * the three surfaces offering it cannot state the same block differently.
   */
  shareBlock: ShareBlock | undefined;
  /** The file is downloading before the share sheet can open. */
  shareBusy: boolean;
  onShare: () => void;
  onDelete: () => void;
  onClear: () => void;
  /**
   * Reports the bar's laid-out height. It stands over the grid, so the grid
   * leaves that much room at its foot — and the height moves with the share
   * reason, the system navigation inset and the text size.
   */
  onHeight?: (height: number) => void;
};

/**
 * The movie grid's selection-mode bottom bar: how many movies are picked and
 * what can be done with them, standing where the tab bar stood.
 *
 * Deletion is the act that works on any number, so it is the bar's primary
 * button. Share is a single-movie act, so it appears while exactly one movie is
 * picked — the count is right above it, so its coming and going reads. What it
 * must **not** do is vanish on a condition the grid cannot show (2026-08-13):
 * a movie with no rendered file keeps the control and states why it is off,
 * the same idiom watch mode and the ⋯ sheet already use, because otherwise the
 * user is left comparing two identical-looking tiles wondering why only one of
 * them can be sent. `busy` is separate for the same reason — a download in
 * flight makes the button say so instead of taking the button away.
 *
 * Rename is not here at all: it belongs to the movie screen, where the title is
 * on display while it is edited.
 */
export function MovieSelectionBar({
  selectedCount,
  shareBlock,
  shareBusy,
  onShare,
  onDelete,
  onClear,
  onHeight,
}: MovieSelectionBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const single = selectedCount === 1;
  // A block with nothing to say — the address still on its way — prints no
  // line at all: 공유 just waits, disabled.
  const shareReason = single ? shareBlockMessage(shareBlock) : undefined;

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
      <View style={styles.counts}>
        <ThemedText type="bodySm" style={styles.count}>
          {selectedCount}편 선택
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="선택 해제"
          accessibilityState={{ disabled: selectedCount === 0 }}
          disabled={selectedCount === 0}
          hitSlop={8}
          onPress={onClear}
          style={styles.textAction}
        >
          <ThemedText selectable={false} type="smallBold" themeColor="textSecondary">
            해제
          </ThemedText>
        </Pressable>
      </View>

      {shareReason ? (
        <ThemedText type="small" themeColor="textSecondary">
          {shareReason}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        {single ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="공유"
            accessibilityState={{ disabled: shareBlock !== undefined || shareBusy }}
            disabled={shareBlock !== undefined || shareBusy}
            hitSlop={8}
            onPress={onShare}
            style={({ pressed }) => [
              styles.textAction,
              { opacity: shareBlock !== undefined ? 0.45 : pressed ? 0.7 : 1 },
            ]}
          >
            <ThemedText selectable={false} type="smallBold">
              {shareBusy ? '준비 중…' : '공유'}
            </ThemedText>
          </Pressable>
        ) : null}
        <SnaplyButton
          variant="danger"
          title="삭제"
          accessibilityLabel={`${selectedCount}편 무비 삭제`}
          disabled={selectedCount === 0}
          onPress={onDelete}
          style={styles.primaryAction}
        />
      </View>
    </View>
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
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  count: { fontWeight: 700 },
  textAction: {
    minHeight: Sizes.touchMin,
    minWidth: Sizes.touchMin,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: { flex: 1 },
});
