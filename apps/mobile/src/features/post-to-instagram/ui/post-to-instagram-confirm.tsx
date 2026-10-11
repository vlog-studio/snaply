import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/shared/ui/text-field';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { PostOutcome } from '../api/post-movie';
import { CaptionMaxLength, usePostToInstagram } from '../model/use-post-to-instagram';

export type PostToInstagramConfirmProps = {
  movieId: string;
  title: string;
  /** The finished render's file on the server — what gets posted. */
  videoId: string;
  /** The linked account's handle, when Instagram told the server one. */
  username: string | null;
  onCancel: () => void;
  /** The post went through (or is processing); the host closes and says so. */
  onPosted: (outcome: PostOutcome) => void;
};

/**
 * The confirm step before posting a finished movie to Instagram (SNS-8): which
 * account it goes to, an optional caption, and — because a post that goes
 * through finishes the movie (MOV-17) — what that costs here, said before the
 * press rather than discovered after.
 *
 * A sheet's content rather than a sheet, like `FinishMovieConfirm`, so the
 * movie screen can host it next to its other steps. The post waits on
 * Instagram's processing, so the button keeps saying what is happening.
 */
export function PostToInstagramConfirm({
  movieId,
  title,
  videoId,
  username,
  onCancel,
  onPosted,
}: PostToInstagramConfirmProps) {
  const theme = useTheme();
  const { post, busy, error } = usePostToInstagram();
  const [caption, setCaption] = useState('');

  const confirm = () => {
    void post({ movieId, videoId, caption }).then((outcome) => {
      if (outcome) onPosted(outcome);
    });
  };

  return (
    <View style={styles.step}>
      <ThemedText type="note" themeColor="textSecondary">
        Instagram에 게시
      </ThemedText>
      <ThemedText type="heading">Instagram에 게시할까요?</ThemedText>

      <View style={[styles.summary, { borderColor: theme.border }]}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {username ? (
          <ThemedText type="note" themeColor="textSecondary" numberOfLines={1}>
            @{username}
          </ThemedText>
        ) : null}
      </View>

      <TextField
        label="설명 (선택)"
        accessibilityLabel="게시물 설명"
        placeholder="게시물에 붙일 설명"
        value={caption}
        onChangeText={setCaption}
        maxLength={CaptionMaxLength}
        multiline
        editable={!busy}
      />

      <ThemedText themeColor="textSecondary">
        게시하면 이 앱에서는 무비가 정리돼요. 컷 구성은 남아서 고쳐 다시 만들 수 있어요.
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
          disabled={busy}
          onPress={onCancel}
          style={[styles.action, { borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}
        >
          <ThemedText selectable={false} type="button">
            취소
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} Instagram에 게시`}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={confirm}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.primary,
              borderColor: theme.primary,
              opacity: busy ? 0.6 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {busy ? '게시하는 중…' : 'Instagram에 게시'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: Spacing.three },
  summary: {
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
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
