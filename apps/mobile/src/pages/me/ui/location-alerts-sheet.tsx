import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type LocationAlertsSheetProps = {
  visible: boolean;
  /** The user said yes — the caller now runs the OS permission requests. */
  onAccept: () => void;
  /** Declining and dismissing both leave the switch off; nothing is asked. */
  onDecline: () => void;
};

/**
 * The in-app question that precedes the OS location prompts. The OS "always
 * allow" prompt is one-shot — once declined it never shows again — so the ask
 * runs in two stages: this sheet states what the alerts do and what they need,
 * and only a yes here surfaces the OS prompts. A no closes the sheet with the
 * switch off and costs nothing; the question can be re-asked any time the user
 * flips the switch again.
 */
export function LocationAlertsSheet({ visible, onAccept, onDecline }: LocationAlertsSheetProps) {
  return (
    <BottomSheet accessibilityLabel="위치 알림 켜기" visible={visible} onClose={onDecline}>
      <ThemedText type="subtitle" accessibilityRole="header">
        주변 장소 알림을 받을까요?
      </ThemedText>
      <ThemedText type="bodySm" themeColor="textSecondary">
        찍기 좋은 장소에 도착하면 알려드려요. 앱을 열지 않아도 알리려면 위치를 &apos;항상
        허용&apos;해야 해요.
      </ThemedText>

      <View style={styles.actions}>
        <SnaplyButton
          variant="secondary"
          title="안 받기"
          accessibilityLabel="알림 안 받기"
          onPress={onDecline}
          style={styles.action}
        />
        <SnaplyButton
          title="알림 받기"
          accessibilityLabel="알림 받기"
          onPress={onAccept}
          style={styles.action}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.two + Spacing.half, marginTop: Spacing.one },
  action: { flex: 1 },
});
