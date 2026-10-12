import { queryOptions } from '@tanstack/react-query';

import { getNickname } from './nickname-api';

/**
 * The account's nickname. Not keyed by account: the query cache is cleared
 * whenever the signed-in account changes (`library-scope-gate.tsx`).
 */
export const nicknameQueries = {
  all: () => ['nickname'] as const,
  current: () =>
    queryOptions({
      queryKey: [...nicknameQueries.all()] as const,
      queryFn: ({ signal }) => getNickname(signal),
      // Only this account changes it, and every change here writes the
      // server's answer straight into the cache.
      staleTime: 5 * 60_000,
    }),
};
