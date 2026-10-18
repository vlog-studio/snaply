import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '@/shared/lib/datetime';
import { formatFileSize } from '@/shared/lib/format-file-size';
import type { LocalRecording } from '@/shared/lib/recording-files';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { StickerButton } from '@/shared/ui/sticker-button';
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
  // snap tab: from this device only, or everywhere. The system alert holds both
  // answers — a sheet here would open over this modal. Either way the snap can
  // still come back from 최근 삭제 until its retention ends (SNAP-20); the
  // other recordings never reached the server, so their delete is final.
  const confirmDelete = (recording: LocalRecording) => {
    if (canDeleteFromDevice(recording)) {
      Alert.alert(
        '스냅을 삭제할까요?',
        '이 기기에서만 삭제하면 보관 기간 동안 스냅 탭에 남아요. 모든 기기에서 삭제해도 그동안은 최근 삭제에서 되살릴 수 있어요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '이 기기에서만 삭제', onPress: () => void onDeleteFromDevice(recording) },
          {
            text: '모든 기기에서 삭제',
            style: 'destructive',
            onPress: () => void onDelete(recording),
          },
        ],
      );
      return;
    }
    Alert.alert('스냅을 삭제할까요?', '삭제한 스냅은 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => void onDelete(recording),
      },
    ]);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
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
          renderItem={({ item }) => {
            const isDeleting = deletingId === item.id;

            return (
              <View style={[styles.recordingRow, { borderBottomColor: theme.ruleLine }]}>
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
                <Pressable
                  accessibilityLabel={`${formatDateTime(item.createdAt)} 스냅 삭제`}
                  accessibilityRole="button"
                  disabled={isDeleting}
                  onPress={() => confirmDelete(item)}
                  style={styles.deleteButton}
                >
                  {/* A delete is ink, not red: red is the main action. */}
                  <ThemedText type="smallBold">{isDeleting ? '삭제하는 중…' : '삭제'}</ThemedText>
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
