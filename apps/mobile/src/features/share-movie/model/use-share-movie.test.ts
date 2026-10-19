import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Movie } from '@/entities/movie';

import {
  InstagramHandoffMessages,
  ShareBlockMessages,
  shareBlockMessage,
  useShareMovie,
  type ShareSource,
} from './use-share-movie';

const mockCanShare = jest.fn<Promise<boolean>, []>();
const mockShareFile = jest.fn<Promise<void>, [string, unknown]>();
const mockDownload = jest.fn<Promise<string>, [string, string]>();

jest.mock('@/shared/lib/sharing', () => ({
  canShareFiles: () => mockCanShare(),
  shareFile: (uri: string, options: unknown) => mockShareFile(uri, options),
}));
const mockRequestAlbum = jest.fn<Promise<{ granted: boolean }>, []>();
const mockSaveToAlbum = jest.fn<Promise<void>, [string]>();
const mockOpenInstagram = jest.fn<Promise<void>, []>();
jest.mock('@/shared/lib/media-library', () => ({
  requestAlbumPermission: () => mockRequestAlbum(),
  saveVideoToAlbum: (uri: string) => mockSaveToAlbum(uri),
}));
jest.mock('../lib/open-instagram', () => ({ openInstagram: () => mockOpenInstagram() }));
jest.mock('../api/download-render-file', () => ({
  downloadRenderFile: (uri: string, cacheKey: string) => mockDownload(uri, cacheKey),
}));

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'm1',
    title: '무비 08-03',
    status: 'ready',
    createdAt: 1_754_000_000_000,
    updatedAt: 1_754_000_000_000,
    snapRefs: [{ snapId: 's1', order: 0 }],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
    render: { videoId: 'result-1', renderedAt: 42, durationSec: 12 },
    ...overrides,
  };
}

const resolved = (uri: string | undefined): ShareSource => ({
  uri,
  resolving: false,
  unresolved: false,
});

/** The ask for the address failed and left nothing to play. */
const unresolved: ShareSource = { uri: undefined, resolving: false, unresolved: true };

/** The fresh address is still on its way (`useRenderSource` on a cold cache). */
const resolving: ShareSource = { uri: undefined, resolving: true, unresolved: false };

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockCanShare.mockResolvedValue(true);
  mockShareFile.mockResolvedValue(undefined);
  mockDownload.mockImplementation((uri) => Promise.resolve(uri));
  mockRequestAlbum.mockResolvedValue({ granted: true });
  mockSaveToAlbum.mockResolvedValue(undefined);
  mockOpenInstagram.mockResolvedValue(undefined);
});

// The way to Instagram that needs no Meta review and no tester role
// (docs/decisions/instagram-app-handoff.md).
describe('openInInstagram', () => {
  it('saves the render to the album, then opens Instagram, and offers 끝내기', async () => {
    mockDownload.mockResolvedValue('file:///cache/share-movie/m1-42.mp4');
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4?sig=abc')),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.openInInstagram();
    });

    expect(outcome).toBe('opened');
    expect(mockSaveToAlbum).toHaveBeenCalledWith('file:///cache/share-movie/m1-42.mp4');
    expect(mockOpenInstagram).toHaveBeenCalledTimes(1);
    expect(result.current.offered).toBe(true);
    expect(result.current.handingOff).toBe(false);
  });

  it('does not open Instagram when the album is refused or the save fails', async () => {
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    mockRequestAlbum.mockResolvedValueOnce({ granted: false });
    let refused;
    await act(async () => {
      refused = await result.current.openInInstagram();
    });
    mockSaveToAlbum.mockRejectedValueOnce(new Error('disk full'));
    let failed;
    await act(async () => {
      failed = await result.current.openInInstagram();
    });

    expect([refused, failed]).toEqual(['blocked', 'failed']);
    expect(mockOpenInstagram).not.toHaveBeenCalled();
    expect(result.current.offered).toBe(false);
  });

  it('has nothing to hand over without a render file', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), resolved(undefined)));

    let outcome;
    await act(async () => {
      outcome = await result.current.openInInstagram();
    });

    expect(outcome).toBe('unavailable');
    expect(mockRequestAlbum).not.toHaveBeenCalled();
  });

  // Offline, a finished movie's link cannot be fetched; the hand-off said it was
  // never finished (2026-10-13 review) — the same mix-up 공유's block avoids.
  it('tells a finished movie whose link could not be fetched apart from one with no render', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), unresolved));

    let outcome;
    await act(async () => {
      outcome = await result.current.openInInstagram();
    });

    expect(outcome).toBe('unresolved');
    expect(InstagramHandoffMessages.unresolved).toBe(ShareBlockMessages.unresolved);
    expect(mockRequestAlbum).not.toHaveBeenCalled();
  });

  // The address takes up to an 8-second deadline and a retry; a tap meanwhile
  // said a finished movie was never finished (2026-10-19 review, MOVIE-3).
  it('hands nothing over and says nothing while the address is on its way', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), resolving));

    let outcome;
    await act(async () => {
      outcome = await result.current.openInInstagram();
    });

    expect(outcome).toBe('resolving');
    expect(mockRequestAlbum).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(result.current.handingOff).toBe(false);
  });

  // A second tap could land before the first one's render and read "not running",
  // or read "running" and show "저장하지 못했어요" over a save still going
  // (2026-10-14 review, backlog E-53).
  it('ignores a second tap while one hand-off runs', async () => {
    let grant!: (value: { granted: boolean }) => void;
    mockRequestAlbum.mockReturnValueOnce(new Promise((resolve) => (grant = resolve)));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    let outcomes: string[] = [];
    await act(async () => {
      const first = result.current.openInInstagram();
      const second = result.current.openInInstagram();
      grant({ granted: true });
      outcomes = await Promise.all([first, second]);
    });

    expect(outcomes).toEqual(['opened', 'busy']);
    expect(mockSaveToAlbum).toHaveBeenCalledTimes(1);
  });

  it('says the movie was saved when only opening Instagram fails', async () => {
    mockOpenInstagram.mockRejectedValueOnce(new Error('no activity'));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.openInInstagram();
    });

    expect(outcome).toBe('saved');
    expect(result.current.offered).toBe(true);
    expect(result.current.handingOff).toBe(false);
  });
});

