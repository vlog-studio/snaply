const DayMs = 24 * 60 * 60 * 1000;

/**
 * Calendar days from today to the day a deadline falls on, in the device's time
 * zone — `0` when it falls today, `1` tomorrow, negative once its day has passed.
 *
 * Counted by days on the calendar, not by 24-hour spans: rounding the hours up
 * read "1일 뒤" with half an hour left, so someone told it would go tomorrow could
 * wait and lose it (2026-10-13 review).
 */
export function calendarDaysUntil(deadline: number, now: number): number {
  const deadlineDay = new Date(deadline);
  deadlineDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // Rounded: a daylight-saving change makes a day 23 or 25 hours long.
  return Math.round((deadlineDay.getTime() - today.getTime()) / DayMs);
}

/** When a deadline still ahead falls, as people count days: `오늘` · `내일` · `3일 뒤`. */
export function relativeDayPhrase(deadline: number, now: number): string {
  const days = calendarDaysUntil(deadline, now);
  if (days <= 0) return '오늘';
  if (days === 1) return '내일';
  return `${days}일 뒤`;
}

/**
 * A card's countdown in the last `windowDays` before a deadline: `오늘까지` on its
 * day, `N일 남음` before it, nothing earlier or once it has passed.
 */
export function daysLeftBadge(
  deadline: number,
  now: number,
  windowDays: number,
): string | undefined {
  if (deadline <= now) return undefined;
  const days = calendarDaysUntil(deadline, now);
  if (days > windowDays) return undefined;
  return days <= 0 ? '오늘까지' : `${days}일 남음`;
}
