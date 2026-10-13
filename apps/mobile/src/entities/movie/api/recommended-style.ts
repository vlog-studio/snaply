import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { MovieStyle } from '../model/movie';

import { movieStyleOfPreset } from './movie.dto';

/** The one field read off `GET /auth/me`. A server older than it sends nothing, read as none. */
const recommendedStyleDtoSchema = z.object({
  recommendedStyle: z.enum(['감성', '여행', '일상']).nullable().optional(),
});

/**
 * The style the account's taste points to (spec PRF-3), or `null` when there
 * is nothing to go by — a new movie then falls back to the default style. The
 * mock build has no taste.
 */
export async function getRecommendedStyle(signal?: AbortSignal): Promise<MovieStyle | null> {
  if (USE_MOCK_API) return null;
  const dto = await apiRequest('/auth/me', {
    method: 'GET',
    schema: recommendedStyleDtoSchema,
    signal,
  });
  return dto.recommendedStyle ? (movieStyleOfPreset(dto.recommendedStyle) ?? null) : null;
}

/**
 * The recommended style. Not keyed by account: the query cache is cleared
 * whenever the signed-in account changes. Taste moves slowly (finished movies,
 * style changes), so a few minutes stale is fine.
 */
export const movieStyleQueries = {
  all: () => ['movie-style'] as const,
  recommended: () =>
    queryOptions({
      queryKey: [...movieStyleQueries.all(), 'recommended'] as const,
      queryFn: ({ signal }) => getRecommendedStyle(signal),
      staleTime: 5 * 60_000,
    }),
};
