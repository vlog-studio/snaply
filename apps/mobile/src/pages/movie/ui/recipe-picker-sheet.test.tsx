import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Movie } from '@/entities/movie';

import { RecipePickerSheet } from './recipe-picker-sheet';

// The sheet reads the safe area; seed fixed metrics so it resolves in tests.
const SafeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'm1',
    title: '무비',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
    snapRefs: [{ snapId: 's1', order: 0 }],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: false,
    ratio: '9:16',
    ...overrides,
  };
}

async function renderSheet(movie: Movie, canEdit = true) {
  const onChange = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SafeAreaMetrics}>
      <RecipePickerSheet
        visible
        movie={movie}
        canEdit={canEdit}
        onChange={onChange}
        onClose={jest.fn()}
      />
    </SafeAreaProvider>,
  );
  return onChange;
}

describe('RecipePickerSheet', () => {
  it('reads a movie stored without a recipe as classic, and hands a pick back as a patch', async () => {
    const onChange = await renderSheet(makeMovie());

    expect(screen.getByRole('radio', { name: /^기본/ })).toBeSelected();
    fireEvent.press(screen.getByRole('radio', { name: /^몽타주/ }));

    expect(onChange).toHaveBeenCalledWith({ recipe: 'trend-montage' });
  });

  it('says a trend recipe re-cuts only a movie whose cuts are all the AI’s', async () => {
    await renderSheet(
      makeMovie({
        recipe: 'trend-routine',
        arranger: 'ai',
        snapRefs: [{ snapId: 's1', order: 0, trimOwner: 'ai' }],
      }),
    );
    expect(screen.getByText(/컷도 편집 스타일에 맞춰 다시 골라요/)).toBeOnTheScreen();
  });

  it('says a trend recipe keeps cuts the user touched', async () => {
    await renderSheet(makeMovie({ recipe: 'cinematic', arranger: 'ai' }));
    expect(screen.getByText(/손본 컷은 그대로 두고/)).toBeOnTheScreen();
  });

  it('becomes a read-out while a job owns the movie', async () => {
    const onChange = await renderSheet(makeMovie({ status: 'generating' }), false);

    fireEvent.press(screen.getByRole('radio', { name: /^몽타주/ }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
