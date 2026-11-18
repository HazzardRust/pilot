/**
 * never-stuck S9 (spec 8; A1): a blocking walkthrough the user has not done holds the co-pilot's yellow lane
 * `YIELD_MS` at most, like a blocking question. `yieldsDue` is pure, so each test builds its own items and passes
 * the clock; nothing touches a store or 4321.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_TICKET, KIND_WALKTHROUGH } from '../items.mjs';
import { yieldsDue } from '../lanes.mjs';

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

test('a walkthrough on a red or green ticket never is', () => {
  const walk = walkthrough();
  const later = POSTED + 60 * MINUTE;

  for (const state of ['red', 'green']) {
    const ticket = ticketIn(state);
    assert.deepEqual(yieldsDue([ticket, walk], REPO, ticket.id, later), [], `a ${state} ticket never yields (A1)`);
  }
});
