import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VideoPreview } from '@/shared/ui/video-preview';

import { VideoPlayerModal } from './video-player-modal';

// The player checks out one of the platform's few hardware decoders, so whether
// it is mounted at all is part of this component's contract. Standing in for it
// is what makes that assertable, and keeps expo-video out of the test.
jest.mock('@/shared/ui/video-preview', () => ({
  VideoPreview: jest.fn(() => null),
}));

const videoPreviewMock = jest.mocked(VideoPreview);

// The system bars are native; what this component owns is asking for light
// glyphs while it is up, so the bar components stand in as plain functions.
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));
jest.mock('expo-navigation-bar', () => ({ NavigationBar: jest.fn(() => null) }));

const statusBarMock = jest.mocked(StatusBar);
const navigationBarMock = jest.mocked(NavigationBar);

// useSafeAreaInsets needs a provider; seed fixed metrics so insets resolve
// synchronously in tests.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const closeLabel = '\uCEF7 \uC7AC\uC0DD \uB2EB\uAE30'; // 'cut playback close'
const edgeLabel = '2026-07-28';
const caption = '3\uCD08 \u00B7 \uC6D0\uBCF8 \uCEF7'; // '3s . original cut'
const uri = 'file:///doc/recordings/snaply-1.mp4';

function withSafeArea(node: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('VideoPlayerModal', () => {
  it('plays the given video under its edge print and caption', async () => {
    await render(
      withSafeArea(
        <VideoPlayerModal
          uri={uri}
          onClose={jest.fn()}
          closeLabel={closeLabel}
          edgeLabel={edgeLabel}
          caption={caption}
        />,
      ),
    );

    expect(videoPreviewMock).toHaveBeenCalledWith(expect.objectContaining({ uri }), undefined);
    expect(screen.getByText(edgeLabel)).toBeTruthy();
    expect(screen.getByText(caption)).toBeTruthy();
  });

  it('calls onClose when the close control is pressed', async () => {
    const onClose = jest.fn();
    await render(
      withSafeArea(<VideoPlayerModal uri={uri} onClose={onClose} closeLabel={closeLabel} />),
    );

    fireEvent.press(screen.getByRole('button', { name: closeLabel }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mounts no player and no overlay without a video', async () => {
    await render(
      withSafeArea(
        <VideoPlayerModal
          uri={undefined}
          onClose={jest.fn()}
          closeLabel={closeLabel}
          edgeLabel={edgeLabel}
          caption={caption}
        />,
      ),
    );

    expect(videoPreviewMock).not.toHaveBeenCalled();
    expect(screen.queryByText(edgeLabel)).toBeNull();
  });

  // On Android the modal's window copies the app's bar glyphs, which are dark
  // under the light theme — dark on the black letterbox.
  it.each([
    ['playing', { uri }],
    ['waiting for the video', { uri: undefined, placeholder: { text: 'loading', busy: true } }],
  ])('asks for light system bars while %s', async (_label, props) => {
    await render(
      withSafeArea(<VideoPlayerModal onClose={jest.fn()} closeLabel={closeLabel} {...props} />),
    );

    expect(statusBarMock).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'light' }),
      undefined,
    );
    expect(navigationBarMock).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'light' }),
      undefined,
    );
  });

  it('leaves the system bars to the app while closed', async () => {
    await render(
      withSafeArea(
        <VideoPlayerModal uri={undefined} onClose={jest.fn()} closeLabel={closeLabel} />,
      ),
    );

    expect(statusBarMock).not.toHaveBeenCalled();
    expect(navigationBarMock).not.toHaveBeenCalled();
  });

  // The design's player turns a reel while the snap is on its way; the words
  // stay the one thing a screen reader reads.
  it('turns a reel over its words while the video is on its way', async () => {
    await render(
      withSafeArea(
        <VideoPlayerModal
          uri={undefined}
          placeholder={{ text: 'loading', busy: true }}
          onClose={jest.fn()}
          closeLabel={closeLabel}
        />,
      ),
    );

    expect(screen.getByText('loading')).toBeTruthy();
    expect(screen.getByRole('progressbar', { includeHiddenElements: true })).not.toBeVisible();
  });

  it('draws no reel once the video could not be brought', async () => {
    await render(
      withSafeArea(
        <VideoPlayerModal
          uri={undefined}
          placeholder={{ text: 'failed', actionLabel: 'retry', onAction: jest.fn() }}
          onClose={jest.fn()}
          closeLabel={closeLabel}
        />,
      ),
    );

    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.queryByRole('progressbar', { includeHiddenElements: true })).toBeNull();
  });

  it('offers the caller action across from the close control', async () => {
    const onPress = jest.fn();
    await render(
      withSafeArea(
        <VideoPlayerModal
          uri={uri}
          onClose={jest.fn()}
          closeLabel={closeLabel}
          action={{ label: 'save', onPress }}
        />,
      ),
    );

    fireEvent.press(screen.getByRole('button', { name: 'save' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['disabled', { label: 'saving', disabled: true, onPress: jest.fn() }],
    ['without a handler', { label: 'saved' }],
  ])('only reads while %s', async (_label, action) => {
    await render(
      withSafeArea(
        <VideoPlayerModal uri={uri} onClose={jest.fn()} closeLabel={closeLabel} action={action} />,
      ),
    );

    const control = screen.getByRole('button', { name: action.label });
    fireEvent.press(control);

    expect(control).toBeDisabled();
    if ('onPress' in action) expect(action.onPress).not.toHaveBeenCalled();
  });
});
