import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, ThemeScope } from '@/shared/ui/theme';

import type { MovieSummary } from '../model/use-movie-shelf';
import { MovieRow } from './movie-row';

// A failed line draws the failure memo, which runs a retry through the feature;
// none of these lines has failed.
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
    snapCount: 6,
    totalSec: 14,
    dateLabel: '2026년 9월 18일',
    coverUris: [],
    ...overrides,
  };
}

const dataLine = '컷 6 · 14초 · 2026년 9월 18일';

async function renderAtNight(movie: MovieSummary) {
  await render(
    <ThemeScope scheme="dark">
      <MovieRow movie={movie} onPress={jest.fn()} />
    </ThemeScope>,
  );
  return screen.getByRole('button', { name: /^가을 산책/ });
}

/** The colours the progress notches beside the percentage are drawn in: outlines and fills. */
function segmentInks() {
  const strip = screen.getByText('60%').parent;
  if (!strip) throw new Error('The percentage sits outside the progress strip.');
  const inks = strip.children.flatMap((node) => {
    if (typeof node === 'string' || node.type !== 'View') return [];
    const style = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);
    return [style?.borderColor, style?.backgroundColor].filter(Boolean);
  });
  return new Set(inks);
}

describe('MovieRow', () => {
  // A held line turns pink, which keeps its value at night, where the night
  // inks — cream title, receipt-blue data, cherry countdown — read at about
  // 1.2–1.5:1 on it. Text on a sticker colour is sticker ink.
  it('prints its title, data line and countdown in sticker ink while held', async () => {
    const row = await renderAtNight(summary({ expiryCountdown: '3일 남음' }));

    await fireEvent(row, 'pressIn');
    expect(screen.getByText('가을 산책')).toHaveStyle({ color: Colors.dark.stickerInk });
    expect(screen.getByText(dataLine)).toHaveStyle({ color: Colors.dark.stickerInk });
    expect(screen.getByText('3일 남음')).toHaveStyle({ color: Colors.dark.stickerInk });

    await fireEvent(row, 'pressOut');
    expect(screen.getByText('가을 산책')).toHaveStyle({ color: Colors.dark.text });
    expect(screen.getByText(dataLine)).toHaveStyle({ color: Colors.dark.receiptBlue });
    expect(screen.getByText('3일 남음')).toHaveStyle({ color: Colors.dark.cherryInk });
  });

  it('prints a generating line’s progress in sticker ink while held', async () => {
    const row = await renderAtNight(summary({ status: 'generating', progress: 0.6 }));

    await fireEvent(row, 'pressIn');
    expect(screen.getByText('60%')).toHaveStyle({ color: Colors.dark.stickerInk });
    expect(segmentInks()).toEqual(new Set([Colors.dark.stickerInk]));

    await fireEvent(row, 'pressOut');
    expect(screen.getByText('60%')).toHaveStyle({ color: Colors.dark.receiptBlue });
    expect(segmentInks()).toEqual(new Set([Colors.dark.ai]));
  });
});
