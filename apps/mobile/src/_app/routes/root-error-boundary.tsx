import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { AlertCard } from '@/shared/ui/notice';
import { PaperGround } from '@/shared/ui/paper';
import { MaxContentWidth, Spacing, useResolvedColorScheme } from '@/shared/ui/theme';

/**
 * What the app shows instead of closing when drawing it throws — exported as
 * the root layout's `ErrorBoundary`, so it catches whatever no screen catches
 * itself. Without it, a render error closes a release build outright.
 *
 * The failure is said the way every other failed load in the app says it: an
 * `AlertCard` with its one way out, which also tells a screen reader.
 *
 * It stands in for the root layout itself, providers included, so it reads
 * nothing they provide (no query client, no gates) and sets the status bar
 * itself. `다시 시도` draws the app again from its first screen (the splash
 * mark fades once more); the session and the stores live outside the boundary
 * and survive, the navigation history does not. Expo Router hides the native
 * splash when it catches the error, so this is never left under it.
 */
export function RootErrorBoundary({ retry }: ErrorBoundaryProps) {
  const scheme = useResolvedColorScheme();

  return (
    <View style={styles.screen}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <PaperGround kind="ruled" />
      <View style={styles.column}>
        <AlertCard
          message="화면을 열지 못했어요"
          action={{ label: '다시 시도', onPress: () => void retry() }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
});
