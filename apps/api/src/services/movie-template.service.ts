/**
 * 무비 템플릿 카탈로그 조회.
 *
 * 카탈로그는 유저 데이터가 아니라 제품 데이터이고, 행은 마이그레이션이 넣는다. 그래서 이
 * 서비스에는 쓰기 경로가 없다 — 문구·힌트 수정은 다음 마이그레이션의 UPDATE 로 한다
 * (docs/decisions/template-snap-recommendation.md §2).
 *
 * 슬롯의 `matchHints` 는 **여기서 응답으로 나가지 않는다.** 추천 점수화의 내부값이고, 앱이
 * 읽기 시작하면 가중치 조정이 다시 앱 릴리스에 묶인다.
 */
import {
  CONTENT_MATCH_FIELDS,
  isContentConcept,
  type ContentField,
  type MovieTemplate,
  type MovieTemplateCatalog,
  type StylePreset,
} from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { parseMatchHints } from './recommendation/score-slots.js';
import { buildTasteLookup, conceptsAffinity, type TasteLookup } from './taste/taste-affinity.js';
import { TASTE_TEMPLATE_EPSILON } from './taste/taste-policy.js';
import { readTasteProfile } from './taste/taste.service.js';

/** 카탈로그가 비어 있을 때의 `updatedAt`. 앱은 이 값으로 캐시를 갱신하지 않는다. */
const EMPTY_CATALOG_UPDATED_AT = new Date(0).toISOString();

/** 템플릿 슬롯 힌트의 개념들(중복 없이). 사전에 없는 id 는 뺀다. */
function hintConcepts(
  slots: ReadonlyArray<{ matchHints: unknown }>,
): Array<{ field: ContentField; concept: string }> {
  const seen = new Set<string>();
  const concepts: Array<{ field: ContentField; concept: string }> = [];
  for (const slot of slots) {
    const hints = parseMatchHints(slot.matchHints);
    for (const field of CONTENT_MATCH_FIELDS) {
      for (const concept of hints[field] ?? []) {
        const key = `${field}\n${concept}`;
        if (seen.has(key) || !isContentConcept(field, concept)) continue;
        seen.add(key);
        concepts.push({ field, concept });
      }
    }
  }
  return concepts;
}

/**
 * 취향이 맞는 템플릿을 앞으로 — 슬롯 힌트 개념들의 평균 취향 순(PRF-3). 비선호는 뒤로 갈 뿐 빠지지 않는다(PRF-2).
 * 차이가 `TASTE_TEMPLATE_EPSILON` 보다 작으면 카탈로그 순서를 지킨다 — 취향이 없는 사용자는 지금 순서 그대로다.
 * 앱은 지금 스냅으로 다 채울 수 있는 템플릿을 앞에 두고, 그 묶음과 나머지 묶음 안에서 이 순서를 따른다
 * (apps/mobile/docs/features/movie-templates.md).
 */
function orderByTaste<T extends { slots: ReadonlyArray<{ matchHints: unknown }> }>(rows: T[], lookup: TasteLookup): T[] {
  if (lookup.isEmpty()) return rows;
  const affinity = new Map(rows.map((row) => [row, conceptsAffinity(lookup, hintConcepts(row.slots))]));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const diff = affinity.get(b.row)! - affinity.get(a.row)!;
      return Math.abs(diff) >= TASTE_TEMPLATE_EPSILON ? diff : a.index - b.index;
    })
    .map(({ row }) => row);
}

/**
 * 내리지 않은 템플릿을 정렬 순서대로 — 사용자를 주면 그 취향으로 다시 놓는다(`orderByTaste`).
 *
 * `style` 은 DB 문자열을 그대로 통과시킨다. 서버가 편집 프리셋을 새로 추가했는데 앱이 아직
 * 모를 수 있고, 그 경우 **거르는 쪽은 앱**이다 — 여기서 걸러 버리면 새 프리셋을 아는 앱에도
 * 그 템플릿이 영영 보이지 않는다.
 */
export async function listMovieTemplates(userId?: string): Promise<MovieTemplateCatalog> {
  const catalog = await getPrisma().movieTemplate.findMany({
    where: { retiredAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      style: true,
      bgm: true,
      updatedAt: true,
      slots: {
        orderBy: { position: 'asc' },
        select: { slotId: true, label: true, hint: true, matchHints: true },
      },
    },
  });
  const rows = userId === undefined ? catalog : orderByTaste(catalog, buildTasteLookup(await readTasteProfile(userId)));

  const templates: MovieTemplate[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    style: row.style as StylePreset,
    bgm: row.bgm,
    slots: row.slots.map((slot) => ({
      id: slot.slotId,
      label: slot.label,
      hint: slot.hint,
    })),
  }));

  // 목록에서 가장 최근에 바뀐 시각. 한 템플릿의 문구만 고쳐도 앱 캐시가 갱신돼야 한다.
  const updatedAt = rows.reduce<number>(
    (latest, row) => Math.max(latest, row.updatedAt.getTime()),
    0,
  );

  return {
    updatedAt: updatedAt === 0 ? EMPTY_CATALOG_UPDATED_AT : new Date(updatedAt).toISOString(),
    templates,
  };
}
