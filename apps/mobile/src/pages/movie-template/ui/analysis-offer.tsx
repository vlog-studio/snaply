import { Pressable, StyleSheet, View } from 'react-native';

import { TextButton } from '@/shared/ui/text-button';
import { Shadows, Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type AnalysisOfferProps = {
  /** Opens the consent sheet — the full wording is agreed to there, not here. */
  onAccept: () => void;
  /** 괜찮아요: remembered, so the next visit does not ask again. */
  onDecline: () => void;
};

/**
 * The question that turns on the second stage, asked where it pays off.
 *
 * It sits under the slots rather than above them: by the time the user reads
 * it the local match has already filled the screen, so what they are asked to
 * trade for is visible (UX `Value Before Cost`). It is one line and two
 * answers, not a sheet on entry — entering the screen is coming to work on a
 * template, and a sheet there would be a request before any result.
 */
export function AnalysisOffer({ onAccept, onDecline }: AnalysisOfferProps) {
  const theme = useTheme();

  return (
    // The agent's offer, on a band of lavender — the colour the app's own
    // making is drawn in.
    <View
      style={[
        styles.offer,
        { backgroundColor: theme.aiFill, boxShadow: Shadows.paper(theme.shadowInk) },
      ]}
    >
      <ThemedText type="bodySm" style={[styles.question, { color: theme.stickerInk }]}>
        스냅을 분석해서 컷에 더 어울리게 채울까요?
      </ThemedText>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="괜찮아요, 분석하지 않기"
          onPress={onDecline}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText selectable={false} type="small" style={{ color: theme.stickerInk }}>
            괜찮아요
          </ThemedText>
        </Pressable>
        <TextButton
          label="분석해서 채우기"
          accessibilityLabel="스냅을 분석해서 채우기"
          onPress={onAccept}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offer: {
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.half,
    gap: Spacing.one,
    transform: [{ rotate: '0.5deg' }],
  },
  question: { fontWeight: 700 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.two,
  },
  action: { minHeight: Sizes.touchMin, paddingHorizontal: Spacing.two, justifyContent: 'center' },
});
