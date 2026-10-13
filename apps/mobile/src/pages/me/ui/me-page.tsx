import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter, useScrollToTop } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { creditQueries } from '@/entities/credit';
import { useMovies } from '@/entities/movie';
import { useClearSession, useCurrentUser } from '@/entities/session';
import { useSnaps } from '@/entities/snap';
import { needsReconnect, useSnsConnection } from '@/entities/sns-connection';
import { useAnalysisConsent } from '@/features/analysis-consent';
import {
  interestReadOut,
  useChosenInterests,
  useInterestTopics,
} from '@/features/choose-interests';
import { EditNicknameSheet, useNickname } from '@/features/edit-nickname';
import { useNotificationPreferences } from '@/features/notification-settings';
import { useAlbumAutoSaveEnabled } from '@/features/save-snap-to-album';
import {
  MaxContentWidth,
  Radius,
  Spacing,
  useTabBarHeight,
  useTheme,
  useThemeMode,
  useTopContentInset,
  type ThemeMode,
} from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { recordedDayCount, weekRecord } from '../model/week-record';
import { RowDivider, SettingRow } from './rows';
import { WeekRing } from './week-ring';

const appVersion = Constants.expoConfig?.version;

const themeModeLabels: Record<ThemeMode, string> = {
  system: '시스템',
  light: '라이트',
  dark: '다크',
};

/**
 * The 나 tab — this week's record as the hero, and the preferences as summary
 * rows that each open their own screen, except a capability that is 준비 중,
 * whose row says so and opens nothing.
 *
 * The screen used to be every setting fully expanded, three viewports deep,
 * all at one visual weight. Now the state stays readable at the root (each
 * row's read-out is the current setting) and the controls live one push away
 * (`/settings/*`) — reveal the controls gradually, never the state.
 */
