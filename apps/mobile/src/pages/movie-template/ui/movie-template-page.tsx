import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMovieTemplate } from '@/entities/movie-template';
import { useSnaps } from '@/entities/snap';
import {
  AnalysisConsentSheet,
  useAnalysisConsent,
  useAnalysisConsentActions,
  useAnalysisOffer,
} from '@/features/analysis-consent';
import { useComposeMovie } from '@/features/compose-movie';
import { useTemplateFill } from '@/features/fill-template';
import { formatSeconds } from '@/shared/lib/datetime';
import { movieHref } from '@/shared/routes';
import { BackBar } from '@/shared/ui/back-bar';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { PaperGround, PaperPiece, Tape, TitleLabel } from '@/shared/ui/paper';
import { TextButton } from '@/shared/ui/text-button';
import { MaxContentWidth, Spacing, useTheme } from '@/shared/ui/theme';
import { AlertCard } from '@/shared/ui/notice';
import { ThemedText } from '@/shared/ui/themed-text';

import { AnalysisOffer } from './analysis-offer';
import { SlotRow, confidenceLabel } from './slot-row';

export type MovieTemplatePageProps = {
  templateId?: string;
};

/**
 * A template with the library matched against it: which scenes it already has,
 * which are missing, and the one button that turns the result into a movie.
 *
 * The match runs on time and place and says so; it never claims to have
 * recognised what is in a shot (`features/fill-template`). What it is really for
 * is the empty rows — a slot the library cannot fill is the app telling the user
 * what to go and shoot, and `지금 찍기` walks them to the camera and puts the
 * result in that exact row on the way back.
 *
 * The server's recommendation — the second stage — runs only for someone who
 * agreed to snap analysis (specs ANA-5): the frames of the outing's snaps go to
 * an outside provider. The screen asks once, under the slots, and composes the
 * two features itself because neither may see the other.
 *
 * Making the movie lands on an editable draft rather than starting generation:
 * generation is slow remote work once a real backend runs it, so the movie
 * screen is where the user settles the cut lengths and the style first and then
 * pays for the run once. This screen only gathers the material.
 */
