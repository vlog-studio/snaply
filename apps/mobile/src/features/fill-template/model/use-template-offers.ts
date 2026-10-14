import { useMemo } from 'react';

import { useMovieTemplates, type MovieTemplate } from '@/entities/movie-template';
import { useSnapsForMovies, type Snap } from '@/entities/snap';

import { groupIntoSessions, pickBestSession, spreadAcrossSlots } from '../lib/match-template';

export type TemplateOffer = {
  template: MovieTemplate;
  /** How many of its slots the library can fill right now. */
  filled: number;
  /** How many it asks for. */
  slotCount: number;
  /**
   * What each slot would hold if the template were opened now, in slot order,
   * and `undefined` for a slot the library cannot fill — laid by the same
   * spread the template screen proposes, so the studio card's strip shows the
   * cuts the user will find on opening it rather than a guess of its own.
   */
  slots: (Snap | undefined)[];
};

/**
 * Every template with how far the library gets through it — what the studio's
 * cards read out.
 *
 * The point of showing the shortfall rather than hiding templates that do not
 * fit is that the shortfall is the invitation: "6컷 중 4컷 있어요" is the app naming
 * two shots the user could go take. A template the library cannot fill at all
 * still belongs on the shelf for the same reason.
 *
 * **The ones the library fills come first** (2026-08-12). The studio draws
 * these as a horizontal row that fits two and a half cards, so catalog order
 * decided by luck which templates a user ever saw — a template the library can
 * fill today is worth more than one it cannot.
 *
 * **Within each group, the server's order** (2026-10-15, spec PRF-3): the
 * server orders the catalog by the user's taste, and by the catalog — shortest
 * first — when there is none. So a cafe lover sees 카페 한 곳 ahead of the other
 * templates the library is short for, however many cuts each is short, and a
 * user with no taste sees the catalog's order. The row stays stable while the
 * library and the taste do.
 *
 * The catalog itself comes from the server now (`useMovieTemplates`), which
 * answers with the built-in one until the request lands — so the cards are drawn
 * from the first render and a template the server added simply appears when its
 * answer arrives.
 */
export function useTemplateOffers(): TemplateOffer[] {
  // A snap whose server copy expired cannot be made into a movie (SNAP-12).
  const snaps = useSnapsForMovies();
  const templates = useMovieTemplates();

  return useMemo(
    () =>
      templates
        .map((template, index) => {
          const slotCount = template.slots.length;
          const best = pickBestSession(groupIntoSessions(snaps), slotCount);
          const slots = best
            ? spreadAcrossSlots(best.snaps, slotCount)
            : Array.from({ length: slotCount }, () => undefined);
          const offer: TemplateOffer = {
            template,
            filled: slots.filter((snap) => snap !== undefined).length,
            slotCount,
            slots,
          };
          return { offer, index, ready: offer.filled === slotCount };
        })
        .sort((left, right) => Number(right.ready) - Number(left.ready) || left.index - right.index)
        .map(({ offer }) => offer),
    [snaps, templates],
  );
}
