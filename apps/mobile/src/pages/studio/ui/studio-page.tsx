import { useRouter, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTemplateOffers } from '@/features/fill-template';
import { formatDuration, useNow } from '@/shared/lib/datetime';
import { draftPickerHref, movieHref, snapPickerHref } from '@/shared/routes';
import { FadeInView } from '@/shared/ui/fade-in-view';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { PaperGround, PaperPiece, Tape, tiltFor } from '@/shared/ui/paper';
import { Polaroid } from '@/shared/ui/polaroid';
import { RansomTitle } from '@/shared/ui/ransom-title';
import { TextButton } from '@/shared/ui/text-button';
import {
  MaxContentWidth,
  Spacing,
  useTabBarHeight,
  useTheme,
  useTopContentInset,
} from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { MovieRow, useBoardMovies } from '@/widgets/movie-shelf';
import { useSnapDays } from '@/widgets/snap-grid';

import { TemplatePanel } from './template-panel';

const HourMs = 60 * 60 * 1000;

/** How many movies the board previews before deferring to the movie tab. */
const BoardPreviewCount = 3;

/**
 * How many of the newest snaps the 새 무비 row shows. The row always lays out
 * this many cells, so a library of two draws two cells of the same size as a
 * library of two hundred — a strip whose cells grew to fill the row would look
 * like a different control.
 */
const RecentSnapCount = 5;

/**
 * The studio — the workbench the app opens on.
 *
 * Three blocks, read top to bottom as start → work: the way into a new movie,
 * the templates that will go looking for material on their own, and the movies
 * themselves — unfinished first. Reopening the app lands here so the user
 * resumes rather than restarts (root docs/decisions/product-concept.md §3).
 *
 * The 새 무비 row and the templates are two entrances to the same place: one is
 * "make a movie out of these", the other is "make me something like this". Both
 * show the user's own material rather than describing it: the row carries the
 * library's size and its newest snaps, the template cards their filled and empty
 * slots — the workbench has the material on it (same decision, §3). The
 * row replaced the 담기 트레이 panel (2026-08-12): picks now become a draft
 * movie directly, and a draft is the basket the tray was — persistent, refill-
 * able through the movie screen, and plural — so the studio's job here shrank
 * to offering the way in, at the one-row weight the empty tray had already
 * settled on.
 */
export function StudioPage() {
  const theme = useTheme();
  const router = useRouter();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();
  // The date stub turns over at midnight while the tab stays open.
  const now = useNow(HourMs);

  // Tapping the tab that is already open returns to the top. Switching tabs
  // keeps each tab's scroll position, which is what the shell's four tabs are
  // for — so re-tapping is the reset, as it is on a native tab bar.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const templateOffers = useTemplateOffers();
  const boardMovies = useBoardMovies();
  const library = useSnapDays();
  // Newest first, as the Snap tab draws them. Held back until the store has
  // read itself back, so a full library never flashes as an empty one; with no
  // snaps the row keeps its one-line shape — there is nothing to show yet.
  const hasMaterial = library.isHydrated && library.totalCount > 0;
  const recentSnaps = hasMaterial
    ? library.days.flatMap((day) => day.snaps).slice(0, RecentSnapCount)
    : [];

  const pickSnaps = () => router.push(snapPickerHref());
  const pickForDraft = () => router.push(draftPickerHref());
  // Every movie opens on the same screen, whatever it is waiting for: watching a
  // finished one and fixing it happen in the same place.
  const openMovie = (movieId: string) => router.push(movieHref(movieId));

  const openTemplate = (templateId: string) =>
    router.push({ pathname: '/template/[id]', params: { id: templateId } });

  return (
    <ScrollView
      ref={scrollRef}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Spacing.five + topInset, paddingBottom: Spacing.seven + tabBarHeight },
      ]}
    >
      {/* Ruled notebook paper under the whole studio, scrolling with it. */}
      <PaperGround kind="ruled" />

      <View style={styles.header}>
        <RansomTitle word="스튜디오" />
        <DateStub now={now} />
      </View>

      <FadeInView duration={260} style={styles.blocks}>
        {/* One block, whole-block tappable: picking the snaps is the first
            real decision of a hand-made movie, and it happens on the Snap tab.
            The frames are what there is to pick from, not targets of their
            own — one tap target keeps them from reading as separate buttons. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            hasMaterial
              ? `스냅 골라서 새 무비 만들기 · 스냅 ${library.totalCount}개`
              : '스냅 골라서 새 무비 만들기'
          }
          onPress={pickSnaps}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <PaperPiece tilt={-0.8} style={styles.newMovie}>
            <Tape color="tapeMint" style={styles.newMovieTape} tilt={-6} />
            <View style={styles.newMovieHead}>
              <ThemedText selectable={false} type="barTitle">
                스냅 골라 새 무비
              </ThemedText>
              <DoodleIcon name="chevronRight" size={20} />
              <View style={styles.spacer} />
              {hasMaterial ? (
                // The Snap tab's own header read-out, so the two never disagree.
                <ThemedText selectable={false} type="data">
                  {library.totalCount}개 · {formatDuration(library.totalDurationSec)}
                </ThemedText>
              ) : null}
            </View>
            {hasMaterial ? (
              <View style={styles.recentRow}>
                {Array.from({ length: RecentSnapCount }, (_, index) => {
                  const snap = recentSnaps[index];
                  return snap ? (
                    <Polaroid
                      key={snap.id}
                      uri={snap.uri}
                      tilt={tiltFor(snap.id, 2)}
                      style={styles.recentCell}
                    />
                  ) : (
                    <View key={`empty-${index}`} style={styles.recentCell} />
                  );
                })}
              </View>
            ) : null}
          </PaperPiece>
        </Pressable>

        {/* The same picking, handed to the edit draft (MOV-21): the snaps it is
            given are chosen among, ordered, and cut. One strip under the block
            above — the material is already on show there, so it is not drawn
            twice. Lavender is the AI's colour. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스냅 골라서 자동으로 편집하기"
          onPress={pickForDraft}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <PaperPiece fill={theme.aiFill} edge="deckle" tilt={0.6} style={styles.autoEdit}>
            <MagicWand />
            <ThemedText
              selectable={false}
              type="button"
              style={[styles.autoEditLabel, { color: theme.stickerInk }]}
            >
              스냅 골라 자동 편집
            </ThemedText>
            <DoodleIcon name="chevronRight" size={20} color={theme.stickerInk} />
          </PaperPiece>
        </Pressable>

        <TemplatePanel offers={templateOffers} onOpen={openTemplate} />

        {/* No movies yet means no board: a heading over a dashed sentence that
            says the list is empty adds a block without adding a fact. The two
            entrances above are what an empty studio has to offer. */}
        {boardMovies.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <ThemedText type="heading">무비</ThemedText>
              <TextButton
                label="전체 보기"
                accessibilityLabel="무비 전체 보기"
                onPress={() => router.navigate('/movies')}
              />
            </View>
            {/* The board as a receipt torn off the roll — one line per movie. */}
            <PaperPiece edge="tornBottom" tilt={0.4} style={styles.receipt}>
              {boardMovies.slice(0, BoardPreviewCount).map((movie) => (
                <MovieRow key={movie.id} movie={movie} onPress={openMovie} />
              ))}
            </PaperPiece>
          </View>
        ) : null}
      </FadeInView>
    </ScrollView>
  );
}

