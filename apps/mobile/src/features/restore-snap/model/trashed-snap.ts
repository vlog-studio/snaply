/**
 * A snap deleted everywhere that the server still keeps, until its retention
 * ends (SNAP-20) — what 최근 삭제 lists and what can be brought back.
 *
 * It is no longer in the library: deleting it took its file off every device,
 * so this is the server's account of it, not a `Snap`.
 */
export type TrashedSnap = {
  videoId: string;
  /** Epoch ms. The deletion time when the server never learnt when it was shot. */
  capturedAt: number;
  /** Absent while the server has not measured the file — the row then leaves the length out rather than say 0초. */
  durationSec?: number;
  thumbnailUrl?: string;
  /** Epoch ms. */
  deletedAt: number;
  /** Epoch ms — after it the server's cleanup removes the files and it cannot come back. */
  restorableUntil: number;
};
