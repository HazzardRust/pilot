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
import { YIELD_MS, lanesFrom, yieldsDue } from '../lanes.mjs';
import { armYields } from '../server-wait.mjs';
import { DeckRefusal, addReply, coPilotFor, listItems, needTicket, pivotTicket, releaseCoPilot, resolveItem, requestSwitch, setCoPilot, takeTicket, yieldTicket } from '../store.mjs';
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

test('a yield keeps the ticket implementing and the slot held', (t) => {
  tempDeck(t);
  const ticket = held('draining');
  const question = blocking(ticket, 21);

  assert.equal(yieldTicket(ticket.id, question.id).id, ticket.id);
  const after = stored(ticket.id);
  assert.equal(after.state, 'yellow', 'implementing while its live slices finish (L6)');
  assert.equal(after.paused, undefined, 'not paused until the co-pilot hands back');
  assert.equal(after.yielding.question, question.id);
  assert.ok(Number.isFinite(Date.parse(after.yielding.at)), 'the yield is stamped');
  assert.deepEqual([coPilotFor(REPO).ticket, coPilotFor(REPO).live], [ticket.id, true], 'the slot stays held');
  const line = messagesOf(stored(question.id)).at(-1);
  assert.deepEqual([line.from, line.author], ['deck', 'deck']);
  assert.ok(Number.isInteger(line.seq), 'a seq, so a parked pilot wait wakes on it');
  assert.equal(
    line.text,
    `Yielding ${ticket.id}: ${question.id} unanswered 20 min; send the co-pilot the pause: it drains every live slice, then hands back paused`,
  );
});

test('the release after the drain pauses it', (t) => {
  tempDeck(t);
  const ticket = held('drained');
  const question = blocking(ticket, 21);
  yieldTicket(ticket.id, question.id);
  const { at } = stored(ticket.id).yielding;

  setCoPilot(ticket.id, false);
  const after = stored(ticket.id);
  assert.equal(after.state, 'green', 'handed back paused, for the user (L1)');
  assert.deepEqual(after.paused, { question: question.id, at }, 'paused on the question it yielded on');
  assert.equal(after.yielding, undefined);
  assert.equal(coPilotFor(REPO).live, false, 'only now is the slot free');
  setCoPilot(ticket.id, false);
  assert.deepEqual(stored(ticket.id), after, 'a ticket no longer yielding has nothing to finish');
});

test('a draining ticket never re-yields and is never refused idle', () => {
  const postedAt = '2026-10-17T10:00:00.000Z';
  const yielding = { question: 'itm_q', at: '2026-10-17T10:20:00.000Z' };
  const ticket = { id: 'itm_held', kind: KIND_TICKET, repo: REPO, state: 'yellow', yielding, replies: [] };
  const queued = { id: 'itm_next', kind: KIND_TICKET, repo: REPO, state: 'yellow', replies: [] };
  const question = { id: 'itm_q', kind: KIND_QUESTION, repo: REPO, ticket: ticket.id, blocking: true, postedAt, replies: [] };
  const items = [ticket, queued, question];

  assert.deepEqual(yieldsDue(items, REPO, ticket.id, Date.parse(postedAt) + 2 * YIELD_MS), [], 'one yield per drain');
  const lanes = lanesFrom(items, REPO, { switching: {}, coPilot: { ticket: ticket.id, live: true } });
  assert.equal(lanes.coPilot, `co-pilot: ${ticket.id} draining`, 'the lane stays held while it drains, and says so (never-stuck spec 9)');
  assert.equal(lanes.refusal, null, 'nothing pushes the next ticket in beside it');
});

test('an answer while draining cancels the yield', (t) => {
  tempDeck(t);
  const ticket = held('answered mid-drain');
  const question = blocking(ticket, 21);
  yieldTicket(ticket.id, question.id);

  addReply(question.id, 'A');
  const after = stored(ticket.id);
  assert.equal(after.state, 'yellow');
  assert.equal(after.yielding, undefined, 'the answer cancels the yield');
  setCoPilot(ticket.id, false);
  assert.equal(stored(ticket.id).state, 'yellow', 'so the release is a plain one, never a pause on an answered question');
  assert.equal(stored(ticket.id).paused, undefined);
});

