import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { updateNickname } from '../api/nickname-api';
import { nicknameQueries } from '../api/nickname.queries';

/**
 * The name the 나 tab shows: the account's own nickname once set, otherwise the
 * sign-in identity's name (`fallback`), so the tab never waits on the server
 * to have something to say.
 */
export function useNickname(fallback: string | undefined): string | undefined {
  const { data } = useQuery(nicknameQueries.current());
  return data ?? fallback;
}

/** Saves a nickname and writes the server's answer into the cache. */
export function useSaveNickname() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateNickname,
    onSuccess: (saved) => queryClient.setQueryData(nicknameQueries.current().queryKey, saved),
  });
}
