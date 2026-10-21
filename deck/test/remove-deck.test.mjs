/**
 * S10 of independence: an old deck tab can be removed (spec 18, A7). Nothing
 * is deleted: open non-chat items of that repository are archived and its
 * runs dismissed, which is what already takes an ended tab off the strip
 * (`deck/tabs.mjs`). The D-number stays and is never reused. Refused while a
 * live session is registered there.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import { renderHomePage } from '../ui/render.mjs';

const {
  createThread,
  listDeckNumbers,
  listItems,
  listStoredRuns,
  postItem,
  registerRun,
  removeDeck,
} = await import('../store.mjs');

const ALPHA = path.resolve('D:/work/alpha');

const post = (base, pathname, fields, origin = base) =>
  fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin === null ? {} : { origin }) },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });

const rightStrip = (page) =>
  page.slice(page.indexOf('<aside class="strip right">'), page.indexOf('</aside>', page.indexOf('strip right')));

const aQuestion = (extra = {}) => ({ kind: 'question', title: 'Which default?', body: 'Pick one.', repo: ALPHA, ...extra });

// --- the store ---------------------------------------------------------------

test('removeDeck archives open non-chat items and dismisses the runs, leaving them all in the store', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: 999999 }); // not this test's own pid: not live
  const question = postItem(aQuestion());
  const chat = listItems().find((item) => item.kind === 'chat' && item.repo === run.repo);

  removeDeck(ALPHA);

  const items = listItems();
  const archived = items.find((item) => item.id === question.id);
  assert.equal(archived.resolution, 'archived with its deck');
  assert.equal(typeof archived.resolvedAt, 'string');
  assert.ok(items.some((item) => item.id === chat.id), 'the chat item is kept, not archived');
  assert.equal(items.find((item) => item.id === chat.id).resolution, undefined, 'and it is left open');
  assert.equal(items.length, 2, 'nothing is deleted (A7)');
});

// Flipped 2026-09-28: a created thread is a user thread, which closes, so it is archived like any open thread.
test('removeDeck archives an open user thread with its deck', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: 999999 });
  const thread = createThread({ name: 'Side question', repo: ALPHA });

  removeDeck(ALPHA);

  assert.equal(listItems().find((item) => item.id === thread.id).resolution, 'archived with its deck');
});

test('removeDeck is refused while a live session is registered there (A7)', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid }); // this test's own pid: live

  assert.throws(() => removeDeck(ALPHA), /live session/);
});

test('removeDeck leaves an already-resolved item and another repository untouched', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: 999999 });
  const BETA = path.resolve('D:/work/beta');
  registerRun({ repo: BETA, pid: 999998 });
  const resolved = postItem(aQuestion({ title: 'Answered already' }));
  // resolveItem/closeItem are exercised elsewhere; a hand-set resolution is
  // enough here to prove removeDeck does not touch what is not open.
  resolved.resolution = 'closed by the user';
  const betaItem = postItem(aQuestion({ repo: BETA, title: 'Not this repository' }));

  removeDeck(ALPHA);

  assert.equal(resolved.resolution, 'closed by the user', 'already resolved, so removeDeck leaves it as it found it');
  assert.equal(betaItem.resolution, undefined, "another repository's open item is untouched");
});

test('removeDeck refuses an empty repo', (t) => {
  tempDeck(t);
  for (const bad of [undefined, '', '   ']) assert.throws(() => removeDeck(bad), /repo/);
});

test('the D-number stays and is not reused, and the tab is gone from the strip once nothing is open (A7)', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: 999999 });
  postItem(aQuestion());
  const before = listDeckNumbers();

  removeDeck(ALPHA);

  assert.deepEqual(listDeckNumbers(), before, 'the number mapping is unchanged (prohibited: dropping it)');
  assert.deepEqual(listStoredRuns(), [], 'the run is stale (dismissed), so the tab has nothing to draw from');
});

// --- the route (L4: Origin present and matching Host, as Create and Auto) ----

test('POST /remove-deck from the page archives and redirects to the overview; any other Origin is refused', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: 999999 });
  const question = postItem(aQuestion());

  for (const origin of ['http://evil.example', null]) {
    const refused = await post(base, '/remove-deck', { repo: ALPHA }, origin);
    assert.equal(refused.status, 403, `Origin ${origin}`);
  }
  assert.equal(listItems().find((item) => item.id === question.id).resolution, undefined, 'the refused calls wrote nothing');

  const response = await post(base, '/remove-deck', { repo: ALPHA });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.equal(listItems().find((item) => item.id === question.id).resolution, 'archived with its deck');
});

test('POST /remove-deck refuses a repository with a live session, and archives nothing', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const question = postItem(aQuestion());

  const response = await post(base, '/remove-deck', { repo: ALPHA });

  assert.equal(response.status, 400);
  assert.match(await response.text(), /live session/);
  assert.equal(listItems().find((item) => item.id === question.id).resolution, undefined);
});

// --- the control is drawn only for an ended tab (prohibited: CSS-only) -------

test('a live tab draws no Remove control at all; an ended one does', (t) => {
  tempDeck(t);
  const live = registerRun({ repo: ALPHA, pid: process.pid });

  const liveTab = rightStrip(renderHomePage(listItems(), [live], ALPHA, false, listDeckNumbers(), {}, Date.now()));
  assert.doesNotMatch(liveTab, /form class="remove"/, 'nothing to un-hide with CSS: the server never sent it');

  const question = postItem(aQuestion());
  const ended = { ...live, pid: 999999 };
  const endedTab = rightStrip(renderHomePage(listItems(), [ended], ALPHA, false, listDeckNumbers(), {}, Date.now()));
  assert.match(endedTab, /form class="remove"/);
  assert.match(endedTab, new RegExp(`name="repo" value="${ALPHA.replace(/\\/g, '\\\\')}"`));
  void question;
});

test("an ended deck's control reads Close and confirms in place", (t) => {
  tempDeck(t);
  const ended = { ...registerRun({ repo: ALPHA, pid: process.pid }), pid: 999999 };
  postItem(aQuestion()); // an ended tab stays on the strip while it has something open
  const strip = rightStrip(renderHomePage(listItems(), [ended], ALPHA, false, listDeckNumbers(), {}, Date.now()));
  const start = strip.indexOf('<details class="remove">');
  const remove = strip.slice(start, strip.indexOf('</details>', start));

  assert.match(remove, /<summary>Close<\/summary>/);
  assert.match(remove, /<button type="submit" data-confirm>Close<\/button>/);
  assert.match(remove, /<div class="step sure" hidden><p>Close [^<]*<\/p><button type="submit">Confirm<\/button>/);
  assert.doesNotMatch(remove, /Remove|Archive/, 'the word the user asked to lose is gone from the control');
  assert.match(remove, /action="\/remove-deck"/, 'the route is unchanged');
  assert.match(remove, /<form class="remove" method="post" action="\/remove-deck" data-confirm-row data-in-place="move">/, 'and lands on the overview in place');
});

test('the overview draws no Remove control', () => {
  const runs = [{ id: 'run_1', repo: ALPHA, name: 'alpha', pid: 999999, startedAt: new Date().toISOString() }];
  const overview = rightStrip(renderHomePage([], runs, null, false, {}, {}, Date.now()));
  assert.doesNotMatch(overview, /form class="remove"/);
});

test('the overview a Remove lands on draws, naming the removed deck by its directory in Create', () => {
  // A deck the deck still numbers but no tab shows: what `/remove-deck` leaves behind.
  const overview = rightStrip(renderHomePage([], [], null, false, { [ALPHA]: 1 }, {}, Date.now()));
  assert.match(overview, /<option value="[^"]*alpha">D1 alpha<\/option>/i);
});