test('any other hand-back of a draining ticket drops its yield', (t) => {
  tempDeck(t);
  const needed = held('needed');
  const question = blocking(needed, 21);
  yieldTicket(needed.id, question.id);
  postStored({ kind: KIND_QUESTION, title: 'Other?', body: 'C or D', repo: REPO, ticket: needed.id });
  needTicket(needed.id);
  assert.equal(stored(needed.id).yielding, undefined, 'a need hands it back green, no yield left');
  pivotTicket(needed.id);
  assert.deepEqual([stored(needed.id).state, stored(needed.id).yielding, stored(needed.id).paused], ['yellow', undefined, undefined]);

  const restarted = held('restarted', OTHER);
  yieldTicket(restarted.id, blocking(restarted, 21).id);
  releaseCoPilot(OTHER);
  assert.equal(stored(restarted.id).yielding, undefined, 'a new pilot session frees the slot and the yield with it');
  assert.deepEqual([stored(restarted.id).state, stored(restarted.id).paused], ['yellow', undefined], 'a restart hands nothing back paused');
});

test('a pivot drops a yield its release never cleared', (t) => {
  tempDeck(t);
  const stale = held('stale');
  yieldTicket(stale.id, blocking(stale, 21).id);
  const took = yellow('took the slot');
  requestSwitch(REPO, took.id);
  setCoPilot(took.id, true); // a switch: the slot now names another ticket, so the hand-back below releases nothing
  needTicket(stale.id);
  pivotTicket(stale.id);
  assert.deepEqual([stored(stale.id).state, stored(stale.id).yielding], ['yellow', undefined]);
});

test('a closed yielding ticket stays closed on its release', (t) => {
  tempDeck(t);
  const ticket = held('closed mid-drain');
  yieldTicket(ticket.id, blocking(ticket, 21).id);
  resolveItem(ticket.id, 'Closed.');
  setCoPilot(ticket.id, false);
  const after = stored(ticket.id);
  assert.deepEqual([after.state, after.paused, after.yielding], ['yellow', undefined, undefined]);
  assert.equal(coPilotFor(REPO).live, false);
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
  assert.ok(stored(overdue.id).yielding, 'a yield 25 minutes old fires at once');
  assert.equal(stored(later.id).yielding, undefined);

  t.mock.timers.tick(10 * MINUTE - 1);
  assert.equal(stored(later.id).yielding, undefined, 'not before its 20 minutes');
  t.mock.timers.tick(1);
  assert.equal(stored(later.id).yielding.at, new Date(START + 10 * MINUTE).toISOString(), 'a 10-minute one yields 10 minutes later');
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
  assert.equal(stored(answered.id).yielding, undefined, 'the user answered, so nothing yields');
  assert.ok(stored(waiting.id).yielding);
  const deckLines = (id) => messagesOf(stored(id)).filter((message) => message.from === 'deck').length;
  assert.equal(deckLines(asked.id), 0);
  assert.equal(deckLines(unanswered.id), 1, 'one timer per yield, however often it is armed');
});

test('a paused ticket is never taken or continued, and a pivot drops its pause', (t) => {
  tempDeck(t);
  const ticket = held('paused');
  const question = blocking(ticket, 21);
  yieldTicket(ticket.id, question.id);
  setCoPilot(ticket.id, false);

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
  assert.equal(stored(ticket.id).yielding, undefined, 'the refused yield wrote nothing');
  assert.equal(messagesOf(stored(question.id)).filter((message) => message.from === 'deck').length, 0);
  assert.equal(errors.mock.callCount(), 0, 'a refusal is expected, not an error');
});
