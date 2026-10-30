import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { Movie } from '@/entities/movie';
import type { MovieSharing } from '@/features/share-movie';

import { GenerateFooter } from './generate-footer';

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

function sharing(state: Partial<MovieSharing> = {}): MovieSharing {
  return {
    blocked: undefined,
    busy: false,
    failed: false,
    offered: false,
    share: jest.fn(),
    openInInstagram: jest.fn(),
    handingOff: false,
    saveToAlbum: jest.fn(),
    savingToAlbum: false,
    savedToAlbum: false,
    ...state,
  };
}

describe('GenerateFooter', () => {
  // '공유 준비 중…' wrapped to three lines in the third of the row the ticket
  // has on a 360dp phone and grew the slot the stage is sized against
  // (2026-10-19 review, MOVIE-7).
  it('keeps the share ticket named 공유 and reports the download as busy', async () => {
    await render(
      <GenerateFooter
        movie={movie}
        cutCount={2}
        sharing={sharing({ busy: true })}
        onStart={jest.fn()}
      />,
    );

    const share = screen.getByRole('button', { name: '공유', busy: true });
    expect(share).toBeDisabled();
    expect(screen.queryByText('공유 준비 중…')).toBeNull();
  });

  // A finished movie's run replaces its result and is paid again (MOV-23).
  it('asks before remaking a finished movie and runs only on the confirming tap', async () => {
    const onStart = jest.fn();
    await render(
      <GenerateFooter movie={movie} cutCount={2} sharing={sharing()} onStart={onStart} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: '이 구성으로 다시 만들기' }));
    expect(onStart).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: '다시 만들기' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('states a failed run’s stored reason over 다시 시도', async () => {
    const onStart = jest.fn();
    await render(
      <GenerateFooter
        movie={{
          ...movie,
          status: 'failed',
          render: undefined,
          error: '스냅 파일을 찾지 못했어요.',
        }}
        cutCount={2}
        sharing={sharing({ blocked: 'no-render' })}
        onStart={onStart}
      />,
    );

    expect(screen.getByText('스냅 파일을 찾지 못했어요.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  // The reason is the movie's standing state, met on every visit; it is read
  // where it sits rather than spoken each time the screen opens.
  it('does not announce a failed run’s reason as the screen opens', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(
      <GenerateFooter
        movie={{
          ...movie,
          status: 'failed',
          render: undefined,
          error: '스냅 파일을 찾지 못했어요.',
        }}
        cutCount={2}
        sharing={sharing({ blocked: 'no-render' })}
        onStart={jest.fn()}
      />,
    );

    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });
});
