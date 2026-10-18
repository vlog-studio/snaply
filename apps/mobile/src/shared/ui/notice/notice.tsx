import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Shadows, Sizes, Spacing, ThemeScope, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { TextButton } from '@/shared/ui/text-button';

type NoticeAction = { label: string; accessibilityLabel?: string; onPress: () => void };

export type NoticeProps = {
  message: ReactNode;
  action?: NoticeAction;
  /** A ✕ that dismisses the notice. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * A standing notice under a screen's head (the design system's `mv-notice`): a
 * butter band with a `!` and dark ink. It stays until what it says is no longer
 * true — a refusal, snaps the draft left out. A notice that goes away by itself
 * is a `Toast`; a failure is an `AlertCard`.
 *
 * Butter keeps its value at night, so the contents are pinned to the day
 * scheme and every text inside resolves the dark ink.
 */
export function NoticeBand({ message, action, onDismiss, style }: NoticeProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.band,
        { backgroundColor: theme.butter, boxShadow: Shadows.paper(theme.shadowInk) },
        style,
      ]}
    >
      <ThemeScope scheme="light">
        <View style={[styles.bang, { borderColor: theme.stickerInk }]}>
          <ThemedText selectable={false} type="edge" style={{ color: theme.stickerInk }}>
            !
          </ThemedText>
        </View>
        <NoticeBody message={message} action={action} onDismiss={onDismiss} />
      </ThemeScope>
    </View>
  );
}

/**
 * A failure line (the design system's `jj-alert`): a white card with the
 * message in cherry ink and, when there is one, the way out as a text button.
 * One shape for every error band — an upload, an import, a load.
 */
export function AlertCard({ message, action, onDismiss, style }: NoticeProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.alert,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          boxShadow: Shadows.paper(theme.shadowInk),
        },
        style,
      ]}
    >
      <NoticeBody message={message} action={action} onDismiss={onDismiss} tone="error" />
    </View>
  );
}

function NoticeBody({
  message,
  action,
  onDismiss,
  tone,
}: Omit<NoticeProps, 'style'> & { tone?: 'error' }) {
  const theme = useTheme();
  return (
    <>
      <View style={styles.message}>
        {typeof message === 'string' ? (
          <ThemedText type="bodySm" themeColor={tone === 'error' ? 'cherryInk' : undefined}>
            {message}
          </ThemedText>
        ) : (
          message
        )}
      </View>
      {action ? (
        <TextButton
          label={action.label}
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          onPress={action.onPress}
        />
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림 닫기"
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="close" size={18} color={theme.text} />
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: Sizes.touchMin,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.one,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: Sizes.touchMin,
    borderWidth: 1,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.one,
  },
  // The `!` sticker — a small stamped square, not a filled warning icon.
  bang: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  message: { flex: 1, minWidth: 0, paddingVertical: Spacing.two },
  dismiss: {
    width: Sizes.touchMin,
    height: Sizes.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
