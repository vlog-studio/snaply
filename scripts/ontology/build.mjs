/**
 * 개념 사전에서 발표용 온톨로지를 만든다 — 순수 함수다(파일 · 네트워크를 쓰지 않는다).
 *
 * **원천은 JSON 사전이고 이것은 생성물이다**(docs/decisions/ontology-personalization.md §3.3). 그래서 결과 파일은 커밋하지
 * 않고, 사전을 바꾸면 다시 만든다. 진입점은 `scripts/ontology-export.mjs`(`npm run ontology:export`).
 *
 * 모델: 개념마다 SKOS 개념이자 필드 클래스(Place · Object · …)의 개체다. 상위 개념은 `skos:broader`, 별칭은 `skos:altLabel`,
 * 관계(`typicallyAt` · `evokes` · `suits` · `roleAffinity`)는 `snaply:` 객체 속성이다. 사전의 "하위 개념은 상위 값을 물려받는다"는
 * 규칙은 OWL 로 펼치지 않는다 — 적힌 값만 낸다(물려받기는 코드의 읽기 규칙이다).
 *
 * 입력에 `editing`(편집 사전 넷 — 효과음 · 의성어 · 움직임 연결 · 레시피)이 있으면 편집 쪽 클래스 · 관계 · 개체도 같은 파일에 엮는다
 * (`editing.mjs`).
 */
import { checkEditing, EDITING_EDGE_KINDS, EDITING_GROUPS, editingGraph, editingTurtle } from './editing.mjs';

export const NAMESPACE = 'https://snaply.dweaxai.com/ontology#';

/** 필드 → (IRI 접두, 클래스 이름, 그래프 색). */
export const FIELD_CLASSES = {
  places: { prefix: 'place', className: 'Place', label: '장소', color: '#4C8BF5' },
  objects: { prefix: 'object', className: 'Object', label: '사물', color: '#34A853' },
  actions: { prefix: 'action', className: 'Action', label: '행동', color: '#F29900' },
  topics: { prefix: 'topic', className: 'Topic', label: '주제', color: '#A142F4' },
  moods: { prefix: 'mood', className: 'Mood', label: '분위기', color: '#E8336D' },
};

/** 스타일 프리셋의 IRI 이름. 앱의 스타일 키(`StylePresets`)와 같은 영어 이름을 쓴다. */
export const STYLE_NAMES = { 감성: 'emotional', 여행: 'travel', 일상: 'daily' };

const EDIT_CLASSES = {
  transition: { className: 'Transition', label: '전환', color: '#5F6368' },
  style: { className: 'StylePreset', label: '스타일', color: '#9AA0A6' },
  cutRole: { className: 'CutRole', label: '컷 역할', color: '#B0B3B8' },
};

const iri = (local) => `snaply:${local}`;
export const conceptIri = (field, id) => iri(`${FIELD_CLASSES[field].prefix}_${id}`);
const transitionIri = (kind) => iri(`transition_${kind}`);
const styleIri = (preset) => iri(`style_${STYLE_NAMES[preset]}`);
const roleIri = (role) => iri(`role_${role}`);

/** Turtle 문자열 리터럴 — 따옴표 · 역슬래시 · 줄바꿈만 이스케이프한다. */
export function literal(text, lang = 'ko') {
  const escaped = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return lang ? `"${escaped}"@${lang}` : `"${escaped}"`;
}

/**
 * 입력을 검사한다 — 관계가 가리키는 것이 모두 있는지. 사전 정합성 테스트가 이미 보지만, 내보내기는 다른 어휘(전환 · 스타일 ·
 * 컷 역할)를 함께 엮으므로 엮는 자리에서 한 번 더 막는다.
 */
function check({ vocabulary, transitionKinds, stylePresets, cutRoles, editing }) {
  if (editing) checkEditing({ vocabulary, editing });
  for (const preset of stylePresets) {
    if (!STYLE_NAMES[preset]) throw new Error(`스타일 프리셋 ${preset} 의 IRI 이름이 없습니다(STYLE_NAMES).`);
  }
  for (const [field, concepts] of Object.entries(vocabulary.concepts)) {
    if (!FIELD_CLASSES[field]) throw new Error(`알 수 없는 필드 ${field}`);
    for (const [id, concept] of Object.entries(concepts)) {
      const where = `${field}.${id}`;
      if (concept.parent && !concepts[concept.parent]) throw new Error(`${where}: 상위 ${concept.parent} 가 없습니다`);
      for (const place of concept.typicallyAt ?? []) {
        if (!vocabulary.concepts.places[place]) throw new Error(`${where}: 장소 ${place} 가 없습니다`);
      }
      for (const mood of concept.evokes ?? []) {
        if (!vocabulary.concepts.moods[mood]) throw new Error(`${where}: 분위기 ${mood} 가 없습니다`);
      }
      for (const kind of concept.suits?.transitions ?? []) {
        if (!transitionKinds.includes(kind)) throw new Error(`${where}: 전환 ${kind} 가 없습니다`);
      }
      for (const preset of concept.suits?.styles ?? []) {
        if (!stylePresets.includes(preset)) throw new Error(`${where}: 스타일 ${preset} 가 없습니다`);
      }
      if (concept.roleAffinity && !cutRoles.includes(concept.roleAffinity)) {
        throw new Error(`${where}: 컷 역할 ${concept.roleAffinity} 가 없습니다`);
      }
    }
  }
}

