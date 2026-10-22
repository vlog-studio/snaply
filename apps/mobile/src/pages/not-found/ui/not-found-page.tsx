import { useNavigation, useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useIsAuthenticated, useIsPendingDeletion, useIsRecovering } from '@/entities/session';
import { BackBar } from '@/shared/ui/back-bar';
import { PaperGround, PaperPiece, Tape } from '@/shared/ui/paper';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * Where a link that names no route lands (`src/app/+not-found.tsx`), such as a
 * stray `snaplyapp://` link. It replaces Expo Router's own unmatched-route
 * screen, which is English, unstyled and offers the route sitemap.
 *
 * Drawn like the app's other missing-thing screens (a template or a movie that
 * is gone): a bare back bar over a taped, torn sheet. With no cause to report,
 * the sheet is a heading and its one ticket.
 *
 * The ticket does what the back bar does, decided at the press: over the app
 * it goes back to where the user was; a link that opened the app cold has
 * nothing under it, so it opens the screen the session leads to
 * (`homeFor`). `canGoBack()` is read at the press, not at render — on the
 * first render of a deep link the stack has not grown yet.
 *
 * Going back runs through this screen's own navigator (`useNavigation`), as
 * the hardware back does. `router.back()` from here threw in Android's view
 * mounting over the movies and me tabs (addViewAt: the specified child already
 * has a parent), as closing this screen and switching tabs in one navigation
 * (`replace('/')`, `dismissTo('/')`) did over the snaps and me tabs on the
 * other redesign branch; `navigate('/')` stacks a second tab navigator over
 * this screen.
 */
export function NotFoundPage() {
  const theme = useTheme();
  const router = useRouter();
  // Back through this screen's own navigator, as the hardware back does.
  const navigation = useNavigation();
  const home = homeFor({
    authenticated: useIsAuthenticated(),
    recovering: useIsRecovering(),
    pendingDeletion: useIsPendingDeletion(),
  });
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : router.replace(home));

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <PaperGround kind="ruled" />
      <BackBar onPress={goBack} />
      <View style={styles.centered}>
        <View style={styles.missing}>
          <Tape color="tapeButter" style={styles.missingTape} />
          <PaperPiece edge="tornBottom" tilt={-0.8} style={styles.missingSheet}>
            <ThemedText type="subtitle" accessibilityRole="header">
              페이지를 찾을 수 없어요
            </ThemedText>
            <SnaplyButton title="돌아가기" onPress={goBack} />
          </PaperPiece>
        </View>
      </View>
    </View>
  );
}

/**
 * The one screen the root layout's guards leave open for this session, in
 * their order. A replace into a guarded-off route is dropped without a word —
 * `replace('/')` while signed out left both buttons doing nothing.
 */
function homeFor(session: {
  authenticated: boolean;
  recovering: boolean;
  pendingDeletion: boolean;
}): Href {
  if (session.recovering) return '/update-password';
  if (!session.authenticated) return '/sign-in';
  if (session.pendingDeletion) return '/account-restore';
  return '/';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
  },
  missing: { alignSelf: 'stretch' },
  missingTape: { position: 'absolute', top: -8, alignSelf: 'center', zIndex: 2 },
  missingSheet: {
    alignItems: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.six,
  },
});
