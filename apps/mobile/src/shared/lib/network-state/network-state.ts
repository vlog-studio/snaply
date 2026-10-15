import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';

// Thin wrapper over expo-network: whether the device can reach the internet,
// and when that changes. Transport/native concerns only — what to do when the
// connection comes back belongs to the caller.

/**
 * An unknown state counts as reachable — the caller's requests decide for
 * themselves. A missing one too (the jest-expo mock answers the read with none).
 */
function isReachable(state: NetworkState | undefined): boolean {
  return state?.isInternetReachable ?? state?.isConnected ?? true;
}

/**
 * Calls `listener` with whether the internet is reachable: once with the
 * current state, then on every change. Returns the unsubscribe.
 *
 * The current state is read rather than left to the first event because Android
 * reports nothing on subscribing while there is no network at all — a launch in
 * airplane mode would otherwise pass for online, and the connection's return
 * for no change. An event that lands first is newer than that read, so it wins.
 */
export function watchInternetReachable(listener: (reachable: boolean) => void): () => void {
  let active = true;
  let heard = false;
  const subscription = addNetworkStateListener((state) => {
    heard = true;
    listener(isReachable(state));
  });
  getNetworkStateAsync().then(
    (state) => {
      if (active && !heard) listener(isReachable(state));
    },
    () => {
      // Unknown: the caller keeps what it assumed.
    },
  );
  return () => {
    active = false;
    subscription.remove();
  };
}
