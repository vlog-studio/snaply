import type { CutsRefusal } from '@/features/compose-movie';
import { NoticeBand } from '@/shared/ui/notice';

/** Why a cut edit was refused, in the user's words. */
export const CutsRefusalMessages: Record<CutsRefusal, string> = {
  empty: '컷이 최소 1개는 있어야 해요.',
  full: '한 편에 들어가는 스냅 수를 넘었어요.',
  frozen: '만드는 동안에는 컷을 고칠 수 없어요.',
};

/**
 * The `busy` refusal's way to the movie being made — the run can be watched to
 * its end or canceled there. A run refusal's own words are
 * `generationRefusalMessage` (`features/compose-movie`), shared with the
 * failed-movie card.
 */
export const OpenGeneratingMovieLabel = '만드는 중인 무비 보기';

/** The one thing a refusal lets the user do about it, worded as its outcome. */
export type RefusalAction = {
  label: string;
  onPress: () => void;
};

/**
 * The band that answers a refusal — one component for both refusals on this
 * screen, a refused run and a refused cut edit, which stand together under the
 * head with the studio's other notices (`MovieNotices`). Wording the same rule
 * in two files is how two surfaces come to disagree about it, which the rules
 * the refusals stand for (`features/compose-movie`) exist to prevent.
 *
 * A refusal the user can resolve somewhere else carries the way there
 * (`action`) as a text button in the band — not a second button competing
 * with the one that refused. It is a standing notice (`NoticeBand`): it stays
 * while the refusal holds. It answers a press, so a screen reader hears it as
 * it arrives (`announce`) — a band that mounts already holding its words is
 * not read out by a live region on Android.
 */
export function RefusalNotice({ message, action }: { message: string; action?: RefusalAction }) {
  return <NoticeBand message={message} action={action} announce />;
}