/**
 * Today, as a stub torn off a receipt beside the title — the date and the day
 * of the week, in the receipt's own type.
 */
function DateStub({ now }: { now: number }) {
  const date = new Date(now);
  const stamp = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  return (
    <PaperPiece edge="tornBottom" tilt={2} style={styles.dateStub}>
      <ThemedText type="dataSm" style={styles.dateText}>
        {stamp}
      </ThemedText>
      <ThemedText type="data" style={styles.dateText}>
        {Weekdays[date.getDay()]}
      </ThemedText>
    </PaperPiece>
  );
}

const Weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** The edit draft's sparkle wand — the canvas's own drawing. */
function MagicWand() {
  return (
    <Svg
      width={26}
      height={26}
      viewBox="0 0 32 32"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path d="M7 26L21 12" stroke="#2B2B2B" strokeWidth={3} strokeLinecap="round" />
      <Path
        d="M22 4l1.8 4.2L28 10l-4.2 1.8L22 16l-1.8-4.2L16 10l4.2-1.8z"
        fill="#D9CCF2"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Path
        d="M8 7l.8 1.8 1.8.8-1.8.8L8 12.2l-.8-1.8L5.4 9.6l1.8-.8z"
        fill="#FFF1A8"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // The page's paper runs to the bottom of the screen, however short the content.
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  dateStub: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two - Spacing.half,
    paddingBottom: Spacing.three,
    marginTop: Spacing.two,
  },
  dateText: { textAlign: 'right' },
  blocks: { gap: Spacing.five - Spacing.half },
  // The one-row weight the empty tray panel had settled on is still the shape
  // of an empty library; the frames below it only arrive with snaps.
  newMovie: {
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingBottom: Spacing.three + Spacing.half,
    gap: Spacing.three,
  },
  newMovieTape: { top: -8, left: 12 },
  newMovieHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + Spacing.half },
  spacer: { flex: 1 },
  recentRow: { flexDirection: 'row', gap: Spacing.two },
  // Square, as in the Snap tab's grid: a frame only has to be recognizable.
  recentCell: { flex: 1 },
  autoEdit: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three + Spacing.half,
  },
  autoEditLabel: { flex: 1 },
  section: { gap: Spacing.one },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingLeft: Spacing.four,
  },
  receipt: {
    paddingTop: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingBottom: Spacing.five,
  },
});
