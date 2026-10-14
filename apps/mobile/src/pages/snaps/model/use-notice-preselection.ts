import { useEffect, useRef } from 'react';

import type { SnapSyncEntry } from '@/entities/snap';

import { expiringSnapIds } from './expiring-snaps';

type NoticePreselectionOptions = {
  /** The arrival an expiry notice's tap made (`album:<at>`); `undefined` for any other arrival. */
  arrival: string | undefined;
  /** Whether the library and the deadlines (the sync store) have both been restored. */
  ready: boolean;
  libraryIds: readonly string[];
  syncEntries: Record<string, SnapSyncEntry | undefined>;
  picked: string[];
  replace: (snapIds: string[]) => void;
};

/**
 * An expiry notice's tap opens the library on the snaps it is about, already
 * picked for the album (SNAP-13). After the arrival, not during it: which snaps
 * are about to go reads the clock. Once per arrival — later picks are the user's.
 *
 * The deadlines live in the sync store, which restores apart from the library,
 * and on a fresh start the reconcile may still be writing them: a tap that
 * launched the app read none and settled on nothing picked. So it waits for both
 * stores, and treats an empty answer as not yet final — until the user picks
 * something themselves after the arrival, which ends the wait without
 * overwriting their pick. Picks already there when the notice arrived are
 * replaced, as they always were.
 */
export function useNoticePreselection({
  arrival,
  ready,
  libraryIds,
  syncEntries,
  picked,
  replace,
}: NoticePreselectionOptions): void {
  const preselectedArrival = useRef<string | undefined>(undefined);
  const picksAtArrival = useRef<{ arrival: string; picked: string[] } | undefined>(undefined);

  useEffect(() => {
    if (!arrival || preselectedArrival.current === arrival) return;
    if (picksAtArrival.current?.arrival !== arrival) picksAtArrival.current = { arrival, picked };
    if (picked !== picksAtArrival.current.picked) {
      preselectedArrival.current = arrival;
      return;
    }
    if (!ready) return;
    const expiring = expiringSnapIds(libraryIds, syncEntries, Date.now());
    if (expiring.length === 0) return;
    preselectedArrival.current = arrival;
    replace(expiring);
  }, [arrival, ready, libraryIds, syncEntries, picked, replace]);
}
