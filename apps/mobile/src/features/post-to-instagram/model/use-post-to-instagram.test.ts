import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import type { PostOutcome } from '../api/post-movie';

import { usePostToInstagram } from './use-post-to-instagram';

const mockPost = jest.fn<Promise<PostOutcome>, [{ videoId: string; caption?: string }]>();
jest.mock('../api/post-movie', () => ({
  postMovieToInstagram: (params: { videoId: string; caption?: string }) => mockPost(params),
}));

const mockRecordFinished = jest.fn();
jest.mock('@/entities/movie', () => ({ useFinishMovie: () => mockRecordFinished }));

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = await renderHook(() => usePostToInstagram(), { wrapper });
  return { ...hook, invalidate };
}

const request = { movieId: 'm1', videoId: 'v1', caption: '  첫 무비  ' };

beforeEach(() => jest.clearAllMocks());

describe('usePostToInstagram', () => {
  // A post that went through finishes the movie on the server (MOV-17); the
  // store hears it at once so watch mode stops showing a file that is gone.
  it('finishes the movie here when the post goes through', async () => {
    mockPost.mockResolvedValue('posted');
    const { result } = await render();

    let outcome: PostOutcome | undefined;
    await act(async () => {
      outcome = await result.current.post(request);
    });

    expect(outcome).toBe('posted');
    expect(mockPost).toHaveBeenCalledWith({ videoId: 'v1', caption: '첫 무비' });
    expect(mockRecordFinished).toHaveBeenCalledWith('m1', expect.any(Number));
  });

  // The server finishes it only once Instagram publishes; nothing ends early here.
  it('keeps the movie while Instagram is still processing', async () => {
    mockPost.mockResolvedValue('processing');
    const { result } = await render();

    await act(async () => {
      await result.current.post(request);
    });

    expect(mockRecordFinished).not.toHaveBeenCalled();
  });

  it('sends no caption when the field was left blank', async () => {
    mockPost.mockResolvedValue('posted');
    const { result } = await render();

    await act(async () => {
      await result.current.post({ ...request, caption: '   ' });
    });

    expect(mockPost).toHaveBeenCalledWith({ videoId: 'v1', caption: undefined });
  });

  // A failure keeps the movie, and re-reads the link: an expired one is the
  // likeliest cause, and the sheet should then offer 다시 연결.
  it('keeps the movie and re-reads the link when the post fails', async () => {
    mockPost.mockRejectedValue(new Error('400'));
    const { result, invalidate } = await render();

    let outcome: PostOutcome | undefined = 'posted';
    await act(async () => {
      outcome = await result.current.post(request);
    });

    expect(outcome).toBeUndefined();
    expect(mockRecordFinished).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Instagram에 게시하지 못했어요. 다시 시도해 주세요.');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sns-connection'] });
  });
});
