/**
 * 온톨로지의 편집 쪽 — 개념 사전 밖의 편집 사전들을 같은 그래프에 엮는다(docs/decisions/ontology-personalization.md §3.3).
 *
 *   효과음   sfx-vocabulary.json         SoundEffect(장면 소리) · SeamSound(이음 · 전환 소리), `evokedBy` → 내용 개념
 *   의성어   accent-vocabulary.json      Accent, `evokedBy` → 내용 개념
 *   움직임   motion-link-vocabulary.json CameraMotion, 연결 규칙은 MotionLink 개체(점수는 `linkScore`) + 지름길 `linksWellTo` · `linksBadlyTo`
 *   레시피   recipe-vocabulary.json      Recipe, `usesLook` → Look · `usesEffect` → CutEffect · `speedsUp` → 행동 개념 · 컷 고르기 · 잇기 전략
 *
 * 원천은 각 JSON 사전이다 — 여기는 그 값을 읽어 내보내기만 한다(개념 사전 판은 그대로라 추천 재사용 키에 영향이 없다).
 * 사전의 방향(효과음 → 개념)을 그대로 쓰고, 개념 → 효과음 방향은 `owl:inverseOf` 로만 선언한다(적힌 값은 한 곳에만 있다).
 */

/** 편집 클래스 → (IRI 접두, 클래스 이름, 그래프 색). */
export const EDITING_CLASSES = {
  sound: { prefix: 'sound', className: 'SoundEffect', label: '효과음', color: '#00897B' },
  seam: { prefix: 'seam', className: 'SeamSound', label: '이음 효과음', color: '#4DB6AC' },
  accent: { prefix: 'accent', className: 'Accent', label: '의성어 · 글', color: '#F4511E' },
  motion: { prefix: 'motion', className: 'CameraMotion', label: '카메라 움직임', color: '#3949AB' },
  recipe: { prefix: 'recipe', className: 'Recipe', label: '편집 레시피', color: '#212121' },
  look: { prefix: 'look', className: 'Look', label: '색감', color: '#C0CA33' },
  effect: { prefix: 'effect', className: 'CutEffect', label: '컷 효과', color: '#8D6E63' },
};

const local = (text) => String(text).replace(/[^A-Za-z0-9]+/g, '_');
const editIri = (kind, name) => `snaply:${EDITING_CLASSES[kind].prefix}_${local(name)}`;

/** 레시피가 가리키는 색감 — 'auto'(내용으로 고름)와 없음은 개체가 아니다. */
const looksOf = (recipes) => [...new Set(Object.values(recipes).map((r) => r.look).filter((l) => l && l !== 'auto'))];
const effectsOf = (recipes) => [...new Set(Object.values(recipes).flatMap((r) => Object.keys(r.transitions?.palette ?? {})))];

/** 편집 사전이 가리키는 것이 모두 있는지 — 개념 · 움직임 · 전환. */
export function checkEditing({ vocabulary, editing }) {
  const { sfx, accents, motionLinks, recipes } = editing;
  const evoked = (where, evokedBy) => {
    for (const [field, ids] of Object.entries(evokedBy ?? {})) {
      const concepts = vocabulary.concepts[field];
      if (!concepts) throw new Error(`${where}: 알 수 없는 필드 ${field}`);
      for (const id of ids) if (!concepts[id]) throw new Error(`${where}: 개념 ${field}.${id} 가 없습니다`);
    }
  };
  for (const [name, sound] of Object.entries(sfx.sounds)) evoked(`효과음 ${name}`, sound.evokedBy);
  for (const [name, accent] of Object.entries(accents.accents)) evoked(`의성어 ${name}`, accent.evokedBy);
  for (const link of motionLinks.links) {
    for (const motion of [link.from, link.to]) {
      if (!motionLinks.motions.includes(motion)) throw new Error(`움직임 연결 ${link.from}→${link.to}: 움직임 ${motion} 가 없습니다`);
    }
  }
  for (const [name, recipe] of Object.entries(recipes.recipes)) {
    for (const action of recipe.speed?.actions ?? []) {
      if (!vocabulary.concepts.actions[action]) throw new Error(`레시피 ${name}: 행동 ${action} 가 없습니다`);
    }
  }
}

