import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';

import type { CreditBalance } from '../model/credit';
import { creditQueries } from './credit.queries';

// Like the app's client, a read that succeeded is not asked again on return
// unless it opts in (`_app/providers/query-client.ts`).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: Infinity, staleTime: 0, refetchOnWindowFocus: false },
  },
});

beforeAll(() => {
  queryClient.mount();
});

afterAll(() => {
  queryClient.unmount();
  focusManager.setFocused(undefined);
});

describe('creditQueries.balance', () => {
  // An operator's grant to a tester lands on the server alone; the me tab kept
  // the old balance until the credits screen was opened (2026-10-14).
  it('asks the server again for a stale balance when the app comes back', async () => {
    const queryFn = jest
      .fn<Promise<CreditBalance>, []>()
      .mockResolvedValueOnce({ balance: 0, entries: [] })
      .mockResolvedValue({ balance: 500, entries: [] });
    const observer = new QueryObserver(queryClient, { ...creditQueries.balance(), queryFn });
    const unsubscribe = observer.subscribe(() => {});
    await waitFor(() => expect(observer.getCurrentResult().status).toBe('success'));

    focusManager.setFocused(false);
    focusManager.setFocused(true);

    await waitFor(() => expect(observer.getCurrentResult().data?.balance).toBe(500));
    unsubscribe();
  });
});
