import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccountPurgeAfter, useClearSession } from '@/entities/session';
import { useRestoreAccount } from '@/features/delete-account';
import { formatFullDate } from '@/shared/lib/datetime';
import { AlertCard } from '@/shared/ui/notice';
import { PaperGround, PaperPiece } from '@/shared/ui/paper';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * The full-screen block for an account inside its deletion grace period
 * (`/account-restore`). The route guard forces it whenever the backend has
 * answered `ACCOUNT_PENDING_DELETION`, so the only ways out are the two
 * offered here: restore (releases the guard back into the app) or sign out.
 */
export function AccountRestorePage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const clearSession = useClearSession();
  const purgeAfter = useAccountPurgeAfter();
  const { restoreAccount, isPending, error } = useRestoreAccount();

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + Spacing.eight,
          paddingBottom: insets.bottom + Spacing.six,
        },
      ]}
    >
      <PaperGround kind="ruled" />
      <View style={styles.copy}>
        <ThemedText type="title" accessibilityRole="header">
          삭제 대기 중인 계정
        </ThemedText>
        {/* The deadline as a receipt slip, with an hourglass sticker on its corner. */}
        <PaperPiece edge="tornBottom" tilt={-0.6} style={styles.receipt}>
          <View style={[styles.sticker, { backgroundColor: theme.butter }]}>
            <Ionicons color={theme.stickerInk} name="hourglass-outline" size={22} />
          </View>
          <ThemedText type="eyebrow" themeColor="textSecondary">
            영구 삭제 예정
          </ThemedText>
          <ThemedText type="data">
            {purgeAfter
              ? `${formatFullDate(purgeAfter.getTime())} 이후 영구 삭제`
              : '기한이 지나면 영구 삭제돼요'}
          </ThemedText>
        </PaperPiece>
      </View>

      <View style={styles.actions}>
        {error ? <AlertCard message={error} /> : null}
        <SnaplyButton
          title={isPending ? '복구 중…' : '계정 복구'}
          disabled={isPending}
          onPress={() => void restoreAccount()}
        />
        <SnaplyButton
          title="로그아웃"
          variant="secondary"
          disabled={isPending}
          onPress={() => void clearSession()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  receipt: {
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.one,
  },
  sticker: {
    position: 'absolute',
    top: -14,
    right: Spacing.three,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
  },
  actions: { gap: Spacing.three },
});
