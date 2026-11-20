/**
 * rune-deck-ui S15 (spec 2, 3): the Tickets panel as data. Its three queues, rows, arrows and Continue states
 * are the ones the page's `renderStrips` draws for the same reads.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ticketsView } = await import('../view/tickets.mjs');
const { viewOf } = await import('../view/index.mjs');
const { renderStrips } = await import('../ui/render-rail.mjs');
const { tabFor, tabsOf } = await import('../tabs.mjs');
const { repoKey } = await import('../items.mjs');

const MINE = 'C:/work/pilot';
const AT = '2026-11-20T10:00:00.000Z';

const aTicket = (id, state, over = {}) => ({
  id, kind: 'ticket', title: `ticket ${id}`, body: 'spec', repo: MINE, state, postedAt: AT, replies: [], ...over,
});

const reads = (items, switches = {}) => ({
  seq: 1, items, runs: [{ repo: MINE, startedAt: AT, pid: process.pid }], numbers: {}, agents: {}, added: [],
  lanes: { coPilots: {}, switches, records: [] }, held: [], alerts: {},
});

/** The page's own Tickets panel for these reads: per queue, each row's title, state label, arrows and Continue. */
function pageRows(r) {
  const tabs = tabsOf(r.runs, r.items, r.numbers, r.agents, r.added, r.lanes);
  const html = renderStrips(tabFor(tabs, MINE), tabs, r.items);
  return Object.fromEntries(
    html.split('<details class="ticket-queue" data-queue="').slice(1).map((queue) => {
      const colour = queue.slice(0, queue.indexOf('"'));
      const rows = [...queue.matchAll(/<li data-state[^>]*>(.*?)<details class="body">/gs)].map(([, row]) => ({
        name: row.match(/<a href="\/thread\/[^"]*">([^<]*)<\/a>/)[1],
        state: row.match(/<span class="ticket-state"[^>]*>([^<]*)</)[1],
        up: /value="up"(?! title="Move up" aria-label="Move up" disabled)/.test(row),
        down: /value="down"(?! title="Move down" aria-label="Move down" disabled)/.test(row),
        switch: row.match(/data-switch="(\w+)"/)?.[1] ?? null,
      }));
      return [colour, rows];
    }),
  );
}

const flat = (view) =>
  Object.fromEntries(
    view.groups.map(({ colour, rows }) => [
      colour,
      rows.map(({ name, state, canMove, switch: swap }) => ({ name, state, up: canMove.up, down: canMove.down, switch: swap })),
    ]),
  );

test('the queues are the page\'s', () => {
  const items = [
    aTicket('itm_0000000000r1', 'red'),
    aTicket('itm_0000000000r2', 'red'),
    aTicket('itm_0000000000r3', 'red'),
    aTicket('itm_0000000000y1', 'yellow'),
    aTicket('itm_0000000000g1', 'green'),
  ];
  // A switch pending to r3 on the main lane: r3 is lit, every other red Continue locked and the red arrows with it.
  const r = reads(items, { [repoKey(MINE)]: { main: { to: 'itm_0000000000r3', from: null, at: AT } } });

  const view = ticketsView(r, { run: MINE });

  assert.deepEqual(view.groups.map(({ colour, label }) => [colour, label]), [['red', 'Red'], ['yellow', 'Yellow'], ['green', 'Green']]);
  assert.deepEqual(flat(view), {
    red: [
      { name: 'ticket itm_0000000000r1', state: 'planning', up: false, down: false, switch: 'locked' },
      { name: 'ticket itm_0000000000r2', state: 'planning', up: false, down: false, switch: 'locked' },
      { name: 'ticket itm_0000000000r3', state: 'planning', up: false, down: false, switch: 'pending' },
    ],
    yellow: [{ name: 'ticket itm_0000000000y1', state: 'planned', up: false, down: false, switch: 'idle' }],
    green: [{ name: 'ticket itm_0000000000g1', state: 'needs you', up: false, down: false, switch: null }],
  });
  assert.deepEqual(flat(view), pageRows(r), 'the page draws the same rows');
  assert.equal(view.groups[0].rows[0].href, '/thread/itm_0000000000r1');
  assert.equal(view.repo, MINE);
});

test('with no switch pending the arrows move within a queue', () => {
  const r = reads([aTicket('itm_0000000000r1', 'red'), aTicket('itm_0000000000r2', 'red'), aTicket('itm_0000000000r3', 'red')]);

  const [red] = ticketsView(r, { run: MINE }).groups;

  assert.deepEqual(red.rows.map(({ canMove }) => canMove), [
    { up: false, down: true },
    { up: true, down: true },
    { up: true, down: false },
  ]);
  assert.deepEqual(red.rows.map(({ switch: swap }) => swap), [null, 'idle', 'idle'], 'the next ticket is in hand');
  assert.deepEqual(flat(ticketsView(r, { run: MINE })), pageRows(r));
});

test('a deck with no tickets has empty queues, and the overview none', () => {
  assert.deepEqual(ticketsView(reads([]), { run: MINE }).groups.map(({ rows }) => rows), [[], [], []]);
  assert.deepEqual(ticketsView({ ...reads([]), runs: [] }, {}), { repo: null, groups: [] });
  assert.deepEqual(viewOf(reads([aTicket('itm_0000000000r1', 'red')]), { screen: 'home', run: MINE }).regions.tickets.groups[0].rows.length, 1);
});
