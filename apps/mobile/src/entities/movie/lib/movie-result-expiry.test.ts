import { MovieResultRetentionDays, movieResultExpiresAt } from './movie-result-expiry';

const DayMs = 24 * 60 * 60 * 1000;
const renderedAt = new Date(2026, 9, 11, 9, 0).getTime();

describe('movie result expiry', () => {
  it('runs out the retention days after the render', () => {
    expect(movieResultExpiresAt(renderedAt) - renderedAt).toBe(MovieResultRetentionDays * DayMs);
  });
});