describe('useShareMovie', () => {
  it('takes one share at a time', async () => {
    let finish!: (uri: string) => void;
    mockDownload.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => {
      result.current.share();
      result.current.share();
      finish('file:///cache/share-movie/m1-42.mp4');
    });

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockShareFile).toHaveBeenCalledTimes(1);
  });

  it('downloads the render locally, then opens the share sheet on the local copy', async () => {
    mockDownload.mockResolvedValue('file:///cache/share-movie/m1-42.mp4');
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4?sig=abc')),
    );

    expect(result.current.blocked).toBeUndefined();
    await act(async () => result.current.share());

    // Keyed on the render version, not the URL — the signed URL changes on
    // every resolution while naming the same bytes.
    expect(mockDownload).toHaveBeenCalledWith('https://cdn/e.mp4?sig=abc', 'm1-42');
    expect(mockShareFile).toHaveBeenCalledWith(
      'file:///cache/share-movie/m1-42.mp4',
      expect.objectContaining({ mimeType: 'video/mp4', dialogTitle: '무비 08-03' }),
    );
  });

  it('blocks a movie whose source resolved to no file', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), resolved(undefined)));

    expect(result.current.blocked).toBe('no-render');
    await act(async () => result.current.share());

    expect(mockShareFile).not.toHaveBeenCalled();
  });

  // Same empty uri, opposite situations: a file that was never made, and one
  // whose address this device could not fetch. Only the second is a connection
  // problem, and saying "not made yet" about a finished movie is the worse lie.
  it('tells an unfetched address apart from a movie with no file', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), unresolved));

    expect(result.current.blocked).toBe('unresolved');
    await act(async () => result.current.share());

    expect(mockShareFile).not.toHaveBeenCalled();
  });

  // The wait for the address read as `no-render`, so every finished movie opened
  // with 아직 완성된 무비가 없어서 공유할 수 없어요 under 공유 until the address
  // arrived (2026-10-19 review, MOVIE-3).
  it('waits without a reason while the address is still on its way', async () => {
    const { result } = await renderHook(() => useShareMovie(makeMovie(), resolving));

    expect(result.current.blocked).toBe('resolving');
    expect(shareBlockMessage(result.current.blocked)).toBeUndefined();
    await act(async () => result.current.share());

    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('is busy while the download runs, and done after', async () => {
    let releaseDownload = (_uri: string) => {};
    mockDownload.mockReturnValue(new Promise((resolve) => (releaseDownload = resolve)));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());
    expect(result.current.busy).toBe(true);

    // A second press while busy starts nothing — the guard is in the hook, not
    // only in a `disabled` prop.
    await act(async () => result.current.share());
    expect(mockDownload).toHaveBeenCalledTimes(1);

    await act(async () => releaseDownload('file:///cache/m.mp4'));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(mockShareFile).toHaveBeenCalledWith('file:///cache/m.mp4', expect.anything());
  });

  it('reports a failed download, and clears it when a new attempt starts', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(mockShareFile).not.toHaveBeenCalled();

    mockDownload.mockResolvedValueOnce('file:///cache/m.mp4');
    await act(async () => result.current.share());
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(mockShareFile).toHaveBeenCalled();
  });

  it('shares nothing on a platform with no share sheet', async () => {
    mockCanShare.mockResolvedValue(false);
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());

    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('survives a share sheet that throws', async () => {
    // The failure is warned about in dev; the warning is the expected output
    // here, not a test problem, so it is silenced rather than printed.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockShareFile.mockRejectedValue(new Error('cancelled'));
    const { result } = await renderHook(() =>
      useShareMovie(makeMovie(), resolved('https://cdn/e.mp4')),
    );

    await act(async () => result.current.share());

    expect(mockShareFile).toHaveBeenCalled();
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it('blocks when there is no movie at all', async () => {
    const { result } = await renderHook(() => useShareMovie(undefined, resolved(undefined)));

    expect(result.current.blocked).toBe('no-render');
  });
});

describe('shareBlockMessage', () => {
  it.each([
    ['nothing blocks', undefined, undefined],
    ['the address is on its way', 'resolving', undefined],
    ['no file was made', 'no-render', ShareBlockMessages['no-render']],
    ['the address could not be fetched', 'unresolved', ShareBlockMessages.unresolved],
  ] as const)('states a reason only for a known block: %s', (_, block, message) => {
    expect(shareBlockMessage(block)).toBe(message);
  });
});
