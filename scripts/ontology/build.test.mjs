/**
 * 발표용 온톨로지 내보내기(`build.mjs` · `html.mjs`). 실제 사전으로 만든다 — 사전이 바뀌어도 내보내기가 깨지지 않는지 본다.
 * `npm run ontology:test` 로 돈다(shared-types 를 먼저 빌드한다). Turtle 문법은 RDF 파서로 따로 확인했다(progress 2026-10-13).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_VOCABULARY,
  CUT_ROLES,
  STYLE_PRESETS,
  TRANSITION_KINDS,
  TRANSITION_VOCABULARY,
} from '@vlog-studio/shared-types';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, buildTurtle, conceptIri, literal } from './build.mjs';
import { readEditing } from './editing.mjs';
import { buildHtml } from './html.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const input = {
  vocabulary: CONTENT_VOCABULARY,
  transitionKinds: [...TRANSITION_KINDS],
  transitionLabels: Object.fromEntries(Object.entries(TRANSITION_VOCABULARY.kinds).map(([kind, entry]) => [kind, entry.label])),
  stylePresets: [...STYLE_PRESETS],
  cutRoles: [...CUT_ROLES],
  editing: await readEditing(root),
};

test('declares every concept once with its label, aliases and parent', () => {
  const turtle = buildTurtle(input);
  for (const [field, concepts] of Object.entries(CONTENT_VOCABULARY.concepts)) {
    for (const [id, concept] of Object.entries(concepts)) {
      const subject = `${conceptIri(field, id)}\n`;
      assert.equal(turtle.split(subject).length - 1, 1, `${field}.${id}`);
      assert.ok(turtle.includes(`skos:prefLabel ${literal(concept.label)}`), `${field}.${id} label`);
    }
  }
  assert.match(turtle, /snaply:place_cafe\n[^.]*skos:broader snaply:place_shop/);
  assert.match(turtle, /snaply:object_coffee\n[^.]*snaply:typicallyAt snaply:place_cafe/);
  assert.match(turtle, /snaply:mood_calm\n[^.]*snaply:suitsTransition snaply:transition_crossfade/);
});

test('every IRI the file uses is declared in it', () => {
  const turtle = buildTurtle(input);
  const used = new Set(turtle.match(/snaply:[A-Za-z_]+/g));
  const declared = new Set([...turtle.matchAll(/^(snaply:[A-Za-z_]+)\n/gm)].map((match) => match[1]));
  for (const name of used) assert.ok(declared.has(name), `${name} 가 선언되지 않았습니다`);
});

test('escapes quotes in literals', () => {
  assert.equal(literal('그 "카페"'), '"그 \\"카페\\""@ko');
  assert.equal(literal('v1', null), '"v1"');
});

test('refuses a relation to something that does not exist', () => {
  const broken = structuredClone(CONTENT_VOCABULARY);
  broken.concepts.objects.coffee.typicallyAt = ['nowhere'];
  assert.throws(() => buildTurtle({ ...input, vocabulary: broken }), /nowhere/);
});

test('draws every concept and relation in the graph', () => {
  const graph = buildGraph(input);
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from) && ids.has(edge.to), `${edge.from} → ${edge.to}`);
  }
  const concepts = Object.values(CONTENT_VOCABULARY.concepts).reduce((sum, field) => sum + Object.keys(field).length, 0);
  const { sfx, accents, motionLinks, recipes } = input.editing;
  const looks = new Set(Object.values(recipes.recipes).map((r) => r.look).filter((l) => l && l !== 'auto'));
  const editing = Object.keys(sfx.sounds).length + Object.keys(accents.accents).length + motionLinks.motions.length
    + Object.keys(recipes.recipes).length + looks.size;
  assert.equal(graph.nodes.length, concepts + TRANSITION_KINDS.length + STYLE_PRESETS.length + editing);
});

test('embeds the graph in a page that a closing script tag cannot break', () => {
  const graph = buildGraph(input);
  graph.nodes[0] = { ...graph.nodes[0], title: '</script><b>x</b>' };
  const html = buildHtml(graph, { version: 1 });
  assert.equal(html.split('</script>').length - 1, 2);
  assert.ok(html.includes('vis-network@9.1.9'));
});

test('links the editing dictionaries — sounds and accents to concepts, motion rules, recipes', () => {
  const turtle = buildTurtle(input);
  assert.match(turtle, /snaply:sound_crunch\n[^.]*snaply:evokedBy snaply:object_bread/);
  assert.match(turtle, /snaply:accent_gulp\n[^.]*snaply:evokedBy [^.]*snaply:action_drink/);
  assert.match(turtle, /snaply:motion_zoom_in\n[^.]*snaply:linksWellTo snaply:motion_zoom_out/);
  assert.match(turtle, /snaply:motion_pan_left\n[^.]*snaply:linksBadlyTo snaply:motion_pan_right/);
  assert.match(turtle, /snaply:motionlink_zoom_in__zoom_out\n[^.]*snaply:linkScore "1"\^\^xsd:decimal/);
  assert.match(turtle, /snaply:recipe_cinematic\n[^]*?snaply:usesLook snaply:look_soft/);
  assert.match(turtle, /snaply:seam_fx_flash\n[^]*?snaply:accompaniesTransition snaply:transition_flash/);
  assert.match(turtle, /snaply:evokesEditElement\n[^]*?owl:inverseOf snaply:evokedBy/);
});

test('refuses an editing link to a concept that does not exist', () => {
  const broken = structuredClone(input.editing);
  broken.sfx.sounds.crunch.evokedBy = { objects: ['nowhere'] };
  assert.throws(() => buildTurtle({ ...input, editing: broken }), /nowhere/);
});
