import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Movie } from '@/entities/movie';

import { StylePickerSheet } from './style-picker-sheet';

// The sheet reads the safe area; seed fixed metrics so it resolves in tests.
const SafeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const movie: Movie = {
  id: 'm1',
  title: '무비 08-03',
  status: 'draft',
  createdAt: 1_754_000_000_000,
  updatedAt: 1_754_000_000_000,
  snapRefs: [],
  style: 'emotional',
  bgm: 'lofi-walk',
  captions: true,
  ratio: '9:16',
};

describe('StylePickerSheet', () => {
  // The cards are radios, and a radio reports `checked`: `selected` read the
  // pick to TalkBack as an unchecked radio (2026-10-19 review, MOVIE-10).
  it('reports the movie’s style as the checked radio and writes a pick through', async () => {
    const onChange = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={SafeAreaMetrics}>
        <StylePickerSheet visible movie={movie} canEdit onChange={onChange} onClose={jest.fn()} />
      </SafeAreaProvider>,
    );

    expect(screen.getByRole('radio', { name: /^감성/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^일상/ })).not.toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: /^여행/ }));
    expect(onChange).toHaveBeenCalledWith({ style: 'travel' });
  });
});
