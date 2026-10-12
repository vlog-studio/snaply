import type { SnapSyncEntry } from '@/entities/snap';

import { expiringSnapIds } from './expiring-snaps';

const DayMs = 24 * 60 * 60 * 1000;
const now = 1_000_000_000_000;

describe('expiringSnapIds', () => {
  it('picks the snaps whose server copy runs out within three days, in library order', () => {
    const entries: Record<string, SnapSyncEntry> = {
      soon: { status: 'uploaded', videoId: 'v1', expiresAt: now + 2 * DayMs },
      edge: { status: 'uploaded', videoId: 'v2', expiresAt: now + 3 * DayMs },
      later: { status: 'uploaded', videoId: 'v3', expiresAt: now + 5 * DayMs },
      gone: { status: 'expired', videoId: 'v4' },
      past: { status: 'uploaded', videoId: 'v5', expiresAt: now - 1 },
      unknown: { status: 'uploaded', videoId: 'v6' },
    };

    expect(
      expiringSnapIds(['later', 'edge', 'gone', 'soon', 'past', 'unknown', 'local'], entries, now),
    ).toEqual(['edge', 'soon']);
  });
});