export function MovieTemplatePage({ templateId }: MovieTemplatePageProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snaps = useSnaps();
  const template = useMovieTemplate(templateId);
  const consent = useAnalysisConsent();
  const offer = useAnalysisOffer();
  const consentActions = useAnalysisConsentActions();
  const [consentSheetVisible, setConsentSheetVisible] = useState(false);
  const fill = useTemplateFill(template, { recommend: consent.available && consent.granted });
  const { fillSlot } = fill;
  const { startMovieFromTemplate } = useComposeMovie();
  const [error, setError] = useState<string>();

  // Which row sent the user to the camera, and what the newest snap was when
  // they left. Refs rather than state: nothing renders from them, and they must
  // survive the trip without re-running the effect that reads them.
  const pending = useRef<{ slotId: string; latestSnapId?: string }>(undefined);

  useFocusEffect(
    useCallback(() => {
      const request = pending.current;
      if (!request) return;
      const newest = snaps[0];
      // A capture prepends to the library, so a different newest snap is the one
      // that was just shot. Coming back without shooting leaves the slot empty.
      if (newest && newest.id !== request.latestSnapId) {
        fillSlot(request.slotId, newest);
      }
      pending.current = undefined;
    }, [snaps, fillSlot]),
  );

  // A direct link can land here with nothing behind it, and the screen has no
  // navigation bar to fall back on — so going back means the studio.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!template) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <BackBar onPress={goBack} />
        <View style={[styles.screen, styles.centered]}>
          <View style={styles.missing}>
            <Tape color="tapeButter" style={styles.missingTape} />
            <PaperPiece edge="tornBottom" tilt={-0.8} style={styles.missingSheet}>
              <ThemedText type="subtitle" accessibilityRole="header">
                템플릿을 찾을 수 없어요
              </ThemedText>
              <ThemedText type="bodySm" themeColor="textSecondary">
                이미 삭제됐거나 없는 템플릿이에요.
              </ThemedText>
            </PaperPiece>
          </View>
        </View>
      </View>
    );
  }

  const shootFor = (slotId: string) => {
    pending.current = { slotId, latestSnapId: snaps[0]?.id };
    router.push('/capture');
  };

  const makeMovie = () => {
    const movie = startMovieFromTemplate({
      snapIds: fill.snapIds,
      style: template.style,
      bgm: template.bgm,
    });
    if (!movie) {
      setError('채운 컷이 없어요. 빈 컷을 찍어 채워 주세요.');
      return;
    }
    router.replace(movieHref(movie.id));
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <BackBar onPress={goBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Spacing.seven }]}>
        <PaperGround kind="ruled" />
        <View style={styles.header}>
          <TitleLabel>{template.name}</TitleLabel>
          <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
            {template.description} · {template.slots.length}컷
          </ThemedText>
        </View>

        {/* The percentages have no label of their own — one heading over the
            column they sit in says what they measure, without repeating a
            constant down every row. Absent when no row shows a number. */}
        {fill.slots.some((filled) => filled.confidence !== undefined) ? (
          <View style={styles.legend}>
            <ThemedText selectable={false} type="dataSm" themeColor="textSecondary">
              {confidenceLabel(fill.confidenceKind)}
            </ThemedText>
          </View>
        ) : null}

        {/* The slots as the lines of one receipt. */}
        <PaperPiece edge="tornBottom" style={styles.slots}>
          {fill.slots.map((filled, index) => (
            <SlotRow
              key={filled.slot.id}
              filled={filled}
              confidenceKind={fill.confidenceKind}
              index={index}
              onShoot={shootFor}
              onDrop={fill.dropSlot}
              onRestore={fill.restoreSlot}
              onMove={fill.moveSnap}
            />
          ))}
        </PaperPiece>

        {fill.isEdited ? (
          <TextButton label="고친 것 되돌리기" onPress={fill.resetSlots} style={styles.reset} />
        ) : null}

        {offer.visible ? (
          <AnalysisOffer onAccept={() => setConsentSheetVisible(true)} onDecline={offer.decline} />
        ) : null}

        {error ? <AlertCard message={error} /> : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.background,
            boxShadow: `0 -2px 0 ${theme.shadowInk}`,
            paddingBottom: insets.bottom + Spacing.four,
          },
        ]}
      >
        <View style={styles.footerHead}>
          <ThemedText type="data">
            {template.slots.length}컷 중 {fill.filledCount}컷 채웠어요
          </ThemedText>
          <ThemedText type="data">{formatSeconds(fill.totalSec)}</ThemedText>
        </View>
        <SnaplyButton
          title={
            fill.filledCount === template.slots.length
              ? '이대로 만들기'
              : `${fill.filledCount}컷으로 만들기`
          }
          disabled={fill.filledCount === 0}
          onPress={makeMovie}
        />
      </View>

      <AnalysisConsentSheet
        visible={consentSheetVisible}
        pending={consentActions.pending === 'give'}
        error={consentActions.error}
        onAccept={async () => {
          if (await consentActions.give()) setConsentSheetVisible(false);
        }}
        // Reading the whole wording and saying no is an answer to the offer too,
        // so it is not asked again; the 나 tab switch stays the way back in.
        onDecline={() => {
          setConsentSheetVisible(false);
          offer.decline();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.six,
  },
  // The page's paper runs to the bottom of the screen, however short the content.
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    // The back arrow above carries its own padding, so the title needs only the
    // gap that keeps it off the glyph.
    paddingTop: Spacing.two,
    gap: Spacing.four,
  },
  header: { gap: Spacing.one + Spacing.half },
  description: { marginLeft: Spacing.one },
  missing: { alignSelf: 'stretch' },
  missingTape: { position: 'absolute', top: -8, alignSelf: 'center', zIndex: 2 },
  missingSheet: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.six,
  },
  legend: { alignItems: 'flex-end', paddingHorizontal: Spacing.one },
  slots: { paddingHorizontal: Spacing.two, paddingTop: Spacing.one, paddingBottom: Spacing.three },
  reset: { alignSelf: 'center' },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  footerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
