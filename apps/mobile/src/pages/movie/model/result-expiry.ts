import {
  MovieResultCountdownDays,
  movieResultDaysLeft,
  movieResultExpiresAt,
} from '@/entities/movie';
import { formatFullDate } from '@/shared/lib/datetime';

export type ResultExpiry = { text: string; urgent: boolean };

/**
 * The watch screen's line on when the finished movie goes away (MOV-16): the
 * date while it is far off, the days left once the D-3 notice is due — said here
 * too, because a user who turned movie notifications off hears it nowhere else.
 * Nothing once the deadline has passed: the file is gone or about to be, and
 * the screen has nothing left to play. The deadline itself is the entity's
 * (`movieResultExpiresAt`), shared with the studio's cards.
 */
export function resultExpiry(renderedAt: number, now: number): ResultExpiry | undefined {
  const daysLeft = movieResultDaysLeft(renderedAt, now);
  if (daysLeft < 1) return undefined;
  if (daysLeft <= MovieResultCountdownDays) {
    return { text: `${daysLeft}일 뒤 사라져요 · 저장하거나 게시해 두세요`, urgent: true };
  }
  return {
    text: `${formatFullDate(movieResultExpiresAt(renderedAt))}까지 볼 수 있어요`,
    urgent: false,
  };
}
