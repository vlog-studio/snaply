import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  SnapExpiryCountdownDays,
  useSnapExpiresAt,
  useSnapSyncStatus,
  type Snap,
  type SnapSyncStatus,
} from '@/entities/snap';
import { daysLeftBadge, formatSeconds } from '@/shared/lib/datetime';
import { Tape, tiltFor } from '@/shared/ui/paper';
import { Polaroid } from '@/shared/ui/polaroid';
import { Tag } from '@/shared/ui/tag';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type SnapCellProps = {
  snap: Snap;
  /** Cell width in points; the print inside it sets the height. */
  width: number;
  /** Selection order, 1-based. Undefined when not selected. */
  pickNumber?: number;
  /** Whether the grid is in selection mode — a tap picks instead of plays. */
  selecting: boolean;
  /** Whether the picks' target (the tray, or a movie) already holds this snap. */
  isHeld: boolean;
  onPress: (snap: Snap) => void;
  onLongPress: (snap: Snap) => void;
};

/**
 * What the sync badge says per status. `uploaded` is the normal state and says
 * nothing — a library where every snap is announcing success would be noise.
 * `pending` is also silent: it is every snap's resting state whenever the
 * worker cannot run (signed out, offline), and a permanent "올리는 중" would be
 * a lie. Only an actual transfer and an actual failure speak.
 */
const SyncBadgeLabel: Record<SnapSyncStatus, string | undefined> = {
  pending: undefined,
  uploading: '올리는 중',
  uploaded: undefined,
  failed: '올리지 못함',
  // The server's copy is gone (SNAP-12). The file may still play here, but no
  // movie can be made from it — which is what the badge is there to say.
  expired: '만료됨',
};

/** `3일 남음` · `오늘까지` inside the countdown window, nothing before it or once it has passed. */
function expiryCountdownOf(expiresAt: number | undefined, now: number): string | undefined {
  if (expiresAt === undefined) return undefined;
  return daysLeftBadge(expiresAt, now, SnapExpiryCountdownDays);
}

/**
 * One snap in the grid: its first frame, its length, its pick number while
 * selecting, a "담김" badge whenever the target already holds it, its upload
 * state while it is not settled on the backend yet, and — once it is — the days
 * left on the server's copy near the end, or that the copy has expired.
 *
 * The badge stays visible during selection because that is exactly when it
 * matters: picking a snap the target already has does nothing, and without the
 * badge the user only finds out afterwards. It sits in the opposite corner from
 * the pick circle so the two never collide.
 *
 * Memoized because selecting one snap re-renders the whole library; without it
 * every cell would re-run its thumbnail lookup on every tap. The sync status is
 * subscribed per cell (not passed down) so an upload finishing re-renders one
 * cell, not the grid.
 */
export const SnapCell = memo(function SnapCell({
  snap,
  width,
  pickNumber,
  selecting,
  isHeld,
  onPress,
  onLongPress,
}: SnapCellProps) {
  const theme = useTheme();
  const isPicked = pickNumber !== undefined;
  const syncStatus = useSnapSyncStatus(snap.id);
  const syncLabel = SyncBadgeLabel[syncStatus];
  const expiresAt = useSnapExpiresAt(snap.id);
  // Read at render: a library left open across a day boundary shows yesterday's
  // count until something re-renders the cell, as the day headings do.
  const countdown = syncLabel ? undefined : expiryCountdownOf(expiresAt, Date.now());

  // A badge per corner of the picture: the state of the copy at the bottom
  // left, 담김 at the top left. The pick number sits on the print's corner.
  const syncTone =
    syncStatus === 'failed' ? 'cherry' : syncStatus === 'expired' ? 'sheet' : 'butter';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selecting ? { selected: isPicked } : undefined}
      accessibilityLabel={`${formatSeconds(snap.durationSec)} 스냅${isHeld ? ' · 이미 담김' : ''}${syncLabel ? ` · ${syncLabel}` : ''}${countdown ? ` · 보관 ${countdown}` : ''}`}
      accessibilityHint={selecting ? '탭하면 선택해요' : '탭하면 재생해요. 길게 누르면 선택해요'}
      onPress={() => onPress(snap)}
      onLongPress={() => onLongPress(snap)}
      style={[styles.cell, { width }]}
    >
      <Polaroid
        uri={snap.uri}
        border={4}
        foot={20}
        tilt={tiltFor(snap.id, 2)}
        style={isPicked ? { borderColor: theme.primary, borderWidth: 2 } : undefined}
        footer={
          <ThemedText selectable={false} type="dataSm" style={{ color: theme.text }}>
            {formatSeconds(snap.durationSec)}
          </ThemedText>
        }
        overlay={
          <>
            {isHeld ? <Tag label="담김" tone="mint" style={styles.heldBadge} /> : null}
            {syncLabel ? (
              <Tag label={syncLabel} tone={syncTone} style={styles.stateBadge} />
            ) : countdown ? (
              <Tag label={countdown} tone="pink" style={styles.stateBadge} />
            ) : null}
          </>
        }
      >
        {isPicked ? (
          <>
            <Tape color="tapePink" width={30} height={12} tilt={35} style={styles.pickTape} />
            <View style={[styles.pick, { backgroundColor: theme.primary }]}>
              <ThemedText selectable={false} type="dataSm" style={{ color: theme.onPrimary }}>
                {pickNumber}
              </ThemedText>
            </View>
          </>
        ) : selecting ? (
          <View
            style={[
              styles.pick,
              styles.pickEmpty,
              { borderColor: theme.textSecondary, backgroundColor: theme.backgroundElement },
            ]}
          />
        ) : null}
      </Polaroid>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // The print sits on its cell with a little room around it, so the tilt of
  // one never touches the next.
  cell: { padding: Spacing.one },
  heldBadge: { position: 'absolute', top: Spacing.one, left: Spacing.one },
  stateBadge: { position: 'absolute', bottom: Spacing.one, left: Spacing.one },
  pickTape: { position: 'absolute', top: -6, right: -10 },
  pick: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  pickEmpty: { borderWidth: 1.5, borderStyle: 'dashed' },
});
