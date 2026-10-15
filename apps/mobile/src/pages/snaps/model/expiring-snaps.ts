import { SnapExpiryCountdownDays, type SnapSyncEntry } from '@/entities/snap';

const DayMs = 24 * 60 * 60 * 1000;

/**
 * The snaps whose server copy runs out within the notice's window, in library
 * order — what an expiry notice opens the library on, already picked for the
 * album. Read from the deadlines this device knows; a snap whose deadline has
 * not reached it yet is not among them.
 */
export function expiringSnapIds(
  snapIds: readonly string[],
  entries: Record<string, SnapSyncEntry | undefined>,
  now: number,
): string[] {
  return snapIds.filter((snapId) => {
    const entry = entries[snapId];
    if (entry?.status !== 'uploaded' || entry.expiresAt === undefined) return false;
    const left = entry.expiresAt - now;
    return left > 0 && left <= SnapExpiryCountdownDays * DayMs;
  });
}
