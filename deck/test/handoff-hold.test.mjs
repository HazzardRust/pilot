/**
 * S1 of held-handoff, spec 1 and 2 (L2, A1): a held hand-off says so on its card, and is not a pick-up.
 * The hold is item state, `hold: { ticket, at }`, written once by `markHold` behind `POST /api/hold`; no message.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFF_ACK_MS, HANDOFF_FAILED, KIND_HANDOFF, KIND_TICKET, isUnacknowledged, messagesOf, noteFor, threadState } from '../items.mjs';
import { addPilotMessage, addReply, listItems, postItem, resolveItem } from '../store.mjs';
import { markHold } from '../store-items.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { deckOnAPort, postStored, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/alpha';
const TICKET = 'itm_0f0e0a0b0c0d';
const HELD_NOTE = `held: /clear waits on ${TICKET}'s co-pilot`;

const aHandoff = () => postItem({ kind: KIND_HANDOFF, title: 'Handoff', body: 'Stash at run.json.', repo: REPO });
const stored = (id) => listItems().find((item) => item.id === id);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("a held hand-off's card reads held", (t) => {
  tempDeck(t);
  const handoff = aHandoff();

  markHold(handoff.id, TICKET);

  const item = stored(handoff.id);
  assert.equal(noteFor(item), HELD_NOTE);
  const page = renderThreadPage(item);
  assert.ok(page.includes(HELD_NOTE.replace("'", '&#39;')), 'the page draws the held line');
  assert.ok(!page.includes('A fresh session picks this up'), 'and not the pick-up line');
  assert.ok(page.includes(HANDOFF_FAILED), 'Handoff failed stays on it');
});

test("a held hand-off's Handoff failed confirms the re-arm, not a lost session (QA F2)", (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  const ask = 'Stop waiting for the co-pilot, and type /clear at this session&#39;s next turn end?';
  assert.ok(renderThreadPage(stored(handoff.id)).includes('Treat the session this went to as lost'), 'unheld: the lost-session ask');

  markHold(handoff.id, TICKET);

  const page = renderThreadPage(stored(handoff.id));
  assert.ok(page.includes(`<p>${ask}</p>`), 'held: the re-arm ask');
  assert.ok(!page.includes('Treat the session this went to as lost'), 'and not the lost-session one');
});

test('a hold is written once', async (t) => {
  tempDeck(t);
  const handoff = aHandoff();

  assert.equal(markHold(handoff.id, TICKET), true);
  const first = stored(handoff.id).hold.at;
  await pause(5);
  assert.equal(markHold(handoff.id, TICKET), false);

  assert.deepEqual(stored(handoff.id).hold, { ticket: TICKET, at: first });
  assert.equal(messagesOf(stored(handoff.id)).length, 0, 'a hold writes no message (A1)');
});

test('a hold refuses a closed item and a non-handoff', (t) => {
  tempDeck(t);
  const closed = aHandoff();
  resolveItem(closed.id, 'delivered');
  const question = postItem({ kind: 'question', title: 'Q', body: 'b', options: ['a', 'b'], repo: REPO });

  assert.equal(markHold(closed.id, TICKET), false);
  assert.equal(markHold(question.id, TICKET), false);
  assert.equal(stored(closed.id).hold, undefined);
  assert.equal(stored(question.id).hold, undefined);
  assert.throws(() => markHold(aHandoff().id, 'not a ticket'), /ticket/);
});

test("a held hand-off's press carries no pickedUpAt", (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  markHold(handoff.id, TICKET);

  addReply(handoff.id, HANDOFF_FAILED);

  const messages = messagesOf(stored(handoff.id));
  assert.equal(messages.length, 1, 'the press alone; no pilot message');
  assert.equal(messages[0].pickedUpAt, undefined);
  assert.ok(!renderThreadPage(stored(handoff.id)).includes('nothing failed'));
});

// S2, spec 3 (L3): Handoff failed on a held hand-off re-arms its `/clear`, co-pilot live or not.
const REARMED_NOTE = 're-armed: /clear at the next turn end';

test('the press on a held hand-off re-arms it', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  markHold(handoff.id, TICKET);
  const at = stored(handoff.id).hold.at;

  addReply(handoff.id, HANDOFF_FAILED);

  const item = stored(handoff.id);
  const [press] = messagesOf(item);
  assert.deepEqual(item.hold, { ticket: TICKET, at, rearmedAt: press.repliedAt }, 'the press\'s own time');
  assert.equal(press.pickedUpAt, undefined, 'a re-arm is not a pick-up');
});

test('the press on a hand-off nobody held re-arms nothing', (t) => {
  tempDeck(t);
  const handoff = aHandoff();

  addReply(handoff.id, HANDOFF_FAILED);

  assert.equal(stored(handoff.id).hold, undefined);
});

test('the card says re-armed', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  markHold(handoff.id, TICKET);

  addReply(handoff.id, HANDOFF_FAILED);

  const item = stored(handoff.id);
  assert.equal(threadState(item), 'held', 'the hold still ends only at the pick-up');
  assert.equal(noteFor(item), REARMED_NOTE, 'and the re-armed line wins over the held one');
  addPilotMessage(handoff.id, 'I hold the run.');
  assert.notEqual(noteFor(stored(handoff.id)), REARMED_NOTE, 'a pick-up ends it');
});

test('a held thread reads held, not unacknowledged', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  markHold(handoff.id, TICKET);
  const later = Date.parse(stored(handoff.id).postedAt) + HANDOFF_ACK_MS + 1000;

  assert.equal(isUnacknowledged(stored(handoff.id), later), false);
  assert.equal(threadState(stored(handoff.id), later), 'held');
});

test('a hold ends at the pick-up: a pilot message reads past it', (t) => {
  tempDeck(t);
  const handoff = aHandoff();
  markHold(handoff.id, TICKET);

  addPilotMessage(handoff.id, 'I hold the run.');

  const item = stored(handoff.id);
  assert.equal(threadState(item), 'the pilot replied');
  assert.notEqual(noteFor(item), HELD_NOTE);
});

test('the route refuses a cross-site write', async (t) => {
  const base = await deckOnAPort(t);
  const handoff = aHandoff();
  const hold = (headers) => fetch(`${base}/api/hold`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ id: handoff.id, ticket: TICKET }),
  });

  const foreign = await hold({ origin: 'http://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal(stored(handoff.id).hold, undefined, 'a cross-site page holds nothing');

  assert.deepEqual(await (await hold({})).json(), { held: true }, 'the wrapper, which sends no Origin, holds it');
  assert.deepEqual(await (await hold({})).json(), { held: false }, 'once');
  assert.equal(stored(handoff.id).hold.ticket, TICKET);

  const bare = await fetch(`${base}/api/hold`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
  assert.equal(bare.status, 400, 'a body that is not an object is refused, not a 500');
});

test('the press on a held chain hand-off leaves its next ticket live', (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'Next', body: 'spec', repo: REPO });
  takeLive(ticket.id);
  const handoff = postStored({ kind: KIND_HANDOFF, title: 'Handoff', body: 'Stash at run.json.', repo: REPO, options: [HANDOFF_FAILED], next: ticket.id });
  markHold(handoff.id, TICKET);

  addReply(handoff.id, HANDOFF_FAILED);

  assert.ok(stored(handoff.id).hold.rearmedAt, 're-armed');
  assert.ok(stored(ticket.id).live, 'the next ticket keeps live');
});
