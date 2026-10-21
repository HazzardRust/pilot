/**
 * S3 of overview-one-ticket (spec 12-14; L9, A2): Red, Yellow and Green are each a `<details>`
 * served shut with its count in the `<summary>`; the groups a browser opened are kept in
 * `localStorage` per repository, put back on arrival and on every live swap; and the Tickets
 * bookmark no longer opens itself on a green ticket.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_TICKET, repoKey } from '../items.mjs';
import { listItems, registerRun } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { install as installLive } from '../ui/js/live.mjs';
import { aSandbox, loadPage, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const KEY = 'pilot.ticket-folds';

const aTicket = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state });
const tabPage = () =>
  renderHomePage(listItems(), [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }], REPO, false, {}, {}, Date.now());

/** Each group's fold, read off the element: its opening tag, its summary and the rows inside it. */
const groupsOf = (html) =>
  [...html.matchAll(/<details class="ticket-queue"([^>]*)><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>(?=<\/div>|<details class="ticket-queue"|<div class="queue-head"|$)/g)].map(
    ([, attributes, summary, body]) => ({ attributes, summary, rows: (body.match(/<li data-state=/g) ?? []).length }),
  );

test('each group is a details with its count in the summary, shut unless it holds the ticket in hand', (t) => {
  tempDeck(t);
  for (let at = 0; at < 20; at += 1) aTicket(`Red ${at}`, 'red');
  aTicket('Yellow 1', 'yellow');
  aTicket('Yellow 2', 'yellow');

  const groups = groupsOf(tabPage());
  assert.deepEqual(
    groups.map(({ summary }) => summary),
    ['Red <span class="count">20</span>', 'Yellow <span class="count">2</span>', 'Green <span class="count">0</span>'],
    'three headings, each with its count (spec 14)',
  );
  assert.deepEqual(groups.map(({ rows }) => rows), [20, 2, 0], 'the count matches the rows unfolded');
  for (const [at, state] of ['red', 'yellow', 'green'].entries()) {
    assert.ok(groups[at].attributes.includes(`data-queue="${state}"`), `the ${state} group says its state`);
    assert.ok(groups[at].attributes.includes(`data-repo="${repoKey(REPO)}"`), 'and its repository');
    // Nothing live, green or asked: the first red is in hand (L13), so Red alone is served open (spec 13).
    assert.equal(/\bopen\b/.test(groups[at].attributes), state === 'red', state === 'red' ? 'the in-hand group is served open' : 'served shut (spec 13)');
  }
});

test('the group holding the ticket in hand is served open and the others shut', (t) => {
  tempDeck(t);
  aTicket('Red 1', 'red');
  aTicket('Yellow 1', 'yellow');
  aTicket('Green 1', 'green');

  const groups = groupsOf(tabPage());
  assert.deepEqual(
    groups.map(({ attributes }) => [/\bopen\b/.test(attributes), attributes.includes('data-in-hand')]),
    [[true, true], [false, false], [true, true]],
    "Red and Green each hold their stage's ticket in hand (three-lanes spec 6), so both are served open and Yellow shut",
  );
});

/** A group as the browser holds it: its keys, whether it holds the ticket in hand, and whether it is open. */
const aGroup = (repo, queue, inHand = false) => ({ dataset: { repo, queue, ...(inHand && { inHand: '' }) }, open: false });

test('a refold with empty storage leaves the in-hand group open, and closing it is not remembered', () => {
  const groups = [aGroup('d:\\work\\pilot', 'red'), aGroup('d:\\work\\pilot', 'yellow', true), aGroup('d:\\work\\pilot', 'green')];
  const document = aDocument(groups);
  const localStorage = aStorage();
  loadPage(aSandbox({ document, localStorage }));
  assert.deepEqual(groups.map((group) => group.open), [false, true, false], 'Yellow holds the ticket in hand and arrives open');

  groups[1].open = false;
  toggle(document, groups[1]);
  assert.equal(localStorage.store.get(KEY), undefined, 'closing the in-hand group is not remembered');
});

/** A `localStorage` that keeps what is written to it, preset with `kept`. */
const aStorage = (kept) => {
  const store = new Map(kept === undefined ? [] : [[KEY, kept]]);
  return { store, getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
};

/** A document holding `groups`, recording the capture listeners the page registers on it. */
const aDocument = (groups) => {
  const listeners = [];
  return {
    listeners,
    querySelectorAll: (selector) => (selector === 'details.ticket-queue' ? groups : []),
    querySelector: () => null,
    addEventListener: (type, handler) => listeners.push({ type, handler }),
    body: { dataset: {} },
  };
};

const toggle = (document, details) => {
  for (const { type, handler } of document.listeners) if (type === 'toggle') handler({ target: details });
};

test('an opened group is remembered and re-opened on load', () => {
  const groups = [aGroup('d:\\work\\pilot', 'red'), aGroup('d:\\work\\pilot', 'yellow'), aGroup('d:\\work\\pilot', 'green')];
  const document = aDocument(groups);
  const localStorage = aStorage();
  loadPage(aSandbox({ document, localStorage }));

  groups[2].open = true;
  toggle(document, groups[2]);
  assert.deepEqual(JSON.parse(localStorage.store.get(KEY)), { 'd:\\work\\pilot': ['green'] }, 'the open group, per repository');

  const again = [aGroup('d:\\work\\pilot', 'red'), aGroup('d:\\work\\pilot', 'yellow'), aGroup('d:\\work\\pilot', 'green'), aGroup('d:\\work\\other', 'green')];
  loadPage(aSandbox({ document: aDocument(again), localStorage }));
  assert.deepEqual(again.map((group) => group.open), [false, false, true, false], 'Green is open after the reload, and only in its own repository');

  toggle(document, { dataset: {}, open: true });
  assert.deepEqual(JSON.parse(localStorage.store.get(KEY)), { 'd:\\work\\pilot': ['green'] }, 'a row\'s threads or spec toggling writes nothing');

  groups[2].open = false;
  toggle(document, groups[2]);
  assert.deepEqual(JSON.parse(localStorage.store.get(KEY)), { 'd:\\work\\pilot': [] }, 'and forgotten when shut');
});

test('a kept fold set that cannot be read leaves every group shut', () => {
  const groups = [aGroup('d:\\work\\pilot', 'green')];
  loadPage(aSandbox({ document: aDocument(groups), localStorage: aStorage('not json') }));
  assert.equal(groups[0].open, false);
});

test('a live swap keeps the opened groups open', async () => {
  const fresh = [aGroup('d:\\work\\pilot', 'red'), aGroup('d:\\work\\pilot', 'yellow')];
  const stream = {};
  loadPage(
    aSandbox({
      document: aDocument([]),
      localStorage: aStorage(JSON.stringify({ 'd:\\work\\pilot': ['yellow'] })),
      fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve('the page') }),
      DOMParser: function DOMParser() {
        this.parseFromString = () => ({ querySelectorAll: (selector) => (selector === 'details.ticket-queue' ? fresh : []), querySelector: () => null });
      },
      EventSource: function EventSource() {
        this.addEventListener = (type, handler) => {
          stream[type] = handler;
        };
      },
    }),
  );

  stream.changed({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fresh.map((group) => group.open), [false, true], 'the fetched page arrives with Yellow open, folded before it is compared');
});

test('the Tickets bookmark does not open itself on a green ticket', (t) => {
  tempDeck(t);
  aTicket('Broken', 'green');
  const html = tabPage();
  assert.match(html, /<details class="tab" id="tickets">/, 'Tickets stays where the user left it (A2)');
});
