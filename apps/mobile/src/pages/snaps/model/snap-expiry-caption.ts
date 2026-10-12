import { formatFullDate } from '@/shared/lib/datetime';

/** The last days the library counts down — the same window as the cell's `3일 남음` and the D-3 push (SNAP-13). */
const CountdownDays = 3;

const DayMs = 24 * 60 * 60 * 1000;

/**
 * The snap player's line on when the server's copy runs out (SNAP-13): the date
 * while it is far off, the days left inside the countdown window. The grid
 * counts down only the last three days, so the player is where a snap's
 * deadline can be read at any time — said here too because a user with
 * notifications off hears it nowhere else. Nothing when the snap has no server
 * copy or the deadline has passed (the player then says the snap expired).
 */
export function snapExpiryCaption(expiresAt: number | undefined, now: number): string | undefined {
  if (expiresAt === undefined) return undefined;
  const daysLeft = Math.ceil((expiresAt - now) / DayMs);
  if (daysLeft < 1) return undefined;
  if (daysLeft <= CountdownDays) return `${daysLeft}일 뒤 보관 기간이 끝나요`;
  return `${formatFullDate(expiresAt)}까지 보관돼요`;
}
