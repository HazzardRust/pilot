/**
 * blocked-yellow-yields S10 (spec 11; §2, A3, A4): the pilot's Moot close of a `Blocked:` item counts as answered for
 * `resumeIn`, so a ticket the yield paused on it resumes at the yellow head in the close's own write. Every test takes
 * its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { MOOT } from '../blocked-shape.mjs';
import { KIND_QUESTION, KIND_TICKET, ticketQueueOf } from '../items.mjs';
import { YIELD_MS } from '../lanes.mjs';
import { DeckRefusal, addReply, listItems, resolveItem, setCoPilot, yieldTicket } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const PILOT = ''; // the stamp `hooks/deck-author.js` writes for the main session
const PAST = new Date(Date.now() - YIELD_MS - 60_000).toISOString();

const stored = (id) => listItems().find((item) => item.id === id);
const yellow = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'yellow' });
const blocking = (ticket, title, extra = {}) =>
  postStored({
    kind: KIND_QUESTION, title, body: 'denied', repo: REPO, ticket: ticket.id, blocking: true,
    options: ['A', 'B'], recommended: 'A', postedAt: PAST, ...extra,
  });

/** Two yellow tickets queued, then the held one paused on `title`'s blocking question by the deck's own yield. */
function pausedOn(title) {
  yellow('first');
  yellow('second');
  const ticket = yellow('building');
  setCoPilot(ticket.id, true);
  const question = blocking(ticket, title);
  yieldTicket(ticket.id, question.id);
  assert.equal(stored(ticket.id).state, 'green');
  return { ticket, question };
}

test('a moot close of the pausing Blocked item resumes the ticket', (t) => {
  tempDeck(t);
  const { ticket, question } = pausedOn('Blocked: npm publish');

  resolveItem(question.id, `${MOOT} done another way`, PILOT);

  const after = stored(ticket.id);
  assert.equal(after.state, 'yellow');
  assert.equal(Object.hasOwn(after, 'paused'), false, 'paused is gone');
  assert.equal(ticketQueueOf(listItems(), REPO, 'yellow')[0].id, ticket.id, 'at the yellow head');
});

test('a moot close of the last unanswered blocker resumes it', (t) => {
  tempDeck(t);
  const { ticket, question } = pausedOn('Which schema?');
  const other = blocking(ticket, 'Blocked: deploy');

  addReply(question.id, 'B');
  assert.equal(stored(ticket.id).state, 'green', 'B is still unanswered');

  resolveItem(other.id, `${MOOT} not needed`, PILOT);

  const after = stored(ticket.id);
  assert.equal(after.state, 'yellow');
  assert.equal(after.paused, undefined);
});

test('a plain close resumes nothing', (t) => {
  tempDeck(t);
  const { ticket, question } = pausedOn('Blocked: npm publish');
  const note = blocking(ticket, 'FYI', { blocking: false });

  resolveItem(note.id, 'Noted', PILOT);
  assert.equal(stored(ticket.id).state, 'green');
  assert.equal(stored(ticket.id).paused.question, question.id);

  const design = blocking(ticket, 'Schema for it');
  assert.throws(() => resolveItem(design.id, `${MOOT} no longer matters`, PILOT), DeckRefusal);
  assert.equal(stored(ticket.id).state, 'green');
});

test('a moot of another blocker leaves the unanswered pausing question holding it', (t) => {
  tempDeck(t);
  const { ticket, question } = pausedOn('Which schema?');
  const other = blocking(ticket, 'Blocked: deploy');

  resolveItem(other.id, `${MOOT} not needed`, PILOT);

  assert.equal(stored(ticket.id).state, 'green');
  assert.equal(stored(ticket.id).paused.question, question.id);
});

test("a moot of another ticket's blocker leaves this one paused", (t) => {
  tempDeck(t);
  const { ticket, question } = pausedOn('Blocked: npm publish');
  const stranger = yellow('stranger');
  const theirs = blocking(stranger, 'Blocked: deploy');

  resolveItem(theirs.id, `${MOOT} not needed`, PILOT);

  assert.equal(stored(ticket.id).state, 'green');
  assert.equal(stored(ticket.id).paused.question, question.id);
});
