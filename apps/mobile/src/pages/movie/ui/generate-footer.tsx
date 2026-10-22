import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Movie } from '@/entities/movie';
import type { MovieSharing } from '@/features/share-movie';
import { AlertCard } from '@/shared/ui/notice';
import { Reel } from '@/shared/ui/reel';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing, useTheme } from '@/shared/ui/theme';

import { RemakeConfirm } from './remake-confirm';

export type GenerateFooterProps = {
  movie: Movie;
  /** Cuts the movie holds; nothing to generate is a refusal, not a run. */
  cutCount: number;
  sharing: MovieSharing;
  /**
   * The selected cut's controls, standing in for the action row while a cut
   * is held.
   */
  inspector?: ReactNode;
  onStart: () => void;
};

/**
 * Handing the movie to the AI — the fixed bar under the timeline (root
 * docs/decisions/product-concept.md §6). The first run, a retry after a failure,
 * and a remake after an edit are the same act on the same button; what changes
 * is the label and, for a failure, the stored reason above it.
 *
 * The action row is a fixed-height slot: while a cut is selected it hands its
 * place to the cut inspector instead of stacking above or below it, so taking
 * and releasing a cut never changes this zone's height — the stage above is
 * sized by what the zones below leave over, and a row that came and went made
 * the video jump. Deselecting (a tap on the strip's empty space) brings the
 * generate button back.
 *
 * Refusals — a refused run, a refused cut edit — and the edited-since-render
 * notice are not here: they are standing notices, and every standing notice on
 * this screen stands under the head (`MovieNotices`), where a pile of them
 * scrolls instead of pushing this slot off a small phone. The page draws them.
 *
 * The button and the failure, and nothing else. A summary line under it used to
 * restate the configuration (컷 수, 길이, 스타일, 음악) and the standing caveats
 * about how long a run takes and how little it really does; on a screen whose
 * stage lives on leftover height, three lines of prose that the strip, the
 * chips, and the progress panel each already say cost more than they told.
 */
export function GenerateFooter({
  movie,
  cutCount,
  sharing,
  inspector,
  onStart,
}: GenerateFooterProps) {
  const theme = useTheme();
  const hasFailed = movie.status === 'failed';
  const isReady = movie.status === 'ready';
  // A finished movie's run replaces its result and is paid again, so that one
  // press asks first (MOV-23). Only meaningful while the movie is still ready.
  const [askingRemake, setAskingRemake] = useState(false);

  return (
    <View style={styles.footer}>
      {hasFailed ? (
        // The stored reason, not a generic apology: the user has to know
        // whether running it again is worth anything, and today's one failure
        // is only answered by putting cuts back first. The server's own
        // diagnostic (`movie.errorDetail`) stays in the store for debugging but
        // is never drawn: it is what a bug report needs, not what the failure
        // means, and raw server text is not user copy. A standing state of the
        // movie, read where it sits rather than on every visit.
        <AlertCard message={movie.error ?? '무비를 만들지 못했어요.'} announce={false} />
      ) : null}

      <View style={styles.actionSlot}>
        {inspector ??
          (isReady && askingRemake ? (
            <RemakeConfirm
              onCancel={() => setAskingRemake(false)}
              onConfirm={() => {
                setAskingRemake(false);
                onStart();
              }}
            />
          ) : (
            <View style={styles.actions}>
              {isReady ? (
                // The wait is the reel, not words: the file downloads before the
                // sheet can open, and '공유 준비 중…' wrapped to three lines in a
                // third of the row on a 360dp phone, growing the slot the stage
                // is sized against. The name stays 공유; the ticket keeps its
                // colour and reports busy (`SnaplyButton`'s `busy`).
                <SnaplyButton
                  title="공유"
                  variant="secondary"
                  leading={sharing.busy ? <Reel size={18} color={theme.navy} /> : undefined}
                  busy={sharing.busy}
                  disabled={sharing.blocked !== undefined}
                  onPress={sharing.share}
                  style={styles.share}
                />
              ) : null}
              <SnaplyButton
                title={
                  hasFailed ? '다시 시도' : isReady ? '이 구성으로 다시 만들기' : '무비 만들기'
                }
                disabled={cutCount === 0}
                onPress={isReady ? () => setAskingRemake(true) : onStart}
                style={styles.generate}
              />
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: Spacing.two },
  // One button tall (`SnaplyButton` minHeight), whichever occupant is in.
  actionSlot: { minHeight: 56, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  share: { flexBasis: '32%' },
  generate: { flex: 1 },
});