/**
 * OWL 온톨로지(Turtle).
 * @param {{ vocabulary: any, transitionKinds: string[], transitionLabels: Record<string, string>, stylePresets: string[], cutRoles: string[], editing?: any }} input
 */
export function buildTurtle(input) {
  check(input);
  const { vocabulary, transitionKinds, transitionLabels, stylePresets, cutRoles } = input;
  const out = [];
  const statement = (subject, pairs) => {
    const body = pairs.filter(([, objects]) => objects.length > 0).map(([predicate, objects]) => `    ${predicate} ${objects.join(', ')}`);
    out.push(`${subject}\n${body.join(' ;\n')} .\n`);
  };

  out.push(
    `@prefix snaply: <${NAMESPACE}> .`,
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '',
  );
  statement('<https://snaply.dweaxai.com/ontology>', [
    ['a', ['owl:Ontology']],
    ['rdfs:label', [literal('Snaply 스냅 내용 · 편집 온톨로지')]],
    ['rdfs:comment', [literal('packages/shared-types/src/ 의 개념 사전(content-vocabulary.json)과 편집 사전들(효과음 · 의성어 · 움직임 연결 · 레시피)에서 만든 생성물. 원천은 그 JSON 사전들이다.')]],
    ['owl:versionInfo', [literal(`content-vocabulary v${vocabulary.contentVocabularyVersion}`, null)]],
  ]);

  out.push('# ── 클래스\n');
  statement(iri('ContentConcept'), [
    ['a', ['owl:Class']],
    ['rdfs:label', [literal('스냅 내용 개념')]],
  ]);
  for (const { className, label } of Object.values(FIELD_CLASSES)) {
    statement(iri(className), [
      ['a', ['owl:Class']],
      ['rdfs:subClassOf', [iri('ContentConcept'), 'skos:Concept']],
      ['rdfs:label', [literal(label)]],
    ]);
  }
  for (const { className, label } of Object.values(EDIT_CLASSES)) {
    statement(iri(className), [
      ['a', ['owl:Class']],
      ['rdfs:label', [literal(label)]],
    ]);
  }

  out.push('# ── 관계\n');
  const property = (name, label, domain, range, comment) =>
    statement(iri(name), [
      ['a', ['owl:ObjectProperty']],
      ['rdfs:label', [literal(label)]],
      ['rdfs:domain', [domain]],
      ['rdfs:range', [range]],
      ['rdfs:comment', [literal(comment)]],
    ]);
  property('typicallyAt', '흔히 보이는 곳', iri('ContentConcept'), iri('Place'), '사물 · 행동 개념이 흔히 보이는 장소(커피 → 카페). 장소 추론과 취향 확장에 쓴다.');
  property('evokes', '자아내는 분위기', iri('ContentConcept'), iri('Mood'), '장소 · 사물 · 행동 개념이 자아내는 분위기(바다 → 청량함).');
  property('suitsTransition', '어울리는 전환', iri('Mood'), iri('Transition'), '분위기에 어울리는 전환. AI 가 경계의 전환을 고를 때 쓴다.');
  property('suitsStyle', '어울리는 스타일', iri('Mood'), iri('StylePreset'), '분위기에 어울리는 스타일 프리셋.');
  property('roleAffinity', '맡기 좋은 컷 역할', iri('ContentConcept'), iri('CutRole'), '이 개념이 보이는 컷이 맡기 좋은 컷 역할.');

  out.push('# ── 편집 개념\n');
  for (const kind of transitionKinds) {
    statement(transitionIri(kind), [
      ['a', [iri('Transition'), 'owl:NamedIndividual']],
      ['rdfs:label', [literal(transitionLabels[kind] ?? kind)]],
      ['skos:notation', [literal(kind, null)]],
    ]);
  }
  for (const preset of stylePresets) {
    statement(styleIri(preset), [
      ['a', [iri('StylePreset'), 'owl:NamedIndividual']],
      ['rdfs:label', [literal(preset)]],
    ]);
  }
  for (const role of cutRoles) {
    statement(roleIri(role), [
      ['a', [iri('CutRole'), 'owl:NamedIndividual']],
      ['skos:notation', [literal(role, null)]],
    ]);
  }

  for (const [field, concepts] of Object.entries(vocabulary.concepts)) {
    out.push(`# ── ${FIELD_CLASSES[field].label}(${field})\n`);
    for (const [id, concept] of Object.entries(concepts)) {
      statement(conceptIri(field, id), [
        ['a', [iri(FIELD_CLASSES[field].className), 'owl:NamedIndividual']],
        ['skos:prefLabel', [literal(concept.label)]],
        ['rdfs:label', [literal(concept.label)]],
        ['skos:altLabel', concept.aliases.map((alias) => literal(alias))],
        ['skos:notation', [literal(id, null)]],
        ['skos:broader', concept.parent ? [conceptIri(field, concept.parent)] : []],
        [iri('typicallyAt'), (concept.typicallyAt ?? []).map((place) => conceptIri('places', place))],
        [iri('evokes'), (concept.evokes ?? []).map((mood) => conceptIri('moods', mood))],
        [iri('suitsTransition'), (concept.suits?.transitions ?? []).map(transitionIri)],
        [iri('suitsStyle'), (concept.suits?.styles ?? []).map(styleIri)],
        [iri('roleAffinity'), concept.roleAffinity ? [roleIri(concept.roleAffinity)] : []],
      ]);
    }
  }
  if (input.editing) editingTurtle(input, { statement, literal, conceptIri, transitionIri, out });
  return out.join('\n');
}

