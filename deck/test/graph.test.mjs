/**
 * The Tree panel draws a run as a git graph (slice-graph S1): each slice a dot
 * on a lane, forks and convergences as lines, and one end point every slice
 * nothing comes after merges into. The layout is a pure function of the flat
 * rows (`graphOf`, L1), so it is unit-tested without a browser; what the panel
 * draws is a claim about bytes, so the render half reads the page itself.
 *
 * The fixture is the user's own (architecture §2):
 * S1 → S2 ‖ S3 → S4 → S5 ‖ (S6 → S7) → S8, and S9 after S1 alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { blockersOf, graphOf, identifierOf, newSliceTable } = await import('../status.mjs');
const { renderHomePage } = await import('../ui/render.mjs');

const fixture = () => [
  { slice: 'S1 The walking skeleton', state: 'integrated' },
  { slice: 'S2 Left arm', state: 'implementing', after: ['S1'] },
  { slice: 'S3 Right arm', state: 'planned', after: ['S1'] },
  { slice: 'S4 Converge', state: 'planned', after: ['S2', 'S3'] },
  { slice: 'S5 Trunk', state: 'planned', after: ['S4'] },
  { slice: 'S6 Chain head', state: 'planned', after: ['S4'] },
  { slice: 'S7 Chain tail', state: 'planned', after: ['S6'] },
  { slice: 'S8 Join', state: 'planned', after: ['S5', 'S7'] },
  { slice: 'S9 Independent', state: 'planned', after: ['S1'] },
];

const lanesOf = (graph) => Object.fromEntries(graph.dots.map((dot) => [dot.id, dot.lane]));

/** The edges as `from→to` identifiers, the end point spelt `end`. */
const edgesOf = (graph) =>
  graph.edges.map((edge) => ({
    name: `${graph.dots[edge.from].id}→${graph.dots[edge.to]?.id ?? 'end'}`,
    lane: edge.lane,
  }));

const edge = (graph, name) => edgesOf(graph).find((found) => found.name === name);

const aRun = (slices) => ({
  id: 'run_000000000001',
  repo: path.join('D:', 'work', 'pilot'),
  name: 'pilot',
  pid: process.pid,
  startedAt: '2026-09-14T10:00:00.000Z',
  slices,
});

/** The Tree panel's own section of the home page. */
const panelOf = (slices) =>
  renderHomePage([], [aRun(slices)], null, false, {}, {})
    .split('<section class="tree">')[1]
    .split('</section>')[0];

const svgOf = (slices) => /<svg class="graph"[\s\S]*<\/svg>/.exec(panelOf(slices))?.[0] ?? '';

test("the user's fixture forks at S1 into three lanes", () => {
  const graph = graphOf(fixture());
  const lanes = lanesOf(graph);

  assert.deepEqual([lanes.S1, lanes.S2, lanes.S3, lanes.S9], [0, 0, 1, 2]);
  assert.equal(graph.lanes, 3);
  assert.deepEqual(edge(graph, 'S1→S3'), { name: 'S1→S3', lane: 1 });
  assert.deepEqual(edge(graph, 'S1→S9'), { name: 'S1→S9', lane: 2 });
});

test('S4 converges S2 and S3 on the leftmost lane', () => {
  const graph = graphOf(fixture());

  assert.equal(lanesOf(graph).S4, 0);
  assert.deepEqual(edge(graph, 'S3→S4'), { name: 'S3→S4', lane: 1 });
  assert.deepEqual(edge(graph, 'S2→S4'), { name: 'S2→S4', lane: 0 });
});

test('a chain keeps its lane beside its sibling', () => {
  const graph = graphOf(fixture());
  const lanes = lanesOf(graph);

  assert.deepEqual([lanes.S5, lanes.S6, lanes.S7, lanes.S8], [0, 1, 1, 0]);
  assert.deepEqual(edge(graph, 'S7→S8'), { name: 'S7→S8', lane: 1 });
});

test('every slice nothing comes after merges into the end point', () => {
  const graph = graphOf(fixture());
  const names = edgesOf(graph).map((found) => found.name);

  assert.deepEqual(edge(graph, 'S8→end'), { name: 'S8→end', lane: 0 });
  assert.deepEqual(edge(graph, 'S9→end'), { name: 'S9→end', lane: 2 });
  assert.equal(names.filter((name) => name.endsWith('→end')).length, 2);
  assert.ok(!names.includes('S9→S8'), 'S9 never meets a slice it does not block');
});

