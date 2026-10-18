import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmailSignInForm, SocialLoginList } from '@/features/sign-in';
import { DottedRule, PaperGround, PaperPiece, Tape } from '@/shared/ui/paper';
import { MaxContentWidth, Shadows, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * The way in, as the cover of a journal: a kraft cover taped to the page with
 * the brand disc and a torn label carrying the one line of what the app does,
 * then the sign-in form on a sheet of its own.
 */
export function SignInPage() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PaperGround kind="ruled" />

          <View style={styles.cover}>
            <Tape color="tapeButter" style={styles.coverTape} tilt={-3} />
            <PaperPiece fill={theme.kraft} tilt={-1.2} style={styles.coverFace}>
              <View style={styles.brand}>
                <View
                  style={[
                    styles.mark,
                    { backgroundColor: theme.primary, boxShadow: Shadows.paper(theme.shadowInk) },
                  ]}
                >
                  <View style={styles.markStitch} />
                  <Image
                    contentFit="contain"
                    source={require('@/assets/images/brand-glyph-white.png')}
                    style={styles.glyph}
                  />
                </View>
                <ThemedText type="eyebrow" style={[styles.wordmark, { color: theme.stickerInk }]}>
                  SNAPLY
                </ThemedText>
              </View>
              <PaperPiece edge="tornBottom" tilt={0.8} style={styles.label}>
                <ThemedText type="title" accessibilityRole="header">
                  {'3초씩 찍으면\n한 편의 무비가 돼요'}
                </ThemedText>
              </PaperPiece>
            </PaperPiece>
          </View>

          <PaperPiece tilt={0.4} style={styles.form}>
            <EmailSignInForm />
          </PaperPiece>

          <View style={styles.divider}>
            <DottedRule color={theme.textSecondary} style={styles.dividerLine} />
            <ThemedText type="small" themeColor="textSecondary">
              또는
            </ThemedText>
            <DottedRule color={theme.textSecondary} style={styles.dividerLine} />
          </View>

          <SocialLoginList />

          <View style={styles.links}>
            <Link href="/reset-password" style={styles.quietLink}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.dotted}>
                비밀번호를 잊었나요?
              </ThemedText>
            </Link>

            <View style={styles.signUpRow}>
              <ThemedText type="small" themeColor="textSecondary">
                계정이 없나요?
              </ThemedText>
              <Link href="/sign-up">
                <ThemedText
                  type="linkPrimary"
                  style={{ backgroundColor: theme.pink, color: theme.stickerInk }}
                >
                  가입하기
                </ThemedText>
              </Link>
            </View>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
            계속하면 서비스 이용약관과 개인정보 처리방침에 동의하게 돼요.
          </ThemedText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  cover: { marginTop: Spacing.two, marginRight: Spacing.one + Spacing.half },
  coverTape: { top: -9, left: '38%', zIndex: 2 },
  coverFace: {
    paddingTop: Spacing.three + Spacing.half,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, height: 48 },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  markStitch: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  glyph: { width: 28, height: 28 },
  wordmark: { fontSize: 20, lineHeight: 24 },
  label: {
    marginTop: Spacing.three - Spacing.half,
    paddingTop: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingBottom: Spacing.three,
  },
  form: { paddingTop: Spacing.three, paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 20 },
  dividerLine: { opacity: 0.6 },
  links: { alignItems: 'center', marginTop: -Spacing.two },
  quietLink: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
  dotted: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 48,
  },
  disclaimer: { textAlign: 'center', alignSelf: 'center', maxWidth: 292 },
});
