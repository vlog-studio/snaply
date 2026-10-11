import type { SnapRef } from '@/entities/movie';

import { cutGone, emptyStageReason } from './cut-gone';

const ref = (fields: Partial<SnapRef> = {}): SnapRef => ({ snapId: 's1', order: 0, ...fields });

describe('cutGone', () => {
  it.each([
    // A snap deleted on another device is the user's act, not our retention —
    // it must not read as expired while that device's movie edit is on its way.
    [
      'deleted on the server, original here',
      ref({ unavailable: true, unavailableReason: 'user' }),
      true,
      'deleted',
    ],
    [
      'deleted on the server, original gone',
      ref({ unavailable: true, unavailableReason: 'user' }),
      false,
      'deleted',
    ],
    [
      'expired, original here',
      ref({ unavailable: true, unavailableReason: 'expired' }),
      true,
      'expired',
    ],
    [
      'expired, original gone',
      ref({ unavailable: true, unavailableReason: 'expired' }),
      false,
      'expired',
    ],
    ['unavailable without a reason', ref({ unavailable: true }), false, 'expired'],
    ['original deleted here only', ref(), false, 'deleted'],
    ['playable', ref(), true, undefined],
  ] as const)('%s', (_label, cut, hasSnap, expected) => {
    expect(cutGone(cut, hasSnap)).toBe(expected);
  });
});

describe('emptyStageReason', () => {
  it('reads expired only when every remaining cut expired', () => {
    expect(emptyStageReason([{ gone: 'expired' }, { gone: 'expired' }])).toBe('expired');
    expect(emptyStageReason([{ gone: 'expired' }, { gone: 'deleted' }])).toBe('deleted');
  });

  // A movie whose only snap was deleted has no cuts left; the empty stage said
  // its snaps had expired (found on the emulator, 2026-10-11).
  it('reads a movie with no cuts as deleted', () => {
    expect(emptyStageReason([])).toBe('deleted');
  });
});