test('a blocker implied by another is not drawn', () => {
  const implied = fixture();
  implied[3] = { ...implied[3], after: ['S1', 'S2', 'S3'] };

  assert.deepEqual(graphOf(implied), graphOf(fixture()));
});

test('rows are topological, table order among the ready', () => {
  const graph = graphOf([
    { slice: 'S2 Second', after: ['S1 First'] },
    { slice: 'S3 Free' },
    { slice: 'S1 First' },
  ]);

  assert.deepEqual(
    graph.dots.map((dot) => [dot.id, dot.row]),
    [['S3', 0], ['S1', 1], ['S2', 2]],
  );
});

test('a chain written bottom up is drawn top down', () => {
  const graph = graphOf([{ slice: 'S3 c', after: ['S2'] }, { slice: 'S2 b', after: ['S1'] }, { slice: 'S1 a' }]);

  assert.deepEqual(graph.dots.map((dot) => dot.id), ['S1', 'S2', 'S3']);
});

test('an edge to a row with no dot passes through to its blockers (A7)', () => {
  const table = newSliceTable([
    { slice: 'S1 A' },
    { slice: 'Fix round', after: ['S1'] },
    { slice: 'S2 B', after: ['Fix round'] },
  ]);
  const graph = graphOf(table);

  assert.deepEqual(edgesOf(graph), [{ name: 'S1→S2', lane: 0 }, { name: 'S2→end', lane: 0 }]);
  assert.deepEqual(lanesOf(graph), { S1: 0, S2: 0 });
});

test('a stored cycle still renders, drawing the rows outside it', () => {
  const cycle = [{ slice: 'S1 a' }, { slice: 'S2 b', after: ['S3'] }, { slice: 'S3 c', after: ['S2'] }];

  assert.deepEqual(graphOf(cycle).dots.map((dot) => dot.id), ['S1']);
  assert.match(svgOf(cycle), /<text[^>]*>S1<tspan class="rest"> a<\/tspan><\/text>/);
  assert.deepEqual(blockersOf({ slice: 'S1', after: null }), []);
});

test('a string after reads as a one-item list', () => {
  const legacy = fixture().map((row) => (row.after?.length === 1 ? { ...row, after: row.after[0] } : row));

  assert.deepEqual(blockersOf({ slice: 'S2', after: 'S1' }), ['S1']);
  assert.deepEqual(blockersOf({ slice: 'S1' }), []);
  assert.deepEqual(graphOf(legacy), graphOf(fixture()));
});

