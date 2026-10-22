import 'react-native-gesture-handler/jestSetup';

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { GestureType } from 'react-native-gesture-handler';

import type { Snap } from '@/entities/snap';

import type { Cut } from '../model/use-movie-cuts';
import { TimelineCut, TrimHandleReach } from './timeline-cut';

// The trim gestures as the clip builds them, in render order: start, then end.
const mockGestures: GestureType[] = [];
jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('react-native-gesture-handler');
  return {
    ...actual,
    GestureDetector: ({ gesture, children }: { gesture: GestureType; children: ReactNode }) => {
      mockGestures.push(gesture);
      return children;
    },
  };
});
// Thumbnails are decoded by a native module; the tiles are not what this is about.
jest.mock('@/shared/ui/video-frame', () => ({ VideoFrame: () => null }));

const snap: Snap = {
  id: 's1',
  uri: 'file:///doc/recordings/s1.mp4',
  durationSec: 3,
  capturedAt: 1_753_200_000_000,
  width: 1080,
  height: 1920,
  orientation: 'portrait',
};

const cut: Cut = {
  ref: { snapId: 's1', order: 0, trim: { startSec: 0.5, endSec: 2 } },
  snap,
  usedSec: 1.5,
  gone: undefined,
};

beforeEach(() => {
  mockGestures.length = 0;
});

describe('TimelineCut', () => {
  // The grips were 18dp-wide touch targets — the only way to set a cut's
  // length, and the one control on the screen under decision 4's 48dp
  // (2026-10-19 review, MOVIE-2).
  it('takes touches 48dp past the clip’s edge on each handle, outward only', async () => {
    await render(
      <TimelineCut
        cut={cut}
        index={1}
        selected
        focused
        width={180}
        x={360}
        pxPerSec={120}
        onSelect={jest.fn()}
        onTrim={jest.fn()}
        onTrimmingChange={jest.fn()}
      />,
    );

    expect(TrimHandleReach).toBe(48);
    // iOS reads the view's own slop; Android the gesture's.
    expect(screen.getByLabelText('컷 시작 지점')).toHaveProp('hitSlop', { left: 30 });
    expect(screen.getByLabelText('컷 끝 지점')).toHaveProp('hitSlop', { right: 30 });
    const [start, end] = mockGestures.slice(-2);
    expect(start.config.hitSlop).toEqual({ left: 30 });
    expect(end.config.hitSlop).toEqual({ right: 30 });
  });

  it('grows no handles on a clip that is not focused', async () => {
    await render(
      <TimelineCut
        cut={cut}
        index={1}
        selected={false}
        focused={false}
        width={180}
        x={360}
        pxPerSec={120}
        onSelect={jest.fn()}
        onTrim={jest.fn()}
        onTrimmingChange={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText('컷 시작 지점')).toBeNull();
    expect(mockGestures).toHaveLength(0);
  });
});
