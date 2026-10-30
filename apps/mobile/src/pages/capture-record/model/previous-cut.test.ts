import type { Snap } from '@/entities/snap';

import { lastFrameTimeMs, pickPreviousCut, type PreviousCutContext } from './previous-cut';

function makeSnap(id: string, capturedAt: number, durationSec = 3): Snap {
  return {
    id,
    uri: `file:///snaps/${id}.mp4`,
    durationSec,
    capturedAt,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
}

const everywhere = () => true;

describe('pickPreviousCut', () => {
  it('picks the most recently captured snap, whatever the list order', () => {
    const snaps = [makeSnap('a', 100), makeSnap('c', 300), makeSnap('b', 200)];

    expect(pickPreviousCut({ snaps, isOnDevice: everywhere })).toEqual({
      snap: snaps[1],
      rule: 'latest',
    });
  });

  it('skips a snap whose file is not on this device', () => {
    const snaps = [makeSnap('old', 100), makeSnap('elsewhere', 300)];

    const cut = pickPreviousCut({ snaps, isOnDevice: (snap) => snap.id !== 'elsewhere' });

    expect(cut?.snap.id).toBe('old');
  });

  it('has no previous cut when nothing is on this device', () => {
    expect(pickPreviousCut({ snaps: [], isOnDevice: everywhere })).toBeUndefined();
    expect(
      pickPreviousCut({ snaps: [makeSnap('a', 100)], isOnDevice: () => false }),
    ).toBeUndefined();
  });

  it('asks the rules in order and lets the first answer that is not a pass win', () => {
    const snaps = [makeSnap('a', 100), makeSnap('b', 200)];
    const context: PreviousCutContext = { snaps, isOnDevice: everywhere };
    const pass = { name: 'latest' as const, decide: () => ({ kind: 'pass' as const }) };
    const none = { name: 'latest' as const, decide: () => ({ kind: 'none' as const }) };
    const pickFirst = {
      name: 'latest' as const,
      decide: () => ({ kind: 'pick' as const, snap: snaps[0] }),
    };

    expect(pickPreviousCut(context, [pass, pickFirst])?.snap.id).toBe('a');
    expect(pickPreviousCut(context, [none, pickFirst])).toBeUndefined();
    expect(pickPreviousCut(context, [pass])).toBeUndefined();
  });
});

describe('lastFrameTimeMs', () => {
  it('samples just before the end of the measured length', () => {
    expect(lastFrameTimeMs(makeSnap('a', 0, 1.2))).toBe(1080);
  });

  it('never goes before the start', () => {
    expect(lastFrameTimeMs(makeSnap('a', 0, 0.05))).toBe(0);
  });
});
