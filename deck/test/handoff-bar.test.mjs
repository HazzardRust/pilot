/**
 * Slice S8 of deck-usability: the hand-off, and the bar that shows it.
 *
 * The user could not tell, from the home page, whether a reply they had typed
 * had reached the pilot or was still sitting there — "hardcoded, not some call
 * to the agent to update it" (spec 4). So the deck records the one fact about
 * the pilot's attention it can honestly know: the moment `deck_wait` or
 * `deck_read` hands a reply to a session, that reply gains a `deliveredAt`
 * (D4, ADR 0017). Everything on the bar is derived from the thread after that;
 * no agent types a state and nothing new is stored on the item.
 *
 * Three claims, tested at the three levels they live at. What the five states
 * are is a claim about a pure function, so `threadState` is asserted directly.
 * That a hand-off is written once, and that a polling read writes nothing at
 * all (D5), is a claim about bytes on disk, so the store file is compared
 * before and after. That the page hears about it is a claim about an HTTP
 * response, so `deck_wait` runs against a real server with a browser on
 * `/events`.
 *
 * Every test takes its own store directory and its own ephemeral port. Nothing
 * here may touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addPilotMessage, addReply, listItems, markDelivered, postItem, resolveItem, storeFile } =
  await import('../store.mjs');
const { messagesOf, threadState } = await import('../items.mjs');
const { browserCount, callTool } = await import('../server.mjs');
const { renderDeckPage, renderHomePage } = await import('../ui/render.mjs');

/** A repository, spelled the way the platform running the test spells them. */
const REPO = path.join('D:', 'work', 'pilot');

/** A second run's repository: one deck, two runs, which is the ordinary case. */
const OTHER = path.join('D:', 'work', 'elsewhere');

const aQuestion = (over = {}) => ({
  kind: 'question',
  title: 'Which port?',
  body: 'The deck wants one fixed port. I recommend 4321.',
  options: ['4321', '4317'],
  recommended: '4321',
  repo: REPO,
  ...over,
});

/** The item as the store now holds it, which is what a page renders from. */
const stored = (id) => listItems().find((item) => item.id === id);

/** The words on a card's bar, which is the whole of what the user reads at a glance. */
const barOn = (page) => /<span class="state"[^>]*>([^<]*)<\/span>/.exec(page)?.[1] ?? null;

async function until(predicate, what) {
  for (let attempt = 0; attempt < 400 && !predicate(); attempt += 1) await sleep(5);
  assert.ok(predicate(), what);
}

