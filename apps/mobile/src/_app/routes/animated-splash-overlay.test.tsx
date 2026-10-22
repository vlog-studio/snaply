import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';

import { Colors } from '@/shared/ui/theme';

import appConfig from '../../../app.json';
import { AnimatedSplashOverlay } from './animated-splash-overlay';

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

// Layout animations never run under Jest, so the fade is stood in for by a view
// that reports its `entering` keyframe finished as soon as it mounts — what the
// overlay does next (leave) is the contract under test, not the animation.
jest.mock('react-native-reanimated', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  class Keyframe {
    callback?: (finished: boolean) => void;
    duration() {
      return this;
    }
    withCallback(callback: (finished: boolean) => void) {
      this.callback = callback;
      return this;
    }
  }

  function AnimatedView({
    entering,
    ...props
  }: { entering?: Keyframe } & import('react-native').ViewProps) {
    useEffect(() => entering?.callback?.(true), [entering]);
    return <View {...props} />;
  }

  return {
    __esModule: true,
    default: { View: AnimatedView },
    Easing: { elastic: () => (t: number) => t },
    Keyframe,
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

/** The overlay's first layout, which is when it takes over from the native splash. */
async function layOut() {
  const overlay = screen.root;
  if (!overlay) throw new Error('The overlay rendered nothing to lay out.');
  await act(async () => {
    fireEvent(overlay, 'layout', { nativeEvent: { layout: {} } });
  });
}

describe('AnimatedSplashOverlay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hides the native splash on its first layout even before the app is ready', async () => {
    await render(<AnimatedSplashOverlay ready={false} />);

    await layOut();

    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('stays over the app until it is ready, then fades out', async () => {
    const view = await render(<AnimatedSplashOverlay ready={false} />);
    await layOut();

    // The session is still being read back: what is under the overlay is an
    // empty window, so the overlay must not leave.
    expect(screen.toJSON()).not.toBeNull();

    await view.rerender(<AnimatedSplashOverlay ready />);

    expect(screen.toJSON()).toBeNull();
  });

  it('fades out once the native splash is gone when the app was ready first', async () => {
    await render(<AnimatedSplashOverlay ready />);

    // Until it has taken over from the native splash, the overlay is the frame
    // the user sees whatever the app's state.
    expect(screen.toJSON()).not.toBeNull();

    await layOut();

    expect(screen.toJSON()).toBeNull();
  });
});

describe('the native splash the overlay takes over from', () => {
  // The overlay paints the theme's paper over the native splash on its first
  // layout, so the two must be the same frame or every cold start jumps colour.
  // The redesign once changed the palette and not app.json: at night the
  // native #16110D swapped to the overlay's #3D3028.
  type SplashConfig = {
    backgroundColor: string;
    image: string;
    imageWidth: number;
    dark: { backgroundColor: string; image: string };
  };
  const entry = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  ) as [string, SplashConfig] | undefined;
  const splash = entry?.[1];

  it.each([
    ['day', () => splash?.backgroundColor, Colors.light.background],
    ['night', () => splash?.dark.backgroundColor, Colors.dark.background],
  ])('is the theme paper by %s', (_, native, paper) => {
    expect(native()?.toLowerCase()).toBe(paper.toLowerCase());
  });

  it('shows the cherry mark the overlay draws, in each scheme', () => {
    expect(splash?.image).toBe('./assets/images/brand-glyph-cherry.png');
    expect(splash?.dark.image).toBe('./assets/images/brand-glyph-cherry-dark.png');
    expect(splash?.imageWidth).toBe(150);
  });
});
