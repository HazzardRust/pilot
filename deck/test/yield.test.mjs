/**
 * blocked-yellow-yields S1 (spec 1, 5; L1, L2, L4, L5, A1): the deck pauses the co-pilot's held ticket when its
 * blocking question has had no word from the user for `YIELD_MS`. `yieldsDue` is the rule, `yieldTicket` the one
 * write, `armYields` the timer that makes it with no pilot turn. Every test takes its own store; the clock is
 * mocked, never waited on; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_QUESTION, KIND_TICKET, messagesOf } from '../items.mjs';
import { YIELD_MS, yieldsDue } from '../lanes.mjs';
import { armYields } from '../server-wait.mjs';
import { DeckRefusal, addReply, coPilotFor, listItems, pivotTicket, requestSwitch, setCoPilot, takeTicket, yieldTicket } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const OTHER = path.join('D:', 'work', 'other');
const MINUTE = 60_000;
const START = Date.parse('2026-10-17T10:00:00Z');

const stored = (id) => listItems().find((item) => item.id === id);
const yellow = (title, repo = REPO) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo, sliceCount: 3, state: 'yellow' });
const held = (title, repo = REPO) => {
  const ticket = yellow(title, repo);
  setCoPilot(ticket.id, true);
  return ticket;
};
const blocking = (ticket, minutesAgo, now = Date.now(), extra = {}) =>
  postStored({
    kind: KIND_QUESTION,
    title: 'Which?',
    body: 'A or B',
    repo: ticket.repo,
    ticket: ticket.id,
    blocking: true,
    postedAt: new Date(now - minutesAgo * MINUTE).toISOString(),
    ...extra,
  });

test('a question 20 minutes unanswered is due', () => {
  assert.equal(YIELD_MS, 20 * MINUTE, 'one constant, 20 minutes (spec 5, L4)');
  const ticket = { id: 'itm_held', kind: KIND_TICKET, repo: REPO, state: 'yellow', replies: [] };
  const postedAt = '2026-10-17T10:00:00.000Z';
  const question = { id: 'itm_q', kind: KIND_QUESTION, repo: REPO, ticket: ticket.id, blocking: true, postedAt, replies: [] };
  const at = Date.parse(postedAt) + YIELD_MS;

  assert.deepEqual(yieldsDue([ticket, question], REPO, ticket.id, at), [{ ticket: ticket.id, question: question.id, at }]);
  assert.deepEqual(yieldsDue([ticket, question], REPO, ticket.id, at - 1), [], 'a minute short of the 20 is not due');

  const answered = { ...question, replies: [{ from: 'user', text: 'A', repliedAt: postedAt }] };
  assert.deepEqual(yieldsDue([ticket, answered], REPO, ticket.id, at), [], 'a user reply on it answers it (A1)');
  assert.deepEqual(yieldsDue([ticket, question], REPO, 'itm_another', at), [], 'only the held ticket yields (L5)');
  assert.deepEqual(yieldsDue([ticket, question], REPO, undefined, at), [], 'no co-pilot, no yield');
  const plain = { ...question, blocking: undefined };
  assert.deepEqual(yieldsDue([ticket, plain], REPO, ticket.id, at), [], 'a question that does not block never yields');
});

test('the yield writes green, paused and released in one write', (t) => {
  tempDeck(t);
  const ticket = held('building');
  const question = blocking(ticket, 21);

  const paused = yieldTicket(ticket.id, question.id);
  assert.equal(paused.id, ticket.id);
  const after = stored(ticket.id);
  assert.equal(after.state, 'green', 'paused is green (L1)');
  assert.equal(after.paused.question, question.id);
  assert.ok(Number.isFinite(Date.parse(after.paused.at)), 'the pause is stamped');
  assert.equal(coPilotFor(REPO).live, false, 'the co-pilot lane is released');

  const line = messagesOf(stored(question.id)).at(-1);
  assert.equal(line.from, 'deck');
  assert.equal(line.author, 'deck');
  assert.ok(Number.isInteger(line.seq), 'a seq, so a parked pilot wait wakes on it');
  assert.equal(
    line.text,
    `Paused ${ticket.id}: ${question.id} unanswered 20 min; send the co-pilot the pause, then deck_ticket co-pilot the next runnable ticket`,
  );
});

test('a yield no longer due is refused', (t) => {
  tempDeck(t);
  const early = held('early');
  const fresh = blocking(early, 19);
  assert.throws(() => yieldTicket(early.id, fresh.id), DeckRefusal, 'not 20 minutes yet');

  const replied = blocking(early, 30);
  addReply(replied.id, 'A');
  assert.throws(() => yieldTicket(early.id, replied.id), DeckRefusal, 'the user replied');
  assert.equal(stored(early.id).state, 'yellow');

  const other = held('elsewhere', OTHER);
  const green = postStored({ kind: KIND_TICKET, title: 'green', body: shapedTicketBody('green'), repo: OTHER, sliceCount: 3, state: 'green' });
  const onGreen = blocking(green, 30);
  assert.throws(() => yieldTicket(green.id, onGreen.id), DeckRefusal, 'the ticket is not yellow');

  const queued = yellow('queued', OTHER);
  const onQueued = blocking(queued, 30);
  assert.throws(() => yieldTicket(queued.id, onQueued.id), DeckRefusal, `the co-pilot holds ${other.id}`);
  assert.equal(stored(queued.id).state, 'yellow');
  assert.equal(coPilotFor(OTHER).live, true, 'a refused yield releases nothing');
  assert.equal(messagesOf(stored(onQueued.id)).length, 0, 'and writes no line');
});

test('an overdue yield fires on start', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const overdue = held('overdue');
  blocking(overdue, 25);
  const later = held('later', OTHER);
  blocking(later, 10);

  armYields();
  t.mock.timers.tick(0);
  assert.equal(stored(overdue.id).state, 'green', 'a yield 25 minutes old fires at once');
  assert.equal(stored(later.id).state, 'yellow');

  t.mock.timers.tick(10 * MINUTE - 1);
  assert.equal(stored(later.id).state, 'yellow', 'not before its 20 minutes');
  t.mock.timers.tick(1);
  assert.equal(stored(later.id).state, 'green', 'a 10-minute one yields 10 minutes later');
  assert.equal(stored(later.id).paused.at, new Date(START + 10 * MINUTE).toISOString());
});

test('a reply before the 20 minutes clears its timer, and a second arm adds none', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const answered = held('answered');
  const asked = blocking(answered, 10);
  const waiting = held('waiting', OTHER);
  const unanswered = blocking(waiting, 10);

  armYields();
  armYields();
  addReply(asked.id, 'A');
  armYields();
  t.mock.timers.tick(10 * MINUTE);
  assert.equal(stored(answered.id).state, 'yellow', 'the user answered, so nothing yields');
  assert.equal(stored(waiting.id).state, 'green');
  const deckLines = (id) => messagesOf(stored(id)).filter((message) => message.from === 'deck').length;
  assert.equal(deckLines(asked.id), 0);
  assert.equal(deckLines(unanswered.id), 1, 'one timer per yield, however often it is armed');
});

test('a paused ticket is never taken or continued, and a pivot drops its pause', (t) => {
  tempDeck(t);
  const ticket = held('paused');
  const question = blocking(ticket, 21);
  yieldTicket(ticket.id, question.id);

  const onQuestion = (err) => err instanceof DeckRefusal && err.message.includes(question.id);
  assert.throws(() => takeTicket(ticket.id), onQuestion, 'take names the question it waits on');
  assert.throws(() => requestSwitch(REPO, ticket.id), onQuestion, 'Continue names it too');
  assert.throws(() => requestSwitch(REPO, ticket.id, { complete: true }), onQuestion);
  assert.equal(stored(ticket.id).live, undefined, 'nothing took it');

  pivotTicket(ticket.id);
  assert.equal(stored(ticket.id).state, 'yellow');
  assert.equal(stored(ticket.id).paused, undefined, 'a pivoted ticket is no longer paused');
});

test('a timer that fires after the user answered is refused quietly and yields nothing', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const ticket = held('answered late');
  const question = blocking(ticket, 10);
  const errors = t.mock.method(console, 'error', () => {});

  armYields();
  addReply(question.id, 'A'); // straight to the store: no announceChange, so the armed timer stands
  t.mock.timers.tick(10 * MINUTE);
  assert.equal(stored(ticket.id).state, 'yellow', 'the refused yield wrote nothing');
  assert.equal(messagesOf(stored(question.id)).filter((message) => message.from === 'deck').length, 0);
  assert.equal(errors.mock.callCount(), 0, 'a refusal is expected, not an error');
});
