import { StyleSheet, View } from 'react-native';

import { AlertCard } from '@/shared/ui/notice';
import { TextButton } from '@/shared/ui/text-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type Props = {
  email: string;
  onResend: () => void;
  isPending: boolean;
  error: string | null;
};

/**
 * Shown after account creation: the user must tap the confirmation link in
 * their email, which deep-links back into the app and signs them in. No code
 * entry — confirmation is completed by the auth callback screen the link opens
 * (`pages/auth-callback`).
 */
export function EmailSentNotice({ email, onResend, isPending, error }: Props) {
  return (
    <View style={styles.container}>
      <ThemedText type="heading">메일을 확인해 주세요</ThemedText>
      <ThemedText themeColor="textSecondary">
        {`${email} 주소로 인증 링크를 보냈어요. 이 기기에서 메일의 링크를 누르면 인증이 끝나고 바로 로그인돼요.`}
      </ThemedText>
      {error ? <AlertCard message={error} /> : null}
      {/* The one thing to do here, as the app's text button: the
          highlighter says it acts, and its slop reaches the 48dp target. */}
      <TextButton
        label="인증 메일 다시 보내기"
        disabled={isPending}
        onPress={onResend}
        style={styles.resend}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
  resend: { alignSelf: 'flex-start' },
});
