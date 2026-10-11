import { useQuery } from '@tanstack/react-query';

import { snsConnectionQueries } from '../api/sns-connection.queries';

import type { SnsConnection, SnsPlatform } from './sns-connection';

export type SnsConnectionState = {
  /** The linked account, or `undefined` when there is none (or no answer yet). */
  connection: SnsConnection | undefined;
  /** The server has answered. Before that, nothing claims a link either way. */
  isLoaded: boolean;
  /** The read failed; the screens say so rather than claim "not linked". */
  isError: boolean;
};

/** Whether the signed-in account has linked `platform`, read from the server. */
export function useSnsConnection(platform: SnsPlatform): SnsConnectionState {
  const query = useQuery(snsConnectionQueries.list());
  return {
    connection: query.data?.find((connection) => connection.platform === platform),
    isLoaded: query.data !== undefined,
    isError: query.isError && query.data === undefined,
  };
}
