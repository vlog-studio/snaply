import { act, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { RootLayout } from './root-layout';

// The web stylesheet is plain CSS, which Jest cannot parse.
jest.mock('@/_app/styles/global.css', () => ({}));

// Whether the persisted session has been read back. The store is the session
// slice's; what the root layout owns is handing its answer to the overlay.
let mockHydrated = false;
const mockHydrationListeners = new Set<() => void>();

jest.mock('@/entities/session', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  const subscribe = (listener: () => void) => {
    mockHydrationListeners.add(listener);
    return () => mockHydrationListeners.delete(listener);
  };
  return {
    initSession: () => () => {},
    markPendingDeletion: jest.fn(),
    useIsAuthenticated: () => false,
    useIsPendingDeletion: () => false,
    useIsRecovering: () => false,
    useSessionHydrated: () => useSyncExternalStore(subscribe, () => mockHydrated),
  };
});

// The real providers mount every headless gate of the app; none of them decides
// when the splash leaves.
jest.mock('@/_app/providers', () => ({
  AppProviders: ({ children }: PropsWithChildren) => children,
}));

// The overlay's own test covers what `ready` does; this one records what the
// layout hands it.
const mockOverlayReady: boolean[] = [];
jest.mock('./animated-splash-overlay', () => ({
  AnimatedSplashOverlay: ({ ready }: { ready: boolean }) => {
    mockOverlayReady.push(ready);
    return null;
  },
}));

// The stack is only drawn once the session is back; a real one needs a router.
jest.mock('expo-router/stack', () => {
  function Stack() {
    return null;
  }
  Stack.Protected = function Protected() {
    return null;
  };
  Stack.Screen = function Screen() {
    return null;
  };
  return { Stack };
});

function hydrate() {
  mockHydrated = true;
  mockHydrationListeners.forEach((listener) => listener());
}

describe('RootLayout', () => {
  beforeEach(() => {
    mockHydrated = false;
    mockOverlayReady.length = 0;
  });

  // On a cold start with an expired access token the session read waits on a
  // token refresh over the network, and nothing is drawn under the overlay
  // until it lands. An overlay that left on its own timer uncovered an empty
  // window for that whole wait.
  it('holds the splash overlay until the session has been read back', async () => {
    await render(<RootLayout />);

    expect(mockOverlayReady.length).toBeGreaterThan(0);
    expect(mockOverlayReady.every((ready) => ready === false)).toBe(true);

    await act(async () => hydrate());

    expect(mockOverlayReady[mockOverlayReady.length - 1]).toBe(true);
  });
});
