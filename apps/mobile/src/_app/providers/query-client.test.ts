import { QueryObserver, type QueryObserverOptions } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';

import { queryClient } from './query-client';

let mockAppStateChange: ((status: string) => void) | undefined;
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: (status: string) => void) => {
      mockAppStateChange = listener;
      return { remove: jest.fn() };
    },
  },
}));

let mockReachable: ((reachable: boolean) => void) | undefined;
jest.mock('@/shared/lib/network-state', () => ({
  watchInternetReachable: (listener: (reachable: boolean) => void) => {
    mockReachable = listener;
    return jest.fn();
  },
}));

const unsubscribes: (() => void)[] = [];

/** A screen holding a read, the way `useQuery` does. */
function observe(
  queryFn: () => Promise<string>,
  options: Partial<QueryObserverOptions<string>> = {},
) {
  const observer = new QueryObserver<string>(queryClient, {
    queryKey: ['read', unsubscribes.length],
    queryFn,
    retry: false,
    ...options,
  });
  unsubscribes.push(observer.subscribe(() => {}));
  return observer;
}

function failingOnce() {
  return jest
    .fn<Promise<string>, []>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue('server');
}

beforeAll(() => {
  queryClient.mount();
});

afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
  queryClient.clear();
  mockAppStateChange?.('active');
  mockReachable?.(true);
});

describe('queryClient', () => {
  // E-44: a read that failed on an offline launch stayed failed — the me tab
  // showed the sign-in email for a name until the app restarted.
  it('asks again for a read that failed offline once the connection is back', async () => {
    mockReachable?.(false);
    const queryFn = failingOnce();
    const observer = observe(queryFn);
    await waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    mockReachable?.(true);

    await waitFor(() => expect(observer.getCurrentResult().data).toBe('server'));
  });

  it('asks again for a read that failed once the app comes back to the front', async () => {
    const queryFn = failingOnce();
    const observer = observe(queryFn);
    await waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));

    mockAppStateChange?.('background');
    mockAppStateChange?.('active');

    await waitFor(() => expect(observer.getCurrentResult().data).toBe('server'));
  });

  it('leaves a read that succeeded alone when the app comes back, however old', async () => {
    const queryFn = jest.fn<Promise<string>, []>().mockResolvedValue('server');
    const observer = observe(queryFn, { staleTime: 0 });
    await waitFor(() => expect(observer.getCurrentResult().status).toBe('success'));

    mockAppStateChange?.('background');
    mockAppStateChange?.('active');
    await Promise.resolve();

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  // Holding reads while offline would put a spinner where the screens say
  // "연결을 확인해 주세요".
  it('still runs a read while offline, so the screen can say it failed', async () => {
    mockReachable?.(false);
    const queryFn = jest.fn<Promise<string>, []>().mockRejectedValue(new Error('offline'));
    const observer = observe(queryFn);

    await waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));
    expect(observer.getCurrentResult().fetchStatus).toBe('idle');
  });
});
