import { snapExpiryCaption } from './snap-expiry-caption';

const DayMs = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 12, 9, 0).getTime();

describe('snapExpiryCaption', () => {
  it('names the last day while the deadline is far off', () => {
    expect(snapExpiryCaption(new Date(2026, 9, 26, 10, 0).getTime(), now)).toBe(
      '2026년 10월 26일까지 보관돼요',
    );
  });

  // The same window as the grid's countdown and the D-3 push, counted by calendar
  // days: hours rounded up read "1일 뒤" with half a day left (2026-10-13 review).
  it('counts down the last three days by the calendar', () => {
    expect(snapExpiryCaption(now + 3 * DayMs, now)).toBe('3일 뒤 보관 기간이 끝나요');
    expect(snapExpiryCaption(new Date(2026, 9, 13, 3, 0).getTime(), now)).toBe(
      '내일 보관 기간이 끝나요',
    );
    expect(snapExpiryCaption(now + DayMs / 2, now)).toBe('오늘 보관 기간이 끝나요');
  });

  it('says nothing without a server copy or past the deadline', () => {
    expect(snapExpiryCaption(undefined, now)).toBeUndefined();
    expect(snapExpiryCaption(now - 1, now)).toBeUndefined();
  });
});
