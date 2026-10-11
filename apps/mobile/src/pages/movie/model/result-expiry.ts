import { formatFullDate } from '@/shared/lib/datetime';

/**
 * How long the server keeps a movie's result file when the user never finishes it
 * (MOV-16) — the backend's `MOVIE_RESULT_RETENTION_DAYS`. The app has no field for
 * the deadline, so it counts from the render, and says it only to the day.
 */
export const MovieResultRetentionDays = 30;

/** Inside this many days the line turns into a countdown — the same window as the D-3 push (NTF-10). */
const CountdownDays = 3;

const DayMs = 24 * 60 * 60 * 1000;

export type ResultExpiry = { text: string; urgent: boolean };

/**
 * The watch screen's line on when the finished movie goes away (MOV-16): the
 * date while it is far off, the days left once the D-3 notice is due — said here
 * too, because a user who turned movie notifications off hears it nowhere else.
 * Nothing once the deadline has passed: the file is gone or about to be, and
 * the screen has nothing left to play.
 *
 * Counted from the app's own `renderedAt`. The server counts from when it filed
 * the result, a run's length earlier, so near midnight the date can read a day
 * late — never early enough to send someone away too soon by more than that.
 */
export function resultExpiry(renderedAt: number, now: number): ResultExpiry | undefined {
  const until = renderedAt + MovieResultRetentionDays * DayMs;
  const daysLeft = Math.ceil((until - now) / DayMs);
  if (daysLeft < 1) return undefined;
  if (daysLeft <= CountdownDays) {
    return { text: `${daysLeft}일 뒤 사라져요 · 저장하거나 게시해 두세요`, urgent: true };
  }
  return { text: `${formatFullDate(until)}까지 볼 수 있어요`, urgent: false };
}
