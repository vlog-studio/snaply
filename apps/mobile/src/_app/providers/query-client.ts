import { focusManager, onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { watchInternetReachable } from '@/shared/lib/network-state';

/**
 * A read that failed is asked again when the app comes back to the front; one
 * that succeeded is left alone (a query that should follow the server across a
 * return opts in, like the credit balance).
 */
function refetchFailedOnReturn(query: Query): boolean | 'always' {
  return query.state.status === 'error' ? 'always' : false;
}

/**
 * The app-wide QueryClient. `_app` owns its creation and global cache/retry
 * policy; features and pages must not instantiate their own. Defaults are
 * conservative for a mobile client: a short stale window and limited retries.
 *
 * **Coming back** (backlog E-44): React Native gives TanStack Query no signal
 * for either, so both are wired below — the connection returning refetches what
 * is stale (`refetchOnReconnect`, which includes every read that failed while
 * offline), and the app returning refetches what failed. Without them a read
 * that failed on an offline launch stayed failed: the me tab showed the sign-in
 * email for a name and no balance until the app was restarted.
 *
 * **`networkMode: 'always'`** keeps reads and writes running while offline, as
 * before the connection was wired: they fail, and the screens say so ("연결을
 * 확인해 주세요"). The default would hold them paused instead — a spinner where
 * that message was.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
      networkMode: 'always',
      // Stated, not left to the default: with `networkMode: 'always'` TanStack
      // Query turns reconnect refetches off.
      refetchOnReconnect: true,
      refetchOnWindowFocus: refetchFailedOnReturn,
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

// "Focused" is the app in the front. While it is in the back, retries and
// polls wait for it to return instead of spending requests nobody sees.
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (status) => {
    setFocused(status === 'active');
  });
  return () => subscription.remove();
});
onlineManager.setEventListener(watchInternetReachable);
