/**
 * 발표용 그래프 페이지 — 한 파일짜리 HTML. 그래프 라이브러리(vis-network)만 CDN 에서 읽고 데이터는 페이지에 들어 있다.
 */
import { EDGE_KINDS, GRAPH_GROUPS } from './build.mjs';

const VIS_NETWORK = 'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js';

/** `</script>` 가 데이터 안에 있어도 페이지가 깨지지 않게 한다. */
const embed = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * @param {{ nodes: any[], edges: any[] }} graph `buildGraph` 의 결과
 * @param {{ version: number }} meta
 */
export function buildHtml(graph, meta) {
  const counts = Object.fromEntries(Object.keys(GRAPH_GROUPS).map((group) => [group, graph.nodes.filter((n) => n.group === group).length]));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snaply 온톨로지</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #202124; --muted: #5f6368; --panel: #f1f3f4; }
  @media (prefers-color-scheme: dark) { :root { --bg: #171717; --fg: #e8eaed; --muted: #9aa0a6; --panel: #262626; } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; background: var(--bg); color: var(--fg); }
  header { padding: 16px 20px 8px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0; color: var(--muted); font-size: 13px; }
  .bar { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 8px 20px; background: var(--panel); font-size: 13px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .line { width: 18px; border-top: 2px solid; display: inline-block; }
  input[type=search] { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--muted); background: var(--bg); color: var(--fg); min-width: 180px; }
  #graph { height: calc(100vh - 140px); min-height: 420px; }
</style>
</head>
<body>
<header>
  <h1>Snaply 온톨로지</h1>
  <p class="sub">스냅 내용(장소 · 사물 · 행동 · 주제 · 분위기)과 편집(전환 · 스타일)을 잇는 개념 사전 v${meta.version} — 개념 ${graph.nodes.length}개, 관계 ${graph.edges.length}개. 원천은 <code>content-vocabulary.json</code> 이고 이 페이지는 생성물이다.</p>
</header>
<div class="bar" id="legend"></div>
<div class="bar">
  <input type="search" id="search" placeholder="개념 찾기 (예: 카페)" aria-label="개념 찾기">
  <span id="edges"></span>
</div>
<div id="graph" role="img" aria-label="개념과 관계 그래프"></div>
<script src="${VIS_NETWORK}"></script>
<script>
  const graph = ${embed(graph)};
  const groups = ${embed(GRAPH_GROUPS)};
  const counts = ${embed(counts)};
  const edgeKinds = ${embed(EDGE_KINDS)};

  document.getElementById('legend').innerHTML = Object.entries(groups)
    .map(([key, g]) => '<span class="chip"><span class="dot" style="background:' + g.color + '"></span>' + g.label + ' ' + counts[key] + '</span>')
    .join('');

  const shown = new Set(Object.keys(edgeKinds));
  const edgeBar = document.getElementById('edges');
  edgeBar.innerHTML = Object.entries(edgeKinds)
    .map(([key, k]) => '<label class="chip"><input type="checkbox" data-kind="' + key + '" checked><span class="line" style="border-color:' + k.color + (k.dashes ? ';border-top-style:dashed' : '') + '"></span>' + k.label + '</label>')
    .join('');

  const nodes = new vis.DataSet(graph.nodes.map((n) => ({ ...n, color: groups[n.group].color, font: { color: getComputedStyle(document.body).color } })));
  const allEdges = graph.edges.map((e, i) => ({
    id: i, from: e.from, to: e.to, kind: e.kind, arrows: 'to',
    color: { color: edgeKinds[e.kind].color, opacity: 0.7 }, dashes: edgeKinds[e.kind].dashes,
  }));
  const edges = new vis.DataSet(allEdges);
  const network = new vis.Network(document.getElementById('graph'), { nodes, edges }, {
    nodes: { shape: 'dot', size: 12, font: { size: 14 } },
    edges: { width: 1.2, smooth: { type: 'continuous' } },
    // 관계가 없는 개념(주제 대부분)이 멀리 흩어지지 않게 가운데로 모은다.
    physics: { barnesHut: { gravitationalConstant: -4000, centralGravity: 0.9, springLength: 100 }, stabilization: { iterations: 400 } },
    interaction: { hover: true, tooltipDelay: 120 },
  });
  network.once('stabilizationIterationsDone', () => network.fit());

  edgeBar.addEventListener('change', (event) => {
    const kind = event.target.dataset.kind;
    if (!kind) return;
    event.target.checked ? shown.add(kind) : shown.delete(kind);
    edges.clear();
    edges.add(allEdges.filter((e) => shown.has(e.kind)));
  });

  document.getElementById('search').addEventListener('input', (event) => {
    const query = event.target.value.trim();
    if (!query) { network.unselectAll(); return; }
    const hit = graph.nodes.find((n) => n.label.includes(query) || n.title.includes(query));
    if (hit) { network.selectNodes([hit.id]); network.focus(hit.id, { scale: 1.4, animation: true }); }
  });
</script>
</body>
</html>
`;
}
