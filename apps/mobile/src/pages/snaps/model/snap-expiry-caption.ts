import { SnapExpiryCountdownDays } from '@/entities/snap';
import { calendarDaysUntil, formatFullDate, relativeDayPhrase } from '@/shared/lib/datetime';

/**
 * The snap player's line on when the server's copy runs out (SNAP-13): the date
 * while it is far off, the days left inside the countdown window. The grid
 * counts down only the last three days, so the player is where a snap's
 * deadline can be read at any time — said here too because a user with
 * notifications off hears it nowhere else. Nothing when the snap has no server
 * copy or the deadline has passed (the player then says the snap expired).
 */
export function snapExpiryCaption(expiresAt: number | undefined, now: number): string | undefined {
  if (expiresAt === undefined || expiresAt <= now) return undefined;
  if (calendarDaysUntil(expiresAt, now) <= SnapExpiryCountdownDays) {
    return `${relativeDayPhrase(expiresAt, now)} 보관 기간이 끝나요`;
  }
  return `${formatFullDate(expiresAt)}까지 보관돼요`;
}
