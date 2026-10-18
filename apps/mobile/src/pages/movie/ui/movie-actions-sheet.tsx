import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Movie } from '@/entities/movie';
import { FinishMovieConfirm } from '@/features/finish-movie';
import type { PostOutcome } from '@/features/post-to-instagram';
import { RenameMovieForm } from '@/features/rename-movie';
import { ShareBlockMessages, type InstagramHandoff, type ShareBlock } from '@/features/share-movie';
import { formatSeconds } from '@/shared/lib/datetime';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { CheckStrip, CheckStripRow } from '@/shared/ui/check-strip';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { InstagramPostStep } from './instagram-post-sheet';

export type MovieActionsSheetProps = {
  visible: boolean;
  movie: Movie;
  /** How many cuts the finished composition holds, for the delete step. */
  cutCount: number;
  /** How long it plays, for the delete step. */
  totalSec: number;
  /** Why the movie cannot be handed to the share sheet, if it cannot. */
  shareBlock: ShareBlock | undefined;
  onEdit: () => void;
  onShare: () => void;
  /**
   * The finished render's file on the server, when there is one to post to
   * Instagram (SNS-8). Absent hides the row.
   */
  postableVideoId?: string;
  /** A post went through (or is processing); the page says so. */
  onPosted: (outcome: PostOutcome) => void;
  /** Posting by hand in the Instagram app — `InstagramPostStep`'s hand-off. */
  onOpenInstagramApp: () => Promise<InstagramHandoff>;
  handingOff: boolean;
  /** Actually deletes — the confirm step inside this sheet has been passed. */
  onConfirmDelete: () => void;
  onClose: () => void;
};

/** The ⋯ sheet's own steps; each is a face of the one Modal. */
type Step = 'menu' | 'delete' | 'rename' | 'finish' | 'instagram';

/**
 * Everything watch mode can do to the movie besides watching it, behind the
 * back bar's ⋯ — so the mode's own surface stays a player, and switching to
 * the studio is a named choice rather than the screen's default.
 *
 * Deleting and renaming both happen as a second step *inside this sheet*
 * instead of in a sheet of their own: two platform Modals swapping visibility
 * race each other's animations, and the movie tab's grid never has this problem
 * because its delete sheet is its only one. Renaming joined the rule on
 * 2026-08-13 — it had been opening `RenameMovieSheet` as this one closed, which
 * is the very trade the delete step exists to avoid; the form was already split
 * from its sheet (`RenameMovieForm`) for a host in exactly this position. The
 * studio face keeps opening the sheet, because there it is the only modal.
 * Every step resets whenever the sheet is left, so it always reopens on the
 * menu.
 */