/** Turtle 조각 — buildTurtle 이 클래스 · 관계 · 개체 자리에 끼운다. h 는 build.mjs 의 도우미(statement · literal · conceptIri · transitionIri). */
export function editingTurtle({ editing, transitionKinds }, h) {
  const { sfx, accents, motionLinks, recipes } = editing;
  const { statement, literal, conceptIri, transitionIri, out } = h;
  const evokedBy = (evoked) => Object.entries(evoked ?? {}).flatMap(([field, ids]) => ids.map((id) => conceptIri(field, id)));

  out.push('# ── 편집 클래스(효과음 · 의성어 · 움직임 · 레시피)\n');
  statement('snaply:EditElement', [
    ['a', ['owl:Class']],
    ['rdfs:label', [literal('편집 요소')]],
    ['rdfs:comment', [literal('개념 사전 밖의 편집 사전(효과음 · 의성어 · 움직임 연결 · 레시피)에서 온 개체.')]],
  ]);
  for (const [kind, { className, label }] of Object.entries(EDITING_CLASSES)) {
    statement(`snaply:${className}`, [
      ['a', ['owl:Class']],
      ['rdfs:subClassOf', [kind === 'seam' ? 'snaply:SoundEffect' : 'snaply:EditElement']],
      ['rdfs:label', [literal(label)]],
    ]);
  }
  statement('snaply:MotionLink', [
    ['a', ['owl:Class']],
    ['rdfs:label', [literal('움직임 연결 규칙')]],
    ['rdfs:comment', [literal('앞 컷 끝의 움직임 → 다음 컷 시작의 움직임과 그 점수(소프트 규칙 — 정의되지 않은 조합은 0).')]],
  ]);

  out.push('# ── 편집 관계\n');
  const property = (name, label, domain, range, comment, extra = []) =>
    statement(`snaply:${name}`, [
      ['a', ['owl:ObjectProperty']],
      ['rdfs:label', [literal(label)]],
      ['rdfs:domain', [domain]],
      ['rdfs:range', [range]],
      ['rdfs:comment', [literal(comment)]],
      ...extra,
    ]);
  property('evokedBy', '이 개념이 보이면 어울린다', 'snaply:EditElement', 'snaply:ContentConcept',
    '효과음 · 의성어가 어울리는 내용 개념(바삭 → 빵). 하위 개념에도 걸린다(읽기 규칙).');
  property('evokesEditElement', '어울리는 효과음 · 의성어', 'snaply:ContentConcept', 'snaply:EditElement',
    'evokedBy 의 역방향 — 적힌 값은 편집 사전에만 있다.', [['owl:inverseOf', ['snaply:evokedBy']]]);
  property('accompaniesTransition', '함께 나는 전환', 'snaply:SeamSound', 'snaply:Transition', '이음 효과음이 함께 나는 전환.');
  property('fromMotion', '앞 컷 끝 움직임', 'snaply:MotionLink', 'snaply:CameraMotion', '연결 규칙의 앞쪽.');
  property('toMotion', '다음 컷 시작 움직임', 'snaply:MotionLink', 'snaply:CameraMotion', '연결 규칙의 뒤쪽.');
  property('linksWellTo', '잘 이어진다', 'snaply:CameraMotion', 'snaply:CameraMotion', '점수가 0 보다 큰 연결(줌 인 → 줌 아웃).');
  property('linksBadlyTo', '어색하게 이어진다', 'snaply:CameraMotion', 'snaply:CameraMotion', '점수가 0 보다 작은 연결(반대 방향 팬).');
  property('usesLook', '색감', 'snaply:Recipe', 'snaply:Look', '레시피가 고정한 색감(auto 면 내용으로 고른다 — 관계 없음).');
  property('usesEffect', '쓰는 컷 효과', 'snaply:Recipe', 'snaply:CutEffect', '레시피의 전환 효과 팔레트.');
  property('speedsUp', '빠르게 하는 행동', 'snaply:Recipe', 'snaply:Action', '이 행동이 보이는 긴 컷을 배속한다.');
  for (const [name, label, domain, range, comment] of [
    ['linkScore', '연결 점수', 'snaply:MotionLink', 'xsd:decimal', '연결 점수 보정 — 더하면 잘 어울린다.'],
    ['cutStrategy', '컷 고르기', 'snaply:Recipe', 'xsd:string', 'continuity · zoom-pairs · motion-peaks · beats · action-span · steady.'],
    ['linkStrategy', '잇기 기준', 'snaply:Recipe', 'xsd:string', 'similar · contrast · chronological · rhythm.'],
  ]) {
    statement(`snaply:${name}`, [
      ['a', ['owl:DatatypeProperty']],
      ['rdfs:label', [literal(label)]],
      ['rdfs:domain', [domain]],
      ['rdfs:range', [range]],
      ['rdfs:comment', [literal(comment)]],
    ]);
  }

  out.push('# ── 효과음(sfx-vocabulary)\n');
  for (const [name, sound] of Object.entries(sfx.sounds)) {
    statement(editIri('sound', name), [
      ['a', ['snaply:SoundEffect', 'owl:NamedIndividual']],
      ['rdfs:label', [literal(sound.label)]],
      ['skos:notation', [literal(name, null)]],
      ['skos:altLabel', (sound.keywords ?? []).map((k) => literal(k))],
      ['snaply:evokedBy', evokedBy(sound.evokedBy)],
    ]);
  }
  for (const [kind, seam] of Object.entries(sfx.seams)) {
    const transition = kind.replace(/^fx-/, '');
    statement(editIri('seam', kind), [
      ['a', ['snaply:SeamSound', 'owl:NamedIndividual']],
      ['rdfs:label', [literal(kind, null)]],
      ['skos:notation', [literal(seam.file, null)]],
      ['snaply:accompaniesTransition', transitionKinds.includes(transition) ? [transitionIri(transition)] : []],
    ]);
  }

  out.push('# ── 의성어 · 글(accent-vocabulary)\n');
  for (const [name, accent] of Object.entries(accents.accents)) {
    statement(editIri('accent', name), [
      ['a', ['snaply:Accent', 'owl:NamedIndividual']],
      ['rdfs:label', [literal(accent.text)]],
      ['skos:notation', [literal(name, null)]],
      ['snaply:evokedBy', evokedBy(accent.evokedBy)],
    ]);
  }

  out.push('# ── 카메라 움직임 · 연결 규칙(motion-link-vocabulary)\n');
  for (const motion of motionLinks.motions) {
    const links = motionLinks.links.filter((l) => l.from === motion);
    statement(editIri('motion', motion), [
      ['a', ['snaply:CameraMotion', 'owl:NamedIndividual']],
      ['rdfs:label', [literal(motion, null)]],
      ['snaply:linksWellTo', links.filter((l) => l.score > 0).map((l) => editIri('motion', l.to))],
      ['snaply:linksBadlyTo', links.filter((l) => l.score < 0).map((l) => editIri('motion', l.to))],
    ]);
  }
  for (const link of motionLinks.links) {
    statement(`snaply:motionlink_${local(link.from)}__${local(link.to)}`, [
      ['a', ['snaply:MotionLink', 'owl:NamedIndividual']],
      ['snaply:fromMotion', [editIri('motion', link.from)]],
      ['snaply:toMotion', [editIri('motion', link.to)]],
      ['snaply:linkScore', [`"${link.score}"^^xsd:decimal`]],
      ['rdfs:comment', link._note ? [literal(link._note)] : []],
    ]);
  }

  out.push('# ── 레시피(recipe-vocabulary)\n');
  for (const look of looksOf(recipes.recipes)) {
    statement(editIri('look', look), [['a', ['snaply:Look', 'owl:NamedIndividual']], ['skos:notation', [literal(look, null)]]]);
  }
  for (const effect of effectsOf(recipes.recipes)) {
    statement(editIri('effect', effect), [['a', ['snaply:CutEffect', 'owl:NamedIndividual']], ['skos:notation', [literal(effect, null)]]]);
  }
  for (const [name, recipe] of Object.entries(recipes.recipes)) {
    statement(editIri('recipe', name), [
      ['a', ['snaply:Recipe', 'owl:NamedIndividual']],
      ['rdfs:label', [literal(recipe.label.split(' — ')[0])]],
      ['rdfs:comment', [literal(recipe.label)]],
      ['skos:notation', [literal(name, null)]],
      ['snaply:usesLook', recipe.look && recipe.look !== 'auto' ? [editIri('look', recipe.look)] : []],
      ['snaply:usesEffect', Object.keys(recipe.transitions?.palette ?? {}).map((e) => editIri('effect', e))],
      ['snaply:speedsUp', (recipe.speed?.actions ?? []).map((a) => conceptIri('actions', a))],
      ['snaply:cutStrategy', recipe.format?.cuts ? [literal(recipe.format.cuts, null)] : []],
      ['snaply:linkStrategy', recipe.format?.link ? [literal(recipe.format.link, null)] : []],
    ]);
  }
}

