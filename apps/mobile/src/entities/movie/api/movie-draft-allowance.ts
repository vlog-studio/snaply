import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/**
 * What the next edit draft costs (spec CRD-9). `agent: false` — the server has
 * no agent, so every draft is free and nothing is counted.
 */
export type MovieDraftAllowance = {
  agent: boolean;
  /** Free drafts left in the last 24 hours. */
  freeRemaining: number;
  /** Credits the next draft takes — 0 while free. */
  nextCost: number;
};

const allowanceDtoSchema = z.object({
  agent: z.boolean(),
  freeRemaining: z.number().int().min(0),
  nextCost: z.number().int().min(0),
});

/** `GET /movie-drafts/allowance`. The mock build has no agent: drafts are free. */
export async function getMovieDraftAllowance(signal?: AbortSignal): Promise<MovieDraftAllowance> {
  if (USE_MOCK_API) return { agent: false, freeRemaining: 0, nextCost: 0 };
  return apiRequest('/movie-drafts/allowance', {
    method: 'GET',
    schema: allowanceDtoSchema,
    signal,
  });
}

/**
 * The draft's cost read. Not keyed by account: the query cache is cleared
 * whenever the signed-in account changes. A draft changes it, so asking for
 * one invalidates `movieDraftQueries.all()`.
 */
export const movieDraftQueries = {
  all: () => ['movie-draft'] as const,
  allowance: () =>
    queryOptions({
      queryKey: [...movieDraftQueries.all(), 'allowance'] as const,
      queryFn: ({ signal }) => getMovieDraftAllowance(signal),
      staleTime: 30_000,
    }),
};
