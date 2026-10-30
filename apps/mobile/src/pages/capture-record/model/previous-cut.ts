import type { Snap } from '@/entities/snap';

/** Which rule settled the previous cut — kept so a later rule's share can be seen. */
export type PreviousCutRuleName = 'latest';

/** The snap the next one is lined up against, and the rule that chose it. */
export type PreviousCut = { snap: Snap; rule: PreviousCutRuleName };

/** What a rule needs to know. Whether a file is on this device is asked, not read, so tests stay pure. */
export type PreviousCutContext = {
  snaps: readonly Snap[];
  isOnDevice: (snap: Snap) => boolean;
};

/**
 * One rule's answer: this snap, no previous cut at all, or "not mine to say" —
 * the next rule in the list is asked.
 */
type RuleAnswer = { kind: 'pick'; snap: Snap } | { kind: 'none' } | { kind: 'pass' };

type PreviousCutRule = {
  name: PreviousCutRuleName;
  decide: (context: PreviousCutContext) => RuleAnswer;
};

const latestOnDevice: PreviousCutRule = {
  name: 'latest',
  decide: ({ snaps, isOnDevice }) => {
    const newestFirst = [...snaps].sort((left, right) => right.capturedAt - left.capturedAt);
    const snap = newestFirst.find(isOnDevice);
    return snap ? { kind: 'pick', snap } : { kind: 'none' };
  },
};

/**
 * Asked in order; the first answer that is not a pass wins. A new situation
 * (an old snap, a snap the user picked) is a rule put in front of the last one,
 * which always answers — capture-coach §4.1, backlog A-23.
 */
export const PREVIOUS_CUT_RULES: readonly PreviousCutRule[] = [latestOnDevice];

/** The previous cut for the next capture, or `undefined` when there is none. */
export function pickPreviousCut(
  context: PreviousCutContext,
  rules: readonly PreviousCutRule[] = PREVIOUS_CUT_RULES,
): PreviousCut | undefined {
  for (const rule of rules) {
    const answer = rule.decide(context);
    if (answer.kind === 'pick') return { snap: answer.snap, rule: rule.name };
    if (answer.kind === 'none') return undefined;
  }
  return undefined;
}

// A hair before the end: the very last timestamp can fall past the final frame
// and fail to extract on iOS.
const LAST_FRAME_LEAD_MS = 120;

/** Where to sample the previous cut's closing frame — the frame the next cut continues from. */
export function lastFrameTimeMs(snap: Snap): number {
  return Math.max(0, Math.round(snap.durationSec * 1000) - LAST_FRAME_LEAD_MS);
}
