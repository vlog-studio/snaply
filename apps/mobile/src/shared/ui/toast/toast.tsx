import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { FadeInView } from '@/shared/ui/fade-in-view';
import { Shadows, Spacing, ThemeScope, useTheme } from '@/shared/ui/theme';
import { TextButton } from '@/shared/ui/text-button';
import { ThemedText } from '@/shared/ui/themed-text';

export type ToastProps = {
  /** What just happened. `undefined` shows nothing. */
  message: string | undefined;
  /** One follow-up, such as `되돌리기` for the action just taken. */
  action?: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean };
  /** How long it stays before `onDismiss`, from when `message` last changed. */
  durationMs?: number;
  onDismiss: () => void;
  /** Distance from the bottom edge — clear of whatever the screen keeps there. */
  bottomOffset: number;
};

/** Long enough to reach the action, short enough not to sit over the screen. */
const DefaultDurationMs = 6000;

/**
 * A one-line notice over the bottom of the screen that goes away by itself — the
 * shape for "act immediately, offer 되돌리기" (docs/ux/interaction-patterns.md
 * §4). Drawn as a post-it (the design system's `jj-note`): butter, a degree off
 * straight, a short hard shadow. Only a notice that leaves by itself is a
 * post-it; a standing one is a `NoticeBand`. Business-agnostic: the caller owns
 * the words, the action, and what dismissing means.
 *
 * It never takes focus or blocks the screen; screen readers hear it through the
 * live region.
 */
export function Toast({
  message,
  action,
  durationMs = DefaultDurationMs,
  onDismiss,
  bottomOffset,
}: ToastProps) {
  const theme = useTheme();

  useEffect(() => {
    if (message === undefined) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
    // A new message restarts the clock; a re-render with the same one does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, durationMs]);

  if (message === undefined) return null;

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: bottomOffset }]}>
      <FadeInView key={message} duration={200} offsetY={8}>
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            { backgroundColor: theme.butter, boxShadow: Shadows.paper(theme.shadowInk) },
          ]}
        >
          {/* Butter keeps its value at night, so the ink inside stays the day ink. */}
          <ThemeScope scheme="light">
            <ThemedText type="bodySm" style={styles.message}>
              {message}
            </ThemedText>
            {action ? (
              <TextButton
                label={action.label}
                accessibilityLabel={action.accessibilityLabel ?? action.label}
                disabled={action.disabled}
                onPress={action.onPress}
              />
            ) : null}
          </ThemeScope>
        </View>
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: Spacing.five, right: Spacing.five },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.three,
    transform: [{ rotate: '-1deg' }],
  },
  message: { flex: 1 },
});
