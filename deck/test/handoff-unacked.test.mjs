/**
 * Thread-kinds S9, spec 19, 21; L7, A8.
 *
 * Silence on a hand-off is a state. A hand-off nobody from the pilot has said a word on
 * for `HANDOFF_ACK_MS` reads `unacknowledged` on its card, its thread and its tab; the
 * pilot's reply (S8's acknowledgement) ends it, and a chain hand-off the lane resolved
 * never reads it. Derived from the clock and the thread, never stored or swept: the
 * daemon's only part is one one-shot timer per open hand-off, so the page repaints when
 * the hand-off crosses the interval without anybody reloading it.
 *
 * The clock is each test's own (`mock.timers`). Never port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addPilotMessage, addReply, listItems, postItem, resolveItem, storeFile } = await import('../store.mjs');
const { HANDOFF_ACK_MS, isUnacknowledged, threadState } = await import('../items.mjs');
const { tabsOf } = await import('../tabs.mjs');
const { createDeckHttpServer } = await import('../server.mjs');
const { renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

const MINUTE = 60_000;
const START = Date.parse('2026-10-01T10:00:00Z');
const A = path.join('D:', 'work', 'alpha');
const B = path.join('D:', 'work', 'beta');

const handoff = (over = {}) => ({
  id: 'itm_h',
  kind: 'handoff',
  title: 'Context is at 40%',
  body: 'b',
  repo: A,
  postedAt: new Date(START).toISOString(),
  replies: [],
  ...over,
});

const reread = (id) => listItems().find((item) => item.id === id);
const stateSpan = (html) => /<span class="state" data-state="([a-z]+)">([^<]*)<\/span>/.exec(html);

test('a hand-off 3 min old with no pilot message is unacknowledged', () => {
  assert.equal(HANDOFF_ACK_MS, 3 * MINUTE);
  assert.equal(isUnacknowledged(handoff(), START + 3 * MINUTE), true);
  assert.equal(threadState(handoff(), START + 3 * MINUTE), 'unacknowledged');
});

test('a hand-off 2 min old is not', () => {
  assert.equal(isUnacknowledged(handoff(), START + 2 * MINUTE), false);
  assert.equal(isUnacknowledged(handoff(), START + 3 * MINUTE - 1), false, 'one millisecond short of the interval');
  assert.equal(threadState(handoff(), START + 2 * MINUTE), 'posted');
});

test('only a hand-off: a question as old is not unacknowledged', () => {
  assert.equal(isUnacknowledged(handoff({ kind: 'question' }), START + 10 * MINUTE), false);
  assert.equal(isUnacknowledged(handoff({ kind: 'crew-handoff' }), START + 10 * MINUTE), false);
});

test('a pilot reply ends it', () => {
  const said = handoff({ replies: [{ from: 'pilot', text: 'Picked up.', repliedAt: new Date(START + MINUTE).toISOString() }] });
  assert.equal(isUnacknowledged(said, START + 10 * MINUTE), false);
  assert.equal(threadState(said, START + 10 * MINUTE), 'the pilot replied');
});

test("the user's reply is not the pilot's", () => {
  const pressed = handoff({ replies: [{ from: 'user', text: 'Handoff failed', repliedAt: new Date(START).toISOString() }] });
  assert.equal(isUnacknowledged(pressed, START + 3 * MINUTE), true);
});

test('a resolved chain hand-off is never unacknowledged', () => {
  const chained = handoff({ next: 'itm_ticket', resolvedAt: new Date(START + MINUTE).toISOString(), resolution: 'Closed.' });
  assert.equal(isUnacknowledged(chained, START + 60 * MINUTE), false);
  assert.equal(threadState(chained, START + 60 * MINUTE), 'resolved');
});

test('a hand-off with no readable postedAt is never unacknowledged', () => {
  assert.equal(isUnacknowledged(handoff({ postedAt: undefined }), START + 60 * MINUTE), false);
});

test('threadState names it and the card and thread draw it', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const item = postItem({ kind: 'handoff', title: 'Context is at 40%', body: 'b', repo: A });

  assert.equal(stateSpan(renderThreadPage(reread(item.id)))?.[2], 'posted', 'fresh, it is merely posted');

  t.mock.timers.tick(HANDOFF_ACK_MS);
  const thread = stateSpan(renderThreadPage(reread(item.id)));
  assert.deepEqual([thread?.[1], thread?.[2]], ['unacknowledged', 'unacknowledged'], 'the thread draws it in its own colour');
  const card = stateSpan(renderHomePage(listItems(), [], null));
  assert.deepEqual([card?.[1], card?.[2]], ['unacknowledged', 'unacknowledged'], 'the card says it the same way');

  addPilotMessage(item.id, 'On it.', '');
  assert.equal(stateSpan(renderThreadPage(reread(item.id)))?.[2], 'the pilot replied');
});

test('the tab carries unacknowledged while one is open in its directory', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const item = postItem({ kind: 'handoff', title: 'Context is at 40%', body: 'b', repo: A });
  postItem({ kind: 'question', title: 'Which port?', body: '?', repo: B });
  const tab = (repo) => tabsOf([], listItems()).find((each) => each.repo === repo);

  assert.equal(tab(A).unacknowledged, false, 'not before the interval');
  t.mock.timers.tick(HANDOFF_ACK_MS);
  assert.equal(tab(A).unacknowledged, true);
  assert.equal(tab(B).unacknowledged, false, "another directory's tab is not marked");
  assert.match(
    renderHomePage(listItems(), [], null),
    /<nav class="runs-strip"[^]*?<span class="unacked"[^>]*>unacknowledged<\/span>[^]*?<\/nav>/,
    'the strip marks the tab',
  );

  addReply(item.id, 'Handoff failed');
  assert.equal(tab(A).unacknowledged, true, "the user's press is not the pilot's word");
  resolveItem(item.id, 'Closed.');
  assert.equal(tab(A), undefined, 'closed, the tab has nothing open and no run, so it is gone with its mark');
});

/** A page's `/events` stream: how many `changed` events it has been sent. */
function listen(base) {
  const seen = { changed: 0 };
  return new Promise((resolve, reject) => {
    const request = http.get(`${base}/events`, { agent: false }, (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk) => (seen.changed += chunk.split('event: changed').length - 1));
      resolve({ seen, close: () => request.destroy() });
    });
    request.on('error', reject);
  });
}

