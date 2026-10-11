import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { snsConnectionQueries } from '@/entities/sns-connection';
import { useTheme } from '@/shared/ui/theme';

/**
 * Where the router lands when the backend sends the browser back to
 * `snaplyapp://sns/connected` or `snaplyapp://sns/error` (SNS-1).
 *
 * The connect flow reads that URL itself from its browser session
 * (`features/connect-sns`), so normally this screen only flashes past: on
 * Android the same link can also reach the router, and without a route it
 * would show the not-found screen. It re-reads the account's links — the one
 * thing the return changes — and steps back to wherever the user started,
 * or to the 소셜 연결 screen when the app was opened by the link itself.
 */
export function SnsReturnPage() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void queryClient.invalidateQueries({ queryKey: snsConnectionQueries.all() });
    if (router.canGoBack()) router.back();
    else router.replace('/settings/social');
  }, [queryClient, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
