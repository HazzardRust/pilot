/**
 * rune-deck-ui S7: the queue region of the view is the page's queue, its labels are the server's, and its state
 * lines run in phase order (spec 2, 6b, 11). Every test takes its own store directory; never port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFF_FAILED, KIND_HANDOFF, KIND_TICKET, askFor } from '../items.mjs';
import { postStored, tempDeck } from '../testUtils.mjs';

const { postItem, registerRun, setCoPilot } = await import('../store.mjs');
const { renderHomePage } = await import('../ui/render-pages.mjs');
const { queueView } = await import('../view/queue.mjs');
const { readDeck } = await import('../view/reads.mjs');

const ALPHA = 'D:/work/alpha';
const BETA = 'D:/work/beta';
const GAMMA = 'D:/work/gamma';

const ask = (title, repo, extra = {}) => postItem({ kind: 'question', title, body: 'A or B', repo, author: '', ...extra });

/** The thread ids of the page's cards, in the order the page draws them. */
const pageIds = (reads, run = null) =>
  [...renderHomePage(reads.items, reads.runs, run, false, reads.numbers, reads.agents, Date.now(), reads.added,
    null, null, reads.alerts, reads.lanes, reads.held).matchAll(/<article\b[^>]*>.*?<h2><a href="\/thread\/([^"]+)">/gs)]
    .map(([, id]) => decodeURIComponent(id));

test('the queue is the page\'s queue', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  registerRun({ repo: BETA, pid: process.pid });
  ask('First', BETA);
  ask('Second', ALPHA);
  ask('Third', BETA);
  const reads = readDeck();

  for (const run of [null, ALPHA, BETA]) {
    const ids = pageIds(reads, run);
    assert.ok(ids.length > 0, `the page draws cards for ${run}`);
    assert.deepEqual(queueView(reads, { run }).cards.map((card) => card.id), ids, `the scope ${run}`);
  }
});

test('labels come from the server', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  // Two live runs, so no sole run's tab is landed on and the overview labels each card.
  registerRun({ repo: BETA, pid: process.pid });
  const asked = ask('Which port?', ALPHA, { options: ['4321', '4322'] });
  // `steps` is a standing kind now, so a kind this code has never seen is swapped in.
  const unknown = ask('Do these', ALPHA);
  const reads = readDeck();
  reads.items = reads.items.map((item) => (item.id === unknown.id ? { ...item, kind: 'mystery' } : item));

  const cards = queueView(reads, {}).cards;
  const card = (id) => cards.find((each) => each.id === id);

  assert.equal(card(unknown.id).kind, 'mystery');
  assert.equal(card(unknown.id).state, 'posted');
  assert.equal(card(unknown.id).title, 'Do these');
  assert.deepEqual(card(unknown.id).options, [], 'an unknown kind offers no reply option');
  assert.equal(card(asked.id).kind, 'question');
  assert.deepEqual(card(asked.id).options, [
    { label: '4321', confirm: false },
    { label: '4322', confirm: false },
    { label: 'Teach me', confirm: false },
  ]);
  assert.equal(card(asked.id).tab.href, `/?run=${encodeURIComponent(ALPHA)}`, 'the overview names the card\'s tab');
});

test('a verdict\'s option carries the page\'s confirm step', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const signoff = postItem({ kind: 'signoff', title: 'Ship it?', body: 'Ready?', repo: ALPHA, author: '' });

  const card = queueView(readDeck(), { run: ALPHA }).cards.find((each) => each.id === signoff.id);

  // The page's own confirm row for a verdict's option: `Send “Sign off”?` and a Confirm (render-parts.mjs).
  assert.deepEqual(card.options.find((option) => option.label === 'Sign off'),
    { label: 'Sign off', confirm: true, ask: 'Send “Sign off”?', yes: 'Confirm' });
  assert.deepEqual(card.options.find((option) => option.label === 'Teach me'), { label: 'Teach me', confirm: false },
    'Teach me never confirms');
});

test('a handoff confirms Handoff failed with its kind\'s sentence', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const handoff = postItem({ kind: KIND_HANDOFF, title: 'Handoff', body: 'Stash at run.json.', repo: ALPHA });

  const { options } = queueView(readDeck(), { run: ALPHA }).cards.find((each) => each.id === handoff.id);

  // The row's one shared step comes after every button (render-parts.mjs `renderHandoffChoices`).
  assert.deepEqual(options.find((option) => option.label === HANDOFF_FAILED),
    { label: HANDOFF_FAILED, confirm: true, ask: askFor(KIND_HANDOFF), yes: 'Confirm' });
});

test('only the home screen has a queue: the thread and items pages draw no card and no state line', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const asked = ask('Which port?', ALPHA);
  const reads = readDeck();

  assert.equal(queueView(reads, { screen: 'home', run: ALPHA }).cards.length, 1, 'home has the card');
  for (const screen of ['thread', 'items']) {
    assert.deepEqual(queueView(reads, { screen, run: ALPHA, id: asked.id }), { cards: [], stateLines: [] }, screen);
  }
});

test('the lane lines are in phase order', (t) => {
  tempDeck(t);
  // Strip order is concluding, planning, implementing; the lines read planning, implementing, concluding.
  for (const [repo, state] of [[GAMMA, 'green'], [ALPHA, 'red'], [BETA, 'yellow']]) {
    registerRun({ repo, pid: process.pid });
    const ticket = postStored({ kind: KIND_TICKET, title: `${state} ticket`, body: 'x', repo, state, live: true });
    // An implementing ticket is the co-pilot's to hold, not the pilot's live one.
    if (state === 'yellow') setCoPilot(ticket.id, true);
  }

  const lines = queueView(readDeck(), {}).stateLines;

  assert.deepEqual(lines.map((line) => line.name), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(lines.map((line) => line.ticket), ['red ticket', undefined, 'green ticket']);
  assert.ok(lines.every((line) => typeof line.state === 'string' && line.state.length > 0));
});
