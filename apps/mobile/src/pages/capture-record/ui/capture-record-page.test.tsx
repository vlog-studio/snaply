import { render, screen } from '@testing-library/react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { useCaptureRecorder } from '../model/use-capture-recorder';
import { CaptureRecordPage } from './capture-record-page';

// The camera, the players and the navigation bar are native; the page only
// mounts them.
jest.mock('expo-camera', () => ({ CameraView: () => null }));
jest.mock('expo-navigation-bar', () => ({ NavigationBar: jest.fn(() => null) }));
jest.mock('@/shared/ui/video-preview', () => ({ VideoPreview: () => null }));
jest.mock('./capture-flight', () => ({ CaptureFlight: () => null }));
// The recorder composes the camera, permissions, one capture run and the
// library, each with its own tests; here it is the page's input, one stage at a
// time.
jest.mock('../model/use-capture-recorder', () => ({ useCaptureRecorder: jest.fn() }));

const navigationBarMock = jest.mocked(NavigationBar);
const useCaptureRecorderMock = jest.mocked(useCaptureRecorder);

const ScreenMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

type Recorder = ReturnType<typeof useCaptureRecorder>;

function recorder({
  stage = 'idle',
  cameraGranted = true,
  libraryError,
}: {
  stage?: 'idle' | 'recording';
  cameraGranted?: boolean;
  libraryError?: string;
} = {}): Recorder {
  return {
    stage,
    showCamera: true,
    errorMessage: undefined,
    dismissErrors: jest.fn(),
    closePage: jest.fn(),
    retake: jest.fn(),
    openLibrary: jest.fn(),
    selectRecording: jest.fn(),
    deleteRecording: jest.fn(),
    deleteRecordingFromDevice: jest.fn(),
    permissions: {
      isCameraGranted: cameraGranted,
      isPermissionReady: true,
      canAskAgain: true,
      message: '스냅을 찍으려면 카메라 권한이 필요해요.',
      requestPermissions: jest.fn(),
      openAppSettings: jest.fn(),
    },
    camera: {
      attachCamera: jest.fn(),
      facing: 'back',
      soundEnabled: false,
      isReady: true,
      isRecordingSupported: true,
      toggleFacing: jest.fn(),
      toggleSound: jest.fn(),
      handleCameraReady: jest.fn(),
      handleMountError: jest.fn(),
    },
    session: {
      lastCollected: undefined,
      isBusy: stage !== 'idle',
      remaining: 3,
      duration: 3,
      selectDuration: jest.fn(),
      beginHold: jest.fn(),
      endHold: jest.fn(),
    },
    library: {
      recordings: [],
      deletingId: undefined,
      isLoading: false,
      isVisible: false,
      selected: undefined,
      errorMessage: libraryError,
      close: jest.fn(),
      canRemoveFromDevice: () => false,
    },
  } as unknown as Recorder;
}

async function renderPage(state: Parameters<typeof recorder>[0]) {
  useCaptureRecorderMock.mockReturnValue(recorder(state));
  await render(
    <SafeAreaProvider initialMetrics={ScreenMetrics}>
      <CaptureRecordPage />
    </SafeAreaProvider>,
  );
}

// ---- Contrast over the live feed (WCAG 2.x) ----

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(color: string): Rgba {
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(',').map(Number);
    return { r, g, b, a };
  }
  const hex = color.replace('#', '');
  const channel = (index: number) => parseInt(hex.slice(index, index + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: hex.length === 8 ? channel(6) / 255 : 1,
  };
}

/** Lays `top` over an opaque `ground`. */
function over(ground: Rgba, top: Rgba): Rgba {
  const mix = (front: number, back: number) => front * top.a + back * (1 - top.a);
  return { r: mix(top.r, ground.r), g: mix(top.g, ground.g), b: mix(top.b, ground.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The viewfinder's own shade over the whole feed. */
const FeedShade = parseColor('rgba(0,0,0,0.12)');

/**
 * How a text on a strip of tape reads over a scene: the strip is the nearest
 * ancestor with a ground of its own, laid over the scene and the feed's shade.
 */
function contrastOverScene(text: string, scene: string): number {
  const node = screen.getByText(text);
  const ink = parseColor(String(StyleSheet.flatten(node.props.style).color));
  let strip = node.parent;
  while (strip && !StyleSheet.flatten(strip.props.style)?.backgroundColor) strip = strip.parent;
  const fill = parseColor(String(StyleSheet.flatten(strip?.props.style).backgroundColor));
  const ground = over(over(parseColor(scene), FeedShade), fill);
  return contrast(over(ground, ink), ground);
}

const Scenes = [
  ['the dark viewfinder ground before the camera is ready', '#0E0B08'],
  ['a white wall', '#FFFFFF'],
] as const;

function isLiveRegion(text: string): boolean {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText(text);
  while (node) {
    const region = node.props.accessibilityLiveRegion;
    if (region === 'polite' || region === 'assertive') return true;
    node = node.parent;
  }
  return false;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CaptureRecordPage', () => {
  // The app-wide bar follows the scheme, so under the light theme the
  // 3-button glyphs were dark over the near-black ground under the shutter.
  it('pushes light navigation-bar glyphs whatever the app theme', async () => {
    await renderPage({});

    expect(navigationBarMock).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'light' }),
      undefined,
    );
  });

  // The REC strip was a 14% cream wash under cream ink: over a bright scene the
  // countdown all but vanished (about 1.1:1) while the shutter was held.
  it.each(Scenes)('keeps the REC countdown readable over %s', async (_scene, scene) => {
    await renderPage({ stage: 'recording' });

    expect(contrastOverScene('3초', scene)).toBeGreaterThanOrEqual(4.5);
  });

  // The unpicked length printed sticker ink on that same wash: about 1:1 over
  // the black viewfinder and any dark scene.
  it.each(Scenes)('keeps the unpicked duration readable over %s', async (_scene, scene) => {
    await renderPage({ stage: 'idle' });

    expect(screen.getByRole('radio', { name: '5초' })).not.toBeChecked();
    expect(contrastOverScene('5초', scene)).toBeGreaterThanOrEqual(4.5);
  });

  // It reruns every second while the shutter is held: announcing each tick
  // would put the screen reader's voice into the take.
  it('does not announce the REC countdown as it ticks', async () => {
    await renderPage({ stage: 'recording' });

    expect(isLiveRegion('3초')).toBe(false);
  });

  // Without camera permission the library's failure was a bare cherry line —
  // not the error card, and not announced.
  it('tells a screen reader when the library fails without camera permission', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const message = '찍은 스냅을 불러오지 못했어요.';

    await renderPage({ cameraGranted: false, libraryError: message });

    const announced = announce.mock.calls.some(([spoken]) => spoken === message);
    expect(announced || isLiveRegion(message)).toBe(true);
  });
});
