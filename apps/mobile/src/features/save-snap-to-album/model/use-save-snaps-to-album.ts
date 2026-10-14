import { useCallback, useEffect, useRef, useState } from 'react';

import type { Snap } from '@/entities/snap';

import { saveSnapToAlbum } from './save-snap-to-album';

/** How a batch ended: how many copies were made, and what stopped the rest. */
export type AlbumBatchOutcome = { saved: number; failed: number; blocked: boolean };

/**
 * Saving several snaps to the album at once (SNAP-17) — the library's
 * selection, or the soon-to-go snaps an expiry notice opened it on (SNAP-13).
 *
 * One at a time, so a batch of fetched copies does not pull every file at once.
 * The first save may raise the OS prompt (the tap was the user's); a refusal
 * stops the batch there, since every later save would be refused the same way.
 * A snap that fails does not stop the others.
 */
export function useSaveSnapsToAlbum() {
  const isMounted = useRef(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const saveAll = useCallback(async (snaps: readonly Snap[]): Promise<AlbumBatchOutcome> => {
    setSaving(true);
    const outcome: AlbumBatchOutcome = { saved: 0, failed: 0, blocked: false };
    try {
      for (const [index, snap] of snaps.entries()) {
        const result = await saveSnapToAlbum(snap, { ask: index === 0 });
        if (result === 'blocked') {
          outcome.blocked = true;
          break;
        }
        if (result === 'saved') outcome.saved += 1;
        else outcome.failed += 1;
      }
      return outcome;
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }, []);

  return { saveAll, saving };
}

/** The one line a batch leaves behind, in the user's words. */
export function albumBatchMessage(outcome: AlbumBatchOutcome): string {
  if (outcome.blocked && outcome.saved === 0) return '앨범에 저장하려면 사진 권한이 필요해요.';
  // Nothing saved is not "0개를 저장했어요" — say what failed, or that nothing was there to save.
  if (outcome.saved === 0) {
    return outcome.failed > 0
      ? `스냅 ${outcome.failed}개를 앨범에 저장하지 못했어요. 다시 시도해 주세요.`
      : '저장할 스냅이 없어요.';
  }
  const saved = `스냅 ${outcome.saved}개를 앨범에 저장했어요`;
  if (outcome.blocked) return `${saved} · 나머지는 사진 권한이 필요해요`;
  return outcome.failed > 0 ? `${saved} · ${outcome.failed}개는 저장하지 못했어요` : saved;
}
