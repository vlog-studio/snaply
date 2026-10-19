import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Snap } from '@/entities/snap';

import type { Cut } from '../model/use-movie-cuts';
import { TimelineStrip } from './timeline-strip';

// A clip decodes thumbnails through a native module and runs its trim gestures
// on the UI thread; neither is what these cases are about.
jest.mock('./timeline-cut', () => ({
  TimelineCut: () => null,
  TimelineCutHeight: 56,
  TrimHandleReach: 48,
}));

function cut(snapId: string): Cut {
  const snap: Snap = {
    id: snapId,
    uri: `file:///doc/recordings/${snapId}.mp4`,
    durationSec: 2,
    capturedAt: 1_753_200_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
  return { ref: { snapId, order: 0 }, snap, usedSec: 2, gone: undefined };
}

const cuts = [cut('a'), cut('b'), cut('c')];

async function renderStrip(selectedIndex: number, isPlaying = false) {
  await render(
    <TimelineStrip
      cuts={cuts}
      selectedIndex={selectedIndex}
      // Pointing at nothing, so the strip does not aim its scroll — a native
      // command Jest has no view for.
      playhead={{ index: -1, secIntoCut: 0 }}
      isPlaying={isPlaying}
      canEdit
      onSelect={jest.fn()}
      onScrub={jest.fn()}
      onTrim={jest.fn()}
      onDeselect={jest.fn()}
      onAddSnaps={jest.fn()}
      onPickTransition={jest.fn()}
    />,
  );
  return StyleSheet.flatten(screen.getByRole('button', { name: '스냅 더 넣기' }).props.style);
}

describe('TimelineStrip', () => {
  // The last clip's end handle takes touches 48dp past its edge (MOVIE-2); the
  // add tile 8dp away would have lost most of its taps to it.
  it('keeps the add tile clear of the last clip’s end handle while it is out', async () => {
    expect((await renderStrip(2)).marginLeft).toBe(48);
  });

  it('keeps the add tile beside the strip otherwise', async () => {
    expect((await renderStrip(1)).marginLeft).toBe(8);
    // Playing folds the handles away.
    expect((await renderStrip(2, true)).marginLeft).toBe(8);
  });
});
