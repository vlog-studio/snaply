import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { useIsAuthenticated } from '@/entities/session';

import { updateInterests } from '../api/interests-api';
import { interestQueries } from '../api/interests.queries';
import type { InterestTopic } from './interest-topic';

/** The account's chosen interests, as topic ids; `undefined` until the server answers or while signed out. */
export function useChosenInterests(): string[] | undefined {
  const signedIn = useIsAuthenticated();
  return useQuery({ ...interestQueries.chosen(), enabled: signedIn }).data;
}

/** The topics to choose from, with what the screen needs to show a failed load and retry it. */
export function useInterestTopics(): {
  topics: InterestTopic[] | undefined;
  failed: boolean;
  retry: () => void;
} {
  const signedIn = useIsAuthenticated();
  const query = useQuery({ ...interestQueries.topics(), enabled: signedIn });
  return { topics: query.data, failed: query.isError, retry: () => void query.refetch() };
}

/**
 * Turns one interest on or off. The choice shows at once, the server's answer
 * replaces it, and a refusal puts the previous choice back with `failed` set.
 * Taps can outrun the server, so only the newest write's answer is committed —
 * an older answer arriving late would otherwise undo a newer tap.
 */
export function useToggleInterest(): { toggle: (id: string) => void; failed: boolean } {
  const queryClient = useQueryClient();
  const key = interestQueries.chosen().queryKey;
  const latest = useRef(0);
  const [failed, setFailed] = useState(false);

  const mutation = useMutation({
    mutationFn: ({ next }: { next: string[]; previous: string[]; write: number }) =>
      updateInterests(next),
    onSuccess: (saved, { write }) => {
      if (write === latest.current) queryClient.setQueryData(key, saved);
    },
    onError: (_error, { previous, write }) => {
      if (write !== latest.current) return;
      queryClient.setQueryData(key, previous);
      setFailed(true);
    },
  });

  const toggle = (id: string) => {
    const previous = queryClient.getQueryData(key);
    if (previous === undefined) return;
    const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id];
    latest.current += 1;
    setFailed(false);
    queryClient.setQueryData(key, next);
    mutation.mutate({ next, previous, write: latest.current });
  };

  return { toggle, failed };
}
