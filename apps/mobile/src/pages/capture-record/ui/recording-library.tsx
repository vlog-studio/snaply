import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '@/shared/lib/datetime';
import { formatFileSize } from '@/shared/lib/format-file-size';
import type { LocalRecording } from '@/shared/lib/recording-files';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { StickerButton } from '@/shared/ui/sticker-button';
import { TextButton } from '@/shared/ui/text-button';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type RecordingLibraryProps = {
  deletingId?: string;
  isLoading: boolean;
  onClose: () => void;
  /** Deleting everywhere (SNAP-16). */
  onDelete: (recording: LocalRecording) => Promise<void>;
  /** Whether the server still keeps this recording's snap (SNAP-19). */
  canDeleteFromDevice: (recording: LocalRecording) => boolean;
  onDeleteFromDevice: (recording: LocalRecording) => Promise<void>;
  onSelect: (recording: LocalRecording) => void;
  recordings: LocalRecording[];
  visible: boolean;
};

export function RecordingLibrary({
  deletingId,
  isLoading,
  onClose,
  onDelete,
  canDeleteFromDevice,
  onDeleteFromDevice,
  onSelect,
  recordings,
  visible,
}: RecordingLibraryProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  // A recording whose snap the server still keeps gets the same question as the
  // snap tab: from this device only, or everywhere. Either way the snap can
  // still come back from 최근 삭제 until its retention ends (SNAP-20); the
  // other recordings never reached the server, so their delete is final.
  // The question is a plain dark sheet drawn inside this modal (the capture
  // screens stay undecorated) — a bottom sheet of its own would be a second
  // modal opening over this one. Which question it asks is judged once, when
  // it opens: an upload finishing while it is up must not swap the answers
  // under the user's finger.
  const [confirming, setConfirming] = useState<{ recording: LocalRecording; kept: boolean }>();
  const askDelete = (recording: LocalRecording) =>
    setConfirming({ recording, kept: canDeleteFromDevice(recording) });
  const closeConfirm = () => setConfirming(undefined);
  const answer = (run: (recording: LocalRecording) => Promise<void>) => {
    const target = confirming?.recording;
    setConfirming(undefined);
    if (target) void run(target);
  };
  // A question left open when the library closes is dropped, so it does not
  // come back over the list the next time the library opens.
  if (!visible && confirming) setConfirming(undefined);

  return (
    <Modal
      animationType="slide"
      onRequestClose={confirming ? closeConfirm : onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: theme.media,
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* While the question is up the list behind it is out of the
            screen-reader order: the sheet is drawn in this same modal, and
            `accessibilityViewIsModal` is iOS-only and hides only the sheet's
            own siblings — TalkBack could otherwise reach another row's 삭제
            (swapping the question's target) or select a row under the sheet. */}
        <View
          style={styles.content}
          importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={!!confirming}
        >
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <ThemedText type="subtitle" accessibilityRole="header">
                찍은 스냅
              </ThemedText>
              <ThemedText type="data">앱에 저장된 스냅 {recordings.length}개</ThemedText>
            </View>
            <StickerButton icon="close" accessibilityLabel="스냅 목록 닫기" onPress={onClose} />
          </View>

          <FlatList
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[
              styles.listContent,
              recordings.length === 0 && styles.emptyListContent,
            ]}
            data={recordings}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { borderColor: theme.textSecondary }]}>
                  <DoodleIcon name="play" size={26} />
                </View>
                <ThemedText type="heading">
                  {isLoading ? '스냅을 불러오는 중' : '아직 찍은 스냅이 없어요'}
                </ThemedText>
              </View>
            }
            renderItem={({ item, index }) => {
              const isDeleting = deletingId === item.id;

              return (
                // Ruled like the board: a line under every row and over the first.
                <View
                  style={[
                    styles.recordingRow,
                    { borderBottomColor: theme.ruleLine },
                    index === 0 && [styles.firstRow, { borderTopColor: theme.ruleLine }],
                  ]}
                >
                  <Pressable
                    accessibilityHint="스냅을 재생하고 쓸 수 있어요"
                    accessibilityLabel={`${formatDateTime(item.createdAt)} 찍은 스냅`}
                    accessibilityRole="button"
                    disabled={isDeleting}
                    onPress={() => onSelect(item)}
                    style={styles.recordingMain}
                  >
                    <View
                      style={[
                        styles.playIcon,
                        { backgroundColor: theme.ribbon, borderColor: theme.border },
                      ]}
                    >
                      <DoodleIcon name="play" size={20} />
                    </View>
                    <View style={styles.recordingCopy}>
                      <ThemedText type="bodySm" style={styles.date}>
                        {formatDateTime(item.createdAt)}
                      </ThemedText>
                      <ThemedText type="data">{formatFileSize(item.size)} · 앱에 저장됨</ThemedText>
                    </View>
                  </Pressable>
                  {/* A delete that is only a word: ink on a kraft marker, not
                      red — red is the main action. */}
                  <TextButton
                    tone="delete"
                    label={isDeleting ? '삭제하는 중…' : '삭제'}
                    accessibilityLabel={`${formatDateTime(item.createdAt)} 스냅 삭제`}
                    disabled={isDeleting}
                    onPress={() => askDelete(item)}
                    style={styles.deleteButton}
                  />
                </View>
              );
            }}
          />
        </View>
        {confirming ? (
          <View style={StyleSheet.absoluteFill}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="시트 닫기"
              onPress={closeConfirm}
              style={[StyleSheet.absoluteFill, styles.scrim]}
            />
            <View
              accessibilityViewIsModal
              accessibilityLabel="스냅 삭제 확인"
              style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.five }]}
            >
              <ThemedText type="subtitle" accessibilityRole="header">
                스냅을 삭제할까요?
              </ThemedText>
              <View style={styles.target}>
                <ThemedText type="bodySm" style={styles.date}>
                  {formatDateTime(confirming.recording.createdAt)}
                </ThemedText>
                <ThemedText type="data">{formatFileSize(confirming.recording.size)}</ThemedText>
              </View>
              {confirming.kept ? (
                <>
                  <ThemedText type="bodySm">
                    이 기기에서만 삭제하면 보관 기간 동안 스냅 탭에 남아요. 모든 기기에서 삭제해도
                    그동안은 최근 삭제에서 되살릴 수 있어요.
                  </ThemedText>
                  <View style={styles.stack}>
                    <SnaplyButton
                      variant="secondary"
                      title="이 기기에서만 삭제"
                      onPress={() => answer(onDeleteFromDevice)}
                    />
                    <SnaplyButton
                      variant="danger"
                      title="모든 기기에서 삭제"
                      onPress={() => answer(onDelete)}
                    />
                    <TextButton
                      label="취소"
                      accessibilityLabel="삭제 취소"
                      onPress={closeConfirm}
                      style={styles.cancel}
                    />
                  </View>
                </>
              ) : (
                <>
                  <ThemedText type="bodySm">삭제한 스냅은 되돌릴 수 없어요.</ThemedText>
                  <View style={styles.row}>
                    {/* Side by side, so the pair takes the compact faces: the
                        delete's VOID keeps close to its end and 삭제 keeps one
                        line at 360dp and large text. */}
                    <SnaplyButton
                      variant="secondary"
                      title="취소"
                      accessibilityLabel="삭제 취소"
                      compact
                      onPress={closeConfirm}
                      style={styles.rowAction}
                    />
                    <SnaplyButton
                      variant="danger"
                      title="삭제"
                      compact
                      onPress={() => answer(onDelete)}
                      style={styles.rowAction}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1 },
  scrim: { backgroundColor: 'rgba(43,35,28,0.5)' },
  // Plain and dark like the screen under it: no holes, spiral or paper strip.
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1C1712',
    borderTopWidth: 1,
    borderTopColor: 'rgba(243,231,207,0.16)',
    paddingTop: Spacing.five - Spacing.half,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  target: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(243,231,207,0.22)',
  },
  stack: { gap: Spacing.two + Spacing.half },
  cancel: { alignSelf: 'center' },
  row: { flexDirection: 'row', gap: Spacing.two + Spacing.half },
  rowAction: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  titleBlock: { flex: 1, gap: Spacing.half },
  listContent: { paddingHorizontal: Spacing.five, paddingBottom: Spacing.five },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', gap: Spacing.three, padding: Spacing.six },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  firstRow: { borderTopWidth: 1 },
  recordingMain: {
    flex: 1,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  playIcon: {
    width: 54,
    height: 54,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCopy: { flex: 1, gap: Spacing.half },
  date: { fontWeight: 700 },
  deleteButton: { minWidth: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
});
