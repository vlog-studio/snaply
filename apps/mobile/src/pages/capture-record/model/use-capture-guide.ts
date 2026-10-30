import { useState } from 'react';

import { isSnapFileLocal, useSnaps } from '@/entities/snap';
import { useVideoThumbnail } from '@/shared/lib/video-thumbnails';

import { lastFrameTimeMs, pickPreviousCut } from './previous-cut';
import { usePreviousCutRead } from './use-previous-cut-read';

/**
 * The viewfinder's framing guide (SNAP-23): a rule-of-thirds grid and the
 * previous cut's closing frame laid faintly over the feed, so the next snap can
 * be shot in the same place and size and the editor has a cut to join them on.
 *
 * Off until the user turns it on — lining every snap up the same way is a
 * style the user picks, not a default (capture-coach §3). The previous cut is
 * only looked up while the guide is on, and follows each new capture: the snap
 * just taken becomes the one the next is lined up against.
 */
export function useCaptureGuide() {
  const snaps = useSnaps();
  const [isOn, setIsOn] = useState(false);

  const previousCut = isOn ? pickPreviousCut({ snaps, isOnDevice: isSnapFileLocal }) : undefined;
  const ghostUri = useVideoThumbnail(
    previousCut?.snap.uri,
    previousCut ? lastFrameTimeMs(previousCut.snap) : undefined,
  );
  const read = usePreviousCutRead(previousCut?.snap.id, ghostUri);

  return {
    isOn,
    previousCut,
    /** The previous cut's closing frame; `undefined` while it is extracted or when there is none. */
    ghostUri,
    /** The AI's line and subject spot for the previous cut, when the account agreed to analysis (SNAP-25). */
    read,
    toggle: () => setIsOn((current) => !current),
  };
}
