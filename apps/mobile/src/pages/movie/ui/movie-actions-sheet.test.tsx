import { render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Movie } from '@/entities/movie';
import { ShareBlockMessages, type ShareBlock } from '@/features/share-movie';

import { MovieActionsSheet } from './movie-actions-sheet';

// The sheet's other steps are their own slices' business; only the menu is read here.
jest.mock('@/features/finish-movie', () => ({ FinishMovieConfirm: () => null }));
jest.mock('@/features/rename-movie', () => ({ RenameMovieForm: () => null }));
jest.mock('./instagram-post-sheet', () => ({ InstagramPostStep: () => null }));
// `features/share-movie` reaches the album adapter for its Instagram hand-off;
// the native media library has no test double of its own.
jest.mock('@/shared/lib/media-library', () => ({
  requestAlbumPermission: jest.fn(),
  saveVideoToAlbum: jest.fn(),
}));

// useSafeAreaInsets needs a provider; seed fixed metrics so insets resolve
// synchronously in tests.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const movie: Movie = {
  id: 'm1',
  title: '무비 08-03',
  status: 'ready',
  createdAt: 1_754_000_000_000,
  updatedAt: 1_754_000_000_000,
  snapRefs: [],
  style: 'daily',
  bgm: 'lofi-walk',
  captions: true,
  ratio: '9:16',
  render: { videoId: 'result-1', renderedAt: 42, durationSec: 12 },
};

function withSafeArea(node: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

async function openMenu(shareBlock: ShareBlock | undefined) {
  await render(
    withSafeArea(
      <MovieActionsSheet
        visible
        movie={movie}
        cutCount={2}
        totalSec={12}
        shareBlock={shareBlock}
        onEdit={jest.fn()}
        onShare={jest.fn()}
        onPosted={jest.fn()}
        onOpenInstagramApp={jest.fn()}
        handingOff={false}
        onConfirmDelete={jest.fn()}
        onClose={jest.fn()}
      />,
    ),
  );
}

describe('MovieActionsSheet', () => {
  it('states why 공유하기 is off under the row', async () => {
    await openMenu('no-render');

    expect(screen.getByRole('button', { name: '공유하기' })).toBeDisabled();
    expect(screen.getByText(ShareBlockMessages['no-render'])).toBeOnTheScreen();
  });

  // While the address is still on its way there is no reason yet — the row
  // said a finished movie had never been finished (2026-10-19 review, MOVIE-3).
  it('keeps 공유하기 off without a reason while the address is on its way', async () => {
    await openMenu('resolving');

    expect(screen.getByRole('button', { name: '공유하기' })).toBeDisabled();
    expect(screen.queryByText(ShareBlockMessages['no-render'])).toBeNull();
    expect(screen.queryByText(ShareBlockMessages.unresolved)).toBeNull();
  });
});
