import { queryOptions } from '@tanstack/react-query';

import { getChosenInterests, getInterestTopics } from './interests-api';

/**
 * The account's interests and the topics to choose from. Not keyed by account:
 * the query cache is cleared whenever the signed-in account changes
 * (`library-scope-gate.tsx`).
 */
export const interestQueries = {
  all: () => ['interests'] as const,
  chosen: () =>
    queryOptions({
      queryKey: [...interestQueries.all(), 'chosen'] as const,
      queryFn: ({ signal }) => getChosenInterests(signal),
      // Only this account changes it, and every change here writes the
      // server's answer straight into the cache.
      staleTime: 5 * 60_000,
    }),
  topics: () =>
    queryOptions({
      queryKey: [...interestQueries.all(), 'topics'] as const,
      queryFn: ({ signal }) => getInterestTopics(signal),
      // Product data that changes with a server release, not per session.
      staleTime: 60 * 60_000,
    }),
};