const callApi = (base, name, args) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/tool`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (response) => {
      response.resume();
      response.on('end', resolve);
    });
    request.on('error', reject);
    request.end(JSON.stringify({ name, arguments: args }));
  });

const settleLoop = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

test('the daemon repaints when a hand-off crosses the interval', async (t) => {
  const base = await deckOnAPort(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const page = await listen(base);
  t.after(() => page.close());

  await callApi(base, 'deck_post', { kind: 'handoff', title: 'Context is at 40%', body: 'b', repo: A });
  await settleLoop();
  const afterPost = page.seen.changed;
  assert.ok(afterPost >= 1, 'the post itself is announced');

  t.mock.timers.tick(HANDOFF_ACK_MS - 1);
  await settleLoop();
  assert.equal(page.seen.changed, afterPost, 'nothing is announced before the interval');

  t.mock.timers.tick(1);
  await settleLoop();
  assert.equal(page.seen.changed, afterPost + 1, 'the page is told the moment the hand-off crosses');

  t.mock.timers.tick(10 * MINUTE);
  await settleLoop();
  assert.equal(page.seen.changed, afterPost + 1, 'once: the timer is one-shot, never an interval');
});

test('one repaint per hand-off however many changes are announced before it crosses', async (t) => {
  const base = await deckOnAPort(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const page = await listen(base);
  t.after(() => page.close());

  await callApi(base, 'deck_post', { kind: 'handoff', title: 'Context is at 40%', body: 'b', repo: A });
  await callApi(base, 'deck_post', { kind: 'question', title: 'Which port?', body: '?', repo: B });
  await callApi(base, 'deck_post', { kind: 'question', title: 'Which name?', body: '?', repo: B });
  await settleLoop();
  const before = page.seen.changed;

  t.mock.timers.tick(HANDOFF_ACK_MS);
  await settleLoop();
  assert.equal(page.seen.changed, before + 1, 'three announced changes armed one timer, not three');
});

test('a hand-off posted before the daemon started still repaints when it crosses', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  tempDeck(t);
  postItem({ kind: 'handoff', title: 'Context is at 40%', body: 'b', repo: A });
  t.mock.timers.tick(MINUTE);
  // `deckOnAPort` takes a fresh store, so the daemon is stood up by hand over the seeded one, unguarded as it is (L5).
  const server = createDeckHttpServer({ secret: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => (server.closeAllConnections(), server.close(resolve))));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await listen(base);
  t.after(() => page.close());

  t.mock.timers.tick(HANDOFF_ACK_MS - MINUTE);
  await settleLoop();
  assert.equal(page.seen.changed, 1, 'the timer the daemon set at its start fired at postedAt + 3 min');
});

test('the hand-off timers swallow a bad postedAt and an unreadable store, and the daemon still stands', (t) => {
  tempDeck(t);
  const posted = postItem({ kind: 'handoff', title: 'Context is at 40%', body: 'b', repo: A });
  const stored = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  stored.items.find((item) => item.id === posted.id).postedAt = 'not a time';
  fs.writeFileSync(storeFile(), JSON.stringify(stored));
  const armed = t.mock.method(globalThis, 'setTimeout');
  assert.doesNotThrow(() => createDeckHttpServer());
  assert.equal(armed.mock.callCount(), 0, 'a postedAt that does not parse arms nothing');
  armed.mock.restore();

  fs.writeFileSync(storeFile(), 'not a deck');
  const said = t.mock.method(console, 'error', () => {});
  assert.doesNotThrow(() => createDeckHttpServer(), 'a store that throws is logged, not raised');
  assert.match(said.mock.calls[0].arguments[0], /hand-off timers could not read the store/);
});
