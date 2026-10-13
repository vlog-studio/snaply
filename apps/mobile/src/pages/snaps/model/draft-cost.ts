import type { MovieDraftAllowance } from '@/entities/movie';

/**
 * What the next edit draft costs, for the selection bar's target read-out
 * (spec CRD-9): `무료 2번 남음` while free drafts are left, `20크레딧` once they
 * are used. Nothing while unknown, or when the server has no agent — every
 * draft is free then, and saying so would be noise.
 */
export function draftCostReadOut(allowance: MovieDraftAllowance | undefined): string | undefined {
  if (!allowance?.agent) return undefined;
  if (allowance.freeRemaining > 0) return `무료 ${allowance.freeRemaining}번 남음`;
  return `${allowance.nextCost}크레딧`;
}
