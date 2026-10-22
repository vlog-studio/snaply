import { MovieSnapLimit } from '@/entities/movie';

/**
 * What a selection is for. `movie` — the user's own cut list, in pick order;
 * the same picks can be deleted or saved, so any number can be picked and only
 * the movie itself takes up to {@link MovieSnapLimit}. `draft` — material
 * handed to the edit draft (MOV-21), up to the draft's cap (`useEditDraft`'s
 * `limit`), which chooses among it. `album` — copies for the device's album
 * (SNAP-17), no cap; an expiry notice opens the library this way with its
 * soon-to-go snaps picked (SNAP-13).
 */
export type SelectionPurpose = 'movie' | 'draft' | 'album';

/**
 * How many snaps the library lets the user pick for each purpose.
 *
 * Only the edit draft is capped while picking. A selection for a new movie is
 * also where snaps are deleted and saved to the album, any number of them, so
 * the movie's cap (MOV-5) holds only the movie's own button — capping the
 * picks refused the save past the cap too (2026-10-14 review, backlog E-55).
 */
export function pickingCapacity(purpose: SelectionPurpose, draftLimit: number): number {
  return purpose === 'draft' ? draftLimit : Number.POSITIVE_INFINITY;
}

/** Why the picks cannot become a movie as they are, or `undefined` when they can. */
export function movieLimitNotice(
  purpose: SelectionPurpose,
  pickedCount: number,
): string | undefined {
  if (purpose !== 'movie' || pickedCount <= MovieSnapLimit) return undefined;
  return `한 편에는 스냅 ${MovieSnapLimit}개까지 들어가요. 무비로 만들려면 ${pickedCount - MovieSnapLimit}개를 빼 주세요.`;
}
