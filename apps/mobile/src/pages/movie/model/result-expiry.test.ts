import { MovieResultRetentionDays } from '@/entities/movie';

import { resultExpiry } from './result-expiry';

const DayMs = 24 * 60 * 60 * 1000;
const renderedAt = new Date(2026, 9, 11, 9, 0).getTime();

describe('resultExpiry', () => {
  it('names the last day while the deadline is far off', () => {
    expect(resultExpiry(renderedAt, renderedAt + DayMs)).toEqual({
      text: '2026년 11월 10일까지 볼 수 있어요',
      urgent: false,
    });
  });

  // The same window as the D-3 push, so the screen says what the notice said —
  // counted by calendar days, so the last day reads 오늘 and not "1일 뒤"
  // (2026-10-13 review).
  it('counts down the last three days by the calendar', () => {
    const threeLeft = renderedAt + (MovieResultRetentionDays - 3) * DayMs;
    expect(resultExpiry(renderedAt, threeLeft)).toEqual({
      text: '3일 뒤 사라져요 · 저장하거나 게시해 두세요',
      urgent: true,
    });
    expect(resultExpiry(renderedAt, threeLeft + 2 * DayMs + 1)?.text).toMatch(/^내일 사라져요/);
    const lastMorning = renderedAt + MovieResultRetentionDays * DayMs - 60 * 60 * 1000;
    expect(resultExpiry(renderedAt, lastMorning)?.text).toMatch(/^오늘 사라져요/);
  });

  it('says nothing once the deadline has passed', () => {
    expect(resultExpiry(renderedAt, renderedAt + MovieResultRetentionDays * DayMs)).toBeUndefined();
  });
});
