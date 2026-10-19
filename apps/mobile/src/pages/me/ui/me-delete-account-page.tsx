import { ScrollView, StyleSheet } from 'react-native';

import { useDeleteAccount } from '@/features/delete-account';
import { AlertCard } from '@/shared/ui/notice';
import { PaperGround } from '@/shared/ui/paper';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';

import { RowDivider, SettingRow, SettingsSection } from './rows';

/**
 * The 계정 삭제 confirmation screen (`/settings/delete-account`). The rows are
 * the consequence read-out — what the backend does the moment the account is
 * deleted (spec ACC-8, social links included: restoring the account does not
 * bring them back), and the one path back — so the screen itself is the confirmation
 * step and the button needs no second alert. On success the action clears the
 * session and the route guard lands on sign-in.
 */
export function MeDeleteAccountPage() {
  const theme = useTheme();
  const { deleteAccount, isPending, error } = useDeleteAccount();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <PaperGround kind="ruled" />
      <SettingsSection>
        <SettingRow
          icon="film-outline"
          title="만드는 중인 무비는 취소되고, 쓴 크레딧은 돌려드려요"
        />
        <RowDivider />
        <SettingRow icon="notifications-off-outline" title="알림이 모두 꺼져요" />
        <RowDivider />
        <SettingRow
          icon="link-outline"
          title="소셜 연결이 모두 끊겨요"
          sub="되돌려도 다시 연결해야 해요"
        />
        <RowDivider />
        <SettingRow icon="time-outline" title="30일 안에 다시 로그인하면 되돌릴 수 있어요" />
      </SettingsSection>

      {error ? <AlertCard message={error} /> : null}

      {/* A delete is kraft with the VOID stamp, not red: red is the main action. */}
      <SnaplyButton
        variant="danger"
        title={isPending ? '삭제하는 중…' : '계정 삭제'}
        accessibilityLabel="계정 삭제"
        busy={isPending}
        onPress={() => void deleteAccount()}
        style={styles.deleteButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.eight,
    gap: Spacing.five,
  },
  deleteButton: { marginTop: 'auto' },
});
