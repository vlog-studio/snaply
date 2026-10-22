import { render } from '@testing-library/react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { SnapExtractPage } from './snap-extract-page';

// The player, the router and the navigation bar are native or app-level; the
// page only mounts them.
jest.mock('expo-navigation-bar', () => ({ NavigationBar: jest.fn(() => null) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), setParams: jest.fn() }) }));
jest.mock('expo-video', () => ({ VideoView: () => null }));
// The source is still being measured, so the screen draws its frame and no
// strip; the playback and the cut each have their own tests.
jest.mock('../model/use-source-duration', () => ({
  useSourceDuration: () => ({ durationSec: undefined, isReading: true, isUnreadable: false }),
}));
jest.mock('../model/use-window-playback', () => ({
  WindowProgressIntervalSec: 0.25,
  useWindowPlayback: () => ({
    player: {},
    isPlaying: false,
    muted: true,
    positionSec: 0,
    seekTo: jest.fn(),
    togglePlayback: jest.fn(),
    toggleMuted: jest.fn(),
  }),
}));
jest.mock('@/features/extract-snap', () => ({
  ExtractStepSec: 0.1,
  MaxExtractSec: 5,
  MinExtractSec: 0.5,
  useExtractSnap: () => ({
    extractSnap: jest.fn(),
    isExtracting: false,
    error: undefined,
    clearError: jest.fn(),
  }),
}));

const navigationBarMock = jest.mocked(NavigationBar);

const ScreenMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

describe('SnapExtractPage', () => {
  // The app-wide bar follows the scheme, so under the light theme the 3-button
  // glyphs were dark over the near-black ground under the cut button.
  it('pushes light navigation-bar glyphs whatever the app theme', async () => {
    await render(
      <SafeAreaProvider initialMetrics={ScreenMetrics}>
        <SnapExtractPage sourceUri="file:///cache/picked.mp4" />
      </SafeAreaProvider>,
    );

    expect(navigationBarMock).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'light' }),
      undefined,
    );
  });
});
