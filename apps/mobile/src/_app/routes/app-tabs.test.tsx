import { render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import { AppTabs } from './app-tabs';

type ScreenOptions = {
  animation?: string;
  transitionSpec?: { animation: string; config: { duration?: number } };
};

// The navigator itself is React Navigation's; what this module owns is the
// options it hands it, so the stand-in records them on every render.
const mockRenders: ScreenOptions[] = [];

jest.mock('expo-router', () => {
  function Tabs({ screenOptions }: { screenOptions: ScreenOptions; children: ReactNode }) {
    mockRenders.push(screenOptions);
    return null;
  }
  Tabs.Screen = function Screen() {
    return null;
  };
  return { Tabs, useRouter: () => ({ push: jest.fn() }) };
});

const latestOptions = () => mockRenders[mockRenders.length - 1];

beforeEach(() => {
  mockRenders.length = 0;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({
    remove: jest.fn(),
  })) as never);
});

describe('AppTabs', () => {
  // The OS setting resolves after the first render, when every scene is already
  // mounted (lazy: false). Switching the option to `animation: 'none'` then
  // dropped the native-driven scene style and left the scenes hidden at launch
  // at opacity 0: every tab but the first opened blank.
  it('keeps the shift transition under reduced motion and runs it in zero time', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    await render(<AppTabs />);

    await waitFor(() => expect(latestOptions()?.transitionSpec).toBeDefined());
    expect(mockRenders.every((options) => options.animation === 'shift')).toBe(true);
    expect(latestOptions()?.transitionSpec).toEqual({
      animation: 'timing',
      config: { duration: 0 },
    });
  });

  it('runs the shift at its own pace when motion is not reduced', async () => {
    const resolved = Promise.resolve(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(resolved);

    await render(<AppTabs />);
    await resolved;

    expect(latestOptions()?.animation).toBe('shift');
    expect(latestOptions()?.transitionSpec).toBeUndefined();
  });
});