test("the graph's only text is the identifiers", () => {
  const svg = svgOf([{ slice: 'Feature: the slice graph', state: 'planned' }, ...fixture()]);
  const texts = Array.from(svg.matchAll(/<text[^>]*>([^<]*)/g), (found) => found[1]);

  assert.deepEqual(texts, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);
  assert.equal((svg.match(/<g class="dot /g) ?? []).length, 9, 'no dot for the Feature row');
  assert.equal(identifierOf('Feature: the slice graph'), null);
  assert.equal(identifierOf('S12 Twelve'), 'S12');
  assert.equal(identifierOf('S1x not one'), null);
});

test("the full name follows the identifier on hover, at once, escaped (the user at Gate 2)", () => {
  const svg = svgOf([...fixture(), { slice: 'S10 Tom & Jerry', after: ['S9'] }]);
  const names = Array.from(svg.matchAll(/<text[^>]*>(S\d+)<tspan class="rest">(.*?)<\/tspan><\/text>/g), (found) => found[1] + found[2]);

  assert.equal(names.length, 10, 'one name per dot');
  assert.equal(names[0], 'S1 The walking skeleton');
  assert.equal(names[9], 'S10 Tom &amp; Jerry');
  assert.doesNotMatch(svg, /<title>/, 'no native tooltip, which waits a second before it shows');
});

test("a dot's whole row is its hover target, the name included (the user at Gate 2)", () => {
  const svg = svgOf(fixture());
  const width = /<svg class="graph" width="(\d+)"/.exec(svg)[1];
  const rows = Array.from(svg.matchAll(/<g class="dot [^"]*"><rect class="hit" x="0" y="[\d.]+" width="(\d+)" height="22"\/>/g));

  assert.equal(rows.length, 9, 'every dot carries a hit band under its circle');
  for (const [, band] of rows) assert.equal(band, width, 'the band spans the lanes and the label');
});

test('the graph scales to the panel and keeps no room for names (the user at Gate 2)', () => {
  const svg = svgOf(fixture());
  const [, width, height, box] = /<svg class="graph" width="(\d+)" height="(\d+)" viewBox="([^"]+)"/.exec(svg);
  const textX = Number(/<text x="(\d+)"/.exec(svg)[1]);
  const css = fs.readFileSync(new URL('../ui/deck.css', import.meta.url), 'utf8');

  assert.equal(box, `0 0 ${width} ${height}`, 'the viewBox is the drawing, so it scales as one');
  assert.equal(Number(width), textX + 4 * 14, 'the identifiers and nothing past them');
  assert.match(css, /\.graph \.dot \.rest \{ display: none; \}/, 'the name is shown over the page, not in the drawing');
  assert.match(css, /\.graph \{[^}]*width: 100%;[^}]*height: auto;/, 'the panel sets the width; the height follows');
});

test('a hovered dot names itself in a box over the page, and leaving the row hides it', async () => {
  const { install } = await import('../ui/js/graph-name.mjs');
  const on = {};
  const body = { appendChild: (el) => (body.box = el) };
  install({ document: { body, createElement: () => ({ style: {} }), addEventListener: (type, run) => (on[type] = run) } });
  const label = { textContent: 'S6 Chain head', getBoundingClientRect: () => ({ right: 120, top: 40, height: 16 }) };
  const dot = { querySelector: () => label, contains: (node) => node === label };
  const target = { closest: (selector) => (selector === 'svg.graph g.dot' ? dot : null) };

  on.mouseover({ target });
  assert.deepEqual([body.box.hidden, body.box.textContent, body.box.style.left, body.box.style.top], [false, 'S6 Chain head', '120px', '48px']);
  on.mouseout({ target, relatedTarget: label });
  assert.equal(body.box.hidden, false, 'moving within the row keeps it');
  on.mouseout({ target, relatedTarget: null });
  assert.equal(body.box.hidden, true);
});

test('row text drawn into the SVG is inert', () => {
  const panel = panelOf([
    { slice: 'S1 <img src=x onerror=alert(1)>', state: 'planned' },
    { slice: '<img src=x onerror=alert(1)> S1', state: 'planned' },
    { slice: `S2 "quoted" 'both'`, after: 'S1' },
  ]);
  const svg = /<svg class="graph"[\s\S]*<\/svg>/.exec(panel)[0];

  assert.match(svg, />S1<tspan class="rest"> &lt;img src=x onerror=alert\(1\)&gt;<\/tspan>/);
  assert.doesNotMatch(panel, /<img/i);
  assert.doesNotMatch(panel, /<[^>]*onerror=/i, 'no tag carries an onerror attribute');
  assert.equal((svg.match(/<g class="dot /g) ?? []).length, 2, 'the row with no leading identifier draws no dot');
  assert.equal((svg.match(/onerror/g) ?? []).length, 1, 'only the escaped name of the S1 row');
  // Every attribute in the SVG is geometry or a class: no row text rides in one.
  for (const [, value] of svg.matchAll(/="([^"]*)"/g)) assert.match(value, /^[\w .,-]*$/);
});

test("a dot's fill is its phase", () => {
  const svg = svgOf([
    { slice: 'S1 a', state: 'planned' },
    { slice: 'S2 b', state: 'implementing', after: 'S1' },
    { slice: 'S3 c', state: 'integrated', after: 'S2' },
    { slice: 'S4 d', state: 'blocked on CI', after: 'S3' },
  ]);

  assert.deepEqual(
    Array.from(svg.matchAll(/<g class="dot (\w+)"/g), (found) => found[1]),
    ['planned', 'doing', 'done', 'none'],
  );
});

test('every edge is one path, one end point, and a dot in progress has a core', () => {
  const svg = svgOf(fixture());

  assert.equal((svg.match(/<path /g) ?? []).length, graphOf(fixture()).edges.length);
  assert.equal((svg.match(/<circle class="end"/g) ?? []).length, 1);
  assert.match(svg, /<g class="dot doing">(?:(?!<\/g>).)*<circle class="core"/);
});

test('the graph folds nothing', () => {
  const panel = panelOf(fixture());

  assert.doesNotMatch(panel, /<details/, 'no disclosure in the Tree panel (spec 8)');
  assert.doesNotMatch(panel, /data-branch/, 'and no fold key to remember');
});