/** 그래프의 편집 노드 · 엣지. id 는 `<kind>:<name>`, 내용 개념은 `<field>:<id>`. */
export function editingGraph({ editing }, conceptId) {
  const { sfx, accents, motionLinks, recipes } = editing;
  const nodes = [];
  const edges = [];
  const evoked = (from, evokedBy) => {
    for (const [field, ids] of Object.entries(evokedBy ?? {})) for (const id of ids) edges.push({ from, to: conceptId(field, id), kind: 'evokedBy' });
  };
  for (const [name, sound] of Object.entries(sfx.sounds)) {
    nodes.push({ id: `sound:${name}`, label: sound.label, group: 'sound', title: `효과음 · ${name}` });
    evoked(`sound:${name}`, sound.evokedBy);
  }
  for (const [name, accent] of Object.entries(accents.accents)) {
    nodes.push({ id: `accent:${name}`, label: accent.text, group: 'accent', title: `의성어 · ${name}` });
    evoked(`accent:${name}`, accent.evokedBy);
  }
  for (const motion of motionLinks.motions) nodes.push({ id: `motion:${motion}`, label: motion, group: 'motion', title: '카메라 움직임' });
  for (const link of motionLinks.links) {
    edges.push({ from: `motion:${link.from}`, to: `motion:${link.to}`, kind: link.score > 0 ? 'linksWell' : 'linksBadly' });
  }
  for (const look of looksOf(recipes.recipes)) nodes.push({ id: `look:${look}`, label: look, group: 'look', title: '색감' });
  for (const [name, recipe] of Object.entries(recipes.recipes)) {
    nodes.push({ id: `recipe:${name}`, label: name, group: 'recipe', title: recipe.label });
    if (recipe.look && recipe.look !== 'auto') edges.push({ from: `recipe:${name}`, to: `look:${recipe.look}`, kind: 'recipe' });
    for (const action of recipe.speed?.actions ?? []) edges.push({ from: `recipe:${name}`, to: conceptId('actions', action), kind: 'recipe' });
  }
  return { nodes, edges };
}

export const EDITING_GROUPS = Object.fromEntries(
  ['sound', 'accent', 'motion', 'recipe', 'look'].map((kind) => [kind, { label: EDITING_CLASSES[kind].label, color: EDITING_CLASSES[kind].color }]),
);

export const EDITING_EDGE_KINDS = {
  evokedBy: { label: '어울리는 개념(효과음 · 의성어)', color: '#00897B', dashes: [6, 3] },
  linksWell: { label: '잘 이어지는 움직임', color: '#3949AB', dashes: false },
  linksBadly: { label: '어색한 움직임', color: '#E53935', dashes: [2, 2] },
  recipe: { label: '레시피 → 색감 · 배속 행동', color: '#212121', dashes: [1, 3] },
};

/** 편집 사전 넷을 읽는다 — 내보내기 · 테스트가 같은 경로로. */
export async function readEditing(root) {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const read = async (name) => JSON.parse(await readFile(join(root, 'packages/shared-types/src', `${name}.json`), 'utf-8'));
  const [sfx, accents, motionLinks, recipes] = await Promise.all(
    ['sfx-vocabulary', 'accent-vocabulary', 'motion-link-vocabulary', 'recipe-vocabulary'].map(read),
  );
  return { sfx, accents, motionLinks, recipes };
}
