/**
 * rune-deck-ui S13 (spec 2): the Status panel's git graph as data. Its lanes, rows and edges are the ones
 * `graphOf` lays out for the record the Status table shows, so the window draws and computes no layout.
 * Every test owns its fixtures.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { graphView } = await import('../view/graph.mjs');
const { viewOf } = await import('../view/index.mjs');
const { repoKey } = await import('../runs.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const AT = '2026-10-15T10:00:00.000Z';

const aTicket = (id, state, over = {}) => ({ id, kind: 'ticket', state, title: `ticket ${id}`, body: '', repo: MINE, postedAt: AT, replies: [], ...over });
const aRun = () => ({ id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: AT, slices: [] });

const yellow = aTicket('itm_0000000000c2', 'yellow', { title: 'Build the kettle' });

/** A fork and a convergence: S1 opens S2 and S3, and both close into S4. */
const slices = [
  { slice: 'S1 the base', state: 'merged' },
  { slice: 'S2 the left', state: 'implementing', after: ['S1'] },
  { slice: 'S3 the right', state: 'planned', after: ['S1'] },
  { slice: 'S4 the join', state: 'planned', after: ['S2', 'S3'] },
];

const reads = (table = slices) => ({
  seq: 1,
  items: [yellow],
  runs: [aRun()],
  numbers: {},
  agents: {},
  added: [],
  lanes: { coPilots: { [repoKey(MINE)]: yellow.id }, switches: {}, records: [{ repo: repoKey(MINE), record: { slug: 'build', ticket: yellow.id, slices: table } }] },
  held: [],
  alerts: {},
});

test('the graph is graphOf\'s', () => {
  const graph = graphView(reads(), { run: MINE, ticket: yellow.id });

  assert.deepEqual(graph, {
    lanes: 2,
    dots: [
      { slice: 'S1 the base', lane: 0, row: 0, state: 'done' },
      { slice: 'S2 the left', lane: 0, row: 1, state: 'doing' },
      { slice: 'S3 the right', lane: 1, row: 2, state: 'planned' },
      { slice: 'S4 the join', lane: 0, row: 3, state: 'planned' },
    ],
    // The fork bends onto lane 1, the convergence off it, and the last dot runs to the end point, row 4.
    edges: [
      { from: 0, to: 1, lane: 0 },
      { from: 0, to: 2, lane: 1 },
      { from: 1, to: 3, lane: 0 },
      { from: 2, to: 3, lane: 1 },
      { from: 3, to: 4, lane: 0 },
    ],
  });
});

test('a state with no phase is drawn as none', () => {
  const { dots } = graphView(reads([{ slice: 'S1 stuck', state: 'blocked on CI' }]), { run: MINE });

  assert.deepEqual(dots, [{ slice: 'S1 stuck', lane: 0, row: 0, state: '' }]);
});

test('no tab has no graph', () => {
  assert.deepEqual(graphView(reads(), { run: path.join('D:', 'work', 'elsewhere') }), { dots: [], edges: [], lanes: 0 });
});

test('the region is the view\'s graph', () => {
  const view = viewOf(reads(), { screen: 'home', run: MINE, ticket: yellow.id });

  assert.equal(view.regions.graph.lanes, 2);
  assert.deepEqual(view.regions.graph.dots.map((dot) => dot.slice), ['S1 the base', 'S2 the left', 'S3 the right', 'S4 the join']);
});
