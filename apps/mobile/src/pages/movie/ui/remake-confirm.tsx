import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type RemakeConfirmProps = {
  /** Runs the movie again from the current composition. */
  onConfirm: () => void;
  /** Backs out — the finished movie stays as it is. */
  onCancel: () => void;
};

/**
 * The one question before a finished movie is made again (MOV-23): a movie keeps
 * one result, so the run drops the one there is, and it is a new paid run.
 * Neither can be undone, so the tap asks first (2026-10-12,
 * docs/decisions/product-concept.md §7).
 *
 * It confirms in place, in the footer's action slot, like 만들기 취소
 * (`CancelRunControl`): this footer is the screen's action zone and a Modal for
 * one yes/no is the stacking the ⋯ sheet's steps avoid. The app does not know
 * the price — the server sets it — so the line says credits are spent again, not
 * how many.
 */
export function RemakeConfirm({ onConfirm, onCancel }: RemakeConfirmProps) {
  const theme = useTheme();
  return (
    <View style={styles.slot}>
      <ThemedText type="small" themeColor="textSecondary">
        지금 완성된 무비는 사라지고, 크레딧을 다시 써요.
      </ThemedText>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="그대로 두기"
          onPress={onCancel}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText selectable={false} type="button">
            그대로 두기
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 만들기"
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.primary,
              borderColor: theme.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            다시 만들기
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { minHeight: 56, justifyContent: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.three },
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
