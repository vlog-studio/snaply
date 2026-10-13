import type { InterestTopic } from './interest-topic';

/** How many names the 나 tab's one-line read-out spells out before counting the rest. */
const NAMED = 2;

/**
 * The 나 tab's read-out of the chosen interests: the names in the topics' own
 * order (`카페 · 여행`), the rest counted (`카페 · 여행 외 2개`), or `고르지 않음`.
 * `undefined` while either side is still loading — a read-out that guesses is
 * worse than none. Ids the topic list no longer has are skipped.
 */
export function interestReadOut(
  chosen: readonly string[] | undefined,
  topics: readonly InterestTopic[] | undefined,
): string | undefined {
  if (chosen === undefined || topics === undefined) return undefined;
  const names = topics.filter((topic) => chosen.includes(topic.id)).map((topic) => topic.label);
  if (names.length === 0) return '고르지 않음';
  const shown = names.slice(0, NAMED).join(' · ');
  return names.length > NAMED ? `${shown} 외 ${names.length - NAMED}개` : shown;
}
