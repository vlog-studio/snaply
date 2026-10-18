import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { needsReconnect, useSnsConnection } from '@/entities/sns-connection';
import { useConnectSns } from '@/features/connect-sns';
import { PostToInstagramConfirm, type PostOutcome } from '@/features/post-to-instagram';
import { InstagramHandoffMessages, type InstagramHandoff } from '@/features/share-movie';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { Reel } from '@/shared/ui/reel';

export type InstagramPostStepProps = {
  movieId: string;
  title: string;
  /** The finished render's file on the server. */
  videoId: string;
  onCancel: () => void;
  /** Instagram opened with the movie in the album — the sheet's work is done. */
  onHandedOff: () => void;
  onPosted: (outcome: PostOutcome) => void;
  /**
   * Saves the movie to the album and opens the Instagram app — posting by hand,
   * with no link, no Meta review and no tester role
   * (docs/decisions/instagram-app-handoff.md). The page's `useShareMovie`.
   */
  onOpenInstagramApp: () => Promise<InstagramHandoff>;
  /** The hand-off is saving the file. */
  handingOff: boolean;
};

/**
 * Posting a finished movie to Instagram (SNS-8), as a sheet's content: the
 * watch face hosts it in its own sheet (`InstagramPostSheet`), and the ⋯ sheet
 * as one of its steps, because two platform Modals swapping visibility race
 * each other's animations. Composed on this page because it joins two actions —
 * linking the account and posting — that cannot reach each other as features.
 *
 * Without a usable link it asks for one first, in place: the user came to post,
 * so sending them to 나 › 소셜 연결 would drop the movie they were on. Once the
 * link lands, the account query refreshes and the same step becomes the post
 * confirm.
 */
export function InstagramPostStep({
  movieId,
  title,
  videoId,
  onCancel,
  onHandedOff,
  onPosted,
  onOpenInstagramApp,
  handingOff,
}: InstagramPostStepProps) {
  const instagram = useSnsConnection('instagram');
  const connecting = useConnectSns();
  const [now] = useState(Date.now);
  const [handoffProblem, setHandoffProblem] = useState<string>();

  // Offered under either state of the link: an account that cannot be linked
  // (personal, or not among the app's testers while Meta review waits) still
  // gets the movie to Instagram, and a linked one may prefer Instagram's own
  // editor. The sheet closes once Instagram opens, and stays with the reason
  // when the movie could not be saved.
  const handoff = (
    <InstagramHandoffRow
      busy={handingOff}
      problem={handoffProblem}
      onPress={() => {
        setHandoffProblem(undefined);
        void onOpenInstagramApp().then((outcome) => {
          if (outcome === 'opened') onHandedOff();
          // A tap while one is running is ignored, not reported.
          else if (outcome !== 'busy') setHandoffProblem(InstagramHandoffMessages[outcome]);
        });
      }}
    />
  );

  const linked = instagram.connection;
  const usable = linked !== undefined && !needsReconnect(linked, now);

  if (!instagram.isLoaded && !instagram.isError) {
    return (
      <View style={styles.loading}>
        <Reel />
      </View>
    );
  }
  if (usable) {
    return (
      <View style={styles.step}>
        <PostToInstagramConfirm
          movieId={movieId}
          title={title}
          videoId={videoId}
          username={linked.username}
          onCancel={onCancel}
          onPosted={onPosted}
        />
        {handoff}
      </View>
    );
  }
  return (
    <View style={styles.step}>
      <ConnectStep
        reconnect={linked !== undefined}
        pending={connecting.pending === 'connect'}
        error={connecting.error}
        onCancel={onCancel}
        onConnect={() => void connecting.connect('instagram')}
      />
      {handoff}
    </View>
  );
}

/** Posting by hand in the Instagram app — under the in-app post, as the way that always works. */
function InstagramHandoffRow({
  busy,
  problem,
  onPress,
}: {
  busy: boolean;
  problem: string | undefined;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.handoff, { borderTopColor: theme.ruleLine }]}>
      <ThemedText type="small" themeColor="textSecondary">
        연결하지 않아도 올릴 수 있어요. 무비를 앨범에 저장하고 Instagram 앱을 열어요.
      </ThemedText>
      {problem ? (
        <ThemedText type="small" themeColor="cherryInk">
          {problem}
        </ThemedText>
      ) : null}
      <SnaplyButton
        variant="secondary"
        title={busy ? '앨범에 저장하는 중…' : 'Instagram 앱에서 올리기'}
        accessibilityLabel="Instagram 앱에서 올리기"
        busy={busy}
        onPress={onPress}
      />
    </View>
  );
}

/** The watch face's own sheet around `InstagramPostStep`. */
export function InstagramPostSheet({
  visible,
  onClose,
  ...step
}: Omit<InstagramPostStepProps, 'onCancel' | 'onHandedOff'> & {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet accessibilityLabel="Instagram에 게시" visible={visible} onClose={onClose}>
      <InstagramPostStep {...step} onCancel={onClose} onHandedOff={onClose} />
    </BottomSheet>
  );
}

function ConnectStep({
  reconnect,
  pending,
  error,
  onCancel,
  onConnect,
}: {
  reconnect: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConnect: () => void;
}) {
  const label = reconnect ? '다시 연결' : 'Instagram 연결';

  return (
    <View style={styles.step}>
      <ThemedText type="subtitle" accessibilityRole="header">
        {reconnect ? 'Instagram을 다시 연결해 주세요' : 'Instagram을 먼저 연결해 주세요'}
      </ThemedText>
      <ThemedText type="bodySm" themeColor="textSecondary">
        {reconnect ? '다시 연결하면 게시할 수 있어요.' : '프로페셔널 계정만 연결할 수 있어요.'}
      </ThemedText>

      {error ? (
        <ThemedText type="small" themeColor="cherryInk">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <SnaplyButton
          variant="secondary"
          title="취소"
          accessibilityLabel="게시 취소"
          disabled={pending}
          onPress={onCancel}
          style={styles.action}
        />
        <SnaplyButton
          title={pending ? '연결하는 중…' : label}
          accessibilityLabel={label}
          busy={pending}
          onPress={onConnect}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: Spacing.six, alignItems: 'center' },
  step: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  handoff: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
  },
  action: { flex: 1 },
});
