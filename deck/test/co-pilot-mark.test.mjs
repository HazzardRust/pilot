/**
 * S1 of ticket-state-accents (spec 1, 2, 21; L3, L16): the yellow ticket this repository's live co-pilot
 * holds is marked `co-pilot-held`, blue with a sideways `co-pilot` label, and its Yellow fold is served
 * open. The mark is read from the deck's `co-pilots` record through `deckLanes()`, never from a field
 * on the ticket, and leaves on `release` or once the ticket is no longer open and yellow. The main slot's
 * `in-hand` and `next` are untouched. Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_TICKET } from '../items.mjs';
import { deckLanes, listItems, registerRun, setCoPilot, storeFile } from '../store.mjs';
import { tabsOf } from '../tabs.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const OTHER = path.resolve('D:/work/other');

const aTicket = (title, state, repo = REPO) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo, sliceCount: 60, state });
const runs = () => [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
const tabPage = () =>
  renderHomePage(listItems(), runs(), REPO, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true }, deckLanes());

/** Each Tickets row as `{ id, open tag, the markup before its link }`, in page order. */
const rows = (html) =>
  [...html.matchAll(/<li (data-state="[a-z]+"[^>]*)>((?:(?!<a ).)*)<a href="\/thread\/(itm_[0-9a-f]+)">/gs)].map(([, tag, lead, id]) => ({ id, tag, lead }));
const rowOf = (html, id) => rows(html).find((row) => row.id === id);
const coPilotHeld = (html) => rows(html).filter((row) => /class="[^"]*co-pilot-held/.test(row.tag)).map((row) => row.id);
const yellowFold = (html) => html.match(/<details class="ticket-queue" data-queue="yellow"[^>]*>/)[0];

/** Rewrite a stored ticket's fields in place, as a later write would leave it, without touching `co-pilots`. */
const restate = (id, fields) => {
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  Object.assign(deck.items.find((item) => item.id === id), fields);
  fs.writeFileSync(storeFile(), JSON.stringify(deck), 'utf8');
};

test("a live co-pilot's yellow ticket is co-pilot-held and labelled", (t) => {
  tempDeck(t);
  const held = aTicket('Held', 'yellow');
  const other = aTicket('Other', 'yellow');
  setCoPilot(held.id, true);

  const html = tabPage();
  assert.deepEqual(coPilotHeld(html), [held.id], 'that row only');
  const row = rowOf(html, held.id);
  assert.match(row.tag, /^data-state="yellow" class="co-pilot-held"$/);
  assert.match(row.lead, /^<span class="lane-label">co-pilot<\/span>/);
  assert.doesNotMatch(row.tag, /in-hand/, 'never in-hand');
  assert.doesNotMatch(rowOf(html, other.id).lead, /lane-label/);
  assert.match(yellowFold(html), / open[ >]/, 'its fold is served open');
});

test('release clears the mark', (t) => {
  tempDeck(t);
  const held = aTicket('Held', 'yellow');
  setCoPilot(held.id, true);
  assert.deepEqual(coPilotHeld(tabPage()), [held.id]);

  setCoPilot(held.id, false);
  const html = tabPage();
  assert.deepEqual(coPilotHeld(html), []);
  assert.doesNotMatch(html, /<span class="lane-label">/);
  assert.doesNotMatch(yellowFold(html), / open[ >]/, 'the fold is served shut again');
});

test('a co-pilot entry on a ticket now green or closed marks nothing', (t) => {
  tempDeck(t);
  const reddened = aTicket('Reddened', 'yellow');
  setCoPilot(reddened.id, true);
  restate(reddened.id, { state: 'green' });
  assert.deepEqual(deckLanes().coPilots, {}, 'a green ticket is no co-pilot');
  assert.deepEqual(coPilotHeld(tabPage()), []);

  const closed = aTicket('Closed', 'yellow');
  setCoPilot(closed.id, true);
  restate(closed.id, { resolvedAt: new Date().toISOString(), resolution: 'done' });
  assert.deepEqual(deckLanes().coPilots, {}, 'a closed ticket is no co-pilot');
  assert.deepEqual(coPilotHeld(tabPage()), []);
});

test("the main slot's in-hand and next are unchanged beside a co-pilot", (t) => {
  tempDeck(t);
  const red = aTicket('Red', 'red');
  const held = aTicket('Held', 'yellow');
  setCoPilot(held.id, true);

  const html = tabPage();
  const row = rowOf(html, red.id);
  assert.match(row.tag, /^data-state="red" class="in-hand"$/, 'the red row keeps in-hand');
  assert.match(row.lead, /^<span class="next">next<\/span>$/, 'and next');
  assert.deepEqual(coPilotHeld(html), [held.id]);
});

test('a yellow ticket with no co-pilot carries no mark', (t) => {
  tempDeck(t);
  aTicket('Waiting', 'yellow');

  const html = tabPage();
  assert.deepEqual(coPilotHeld(html), []);
  assert.doesNotMatch(html, /<span class="lane-label">/);
});

test("another repository's co-pilot marks nothing on this tab", (t) => {
  tempDeck(t);
  const here = aTicket('Here', 'yellow');
  const there = aTicket('There', 'yellow', OTHER);
  setCoPilot(there.id, true);

  const html = tabPage();
  assert.ok(rowOf(html, here.id), 'this tab lists its own ticket');
  assert.deepEqual(coPilotHeld(html), []);
  const tabs = tabsOf(runs(), listItems(), {}, {}, [], {}, deckLanes());
  assert.equal(tabs.find((tab) => tab.repo === REPO).coPilot, null);
  assert.equal(tabs.find((tab) => tab.repo === OTHER).coPilot, there.id);
});
