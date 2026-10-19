import { Children, isValidElement, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MaxContentWidth, Spacing, useReducedMotion } from '@/shared/ui/theme';

/** The most of the window the bands may stand in before they scroll. */
export const MovieNoticesMaxShare = 0.3;

export type MovieNoticesProps = {
  /**
   * The butter bands, one conditional slot each. A band keyed by what it says
   * counts as a new band when its words change.
   */
  children: ReactNode;
};

/**
 * Where the studio's standing notices stand: all of them under the head — a
 * refused run, a refused cut edit, the snaps the draft left out, and the
 * edited-since-render band — as the junk-journal usage rule puts every
 * standing notice (root `docs/decisions/junk-journal-design-system.md`, 안내 띠).
 *
 * Every other zone of the studio is a fixed height and the stage takes what
 * they leave, down to its floor — so a pile of bands cannot be allowed to grow
 * the column past the window. On a 360×780dp phone the restore band and a
 * refusal did exactly that, and the footer — the ticket that answers the
 * refusal, the remake confirm, the inspector, 공유 — went under the navigation
 * bar with nothing on the screen able to scroll it back (2026-10-19 review,
 * MOVIE-1). The bands therefore sit in a scroll region of their own: as tall as
 * they are while they fit, capped at a share of the window so they never take
 * the stage on a tall phone, and shrunk below that when the stage is already
 * at its floor, so the zones under it always keep their place and every band
 * is still reachable by scrolling.
 *
 * A band that arrives while the region is already standing is the answer to
 * what was just pressed, so the region scrolls to that band's top — wherever
 * its slot puts it. The region opens at its top, and a band going away leaves
 * it where the user has it.
 */
export function MovieNotices({ children }: MovieNoticesProps) {
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  // `toArray` drops the empty slots and keys every band by its slot, or by its
  // own key when it has one.
  const bands = Children.toArray(children).filter(isValidElement);
  const keys = JSON.stringify(bands.map((band) => String(band.key)));
  // The bands up at the last commit; unset until the region first stands.
  const shown = useRef<string[] | undefined>(undefined);
  // The band that arrived and waits for its first layout to be scrolled to.
  const arrival = useRef<string | undefined>(undefined);

  // A layout effect, so the arrival is known before any band reports its layout.
  useLayoutEffect(() => {
    const now = JSON.parse(keys) as string[];
    const before = shown.current;
    shown.current = now;
    // The highest of the new bands, so as many of them as fit are in view.
    arrival.current = before === undefined ? undefined : now.find((key) => !before.includes(key));
  }, [keys]);

  if (bands.length === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.region, { maxHeight: Math.round(height * MovieNoticesMaxShare) }]}
      contentContainerStyle={styles.content}
      // Nothing to pull at while the bands fit.
      alwaysBounceVertical={false}
    >
      {bands.map((band) => {
        const key = String(band.key);
        return (
          <View
            key={key}
            onLayout={(event) => {
              if (arrival.current !== key) return;
              arrival.current = undefined;
              // Past the end the platform stops the scroll at the end.
              scrollRef.current?.scrollTo({
                y: Math.max(0, event.nativeEvent.layout.y - Spacing.half),
                animated: !reducedMotion,
              });
            }}
          >
            {band}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Sized by the bands, never stretched (a ScrollView grows by default), and
  // the one zone that gives way when the column runs out of height.
  region: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // The bands' old margins under the head. The bottom keeps the last band's
  // paper shadow inside the region, which clips what it holds.
  content: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.half,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
});