export function MovieActionsSheet({
  visible,
  movie,
  cutCount,
  totalSec,
  shareBlock,
  onEdit,
  onShare,
  postableVideoId,
  onPosted,
  onOpenInstagramApp,
  handingOff,
  onConfirmDelete,
  onClose,
}: MovieActionsSheetProps) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('menu');
  const confirmingDelete = step === 'delete';

  const close = () => {
    setStep('menu');
    onClose();
  };
  const act = (action: () => void) => () => {
    setStep('menu');
    action();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      accessibilityLabel={
        confirmingDelete
          ? '무비 삭제 확인'
          : step === 'rename'
            ? '무비 이름 바꾸기'
            : step === 'finish'
              ? '무비 정리 확인'
              : step === 'instagram'
                ? 'Instagram에 게시'
                : '무비 더보기'
      }
    >
      {step === 'instagram' && postableVideoId ? (
        // Posting as a step here too: one Modal, no race (see above).
        <InstagramPostStep
          movieId={movie.id}
          title={movie.title}
          videoId={postableVideoId}
          onCancel={() => setStep('menu')}
          // Back from Instagram the user should not find the ⋯ menu still open.
          onHandedOff={close}
          onPosted={(outcome) => {
            close();
            onPosted(outcome);
          }}
          onOpenInstagramApp={onOpenInstagramApp}
          handingOff={handingOff}
        />
      ) : step === 'finish' ? (
        // 끝내기 (MOV-17) as a step here, for the same reason delete and rename
        // are: one Modal, no race. The feature's confirm carries the words that
        // make the loss plain and the request that makes it so.
        <FinishMovieConfirm
          movieId={movie.id}
          title={movie.title}
          onCancel={() => setStep('menu')}
          onFinished={close}
        />
      ) : step === 'rename' ? (
        // Keyed by the stored name so reopening the step starts from what the
        // movie is called now rather than from the last edit's leftovers.
        <RenameMovieForm
          key={movie.title}
          movieId={movie.id}
          title={movie.title}
          onCancel={() => setStep('menu')}
          onSaved={close}
        />
      ) : confirmingDelete ? (
        <View style={styles.step}>
          <ThemedText type="subtitle" accessibilityRole="header">
            이 무비를 삭제할까요?
          </ThemedText>

          <CheckStrip>
            <CheckStripRow>
              <ThemedText type="bodySm" numberOfLines={1} style={styles.summaryTitle}>
                {movie.title}
              </ThemedText>
              <ThemedText type="data">
                컷 {cutCount} · {formatSeconds(totalSec)}
              </ThemedText>
            </CheckStripRow>
          </CheckStrip>

          <ThemedText type="bodySm" themeColor="textSecondary">
            컷 구성과 완성된 무비가 함께 사라져요. 스냅은 그대로 남아요.
          </ThemedText>

          <View style={styles.confirmActions}>
            <SnaplyButton
              variant="secondary"
              title="취소"
              accessibilityLabel="삭제 취소"
              onPress={() => setStep('menu')}
              style={styles.confirmAction}
            />
            <SnaplyButton
              variant="danger"
              title="삭제"
              accessibilityLabel={`${movie.title} 삭제`}
              onPress={act(onConfirmDelete)}
              style={styles.confirmAction}
            />
          </View>
        </View>
      ) : (
        <View style={styles.step}>
          <View style={[styles.group, { borderColor: theme.ruleLine }]}>
            <ActionRow icon="film" label="무비 편집하기" onPress={act(onEdit)} />
            <ActionRow
              icon="pencil"
              label="이름 바꾸기"
              divider
              onPress={() => setStep('rename')}
            />
            <ActionRow
              icon="share-social"
              label="공유하기"
              note={shareBlock === undefined ? undefined : ShareBlockMessages[shareBlock]}
              disabled={shareBlock !== undefined}
              divider
              onPress={act(onShare)}
            />
            {postableVideoId ? (
              <ActionRow
                icon="logo-instagram"
                label="Instagram에 게시"
                divider
                onPress={() => setStep('instagram')}
              />
            ) : null}
            {/* Only a movie with a file to give up can be finished; the note
                says what the act is, since the word alone could mean anything. */}
            {movie.render ? (
              <ActionRow
                icon="checkmark-done"
                label="앱에서 무비 정리하기"
                note="기기에 저장했다면 앱의 무비 파일을 정리해요"
                divider
                onPress={() => setStep('finish')}
              />
            ) : null}
          </View>
          <View style={[styles.group, { borderColor: theme.ruleLine }]}>
            <ActionRow
              icon="trash"
              label="무비 삭제하기"
              danger
              onPress={() => setStep('delete')}
            />
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

export type ActionRowProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  /** Why the row cannot be pressed, shown under the label. */
  note?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Draws the hairline against the row above; the group's first row has none. */
  divider?: boolean;
  onPress: () => void;
};

/** One row of a sheet's action group — shared by this slice's sheets. */
export function ActionRow({
  icon,
  label,
  note,
  disabled,
  danger,
  divider,
  onPress,
}: ActionRowProps) {
  const theme = useTheme();
  // A destructive line is not red — red is the main action; it is set apart
  // by its own group and by the confirm step it opens instead.
  void danger;
  const color = theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider ? [styles.rowDivider, { borderTopColor: theme.ruleLine }] : null,
        { backgroundColor: pressed ? theme.pink : 'transparent', opacity: disabled ? 0.45 : 1 },
      ]}
    >
      <Ionicons name={icon} size={19} color={color} />
      <View style={styles.rowText}>
        <ThemedText selectable={false} style={{ color }}>
          {label}
        </ThemedText>
        {note ? (
          <ThemedText selectable={false} type="data">
            {note}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  step: { gap: Spacing.three },
  // A group of lines on the note sheet, ruled above and below.
  group: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingVertical: Spacing.two,
  },
  rowDivider: { borderTopWidth: 1 },
  rowText: { flex: 1, gap: Spacing.half },
  summaryTitle: { flex: 1, minWidth: 0 },
  confirmActions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  confirmAction: { flex: 1 },
});
