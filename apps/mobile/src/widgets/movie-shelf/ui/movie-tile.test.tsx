import { render, screen } from '@testing-library/react-native';

import type { MovieSummary } from '../model/use-movie-shelf';
import { MovieTile } from './movie-tile';

// A failed tile draws the failure memo, which runs a retry through the feature;
// this tile has not failed.
jest.mock('@/features/compose-movie', () => ({
  generationRefusalHeadline: jest.fn(),
  useComposeMovie: () => ({ startGeneration: jest.fn() }),
}));

function summary(overrides: Partial<MovieSummary> = {}): MovieSummary {
  return {
    id: 'm1',
    title: '가을 산책',
    status: 'ready',
    style: 'daily',
    snapCount: 8,
    totalSec: 14,
    dateLabel: '2026년 9월 19일',
    coverUris: [],
    ...overrides,
  };
}

describe('MovieTile', () => {
  // MOV-16 ②: an expiring movie is weeks old, so its date carries the year,
  // and at the end of the one-line run the countdown was the part a ~165dp
  // cell's ellipsis took — for a user with notifications off, the warning.
  it.each(['3일 남음', '오늘까지'])(
    'keeps the %s countdown whole beside the date line that gives way',
    async (countdown) => {
      await render(
        <MovieTile
          movie={summary({ expiryCountdown: countdown })}
          width={165}
          onPress={jest.fn()}
        />,
      );

      expect(screen.getByText('2026년 9월 19일 · 컷 8')).toHaveProp('numberOfLines', 1);
      const warning = screen.getByText(`· ${countdown}`);
      expect(warning).not.toHaveProp('numberOfLines');
      expect(screen.getByText('2026년 9월 19일 · 컷 8')).not.toContainElement(warning);
    },
  );
});
