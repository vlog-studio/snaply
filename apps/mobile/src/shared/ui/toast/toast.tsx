import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { FadeInView } from '@/shared/ui/fade-in-view';
import { Tape } from '@/shared/ui/paper';
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

/** The canvas's tape across the post-it's top edge (`jj-tape--top`). */
const TapeWidth = 64;

/**
 * A one-line notice over the bottom of the screen that goes away by itself — the
 * shape for "act immediately, offer 되돌리기" (docs/ux/interaction-patterns.md
 * §4). Drawn as a post-it (the design system's `jj-note` in `st-toast`):
 * butter, a degree off straight, a short hard shadow, held to the page by a
 * strip of pink tape. Only a notice that leaves by itself is a post-it; a
 * standing one is a `NoticeBand`. Business-agnostic: the caller owns the
 * words, the action, and what dismissing means.
 *
 * It never takes focus or blocks the screen. A screen reader hears each
 * message once as it appears — its words, then the action on offer — as an
 * announcement queued behind whatever the reader is saying (`queue` is
 * iOS-only; TalkBack speaks it at once). The post-it mounts already holding its
 * words, and an Android live region speaks a change to a node that is there,
 * not a node that arrives, so it carries no live region that could say it a
 * second time.
 */
export function Toast({
  message,
  action,
  durationMs = DefaultDurationMs,
  onDismiss,
  bottomOffset,
}: ToastProps) {
  const theme = useTheme();
  const spoken =
    message === undefined ? undefined : action ? `${message}, ${action.label}` : message;

  useEffect(() => {
    if (spoken !== undefined) {
      AccessibilityInfo.announceForAccessibilityWithOptions(spoken, { queue: true });
    }
  }, [spoken]);

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
          style={[
            styles.toast,
            { backgroundColor: theme.butter, boxShadow: Shadows.paper(theme.shadowInk) },
          ]}
        >
          <Tape color="tapePink" width={TapeWidth} style={styles.tape} />
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
  // The canvas's `st-toast`: 16dp in from each side.
  anchor: { position: 'absolute', left: Spacing.four, right: Spacing.four },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.three,
    transform: [{ rotate: '-1deg' }],
  },
  // Centred on the top edge, half above it.
  tape: { top: -9, left: '50%', marginLeft: -TapeWidth / 2 },
  message: { flex: 1 },
});
