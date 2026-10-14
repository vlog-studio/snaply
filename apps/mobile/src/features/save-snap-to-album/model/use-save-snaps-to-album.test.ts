import { act, renderHook } from '@testing-library/react-native';

import type { Snap } from '@/entities/snap';

import { albumBatchMessage, useSaveSnapsToAlbum } from './use-save-snaps-to-album';

const mockSaveSnapToAlbum = jest.fn();

jest.mock('./save-snap-to-album', () => ({
  saveSnapToAlbum: (snap: unknown, options: unknown) => mockSaveSnapToAlbum(snap, options),
}));

function makeSnap(id: string): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}`,
    durationSec: 3,
    capturedAt: 1_000,
    width: 720,
    height: 1280,
    orientation: 'portrait',
  };
}

describe('useSaveSnapsToAlbum', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves one at a time, asking only on the first, and counts what failed', async () => {
    mockSaveSnapToAlbum
      .mockResolvedValueOnce('saved')
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('saved');
    const { result } = await renderHook(() => useSaveSnapsToAlbum());

    let outcome;
    await act(async () => {
      outcome = await result.current.saveAll([makeSnap('a'), makeSnap('b'), makeSnap('c')]);
    });

    expect(outcome).toEqual({ saved: 2, failed: 1, blocked: false });
    expect(mockSaveSnapToAlbum.mock.calls.map((call) => call[1])).toEqual([
      { ask: true },
      { ask: false },
      { ask: false },
    ]);
    expect(result.current.saving).toBe(false);
  });

  // Every later save would be refused the same way.
  it('stops at a refused permission', async () => {
    mockSaveSnapToAlbum.mockResolvedValueOnce('blocked');
    const { result } = await renderHook(() => useSaveSnapsToAlbum());

    let outcome;
    await act(async () => {
      outcome = await result.current.saveAll([makeSnap('a'), makeSnap('b')]);
    });

    expect(outcome).toEqual({ saved: 0, failed: 0, blocked: true });
    expect(mockSaveSnapToAlbum).toHaveBeenCalledTimes(1);
  });
});

describe('albumBatchMessage', () => {
  it.each([
    [{ saved: 3, failed: 0, blocked: false }, '스냅 3개를 앨범에 저장했어요'],
    [
      { saved: 2, failed: 1, blocked: false },
      '스냅 2개를 앨범에 저장했어요 · 1개는 저장하지 못했어요',
    ],
    [{ saved: 0, failed: 0, blocked: true }, '앨범에 저장하려면 사진 권한이 필요해요.'],
    [
      { saved: 1, failed: 0, blocked: true },
      '스냅 1개를 앨범에 저장했어요 · 나머지는 사진 권한이 필요해요',
    ],
    // Nothing saved read "스냅 0개를 앨범에 저장했어요" (2026-10-13 review).
    [
      { saved: 0, failed: 3, blocked: false },
      '스냅 3개를 앨범에 저장하지 못했어요. 다시 시도해 주세요.',
    ],
    [{ saved: 0, failed: 0, blocked: false }, '저장할 스냅이 없어요.'],
  ])('words %j', (outcome, message) => {
    expect(albumBatchMessage(outcome)).toBe(message);
  });
});
