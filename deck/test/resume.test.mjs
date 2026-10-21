/**
 * blocked-yellow-yields S4 (spec 3; §2, A3): the user's answer resumes a paused ticket at the yellow head. `resumeIn`
 * is the move, made inside `addReply`'s own write, for a user reply only. Every test takes its own store; nothing
 * touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_QUESTION, KIND_TICKET, ticketQueueOf } from '../items.mjs';
import { YIELD_MS } from '../lanes.mjs';
import { addPilotMessage, addReply, listItems, setCoPilot, yieldTicket } from '../store.mjs';
import { resumeIn } from '../store-items.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const OTHER = path.join('D:', 'work', 'other');
const PAST = new Date(Date.now() - YIELD_MS - 60_000).toISOString();

const stored = (id) => listItems().find((item) => item.id === id);
const yellow = (title, repo = REPO) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo, sliceCount: 3, state: 'yellow' });
const blocking = (ticket, extra = {}) =>
  postStored({
    kind: KIND_QUESTION, title: 'Which?', body: 'A or B', repo: ticket.repo, ticket: ticket.id, blocking: true,
    options: ['A', 'B'], recommended: 'A', postedAt: PAST, ...extra,
  });

/** Two yellow tickets queued, then the held one paused on its blocking question by the deck's own yield. */
function pausedBehindTwo() {
  yellow('first');
  yellow('second');
  const ticket = yellow('building');
  setCoPilot(ticket.id, true);
  const question = blocking(ticket);
  yieldTicket(ticket.id, question.id);
  return { ticket, question };
}

test('the answer resumes at the yellow head', () => {
  const at = '2026-10-17T10:00:00.000Z';
  const other = { id: 'itm_other', kind: KIND_TICKET, repo: OTHER, state: 'yellow', replies: [] };
  const first = { id: 'itm_first', kind: KIND_TICKET, repo: REPO, state: 'yellow', replies: [] };
  const second = { id: 'itm_second', kind: KIND_TICKET, repo: REPO, state: 'yellow', replies: [] };
  const ticket = { id: 'itm_paused', kind: KIND_TICKET, repo: REPO, state: 'green', paused: { question: 'itm_q', at }, replies: [] };
  const question = {
    id: 'itm_q', kind: KIND_QUESTION, repo: REPO, ticket: ticket.id, blocking: true, postedAt: at,
    replies: [{ from: 'user', text: 'A', repliedAt: at }],
  };
  const deck = { items: [other, first, second, ticket, question] };

  assert.equal(resumeIn(deck, question), ticket);
  assert.equal(ticket.state, 'yellow');
  assert.equal(Object.hasOwn(ticket, 'paused'), false, 'paused is deleted');
  assert.deepEqual(ticketQueueOf(deck.items, REPO, 'yellow').map((item) => item.id), [ticket.id, first.id, second.id]);
  assert.deepEqual(ticketQueueOf(deck.items, OTHER, 'yellow'), [other], "another repository's queue is its own");
  assert.equal(deck.items.length, 5, 'moved, not copied');
});

test('Assume the default resumes too', (t) => {
  tempDeck(t);
  const { ticket, question } = pausedBehindTwo();
  assert.equal(stored(ticket.id).state, 'green');

  addReply(question.id, 'Assume the default');

  const after = stored(ticket.id);
  assert.equal(after.state, 'yellow');
  assert.equal(after.paused, undefined);
  assert.equal(ticketQueueOf(listItems(), REPO, 'yellow')[0].id, ticket.id, 'first in line for the co-pilot lane');
});

test('a second unanswered blocking item keeps it paused', (t) => {
  tempDeck(t);
  const { ticket, question } = pausedBehindTwo();
  const second = blocking(ticket, { title: 'And?' });

  addReply(question.id, 'B');
  const after = stored(ticket.id);
  assert.equal(after.state, 'green', 'still waiting on the user');
  assert.equal(after.paused.question, question.id);

  const items = listItems();
  const deck = { items };
  assert.equal(resumeIn(deck, items.find((item) => item.id === question.id)), undefined);
  assert.equal(items.find((item) => item.id === ticket.id).state, 'green');

  const pausing = { id: 'itm_pausing', kind: KIND_QUESTION, repo: REPO, ticket: 'itm_t', resolution: 'closed', replies: [] };
  const other = { id: 'itm_other_q', kind: KIND_QUESTION, repo: REPO, ticket: 'itm_t', replies: [{ from: 'user', text: 'A' }] };
  const lone = { id: 'itm_t', kind: KIND_TICKET, repo: REPO, state: 'green', paused: { question: pausing.id, at: PAST }, replies: [] };
  assert.equal(resumeIn({ items: [lone, pausing, other] }, other), undefined, 'the question that paused it, closed unanswered, still waits');
  assert.equal(lone.state, 'green');

  addReply(second.id, 'A');
  assert.equal(stored(ticket.id).state, 'yellow', 'the last answer resumes it');
});

test('only the user resumes', (t) => {
  tempDeck(t);
  const { ticket, question } = pausedBehindTwo();
  assert.ok(stored(question.id).replies.some((message) => message.from === 'deck'), 'the deck\'s own line is on it');
  assert.equal(stored(ticket.id).state, 'green', 'the deck\'s message did not resume it');

  const lone = { id: 'itm_t', kind: KIND_TICKET, repo: REPO, state: 'green', paused: { question: 'itm_q', at: PAST }, replies: [] };
  const asked = {
    id: 'itm_q', kind: KIND_QUESTION, repo: REPO, ticket: lone.id, blocking: true,
    replies: [{ from: 'deck', author: 'deck', text: 'Paused' }, { from: 'pilot', author: 'pilot', text: 'Still waiting' }],
  };
  assert.equal(resumeIn({ items: [lone, asked] }, asked), undefined, 'no word from the user, no resume');
  assert.equal(lone.state, 'green');

  addPilotMessage(question.id, 'Still waiting on you here.', 'pilot');
  const after = stored(ticket.id);
  assert.equal(after.state, 'green', 'a pilot\'s message leaves it paused');
  assert.equal(after.paused.question, question.id);
});
