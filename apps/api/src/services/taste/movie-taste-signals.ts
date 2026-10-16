/**
 * 무비에서 나오는 취향 신호(docs/decisions/ontology-personalization.md §4.2 — 신호를 내는 곳과 때).
 *
 * 앱은 신호를 따로 보내지 않는다 — 서버가 이미 받는 것(초안 제안 · 무비 저장 전후 · 생성 완료)을 비교해 낸다. 그래서 신호는
 * "사용자가 무엇을 했는가"가 아니라 **서버에 닿은 결과의 차이**다. 기기에서 넣었다 뺀 컷처럼 서버에 오기 전에 끝난 일은 모른다.
 */
import { findMovieDraft } from '../movie-draft.service.js';
import { contentSignalsOf, type TasteSignal } from './taste.service.js';
import { TASTE_SIGNAL_STRENGTH } from './taste-policy.js';

/** 신호를 비교할 때 보는 무비의 모양. 저장된 행 그대로다. */
export interface MovieShape {
  stylePreset: string;
  clips: ReadonlyArray<{
    videoId: string;
    trimOwner: string;
    transitionKind: string | null;
    transitionOwner: string;
  }>;
}

/**
 * AI 초안으로 만든 무비가 처음 서버에 올라왔을 때 — 그 초안과 비교한다. 남긴 컷 · 다시 넣은 빠진 스냅은 +, 지운 컷은 −.
 * 무비의 초안은 `findMovieDraft` 로 찾는다. 맞는 초안이 없으면 신호를 내지 않는다 — 틀린 비교보다 없는 편이 낫다.
 */
export async function draftComparisonSignals(
  userId: string,
  clipVideoIds: readonly string[],
  now: Date = new Date(),
): Promise<TasteSignal[]> {
  const draft = await findMovieDraft(userId, clipVideoIds, now);
  if (draft === null) return [];
  const inMovie = new Set(clipVideoIds);
  const removed = draft.cuts.filter((id) => !inMovie.has(id));
  return [
    ...(await contentSignalsOf(userId, [...inMovie], TASTE_SIGNAL_STRENGTH.picked)),
    ...(await contentSignalsOf(userId, removed, TASTE_SIGNAL_STRENGTH.unwanted)),
  ];
}

/** 경계 하나의 키 — 같은 두 컷이 이어진 경계를 저장 전후에서 맞춘다. */
function boundaryKey(from: string, to: string): string {
  return `${from}\n${to}`;
}

/**
 * 무비를 저장할 때 — 저장 전과 후를 비교한다.
 *
 * - 새로 넣은 스냅: + (`picked`)
 * - 지운 컷 중 AI 가 넣은 것(`trimOwner: ai`): − (`unwanted`). 사용자가 넣었다 뺀 컷은 취향의 근거로 삼지 않는다
 * - AI 가 고른 전환을 사용자가 바꾼 경계(같은 두 컷, 주인이 ai → user, 종류가 다름): 바꾼 값 + · 원래 값 −
 * - 스타일을 바꿈: 바꾼 값 + · 원래 값 −
 */
export async function movieEditSignals(
  userId: string,
  before: MovieShape,
  after: MovieShape,
): Promise<TasteSignal[]> {
  const beforeIds = new Set(before.clips.map((clip) => clip.videoId));
  const afterIds = new Set(after.clips.map((clip) => clip.videoId));
  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removedAi = before.clips
    .filter((clip) => clip.trimOwner === 'ai' && !afterIds.has(clip.videoId))
    .map((clip) => clip.videoId);

  const aiBoundaries = new Map<string, string>();
  before.clips.forEach((clip, index) => {
    const next = before.clips[index + 1];
    if (next && clip.transitionOwner === 'ai' && clip.transitionKind !== null) {
      aiBoundaries.set(boundaryKey(clip.videoId, next.videoId), clip.transitionKind);
    }
  });
  const transitions: TasteSignal[] = after.clips.flatMap((clip, index) => {
    const next = after.clips[index + 1];
    if (!next || clip.transitionOwner !== 'user' || clip.transitionKind === null) return [];
    const replaced = aiBoundaries.get(boundaryKey(clip.videoId, next.videoId));
    if (replaced === undefined || replaced === clip.transitionKind) return [];
    return [
      { field: 'transition' as const, concept: clip.transitionKind, strength: TASTE_SIGNAL_STRENGTH.editChosen },
      { field: 'transition' as const, concept: replaced, strength: TASTE_SIGNAL_STRENGTH.editReplaced },
    ];
  });
  const style: TasteSignal[] =
    before.stylePreset === after.stylePreset
      ? []
      : [
          { field: 'style', concept: after.stylePreset, strength: TASTE_SIGNAL_STRENGTH.editChosen },
          { field: 'style', concept: before.stylePreset, strength: TASTE_SIGNAL_STRENGTH.editReplaced },
        ];

  return [
    ...(await contentSignalsOf(userId, added, TASTE_SIGNAL_STRENGTH.picked)),
    ...(await contentSignalsOf(userId, removedAi, TASTE_SIGNAL_STRENGTH.unwanted)),
    ...transitions,
    ...style,
  ];
}

/** 생성이 끝난 무비 — 가장 강한 근거다. 컷의 내용 개념, 경계마다 쓴 전환, 스타일. */
export async function finishedMovieSignals(userId: string, movie: MovieShape): Promise<TasteSignal[]> {
  const transitions: TasteSignal[] = movie.clips.slice(0, -1).map((clip) => ({
    field: 'transition',
    concept: clip.transitionKind ?? 'hardcut',
    strength: TASTE_SIGNAL_STRENGTH.final,
  }));
  return [
    ...(await contentSignalsOf(
      userId,
      movie.clips.map((clip) => clip.videoId),
      TASTE_SIGNAL_STRENGTH.final,
    )),
    ...transitions,
    { field: 'style', concept: movie.stylePreset, strength: TASTE_SIGNAL_STRENGTH.final },
  ];
}
