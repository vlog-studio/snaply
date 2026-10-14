import { act, render, screen } from '@testing-library/react-native';

import { applyServerSnapState, getSnapSyncEntries, type Snap } from '@/entities/snap';

import { SnapCell } from './snap-cell';

// The frame pulls a thumbnail off the file system through a native module.
jest.mock('@/shared/ui/video-frame', () => ({ VideoFrame: () => null }));
// The sync store persists through the file system too.
jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const DayMs = 24 * 60 * 60 * 1000;

const expiredLabel = '\uB9CC\uB8CC\uB428'; // 만료됨
const twoDaysLeft = '2\uC77C \uB0A8\uC74C'; // 2일 남음
const oneDayLeft = '1\uC77C \uB0A8\uC74C'; // 1일 남음

/** Noon `daysFromToday` days from now, in the device's time zone. */
function localNoon(daysFromToday: number): number {
  const day = new Date();
  day.setDate(day.getDate() + daysFromToday);
  day.setHours(12, 0, 0, 0);
  return day.getTime();
}
const daysLeftPattern = /\uC77C \uB0A8\uC74C/; // 일 남음

const snap: Snap = {
  id: 'snap-1',
  uri: 'file:///doc/recordings/snap-1.mp4',
  durationSec: 3,
  capturedAt: 1_770_000_000_000,
  width: 720,
  height: 1280,
  orientation: 'portrait',
};

async function renderCellWith(
  entry: Parameters<typeof applyServerSnapState>[0]['entries'][string],
) {
  await act(async () => applyServerSnapState({ entries: { [snap.id]: entry }, dropped: [] }));
  return render(
    <SnapCell
      snap={snap}
      width={120}
      selecting={false}
      isHeld={false}
      onPress={jest.fn()}
      onLongPress={jest.fn()}
    />,
  );
}

describe('SnapCell', () => {
  afterEach(async () => {
    await act(async () =>
      applyServerSnapState({ entries: {}, dropped: Object.keys(getSnapSyncEntries()) }),
    );
  });

  it('says the server copy expired, which is why no movie can be made from it', async () => {
    await renderCellWith({ status: 'expired', videoId: 'v1' });

    expect(screen.getByText(expiredLabel)).toBeTruthy();
  });

  // Days are counted on the calendar, so the deadline is a local day and hour —
  // "1.5 days from now" lands on a different day depending on when the test runs.
  it('counts down the last days of the server copy', async () => {
    await renderCellWith({ status: 'uploaded', videoId: 'v1', expiresAt: localNoon(2) });

    expect(screen.getByText(twoDaysLeft)).toBeTruthy();
  });

  it('counts a copy that goes tomorrow as one day left, whatever the hour', async () => {
    await renderCellWith({ status: 'uploaded', videoId: 'v1', expiresAt: localNoon(1) });

    expect(screen.getByText(oneDayLeft)).toBeTruthy();
  });

  it('says nothing about the copy before its last three days', async () => {
    await renderCellWith({ status: 'uploaded', videoId: 'v1', expiresAt: Date.now() + 10 * DayMs });

    expect(screen.queryByText(daysLeftPattern)).toBeNull();
  });
});
