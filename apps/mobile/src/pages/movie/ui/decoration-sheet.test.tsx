import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Movie } from '@/entities/movie';

import { DecorationSheet } from './decoration-sheet';

// The sheet reads the safe area; seed fixed metrics so it resolves in tests.
const SafeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const movie: Movie = {
  id: 'm1',
  title: '무비 10-30',
  status: 'draft',
  createdAt: 1_754_000_000_000,
  updatedAt: 1_754_000_000_000,
  snapRefs: [],
  style: 'daily',
  recipe: 'cinematic',
  bgm: 'lofi-walk',
  captions: false,
  ratio: '9:16',
};

async function renderSheet(props: Partial<Parameters<typeof DecorationSheet>[0]> = {}) {
  const onChange = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SafeAreaMetrics}>
      <DecorationSheet
        visible
        movie={movie}
        canEdit
        onChange={onChange}
        onClose={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return onChange;
}

describe('DecorationSheet', () => {
  // A movie stored before decorations reads as its recipe's defaults —
  // 시네마틱: all three on.
  it('draws the recipe’s defaults for a movie that has none of its own', async () => {
    await renderSheet();

    expect(screen.getByRole('switch', { name: '글자' })).toBeChecked();
    expect(screen.getByRole('switch', { name: '이모지' })).toBeChecked();
    expect(screen.getByRole('switch', { name: '얼굴 스티커' })).toBeChecked();
  });

  // The decorations travel whole, so one switch never drops the other two.
  it('writes one switch through with the other two as they are', async () => {
    const onChange = await renderSheet({
      movie: { ...movie, decorations: { text: true, emoji: false, face: true } },
    });

    await fireEvent.press(screen.getByRole('switch', { name: '글자' }));

    expect(onChange).toHaveBeenCalledWith({
      decorations: { text: false, emoji: false, face: true },
    });
  });

  // MOV-29 — both start off whatever the recipe, and travel whole too.
  it('draws the editing choices off by default and writes one through with the other kept', async () => {
    const onChange = await renderSheet();

    expect(screen.getByRole('switch', { name: '말소리' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: '장면 순서' })).not.toBeChecked();

    await fireEvent.press(screen.getByRole('switch', { name: '말소리' }));

    expect(onChange).toHaveBeenCalledWith({ editing: { speech: true, sceneOrder: false } });
  });

  it('draws a movie’s own editing choices', async () => {
    await renderSheet({ movie: { ...movie, editing: { speech: false, sceneOrder: true } } });

    expect(screen.getByRole('switch', { name: '장면 순서' })).toBeChecked();
  });

  it('says a finished movie changes only when it is made again, cuts and music kept', async () => {
    await renderSheet({ movie: { ...movie, status: 'ready' } });

    expect(screen.getByText(/다시 만들 때 적용돼요\. 컷·순서·음악은 그대로예요\./)).toBeTruthy();
  });

  it('becomes a read-out while a run owns the movie', async () => {
    const onChange = await renderSheet({ canEdit: false });

    expect(screen.getByRole('switch', { name: '이모지' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('switch', { name: '이모지' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
