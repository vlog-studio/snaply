import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

import { ThemedText } from '@/shared/ui/themed-text';

/**
 * A failure worded in place under the controls it belongs to — the canvas's
 * inline error line, cherry ink in small type — and said to a screen reader as
 * it arrives. The line mounts already holding its words, which an Android live
 * region does not read out, so a refused tap went unannounced (2026-10-19
 * review, MOVIE-8). The same words again after a cleared line are said again.
 */
export function ErrorLine({ message }: { message: string | null | undefined }) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (!message) return null;
  return (
    <ThemedText type="small" themeColor="cherryInk">
      {message}
    </ThemedText>
  );
}