/** A page reading `/events`, and the next frame the daemon pushes to it. */
async function aBrowserOn(base, t) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${base}/events`, { signal: controller.signal });
  const reader = response.body.getReader();
  await until(() => browserCount() === 1, 'the page is counted as watching the deck');
  return { nextFrame: async () => new TextDecoder().decode((await reader.read()).value) };
}

const callOverHttp = (base, name, args) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  }).then((response) => response.json());

// --- the five states, derived from the thread and nothing else (spec 4) -----

test('a thread nobody has answered yet reads posted', (t) => {
  tempDeck(t);

  assert.equal(threadState(postItem(aQuestion())), 'posted');
});

test('a reply no session has been handed reads not picked up yet', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  assert.equal(threadState(addReply(item.id, '4321')), 'not picked up yet');
});

test('a reply deck_read has handed to a session reads the pilot has it', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');

  callTool('deck_read', { repo: REPO });

  assert.equal(threadState(stored(item.id)), 'the pilot has it');
});

test('the pilot\'s own message in the thread reads the pilot replied', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');
  callTool('deck_read', { repo: REPO });

  assert.equal(threadState(addPilotMessage(item.id, 'Why not 4317?')), 'the pilot replied');
});

test('a thread the pilot has closed reads resolved', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');

  assert.equal(threadState(resolveItem(item.id, 'we went with 4321')), 'resolved');
});

// --- the hand-off itself (D4, D5) ------------------------------------------

test('deck_wait marks the reply it hands over and tells the page it moved', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');
  const browser = await aBrowserOn(base, t);

  const waited = await callOverHttp(base, 'deck_wait', { since: 0, timeout: 1000 });

  assert.match(waited.content[0].text, /4321/, 'the reply was handed to the session');
  assert.equal(threadState(stored(item.id)), 'the pilot has it');
  assert.match(
    await browser.nextFrame(),
    /event: changed/,
    'the bar moves without the page being reloaded, so the swap has to be announced',
  );
});

// --- whose reply is it, and who may be said to have it ---------------------
//
// The hand-off is a claim about one run's attention, so it may only be made on
// that run's behalf. One deck holds every run on the machine, and a call that
// asked about all of them has told the deck nothing about who is reading.

test('a read of the whole deck hands nothing over, because it names no run to hand it to', (t) => {
  tempDeck(t);
  const ours = postItem(aQuestion());
  const theirs = postItem(aQuestion({ repo: OTHER, title: 'Their question' }));
  addReply(ours.id, '4321');
  addReply(theirs.id, 'theirs, not ours');

  callTool('deck_read', {});

  assert.equal(threadState(stored(ours.id)), 'not picked up yet');
  assert.equal(
    threadState(stored(theirs.id)),
    'not picked up yet',
    'nothing of this run read that reply, so the deck may not say a session has it',
  );
});

test('a read naming a run hands over that run\'s replies and nobody else\'s', (t) => {
  tempDeck(t);
  const ours = postItem(aQuestion());
  const theirs = postItem(aQuestion({ repo: OTHER, title: 'Their question' }));
  addReply(ours.id, '4321');
  addReply(theirs.id, 'theirs, not ours');

  callTool('deck_read', { repo: REPO });

  assert.equal(threadState(stored(ours.id)), 'the pilot has it');
  assert.equal(threadState(stored(theirs.id)), 'not picked up yet');
});

test('a wait naming a run hands back that run\'s replies and nobody else\'s', async (t) => {
  const base = await deckOnAPort(t);
  const ours = postItem(aQuestion());
  const theirs = postItem(aQuestion({ repo: OTHER, title: 'Their question' }));
  addReply(ours.id, '4321');
  addReply(theirs.id, 'theirs, not ours');

  const waited = await callOverHttp(base, 'deck_wait', { since: 0, timeout: 1000, repo: REPO });

  assert.deepEqual(
    JSON.parse(waited.content[0].text).replies.map((reply) => reply.text),
    ['4321'],
    'a run is handed the answers to its own questions and not another run\'s',
  );
  assert.equal(threadState(stored(ours.id)), 'the pilot has it');
  assert.equal(threadState(stored(theirs.id)), 'not picked up yet');
});

test('a wait that names no run is the whole deck, as it always was', async (t) => {
  const base = await deckOnAPort(t);
  const ours = postItem(aQuestion());
  const theirs = postItem(aQuestion({ repo: OTHER, title: 'Their question' }));
  addReply(ours.id, '4321');
  addReply(theirs.id, 'theirs, not ours');

  const waited = await callOverHttp(base, 'deck_wait', { since: 0, timeout: 1000 });

  assert.deepEqual(
    JSON.parse(waited.content[0].text).replies.map((reply) => reply.text),
    ['4321', 'theirs, not ours'],
  );
  assert.equal(threadState(stored(theirs.id)), 'the pilot has it');
});

test('a reply the deck cannot place is handed to whoever is waiting', async (t) => {
  // An item posted before the client stamped a repository on one carries none,
  // and refusing it to every run would lose it altogether. The same rule
  // `hooks/inbox-alert.js` applies to the same question.
  const base = await deckOnAPort(t);
  const old = postItem(aQuestion({ repo: undefined, title: 'Asked before runs had repositories' }));
  addReply(old.id, 'answered all the same');

  const waited = await callOverHttp(base, 'deck_wait', { since: 0, timeout: 1000, repo: REPO });

  assert.deepEqual(
    JSON.parse(waited.content[0].text).replies.map((reply) => reply.text),
    ['answered all the same'],
  );
  assert.equal(threadState(stored(old.id)), 'the pilot has it');
});

test('a polling deck_read writes nothing and never rewrites a hand-off', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');
  callTool('deck_read', { repo: REPO });
  const afterTheHandOff = fs.readFileSync(storeFile());
  const { deliveredAt } = messagesOf(stored(item.id))[0];
  assert.match(deliveredAt, /^\d{4}-\d\d-\d\dT.*Z$/, 'the hand-off is recorded as a moment');

  callTool('deck_read', { repo: REPO });

  assert.deepEqual(
    fs.readFileSync(storeFile()),
    afterTheHandOff,
    'nothing new was handed over, so the store file is byte-identical',
  );
  assert.equal(
    markDelivered(messagesOf(stored(item.id))),
    false,
    'and the store says so, which is what keeps a poll from waking every open page',
  );
  assert.equal(messagesOf(stored(item.id))[0].deliveredAt, deliveredAt);
});

test('two sessions handed the same reply at once mark it once', (t) => {
  // The overlap, not the sequence: two tool calls that both read the deck before
  // either wrote, which is `deck_wait` and `deck_read` racing, or two parked waits
  // woken by one reply. Both hold a copy where the reply is unmarked, so what has
  // to hold is the check against the *stored* deck rather than against the copy —
  // and that is the check a later change could quietly drop.
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');
  const handedToBoth = messagesOf(stored(item.id));

  assert.equal(markDelivered(handedToBoth), true, 'the first hand-off writes');
  const afterTheFirst = fs.readFileSync(storeFile());

  assert.equal(
    markDelivered(handedToBoth),
    false,
    'the second, holding the same copy from before the write, writes nothing',
  );
  assert.deepEqual(fs.readFileSync(storeFile()), afterTheFirst, 'and the store file is untouched');
});

test('a resolved thread whose reply was never handed over is not marked by a later read', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');
  resolveItem(item.id, 'we went with 4321');
  const beforeTheRead = fs.readFileSync(storeFile());

  callTool('deck_read', { repo: REPO });

  assert.equal(
    markDelivered(messagesOf(stored(item.id))),
    false,
    'the bar on a closed thread cannot move, so a reply on it is never marked',
  );
  assert.deepEqual(
    fs.readFileSync(storeFile()),
    beforeTheRead,
    'the store file is byte-identical after the read',
  );
});

test('deck_read hands over what it returned and not what its bound left off', (t) => {
  tempDeck(t);
  const older = postItem(aQuestion({ title: 'The older question' }));
  addReply(older.id, 'the older answer');
  const newer = postItem(aQuestion({ title: 'The newer question' }));
  addReply(newer.id, 'the newer answer');

  callTool('deck_read', { repo: REPO, limit: 1 });

  assert.equal(threadState(stored(newer.id)), 'the pilot has it');
  assert.equal(
    threadState(stored(older.id)),
    'not picked up yet',
    'an item the bound cut off never reached the session, so the deck may not say it did',
  );
});

test('the pilot\'s own message is never marked as handed over', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addPilotMessage(item.id, 'One more thing before you answer.');

  callTool('deck_read', { repo: REPO });

  const [message] = messagesOf(stored(item.id));
  assert.equal(message.from, 'pilot');
  assert.equal(message.deliveredAt, undefined, 'a session never hands itself its own words');
});

// --- the bar on the card (spec 4, A7) --------------------------------------

test('every card shows the bar, and it moves from not picked up yet to the pilot has it', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  assert.equal(barOn(renderHomePage(listItems())), 'posted');

  addReply(item.id, '4321');
  assert.equal(barOn(renderHomePage(listItems())), 'not picked up yet');

  callTool('deck_read', { repo: REPO });

  assert.equal(barOn(renderHomePage(listItems())), 'the pilot has it');
  assert.equal(
    barOn(renderDeckPage(listItems())),
    'the pilot has it',
    'the history behind the home page shows the same bar',
  );
});

test('the bar sits inside the region the page swaps in place', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, '4321');

  const home = renderHomePage(listItems());

  assert.ok(
    home.indexOf('data-live="queue"') < home.indexOf('<span class="state"'),
    'a bar outside a live region would need a reload to move (D1)',
  );
});
