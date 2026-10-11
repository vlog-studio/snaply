import { queryOptions } from '@tanstack/react-query';

import { getSnsConnections } from './get-sns-connections';

/**
 * The account's linked social accounts. Not keyed by account: the query cache is
 * cleared whenever the signed-in account changes, so one account's link can
 * never stand in for another's.
 */
export const snsConnectionQueries = {
  all: () => ['sns-connection'] as const,
  list: () =>
    queryOptions({
      queryKey: [...snsConnectionQueries.all(), 'list'] as const,
      queryFn: ({ signal }) => getSnsConnections(signal),
    }),
};
