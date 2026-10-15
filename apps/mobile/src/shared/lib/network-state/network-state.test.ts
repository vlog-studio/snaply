import type { NetworkState } from 'expo-network';

import { watchInternetReachable } from './network-state';

const mockEmitters: ((state: NetworkState) => void)[] = [];
const mockRemove = jest.fn();
const mockGetNetworkState = jest.fn<Promise<NetworkState>, []>();

jest.mock('expo-network', () => ({
  addNetworkStateListener: (listener: (state: NetworkState) => void) => {
    mockEmitters.push(listener);
    return { remove: mockRemove };
  },
  getNetworkStateAsync: () => mockGetNetworkState(),
}));

function emit(state: NetworkState) {
  for (const listener of mockEmitters) listener(state);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const Offline: NetworkState = { isConnected: false, isInternetReachable: false };
const Online: NetworkState = { isConnected: true, isInternetReachable: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockEmitters.length = 0;
});

describe('watchInternetReachable', () => {
  // Android says nothing on subscribing while there is no network, so an
  // airplane-mode launch passed for online and the return for no change (E-44).
  it('reports an offline launch from the current state', async () => {
    mockGetNetworkState.mockResolvedValue(Offline);
    const listener = jest.fn();

    watchInternetReachable(listener);
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith(false);
  });

  it('lets a change that lands before the first read win over it', async () => {
    const read = deferred<NetworkState>();
    mockGetNetworkState.mockReturnValue(read.promise);
    const listener = jest.fn();

    watchInternetReachable(listener);
    emit(Online);
    read.resolve(Offline);
    await read.promise;

    expect(listener.mock.calls).toEqual([[true]]);
  });

  it.each<[string, boolean, NetworkState]>([
    ['connected and reaching the internet', true, Online],
    [
      'connected without the internet yet',
      false,
      { isConnected: true, isInternetReachable: false },
    ],
    ['disconnected', false, Offline],
    ['unknown', true, {}],
  ])('reads %s as reachable: %s', (_name, reachable, state) => {
    mockGetNetworkState.mockReturnValue(new Promise(() => {}));
    const listener = jest.fn();

    watchInternetReachable(listener);
    emit(state);

    expect(listener).toHaveBeenLastCalledWith(reachable);
  });

  it('stops listening, and ignores a first read still on its way', async () => {
    const read = deferred<NetworkState>();
    mockGetNetworkState.mockReturnValue(read.promise);
    const listener = jest.fn();

    const stop = watchInternetReachable(listener);
    stop();
    read.resolve(Offline);
    await read.promise;

    expect(mockRemove).toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
