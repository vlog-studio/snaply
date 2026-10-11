import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { needsReconnect, useSnsConnection } from '@/entities/sns-connection';
import { useConnectSns } from '@/features/connect-sns';
import { PostToInstagramConfirm, type PostOutcome } from '@/features/post-to-instagram';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type InstagramPostStepProps = {
  movieId: string;
  title: string;
  /** The finished render's file on the server. */
  videoId: string;
  onCancel: () => void;
  onPosted: (outcome: PostOutcome) => void;
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
  onPosted,
}: InstagramPostStepProps) {
  const instagram = useSnsConnection('instagram');
  const connecting = useConnectSns();
  const [now] = useState(Date.now);

  const linked = instagram.connection;
  const usable = linked !== undefined && !needsReconnect(linked, now);

  if (!instagram.isLoaded && !instagram.isError) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  if (usable) {
    return (
      <PostToInstagramConfirm
        movieId={movieId}
        title={title}
        videoId={videoId}
        username={linked.username}
        onCancel={onCancel}
        onPosted={onPosted}
      />
    );
  }
  return (
    <ConnectStep
      reconnect={linked !== undefined}
      pending={connecting.pending === 'connect'}
      error={connecting.error}
      onCancel={onCancel}
      onConnect={() => void connecting.connect('instagram')}
    />
  );
}

/** The watch face's own sheet around `InstagramPostStep`. */
export function InstagramPostSheet({
  visible,
  onClose,
  ...step
}: Omit<InstagramPostStepProps, 'onCancel'> & { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet accessibilityLabel="Instagram에 게시" visible={visible} onClose={onClose}>
      <InstagramPostStep {...step} onCancel={onClose} />
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
  const theme = useTheme();
  const label = reconnect ? '다시 연결' : 'Instagram 연결';

  return (
    <View style={styles.step}>
      <ThemedText type="note" themeColor="textSecondary">
        Instagram에 게시
      </ThemedText>
      <ThemedText type="heading">
        {reconnect ? 'Instagram을 다시 연결해 주세요' : 'Instagram을 먼저 연결해 주세요'}
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        {reconnect ? '다시 연결하면 게시할 수 있어요.' : '프로페셔널 계정만 연결할 수 있어요.'}
      </ThemedText>

      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="게시 취소"
          disabled={pending}
          onPress={onCancel}
          style={[styles.action, { borderColor: theme.border, opacity: pending ? 0.6 : 1 }]}
        >
          <ThemedText selectable={false} type="button">
            취소
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          onPress={onConnect}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.primary,
              borderColor: theme.primary,
              opacity: pending ? 0.6 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {pending ? '연결하는 중…' : label}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: Spacing.six, alignItems: 'center' },
  step: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  action: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
