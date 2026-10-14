import { calendarDaysUntil, daysLeftBadge, relativeDayPhrase } from './days-until';

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).getTime();
const now = at(14, 21);

// "N일 뒤" used to round hours up — half an hour before a deadline read "1일 뒤",
// and someone told it would go tomorrow could wait and lose it (2026-10-13 review).
describe('calendarDaysUntil', () => {
  it('counts the days on the calendar, not 24-hour spans', () => {
    expect(calendarDaysUntil(at(14, 23), now)).toBe(0);
    expect(calendarDaysUntil(at(15, 2), now)).toBe(1); // five hours away, but tomorrow
    expect(calendarDaysUntil(at(17, 9), now)).toBe(3);
    expect(calendarDaysUntil(at(13, 9), now)).toBe(-1);
  });
});

describe('relativeDayPhrase', () => {
  it('says 오늘, 내일, then N일 뒤', () => {
    expect(relativeDayPhrase(at(14, 23), now)).toBe('오늘');
    expect(relativeDayPhrase(at(15, 2), now)).toBe('내일');
    expect(relativeDayPhrase(at(16, 9), now)).toBe('2일 뒤');
  });
});

describe('daysLeftBadge', () => {
  it('reads 오늘까지 on the last day and N일 남음 inside the window', () => {
    expect(daysLeftBadge(at(14, 23), now, 3)).toBe('오늘까지');
    expect(daysLeftBadge(at(15, 2), now, 3)).toBe('1일 남음');
    expect(daysLeftBadge(at(17, 9), now, 3)).toBe('3일 남음');
  });

  it('says nothing before the window or once the deadline has passed', () => {
    expect(daysLeftBadge(at(18, 9), now, 3)).toBeUndefined();
    expect(daysLeftBadge(at(14, 20), now, 3)).toBeUndefined();
  });
});
