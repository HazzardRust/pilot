/**
 * rune-deck-ui S12 (spec 2): the Status region as data. Its rows are the ones the HTML table draws for the
 * same record, and a `ticket` naming no held lane is dropped, never echoed. Every test owns its fixtures.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { statusView } = await import('../view/status.mjs');
const { viewOf } = await import('../view/index.mjs');
const { renderStrips } = await import('../ui/render-rail.mjs');
const { tabFor, tabsOf } = await import('../tabs.mjs');
const { repoKey } = await import('../runs.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const AT = '2026-10-15T10:00:00.000Z';

const aTicket = (id, state, over = {}) => ({ id, kind: 'ticket', state, title: `ticket ${id}`, body: '', repo: MINE, postedAt: AT, replies: [], ...over });
const aRun = () => ({ id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: AT, slices: [] });

const red = aTicket('itm_0000000000c1', 'red', { live: true, title: 'Plan the kettle' });
const yellow = aTicket('itm_0000000000c2', 'yellow', { title: 'Build the kettle' });
const green = aTicket('itm_0000000000c3', 'green', { live: true, title: 'Ship the kettle' });
/** A question the user owes on the yellow record's first slice: its row's `Yours` link. */
const asked = { id: 'itm_0000000000q1', kind: 'question', title: 'Which port?', body: 'A or B', repo: MINE, slice: 'S1 the yellow slice', postedAt: AT, replies: [], options: ['A', 'B'] };

const records = [
  {
    slug: 'build',
    ticket: yellow.id,
    slices: [
      { slice: 'S1 the yellow slice', state: 'implementing', branch: 'slice/s1', pr: 7 },
      { slice: 'S2 the second', state: 'planned', after: ['S1 the yellow slice'] },
    ],
  },
  { slug: 'ship', ticket: green.id, slices: [{ slice: 'S1 the green slice', state: 'merged' }] },
];

const reads = (items = [red, yellow, green, asked]) => ({
  seq: 1,
  items,
  runs: [aRun()],
  numbers: {},
  agents: {},
  added: [],
  lanes: { coPilots: { [repoKey(MINE)]: yellow.id }, switches: {}, records: records.map((record) => ({ repo: repoKey(MINE), record })) },
  held: [],
  alerts: {},
});

/** What the HTML Status table draws for `ticket`: each row's slice, state and Yours link. */
const pageRows = (ticket) => {
  const r = reads();
  const tab = tabFor(tabsOf(r.runs, r.items, r.numbers, r.agents, r.added, r.lanes), MINE);
  const html = renderStrips(tab, [tab], r.items, { ticket }).split('<tbody>')[1].split('</tbody>')[0];
  return [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(([, row]) => {
    const [slice, state, yours] = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(([, cell]) => cell);
    return { slice, state, href: yours.match(/href="([^"]*)"/)?.[1] };
  });
};

test('the rows are the page\'s', () => {
  const { rows } = statusView(reads(), { run: MINE, ticket: yellow.id });

  const drawn = rows.map(({ slice, state, href }) => ({ slice, state, href }));
  assert.deepEqual(drawn, pageRows(yellow.id));
  assert.equal(rows[0].href, `/thread/${asked.id}`, 'the Yours link is the thread');
  assert.deepEqual(rows[0], { slice: 'S1 the yellow slice', state: 'implementing', branch: 'slice/s1', pr: 7, href: `/thread/${asked.id}`, after: [] });
  assert.deepEqual(rows[1].after, ['S1 the yellow slice']);
});

test('the selector lists the held lanes with the chosen one marked', () => {
  const { tickets } = statusView(reads(), { run: MINE, ticket: green.id });

  assert.deepEqual(
    tickets.map(({ id, lane, chosen }) => ({ id, lane, chosen })),
    [
      { id: yellow.id, lane: 'implementing', chosen: false },
      { id: green.id, lane: 'concluding', chosen: true },
      { id: red.id, lane: 'planning', chosen: false },
    ],
  );
  assert.deepEqual(statusView(reads(), { run: MINE, ticket: green.id }).rows.map((row) => row.slice), ['S1 the green slice']);
});

test('a foreign ticket id is dropped', () => {
  const bogus = 'itm_bogus"><script>x</script>';
  const queued = aTicket('itm_0000000000c9', 'red');

  for (const ticket of [bogus, queued.id, null]) {
    const view = statusView(reads([red, yellow, green, queued, asked]), { run: MINE, ticket });
    assert.deepEqual(view.rows.map((row) => row.slice), ['S1 the yellow slice', 'S2 the second'], 'the default lane, implementing');
    assert.deepEqual(view.tickets.filter((one) => one.chosen).map((one) => one.id), [yellow.id]);
    assert.ok(!JSON.stringify(view).includes('bogus'), 'the unvalidated id is nowhere in the view');
  }
});

test('one held lane has no selector', () => {
  const lone = reads([yellow, aTicket('itm_0000000000d2', 'red')]);

  assert.deepEqual(statusView(lone, { run: MINE }).tickets, []);
  assert.deepEqual(statusView(lone, { run: MINE }).rows.map((row) => row.slice), ['S1 the yellow slice', 'S2 the second']);
});

test('a held ticket with no record has no rows', () => {
  assert.deepEqual(statusView(reads(), { run: MINE, ticket: red.id }).rows, []);
});

test('the region is the view\'s status', () => {
  const view = viewOf(reads(), { screen: 'home', run: MINE, ticket: green.id });

  assert.deepEqual(view.regions.status, statusView(reads(), { run: MINE, ticket: green.id }));
});
