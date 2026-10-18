import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requestSnapReconcile } from '@/features/reconcile-snaps';
import { useRestoreSnaps, useTrashedSnaps, type TrashedSnap } from '@/features/restore-snap';
import { formatDateTime, formatSeconds } from '@/shared/lib/datetime';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { ImageFrame } from '@/shared/ui/image-frame';
import { PaperGround, PaperPiece, Tape, tiltFor } from '@/shared/ui/paper';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Shadows, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { Toast } from '@/shared/ui/toast';

import { daysLeftLabel } from '../lib/days-left';

/**
 * 최근 삭제 (`/recently-deleted`) — snaps deleted everywhere that the server still
 * keeps until their retention ends, most recent first, each with 되살리기
 * (SNAP-20, docs/decisions/snap-trash.md).
 *
 * A restored snap goes back on the account and the library's reconcile brings
 * it into the Snap tab, its file fetched on first play; the screen asks for that
 * pass at once instead of waiting for the next return to the foreground. Only
 * the snap comes back — the cuts the delete took out of movies stay out.
 *
 * Reached from the end of the Snap tab. It says nothing about how the trash
 * works: each row's countdown is the state, and the empty screen is one line.
 */
export function RecentlyDeletedPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { snaps, failed, retry } = useTrashedSnaps();
  const { restoreSnaps, restoringIds, errorMessage, clearError } = useRestoreSnaps();
  const [notice, setNotice] = useState<string>();
  // Read once per visit: the countdown is in days, and a render-time clock is impure.
  const [now] = useState(Date.now);

  const restore = async (videoId: string) => {
    const outcome = await restoreSnaps([videoId]);
    if (outcome.restored.length > 0) {
      requestSnapReconcile();
      setNotice('스냅을 되살렸어요');
    }
  };

  const empty =
    snaps === undefined ? (
      failed ? (
        <EmptySheet tape="tapePink" tilt={-1}>
          <View style={styles.errorLine}>
            <ThemedText type="heading" themeColor="cherryInk" importantForAccessibility="no">
              !
            </ThemedText>
            <ThemedText type="heading" themeColor="cherryInk" accessibilityRole="alert">
              최근 삭제를 불러오지 못했어요
            </ThemedText>
          </View>
          <SnaplyButton title="다시 시도" accessibilityLabel="다시 시도" onPress={retry} />
        </EmptySheet>
      ) : null
    ) : (
      <EmptySheet tape="tapeButter" tilt={1}>
        <DoodleIcon name="trash" size={36} color={theme.textSecondary} />
        <ThemedText type="heading">최근 삭제한 스냅이 없어요</ThemedText>
      </EmptySheet>
    );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.eight + insets.bottom }]}
      >
        <PaperGround kind="ruled" />
        {snaps && snaps.length > 0 ? (
          // The trash as one receipt, a line per snap, taped to the page.
          <View>
            <Tape color="tapeSky" tilt={-8} style={styles.receiptTape} />
            <PaperPiece edge="tornBottom" tilt={-0.4} style={styles.receipt}>
              {snaps.map((snap, index) => (
                <TrashedSnapRow
                  key={snap.videoId}
                  snap={snap}
                  now={now}
                  last={index === snaps.length - 1}
                  restoring={restoringIds.has(snap.videoId)}
                  disabled={restoringIds.size > 0}
                  onRestore={() => void restore(snap.videoId)}
                />
              ))}
            </PaperPiece>
          </View>
        ) : (
          empty
        )}
      </ScrollView>
      <Toast
        message={notice ?? errorMessage}
        onDismiss={() => {
          setNotice(undefined);
          clearError();
        }}
        bottomOffset={insets.bottom + Spacing.three}
      />
    </View>
  );
}

/** An empty state on a torn sheet, taped to the page. */
function EmptySheet({
  tape,
  tilt,
  children,
}: {
  tape: 'tapeButter' | 'tapePink';
  tilt: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.emptyWrap}>
      <Tape color={tape} style={styles.emptyTape} />
      <PaperPiece edge="tornBottom" tilt={tilt} style={styles.empty}>
        {children}
      </PaperPiece>
    </View>
  );
}

function TrashedSnapRow({
  snap,
  now,
  last,
  restoring,
  disabled,
  onRestore,
}: {
  snap: TrashedSnap;
  now: number;
  last: boolean;
  restoring: boolean;
  disabled: boolean;
  onRestore: () => void;
}) {
  const theme = useTheme();
  const [coverFailed, setCoverFailed] = useState(false);
  const left = daysLeftLabel(snap.restorableUntil, now);

  return (
    <View
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.ruleLine }]}
    >
      <View
        style={[
          styles.cover,
          {
            backgroundColor: theme.media,
            borderColor: theme.backgroundElement,
            boxShadow: Shadows.paper(theme.shadowInk),
            transform: [{ rotate: `${tiltFor(snap.videoId, 1.5)}deg` }],
          },
        ]}
      >
        {snap.thumbnailUrl && !coverFailed ? (
          <ImageFrame uri={snap.thumbnailUrl} onError={() => setCoverFailed(true)} />
        ) : null}
      </View>
      <View style={styles.meta}>
        <ThemedText type="bodySm" numberOfLines={1} style={styles.time}>
          {formatDateTime(snap.capturedAt)}
        </ThemedText>
        <ThemedText type="data">
          {formatSeconds(snap.durationSec)} · {left}
        </ThemedText>
      </View>
      <SnaplyButton
        variant="secondary"
        title={restoring ? '되살리는 중…' : '되살리기'}
        accessibilityLabel={`${formatDateTime(snap.capturedAt)} 스냅 되살리기`}
        busy={restoring}
        disabled={disabled && !restoring}
        onPress={onRestore}
        style={styles.restore}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  receiptTape: { position: 'absolute', top: -6, left: Spacing.two, zIndex: 2 },
  receipt: {
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  cover: { width: 56, height: 56, borderWidth: 4, overflow: 'hidden' },
  meta: { flex: 1, minWidth: 0, gap: Spacing.half },
  time: { fontWeight: 700 },
  restore: { minWidth: 96 },
  emptyWrap: { marginTop: Spacing.seven },
  emptyTape: { position: 'absolute', top: -8, alignSelf: 'center', zIndex: 2 },
  empty: {
    alignItems: 'center',
    gap: Spacing.three + Spacing.half,
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.five,
  },
  errorLine: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
});
