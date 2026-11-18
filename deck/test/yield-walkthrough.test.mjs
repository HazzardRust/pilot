/**
 * never-stuck S9 (spec 8; A1): a blocking walkthrough the user has not done holds the co-pilot's yellow lane
 * `YIELD_MS` at most, like a blocking question, and the user doing it resumes the ticket it paused. `yieldsDue` is
 * pure, so those tests build their own items and pass the clock; the resume test takes its own store; nothing
 * touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_TICKET, KIND_WALKTHROUGH } from '../items.mjs';
import { yieldsDue } from '../lanes.mjs';
import { addReply, listItems, setCoPilot, yieldTicket } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const MINUTE = 60_000;
const POSTED_AT = '2026-10-17T10:00:00.000Z';
const POSTED = Date.parse(POSTED_AT);

const ticketIn = (state) => ({ id: 'itm_held', kind: KIND_TICKET, repo: REPO, state, replies: [] });
const walkthrough = (extra = {}) => ({
  id: 'itm_walk',
  kind: KIND_WALKTHROUGH,
  title: 'Walk the new card',
  repo: REPO,
  ticket: 'itm_held',
  blocking: true,
  postedAt: POSTED_AT,
  replies: [],
  ...extra,
});

test('a blocking walkthrough is due at 20 minutes', () => {
  const ticket = ticketIn('yellow');
  const walk = walkthrough();
  const at = POSTED + 20 * MINUTE;

  assert.deepEqual(yieldsDue([ticket, walk], REPO, ticket.id, at), [{ ticket: ticket.id, question: walk.id, at }]);
  assert.deepEqual(yieldsDue([ticket, walk], REPO, ticket.id, POSTED + 19 * MINUTE), [], 'not due at 19 minutes');

  const done = walkthrough({ replies: [{ from: 'user', text: '- step 1 worked', repliedAt: POSTED_AT }] });
  assert.deepEqual(yieldsDue([ticket, done], REPO, ticket.id, at), [], 'a user message on it answers it (A1)');
  const closed = walkthrough({ resolvedAt: POSTED_AT });
  assert.deepEqual(yieldsDue([ticket, closed], REPO, ticket.id, at), [], 'a resolved walkthrough holds nothing');
});

test('a non-blocking walkthrough never is', () => {
  const ticket = ticketIn('yellow');
  const walk = walkthrough({ blocking: undefined });

  assert.deepEqual(yieldsDue([ticket, walk], REPO, ticket.id, POSTED + 60 * MINUTE), []);
});

test('the user doing the walkthrough that paused a ticket resumes it', (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'building', body: shapedTicketBody('building'), repo: REPO, sliceCount: 3, state: 'yellow' });
  setCoPilot(ticket.id, true);
  const walk = postStored({
    kind: KIND_WALKTHROUGH, title: 'Walk the new card', body: '1. open the deck', repo: REPO, ticket: ticket.id, blocking: true,
    postedAt: new Date(Date.now() - 21 * MINUTE).toISOString(),
  });
  yieldTicket(ticket.id, walk.id);
  setCoPilot(ticket.id, false); // the drain is over (never-stuck L6)
  assert.equal(listItems().find((item) => item.id === ticket.id).state, 'green', 'the walkthrough paused it');

  addReply(walk.id, '- step 1 worked');

  const resumed = listItems().find((item) => item.id === ticket.id);
  assert.equal(resumed.state, 'yellow');
  assert.equal(Object.hasOwn(resumed, 'paused'), false);
});

test('a walkthrough on a red or green ticket never is', () => {
  const walk = walkthrough();
  const later = POSTED + 60 * MINUTE;

  for (const state of ['red', 'green']) {
    const ticket = ticketIn(state);
    assert.deepEqual(yieldsDue([ticket, walk], REPO, ticket.id, later), [], `a ${state} ticket never yields (A1)`);
  }
});
