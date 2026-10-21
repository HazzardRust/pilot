/**
 * S3 of yellow-lane (spec 4, 5, L3): one gate2 rule, `gate2Blockers`, read by the post and the
 * Sign-off press alike. Only an open blocking item of the ticket holds it, a question or a
 * walkthrough; a plain question never does.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, KIND_TICKET, KIND_WALKTHROUGH, SIGN_OFF, chosenOf, gate2Blockers, isBlocking } from '../items.mjs';
import { DeckRefusal, addReply, listItems, postItem, resolveItem } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'yellow' });
const liveTicket = (title) => {
  const ticket = aTicket(title);
  takeLive(ticket.id);
  return ticket;
};
const ask = (ticket) => postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket: ticket.id });
const walk = (ticket, extra = {}) => postItem({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket: ticket.id, ...extra });
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('a walkthrough takes blocking', (t) => {
  tempDeck(t);
  const ticket = liveTicket('Walked');
  const blocker = walk(ticket, { blocking: true });
  assert.equal(isBlocking(reread(blocker.id)), true, 'open and blocking');
  assert.equal(isBlocking(reread(walk(ticket).id)), false, 'plain is not blocking');
  assert.throws(() => walk(ticket, { blocking: true, ticket: undefined }), refusedNaming('blocking', 'ticket'), 'no blocking without a ticket');
  addReply(blocker.id, '- step 1 worked');
  resolveItem(blocker.id, 'walked');
  assert.equal(isBlocking(reread(blocker.id)), false, 'resolved');
});

test('a plain question never holds the press', (t) => {
  tempDeck(t);
  const ticket = liveTicket('Plain');
  const gate2 = aGate2(ticket);
  ask(ticket);
  assert.deepEqual(gate2Blockers(listItems(), ticket.id), []);
  addReply(gate2.id, SIGN_OFF);
  assert.equal(chosenOf(reread(gate2.id)), SIGN_OFF);
});

test('a blocking walkthrough holds post and press', (t) => {
  tempDeck(t);
  const ticket = liveTicket('Held');
  const blocker = walk(ticket, { blocking: true });
  assert.deepEqual(gate2Blockers(listItems(), ticket.id), [blocker.id]);
  assert.throws(() => aGate2(ticket), refusedNaming('blocking', blocker.id, 'answer them or press Assume the default first'), 'the post');

  addReply(blocker.id, '- step 1 worked');
  resolveItem(blocker.id, 'walked');
  const gate2 = aGate2(ticket);
  const late = walk(ticket, { blocking: true });
  assert.throws(() => addReply(gate2.id, SIGN_OFF), refusedNaming('blocking', gate2.id, late.id, 'answer them or press Assume the default first'), 'the press');
  assert.equal(chosenOf(reread(gate2.id)), null, 'not signed');
});
