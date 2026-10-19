import { render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Movie } from '@/entities/movie';
import type { RenderSource } from '@/features/compose-movie';
import { ShareBlockMessages, useShareMovie } from '@/features/share-movie';

import { MovieWatch } from './movie-watch';

// The players hold a hardware decoder through expo-video; which one the stage
// mounts is not what these cases are about, so they stand in as nothing.
jest.mock('./cut-player', () => ({ CutPlayer: () => null }));
jest.mock('./render-player', () => ({ RenderPlayer: () => null }));
// Only fetched when the stage plays the cuts; here there are none to fetch.
jest.mock('@/entities/snap', () => ({
  useSnapFiles: () => ({ fetching: false, failed: false, retry: jest.fn() }),
}));
// `features/share-movie` reaches the album adapter for its Instagram hand-off;
// the native media library has no test double of its own.
jest.mock('@/shared/lib/media-library', () => ({
  requestAlbumPermission: jest.fn(),
  saveVideoToAlbum: jest.fn(),
}));

// useSafeAreaInsets needs a provider; seed fixed metrics so insets resolve
// synchronously in tests.
const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 780 },
  insets: { top: 32, left: 0, right: 0, bottom: 48 },
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
  render: { videoId: 'result-1', renderedAt: 1_754_000_000_000, durationSec: 12 },
};

function source(state: Partial<RenderSource>): RenderSource {
  return { uri: undefined, resolving: false, unresolved: false, retry: jest.fn(), ...state };
}

/** Watch mode as the page drives it: one resolved source for the stage and 공유. */
function Watch({ renderSource }: { renderSource: RenderSource }) {
  const sharing = useShareMovie(movie, renderSource);
  return (
    <MovieWatch
      movie={movie}
      cuts={[]}
      renderSource={renderSource}
      sharing={sharing}
      editedSinceRender={false}
      onReviewEdits={jest.fn()}
      onFinish={jest.fn()}
    />
  );
}

function withSafeArea(node: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

describe('MovieWatch', () => {
  // The address wait read as "no file was made", so every finished movie opened
  // with 아직 완성된 무비가 없어서 공유할 수 없어요 under 공유 for as long as the
  // address took — up to about 16 seconds offline (2026-10-19 review, MOVIE-3).
  it('keeps 공유 off without a reason while the address is on its way', async () => {
    await render(withSafeArea(<Watch renderSource={source({ resolving: true })} />));

    expect(screen.getByText('불러오는 중…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '공유' })).toBeDisabled();
    expect(screen.queryByText(ShareBlockMessages['no-render'])).toBeNull();
    expect(screen.queryByText(ShareBlockMessages.unresolved)).toBeNull();
  });

  it('says why 공유 is off when the run produced no file', async () => {
    await render(withSafeArea(<Watch renderSource={source({})} />));

    expect(screen.getByText(ShareBlockMessages['no-render'])).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '공유' })).toBeDisabled();
  });

  it('says the address could not be fetched, not that there is no movie', async () => {
    await render(withSafeArea(<Watch renderSource={source({ unresolved: true })} />));

    expect(screen.getByText(ShareBlockMessages.unresolved)).toBeOnTheScreen();
    expect(screen.queryByText(ShareBlockMessages['no-render'])).toBeNull();
  });
});