export function MePage() {
  const theme = useTheme();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const currentUser = useCurrentUser();
  const clearSession = useClearSession();
  const snaps = useSnaps();
  const movies = useMovies();
  const instagram = useSnsConnection('instagram');
  // When the tab opened — enough to tell a lapsed link (the same reading 최근 삭제 uses).
  const [now] = useState(Date.now);
  const name = useNickname(currentUser?.displayName);
  const [editingName, setEditingName] = useState(false);
  // Before the server answers, nothing claims a link either way.
  const socialReadOut = !instagram.isLoaded
    ? undefined
    : !instagram.connection
      ? '연결된 계정 없음'
      : needsReconnect(instagram.connection, now)
        ? 'Instagram 다시 연결 필요'
        : `Instagram ${instagram.connection.username ? `@${instagram.connection.username}` : '연결됨'}`;
  const notificationPreferences = useNotificationPreferences();
  // Blank until both the choice and the topic names have arrived (spec ACC-5).
  const interests = interestReadOut(useChosenInterests(), useInterestTopics().topics);
  const albumAutoSave = useAlbumAutoSaveEnabled();
  const themeMode = useThemeMode();
  const creditBalance = useQuery(creditQueries.balance());
  const analysisConsent = useAnalysisConsent();
  // A granted consent must stay reachable to be withdrawn even while the server
  // has analysis switched off; only an ungranted one reads 준비 중 then.
  const analysisReachable = analysisConsent.available || analysisConsent.granted;
  const analysisReadOut = !analysisConsent.isLoaded
    ? undefined
    : analysisConsent.granted
      ? '켜짐'
      : analysisConsent.available
        ? '꺼짐'
        : '준비 중';

  const days = weekRecord(snaps.map((snap) => snap.capturedAt));
  const recordedDays = recordedDayCount(days);

  // Reminders are 준비 중, so the read-out summarizes only the alerts that
  // actually arrive. Until the account's preferences load it says nothing
  // rather than guessing 모두 꺼짐.
  const enabledAlerts = [
    notificationPreferences?.movieReady && '무비 완성',
    notificationPreferences?.locationAlerts && '위치',
  ].filter((label): label is string => Boolean(label));
  const alertSummary = notificationPreferences
    ? enabledAlerts.length
      ? enabledAlerts.join(' · ')
      : '모두 꺼짐'
    : undefined;

  return (
    <ScrollView
      ref={scrollRef}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Spacing.six + topInset, paddingBottom: Spacing.eight + tabBarHeight },
      ]}
    >
      <View style={styles.hero}>
        <WeekRing days={days} initial={(name ?? '?').charAt(0)} size={148} />
        <View style={styles.heroCopy}>
          {/* The name is the way to change it (ACC-5): a tap opens the sheet. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`이름 ${name ?? ''} · 바꾸기`}
            disabled={!currentUser}
            onPress={() => setEditingName(true)}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.nameRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <ThemedText type="subtitle" numberOfLines={1} style={styles.name}>
              {name ?? '로그인하지 않음'}
            </ThemedText>
            {currentUser ? <Ionicons name="pencil" size={16} color={theme.textSecondary} /> : null}
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            {`이번 주 ${recordedDays}일 기록`}
          </ThemedText>
        </View>
        <View style={styles.statPills}>
          <StatPill label="스냅" value={snaps.length} />
          <StatPill label="무비" value={movies.length} />
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        <SettingRow
          icon="ticket-outline"
          title="크레딧"
          // The read-out is the current balance; while it loads or fails the
          // row stays a plain doorway rather than showing a number that lies.
          sub={
            creditBalance.data
              ? `${creditBalance.data.balance.toLocaleString('ko-KR')} 크레딧`
              : undefined
          }
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/credits')}
        />
        <RowDivider />
        <SettingRow
          icon="notifications-outline"
          title="알림"
          sub={alertSummary}
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/notifications')}
        />
        <RowDivider />
        <SettingRow
          icon="contrast-outline"
          title="화면 테마"
          sub={themeModeLabels[themeMode]}
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/theme')}
        />
        <RowDivider />
        <SettingRow
          icon="scan-outline"
          title="스냅 분석"
          sub={analysisReadOut}
          subLines={1}
          right={analysisReachable ? <Chevron /> : undefined}
          onPress={analysisReachable ? () => router.push('/settings/analysis') : undefined}
        />
        <RowDivider />
        {/* Saving one snap is the player's; the row reads the automatic copy,
            the one preference behind it. */}
        <SettingRow
          icon="images-outline"
          title="앨범 저장"
          sub={albumAutoSave ? '자동 저장 켜짐' : '자동 저장 꺼짐'}
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/album')}
        />
        <RowDivider />
        {/* The topics the account likes (spec ACC-5); they order the templates and
            feed the recommendation and the edit draft (PRF-3). */}
        <SettingRow
          icon="heart-outline"
          title="관심사"
          sub={interests}
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/interests')}
        />
        <RowDivider />
        {/* Instagram can be linked here and a finished movie posted to it
            (SNS-8, 2026-10-11); the row reads the link. TikTok has no link to
            offer yet, so the screen behind shows it as 준비 중. */}
        <SettingRow
          icon="link-outline"
          title="소셜 연결"
          sub={socialReadOut}
          subLines={1}
          right={<Chevron />}
          onPress={() => router.push('/settings/social')}
        />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        <Pressable accessibilityRole="button" style={styles.accountAction} onPress={clearSession}>
          <ThemedText type="smallBold">로그아웃</ThemedText>
        </Pressable>
        <RowDivider />
        <Pressable
          accessibilityRole="button"
          style={styles.accountAction}
          onPress={() => router.push('/settings/delete-account')}
        >
          <ThemedText type="smallBold" themeColor="danger">
            계정 삭제
          </ThemedText>
        </Pressable>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
        {appVersion ? `Snaply ${appVersion}` : 'Snaply'}
      </ThemedText>

      {/* Mounted per opening so the form starts from the name shown now. */}
      {editingName && name ? (
        <EditNicknameSheet visible name={name} onClose={() => setEditingName(false)} />
      ) : null}
    </ScrollView>
  );
}

function Chevron() {
  const theme = useTheme();
  return <Ionicons color={theme.textSecondary} name="chevron-forward" size={16} />;
}

function StatPill({ label, value }: { label: string; value: number }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.statPill,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.five,
  },
  hero: { alignItems: 'center', gap: Spacing.four },
  heroCopy: { alignItems: 'center', gap: Spacing.half },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, maxWidth: '100%' },
  name: { flexShrink: 1 },
  statPills: { flexDirection: 'row', gap: Spacing.two },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 36,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    borderRadius: Radius.pill,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  accountAction: { minHeight: 54, justifyContent: 'center', paddingHorizontal: Spacing.four },
  version: { textAlign: 'center', paddingTop: Spacing.three },
});
