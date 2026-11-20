/**
 * rune-deck-ui S18: the history region is the page's: settled threads by day under Everything, and the
 * items screen's order (spec 2, 3). The clock is pinned; every test takes its own store directory.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { postItem, registerRun } = await import('../store.mjs');
const { daySections } = await import('../ui/render.mjs');
const { renderDeckPage } = await import('../ui/render-pages.mjs');
const { historyView } = await import('../view/history.mjs');
const { readDeck } = await import('../view/reads.mjs');

const NOW = new Date(2026, 8, 22, 12, 0, 0).getTime();
const ALPHA = 'D:/work/alpha';

const ask = (title) => postItem({ kind: 'question', title, body: 'A or B', repo: ALPHA, author: '' });
const settled = (title, postedAt) => ({
  id: `itm_${title}`, kind: 'note', title, body: '', repo: ALPHA, author: '', postedAt, resolvedAt: postedAt, replies: [],
});
const stamp = (back, hour = 9) => new Date(2026, 8, 22 - back, hour, 14).toISOString();

test('the days are the page\'s', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const reads = { ...readDeck(), items: [settled('new', stamp(0)), settled('old', stamp(1)), settled('older', stamp(40))] };
  const view = historyView(reads, { run: null, all: true, screen: 'home' }, NOW);
  const want = daySections(reads.items, NOW);

  assert.deepEqual(view.days.map(({ key, heading, open }) => ({ key, heading, open })),
    want.map(({ key, label, open }) => ({ key, heading: label, open })));
  assert.deepEqual(view.days.map((day) => day.cards.map((card) => card.id)),
    want.map((day) => day.items.map((item) => item.id)));
  assert.equal(view.days[0].open, true, 'today is served open');
  assert.equal(view.days[1].open, false);
});

test('nothing is settled-by-day without Everything', (t) => {
  tempDeck(t);
  const reads = { ...readDeck(), items: [settled('old', stamp(1))] };
  assert.deepEqual(historyView(reads, { run: null, all: false, screen: 'home' }, NOW).days, []);
});

test('the items screen lists everything', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const open = ask('Waiting');
  const reads = { ...readDeck(), items: [settled('a', stamp(3)), ...readDeck().items, settled('b', stamp(1))] };
  const view = historyView(reads, { run: null, all: false, screen: 'items' }, NOW);

  const ids = view.days.flatMap((day) => day.cards.map((card) => card.id));
  const page = [...renderDeckPage(reads.items, reads.runs).matchAll(/<h2><a href="\/thread\/([^"]+)">/g)]
    .map(([, id]) => decodeURIComponent(id));
  assert.deepEqual(ids, page);
  assert.equal(ids[0], open.id, 'the open queue first');
  assert.deepEqual(ids.filter((id) => id === 'itm_a' || id === 'itm_b'), ['itm_b', 'itm_a'], 'then the rest newest first');
  assert.deepEqual(view.runs.map(({ name, dismissable }) => ({ name, dismissable })), [{ name: 'alpha', dismissable: true }]);
  assert.match(view.runs[0].id, /^run_/);
});

test("a run's scope holds its own settled threads, never the open ones or another repo's", (t) => {
  tempDeck(t);
  const BETA = 'D:/work/beta';
  registerRun({ repo: ALPHA, pid: process.pid });
  registerRun({ repo: BETA, pid: process.pid });
  const open = ask('Waiting');
  const reads = { ...readDeck(), items: [...readDeck().items, settled('mine', stamp(0)), { ...settled('theirs', stamp(0)), repo: BETA }] };
  const idsOf = (run) => historyView(reads, { run, all: true, screen: 'home' }, NOW).days.flatMap((day) => day.cards.map((card) => card.id));

  assert.deepEqual(idsOf(ALPHA), ['itm_mine']);
  assert.deepEqual(idsOf(BETA), ['itm_theirs']);
  assert.deepEqual(idsOf(null).sort(), ['itm_mine', 'itm_theirs']);
  assert.ok(!idsOf(null).includes(open.id), "what is waiting is the queue's");
});
