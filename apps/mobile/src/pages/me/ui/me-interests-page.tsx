import { ScrollView, StyleSheet, View } from 'react-native';

import {
  useChosenInterests,
  useInterestTopics,
  useToggleInterest,
} from '@/features/choose-interests';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { AlertCard } from '@/shared/ui/notice';
import { PaperGround } from '@/shared/ui/paper';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { OptionPill, SettingsSection } from './rows';

/**
 * The 관심사 settings screen (`/settings/interests`) — the topics the account
 * likes (spec ACC-5). The choices are the server's concept vocabulary; nothing
 * is typed.
 *
 * Each tap is the commit, like every other preference on the 나 screens: a
 * choice is cheap and reversible (tap again), so a separate save button would
 * only add a step. The count read-out sits above the pills so the user sees how
 * many are on without counting. Choosing none is a valid answer — every feature
 * works without interests.
 */
export function MeInterestsPage() {
  const theme = useTheme();
  const chosen = useChosenInterests();
  const { topics, failed: loadFailed, retry } = useInterestTopics();
  const { toggle, failed: saveFailed } = useToggleInterest();

  const ready = chosen !== undefined && topics !== undefined;
  const count = chosen?.filter((id) => topics?.some((topic) => topic.id === id)).length ?? 0;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <PaperGround kind="ruled" />
      {loadFailed && !ready ? (
        <View style={styles.failed}>
          <ThemedText type="small" themeColor="textSecondary">
            관심사를 불러오지 못했어요
          </ThemedText>
          <SnaplyButton title="다시 시도" variant="secondary" onPress={retry} />
        </View>
      ) : ready ? (
        <SettingsSection title={count === 0 ? '고른 관심사가 없어요' : `${count}개 골랐어요`}>
          <View style={styles.pills}>
            {topics.map((topic) => (
              <OptionPill
                key={topic.id}
                role="checkbox"
                label={topic.label}
                selected={chosen.includes(topic.id)}
                onPress={() => toggle(topic.id)}
              />
            ))}
          </View>
        </SettingsSection>
      ) : null}
      {saveFailed ? <AlertCard message="관심사를 저장하지 못했어요. 다시 시도해 주세요." /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // The page's paper runs to the bottom of the screen, however short the content.
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.eight,
    gap: Spacing.three,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  failed: { gap: Spacing.three, alignItems: 'flex-start' },
});
