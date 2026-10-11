import type { SnapRef } from '@/entities/movie';

/**
 * Why a cut can no longer be played or run, worded apart on screen (SNAP-12):
 * `expired` is our retention, `deleted` is the user's own act — on this device
 * (the original is gone here) or another (the server says `user`).
 */
export type CutGone = 'expired' | 'deleted';

/**
 * Reads a cut's fate from the server's mark and the snap library.
 *
 * An unavailable cut with no reason reads as expired, as every unavailable cut
 * did before the server sent one. A cut the server still has but whose
 * original is gone from this device was deleted here.
 */
export function cutGone(ref: SnapRef, hasSnap: boolean): CutGone | undefined {
  if (ref.unavailable) return ref.unavailableReason === 'user' ? 'deleted' : 'expired';
  return hasSnap ? undefined : 'deleted';
}

/**
 * Why a movie has nothing to play, for its empty stage: `expired` only when
 * every cut that is left ran out its retention. A movie with no cuts at all got
 * there by the user's deletions — a deleted snap takes its cut out of the movie
 * (SNAP-20) — so it reads as deleted, never as expired.
 */
export function emptyStageReason(cuts: readonly { gone?: CutGone }[]): CutGone {
  return cuts.length > 0 && cuts.every((cut) => cut.gone === 'expired') ? 'expired' : 'deleted';
}
