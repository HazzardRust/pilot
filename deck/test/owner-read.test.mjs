/**
 * Thread-ownership S3, spec 2 (the `deck_read` path and the bar); A9.
 *
 * A read hands over only the replies on threads the reader's kind owns, and the
 * hand-off records who received each one (`deliveredTo`), once. A wait skips a
 * reply already delivered to another kind, and the bar names who has it.
 *
 * Every test takes its own store directory and its own ephemeral port. Nothing
 * here may touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addReply, listItems, markDelivered, postItem, registerRun, storeFile } = await import('../store.mjs');
const { messagesOf, threadState } = await import('../items.mjs');
const { callTool } = await import('../server.mjs');
const { renderHomePage } = await import('../ui/render.mjs');

const ALPHA = 'D:/work/alpha';
const QA = 'pilot:pilot-qa';

const stored = (id) => listItems().find((item) => item.id === id);
const lastReply = (id) => messagesOf(stored(id)).at(-1);

const walkthrough = () =>
  postItem({ kind: 'walkthrough', title: 'Try it', body: 'Step one.', repo: ALPHA, author: QA });
const question = () => postItem({ kind: 'question', title: 'Which?', body: 'A or B', repo: ALPHA, author: '' });

const readAs = (author) => JSON.parse(callTool('deck_read', { repo: ALPHA, author }).content[0].text);

test("a qa deck_read does not mark a pilot thread's reply delivered", (t) => {
  tempDeck(t);
  const asked = question();
  addReply(asked.id, 'A');

  readAs(QA);

  assert.equal(lastReply(asked.id).deliveredAt, undefined, 'QA reading the deck is not the pilot being handed it');
  assert.equal(threadState(stored(asked.id)), 'not picked up yet');
});

test("a pilot deck_read marks its own thread's reply delivered to pilot", (t) => {
  tempDeck(t);
  const asked = question();
  const walk = walkthrough();
  addReply(asked.id, 'A');
  addReply(walk.id, 'looks right');

  readAs(undefined);

  assert.equal(lastReply(asked.id).deliveredTo, 'pilot');
  assert.ok(lastReply(asked.id).deliveredAt);
  assert.equal(lastReply(walk.id).deliveredAt, undefined, "and QA's walkthrough reply is left for QA");
});

test('a reply delivered to pilot is not handed to a qa wait', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const walk = walkthrough();
  addReply(walk.id, 'looks right');
  assert.equal(markDelivered(messagesOf(stored(walk.id)), 'pilot'), true);

  const response = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_wait', arguments: { since: 0, timeout: 50, repo: ALPHA, author: QA } }),
  });
  const waited = JSON.parse((await response.json()).content[0].text);

  assert.deepEqual(waited.replies, [], 'a reply is handed to at most one kind (A9)');
});

test('a thread whose newest message is qa\'s reads "qa replied", in the colour of waiting on the user', (t) => {
  tempDeck(t);
  const walk = walkthrough();
  callTool('deck_reply', { id: walk.id, text: 'try step two again', author: QA });

  assert.equal(threadState(stored(walk.id)), 'qa replied');
  assert.match(renderHomePage(listItems()), /<span class="state" data-state="waiting">qa replied<\/span>/);
});

test('deliveredTo is written once and never rewritten', (t) => {
  tempDeck(t);
  const walk = walkthrough();
  addReply(walk.id, 'looks right');
  const unmarked = messagesOf(stored(walk.id));

  assert.equal(markDelivered(unmarked, 'qa'), true);
  const first = lastReply(walk.id);
  // The caller's own copy still says undelivered, as a racing hand-off's would.
  assert.equal(markDelivered(unmarked, 'pilot'), false, 'the second hand-off writes nothing');

  assert.equal(lastReply(walk.id).deliveredTo, 'qa');
  assert.equal(lastReply(walk.id).deliveredAt, first.deliveredAt);
});

test('a qa thread whose reply was handed over reads "qa has it"', (t) => {
  tempDeck(t);
  const walk = walkthrough();
  const asked = question();
  addReply(walk.id, 'looks right');
  addReply(asked.id, 'A');

  readAs(QA);
  readAs(undefined);

  assert.equal(threadState(stored(walk.id)), 'qa has it');
  assert.equal(threadState(stored(asked.id)), 'the pilot has it', "the pilot's wording is unchanged");
  assert.match(
    renderHomePage(listItems()),
    /<span class="state" data-state="pilot">qa has it<\/span>/,
    'the bar reads it in the colour of a question an agent holds',
  );
});

test('deck_read items carry their owner', (t) => {
  tempDeck(t);
  walkthrough();
  question();
  // An item stored before owners existed has none on disk, and reads as its author (A2).
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  for (const item of deck.items) delete item.owner;
  fs.writeFileSync(storeFile(), `${JSON.stringify(deck, null, 2)}\n`);

  assert.deepEqual(
    readAs(undefined).items.map((item) => item.owner),
    ['qa', 'pilot'],
  );
});
