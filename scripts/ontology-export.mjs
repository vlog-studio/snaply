#!/usr/bin/env node
/**
 * 개념 사전에서 발표용 온톨로지 파일을 만든다(backlog A-13 8단계, docs/decisions/ontology-personalization.md §3.3).
 *
 *   dist/ontology/snaply-ontology.ttl   OWL 온톨로지(Turtle) — 개념 · 상위 관계 · 별칭 · typicallyAt · evokes · suits · roleAffinity
 *   dist/ontology/snaply-ontology.html  그래프 시각화(브라우저로 연다)
 *
 * 원천은 `packages/shared-types/src/content-vocabulary.json` 이다. 결과는 생성물이라 커밋하지 않는다(`dist/` 는 무시된다).
 * 사전 값은 빌드된 `@vlog-studio/shared-types` 에서 읽으므로 `npm run ontology:export` 가 먼저 그 패키지를 빌드한다.
 *
 * 사용법:
 *   npm run ontology:export                 # dist/ontology/ 에 쓴다
 *   node scripts/ontology-export.mjs --out <dir>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTENT_VOCABULARY,
  CUT_ROLES,
  STYLE_PRESETS,
  TRANSITION_KINDS,
  TRANSITION_VOCABULARY,
} from '@vlog-studio/shared-types';
import { buildGraph, buildTurtle } from './ontology/build.mjs';
import { buildHtml } from './ontology/html.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? resolve(args[outIndex + 1]) : join(root, 'dist', 'ontology');

const input = {
  vocabulary: CONTENT_VOCABULARY,
  transitionKinds: [...TRANSITION_KINDS],
  transitionLabels: Object.fromEntries(Object.entries(TRANSITION_VOCABULARY.kinds).map(([kind, entry]) => [kind, entry.label])),
  stylePresets: [...STYLE_PRESETS],
  cutRoles: [...CUT_ROLES],
};

const turtle = buildTurtle(input);
const graph = buildGraph(input);
const html = buildHtml(graph, { version: CONTENT_VOCABULARY.contentVocabularyVersion });

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'snaply-ontology.ttl'), turtle, 'utf-8');
await writeFile(join(outDir, 'snaply-ontology.html'), html, 'utf-8');

console.log(`개념 ${graph.nodes.length}개 · 관계 ${graph.edges.length}개 (사전 v${CONTENT_VOCABULARY.contentVocabularyVersion})`);
console.log(`  ${join(outDir, 'snaply-ontology.ttl')}`);
console.log(`  ${join(outDir, 'snaply-ontology.html')}`);