/**
 * 그래프 시각화용 노드 · 엣지. 엣지 종류는 `broader` · `typicallyAt` · `evokes` · `suits`, 편집 사전이 있으면 `EDITING_EDGE_KINDS` 도.
 * @returns {{ nodes: Array<{id: string, label: string, group: string, title: string}>, edges: Array<{from: string, to: string, kind: string}> }}
 */
export function buildGraph(input) {
  check(input);
  const { vocabulary, transitionKinds, transitionLabels, stylePresets } = input;
  const nodes = [];
  const edges = [];
  const id = (field, concept) => `${field}:${concept}`;
  for (const [field, concepts] of Object.entries(vocabulary.concepts)) {
    for (const [conceptId, concept] of Object.entries(concepts)) {
      nodes.push({
        id: id(field, conceptId),
        label: concept.label,
        group: field,
        title: [`${FIELD_CLASSES[field].label} · ${conceptId}`, ...(concept.aliases.length ? [`별칭: ${concept.aliases.join(', ')}`] : [])].join('\n'),
      });
      if (concept.parent) edges.push({ from: id(field, conceptId), to: id(field, concept.parent), kind: 'broader' });
      for (const place of concept.typicallyAt ?? []) edges.push({ from: id(field, conceptId), to: id('places', place), kind: 'typicallyAt' });
      for (const mood of concept.evokes ?? []) edges.push({ from: id(field, conceptId), to: id('moods', mood), kind: 'evokes' });
      for (const kind of concept.suits?.transitions ?? []) edges.push({ from: id(field, conceptId), to: `transition:${kind}`, kind: 'suits' });
      for (const preset of concept.suits?.styles ?? []) edges.push({ from: id(field, conceptId), to: `style:${preset}`, kind: 'suits' });
    }
  }
  for (const kind of transitionKinds) {
    nodes.push({ id: `transition:${kind}`, label: transitionLabels[kind] ?? kind, group: 'transition', title: `전환 · ${kind}` });
  }
  for (const preset of stylePresets) {
    nodes.push({ id: `style:${preset}`, label: preset, group: 'style', title: '스타일 프리셋' });
  }
  if (input.editing) {
    const more = editingGraph(input, id);
    nodes.push(...more.nodes);
    edges.push(...more.edges);
  }
  return { nodes, edges };
}

/** 그래프 그룹의 색과 이름 — HTML 범례가 쓴다. */
export const GRAPH_GROUPS = {
  ...Object.fromEntries(Object.entries(FIELD_CLASSES).map(([field, { label, color }]) => [field, { label, color }])),
  transition: { label: EDIT_CLASSES.transition.label, color: EDIT_CLASSES.transition.color },
  style: { label: EDIT_CLASSES.style.label, color: EDIT_CLASSES.style.color },
  ...EDITING_GROUPS,
};

export const EDGE_KINDS = {
  broader: { label: '상위 개념', color: '#9AA0A6', dashes: false },
  typicallyAt: { label: '흔히 보이는 곳', color: '#4C8BF5', dashes: true },
  evokes: { label: '자아내는 분위기', color: '#E8336D', dashes: true },
  suits: { label: '어울리는 전환 · 스타일', color: '#5F6368', dashes: [2, 4] },
  ...EDITING_EDGE_KINDS,
};
