/**
 * blocking-close S1 (spec 1, 2, 4, 6; L1-L5, ADR 0178): the pilot closes any open blocking question on a
 * ticket with `Moot: <why>` or `Assumed: <what>`, with no press from the user, and its gate2 then posts.
 * Any other close of an unanswered blocking item is still refused, the prefixes are the pilot's alone,
 * never on a gate, signoff, walkthrough or proposal, and the user's reopen puts the hold back for good.
 * Widens blocked-yellow-yields S5's `Blocked:`-only Moot (ADR 0153 A4).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { PILOT_CLOSES, isPilotClose } from '../blocked-shape.mjs';
import {
  ASSUME_DEFAULT, KIND_GATE1, KIND_GATE2, KIND_QUESTION, KIND_SIGNOFF, KIND_TICKET, KIND_WALKTHROUGH, isOpen,
} from '../items.mjs';
import { YIELD_MS } from '../lanes.mjs';
import { DeckRefusal, listItems, postItem, reopenItem, resolveItem, setCoPilot, yieldTicket } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const PILOT = ''; // the stamp `hooks/deck-author.js` writes for the main session
const QA = 'pilot:pilot-qa';
const [MOOT, ASSUMED] = PILOT_CLOSES;
const PAST = new Date(Date.now() - YIELD_MS - 60_000).toISOString();

const aTicket = (title, state = 'yellow') =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state });
const aDesign = (ticket, extra = {}) => postItem({
  kind: KIND_QUESTION, title: 'Schema for it', body: 'which?', repo: REPO,
  options: ['A', 'B'], recommended: 'A', ticket: ticket.id, blocking: true, ...extra,
});
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));
const invitingNoPilotClose = (error) => error instanceof DeckRefusal && !error.message.includes(`${MOOT} <why>`) && !error.message.includes(`${ASSUMED} <what>`);

/** A live ticket held by one blocking design question. */
function heldByDesign(t) {
  tempDeck(t);
  const ticket = aTicket('Ours');
  takeLive(ticket.id);
  return { ticket, design: aDesign(ticket) };
}

test('the pilot closes a blocking design question as Moot', (t) => {
  const { ticket, design } = heldByDesign(t);
  const why = `${MOOT} done another way`;
  assert.throws(() => aGate2(ticket), refusedNaming('gate2', design.id), 'held before the close');

  resolveItem(design.id, why, PILOT);

  const closed = reread(design.id);
  assert.equal(isOpen(closed), false);
  assert.equal(closed.resolution, why);
  assert.equal(closed.notice, true, 'the user sees the close notice');
  aGate2(ticket);
  assert.equal(reread(ticket.id).state, 'green', 'the gate2 post is accepted');
});

test('the pilot closes a blocking design question as Assumed', (t) => {
  const { ticket, design } = heldByDesign(t);
  const what = `${ASSUMED} B, the schema the migration already uses`;
  assert.throws(() => aGate2(ticket), refusedNaming('gate2', design.id), 'held before the close');

  resolveItem(design.id, what, PILOT);

  const closed = reread(design.id);
  assert.equal(isOpen(closed), false);
  assert.equal(closed.resolution, what);
  assert.equal(closed.notice, true);
  aGate2(ticket);
  assert.equal(reread(ticket.id).state, 'green', 'the gate2 post is accepted');
});

test('a bare or empty close is refused naming both prefixes', (t) => {
  const { design } = heldByDesign(t);
  for (const bare of ['Done', MOOT, `${ASSUMED}   `]) {
    assert.throws(
      () => resolveItem(design.id, bare, PILOT),
      refusedNaming(design.id, 'blocking', MOOT, ASSUMED, ASSUME_DEFAULT),
      `refused: ${JSON.stringify(bare)}`,
    );
  }
  assert.equal(isOpen(reread(design.id)), true);
});

test('only the pilot', (t) => {
  const { design } = heldByDesign(t);
  const why = `${MOOT} no longer matters`;
  // The owner check refuses a QA writer first, so the predicate's own author check is asserted directly.
  assert.equal(isPilotClose(reread(design.id), why, QA), false, 'a QA writer');
  assert.throws(() => resolveItem(design.id, why, undefined), refusedNaming(design.id, 'blocking'), 'an unstamped writer');
  assert.equal(isOpen(reread(design.id)), true);
});

test('never a gate, walkthrough or proposal', (t) => {
  tempDeck(t);
  const ticket = aTicket('Kinds', 'green');
  const why = `${MOOT} no longer matters`;
  const held = [
    postStored({ kind: KIND_GATE1, title: 'Gate 1', body: 'Sign it.', repo: REPO, ticket: ticket.id }),
    postStored({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, ticket: ticket.id }),
    postStored({ kind: KIND_SIGNOFF, title: 'Sign off', body: 'Done?', repo: REPO, ticket: ticket.id }),
    postStored({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket: ticket.id, blocking: true }),
    postStored({ kind: KIND_QUESTION, title: 'Tickets', body: 'Cut?', repo: REPO, options: ['Yes', 'No'], blocking: true, proposal: true }),
  ];
  for (const item of held) {
    assert.throws(() => resolveItem(item.id, why, PILOT), DeckRefusal, `${item.kind}${item.proposal ? ' proposal' : ''}`);
    assert.equal(isOpen(reread(item.id)), true, item.kind);
  }
  assert.throws(() => resolveItem(held[4].id, why, PILOT), invitingNoPilotClose, 'a proposal is never invited to a pilot close');
  const note = postStored({ kind: KIND_QUESTION, title: 'FYI', body: 'Noted?', repo: REPO, options: ['Yes'], ticket: ticket.id });
  assert.throws(() => resolveItem(note.id, `${ASSUMED} yes`, PILOT), refusedNaming(note.id, ASSUMED, 'plain words'), 'a prefix on a non-blocking question');
  resolveItem(note.id, 'Noted', PILOT);
  assert.equal(isOpen(reread(note.id)), false, 'plain words still close it');
});

test('a pilot close resumes the ticket a design question paused', (t) => {
  tempDeck(t);
  aTicket('first');
  const ticket = aTicket('building');
  setCoPilot(ticket.id, true);
  const design = postStored({
    kind: KIND_QUESTION, title: 'Which schema?', body: 'which?', repo: REPO, ticket: ticket.id, blocking: true,
    options: ['A', 'B'], recommended: 'A', postedAt: PAST,
  });
  yieldTicket(ticket.id, design.id);
  assert.equal(reread(ticket.id).state, 'green', 'paused');

  resolveItem(design.id, `${ASSUMED} A`, PILOT);

  const after = reread(ticket.id);
  assert.equal(after.state, 'yellow');
  assert.equal(Object.hasOwn(after, 'paused'), false, 'paused is gone');
});

test("the user's reopen restores the hold for good", (t) => {
  const { ticket, design } = heldByDesign(t);
  resolveItem(design.id, `${MOOT} done another way`, PILOT);
  assert.equal(isOpen(reread(design.id)), false);

  reopenItem(design.id);

  for (const close of [`${MOOT} still not needed`, `${ASSUMED} A`]) {
    assert.throws(() => resolveItem(design.id, close, PILOT), refusedNaming(design.id, 'blocking', 'reopened'), close);
    assert.throws(() => resolveItem(design.id, close, PILOT), invitingNoPilotClose, `${close}: the refusal never invites the close it refuses`);
  }
  assert.throws(() => aGate2(ticket), refusedNaming('gate2', design.id), 'the gate2 is held again');
  assert.equal(isOpen(reread(design.id)), true);
});
