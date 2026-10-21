/**
 * blocked-yellow-yields S5 (spec 6, A4): the pilot closes a `Blocked:` item whose step no longer
 * matters with a resolution starting `Moot:`, with no press from the user, and its gate2 then posts.
 * Any other close of an unanswered blocking item is still refused, and `Moot:` is the pilot's alone,
 * on `Blocked:` questions alone.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { MOOT, isMoot } from '../blocked-shape.mjs';
import { ASSUME_DEFAULT, KIND_GATE2, KIND_QUESTION, KIND_TICKET, KIND_WALKTHROUGH, isOpen } from '../items.mjs';
import { DeckRefusal, listItems, postItem, resolveItem } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const PILOT = ''; // the stamp `hooks/deck-author.js` writes for the main session
const QA = 'pilot:pilot-qa';

const aTicket = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'yellow' });
const aBlocked = (ticket) => postItem({
  kind: KIND_QUESTION, title: 'Blocked: npm publish', body: 'denied', repo: REPO,
  options: ['I ran it', 'Skip it'], recommended: 'Skip it', ticket: ticket.id, blocking: true,
});
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('a moot Blocked item closes and frees its gate2', (t) => {
  tempDeck(t);
  const ticket = aTicket('Ours');
  takeLive(ticket.id);
  const blocked = aBlocked(ticket);
  const why = `${MOOT} done another way`;
  assert.equal(isMoot(reread(blocked.id), why, PILOT), true);
  assert.throws(() => aGate2(ticket), refusedNaming('gate2', blocked.id), 'held before the close');

  resolveItem(blocked.id, why, PILOT);

  const closed = reread(blocked.id);
  assert.equal(isOpen(closed), false);
  assert.equal(closed.resolution, why);
  assert.equal(closed.notice, true, 'the user sees the close notice');
  aGate2(ticket);
  assert.equal(reread(ticket.id).state, 'green', 'the gate2 post is accepted');
});

test('a plain close still waits', (t) => {
  tempDeck(t);
  const ticket = aTicket('Plain');
  takeLive(ticket.id);
  const blocked = aBlocked(ticket);
  assert.throws(() => resolveItem(blocked.id, 'Done', PILOT), refusedNaming(blocked.id, 'blocking', ASSUME_DEFAULT));
  assert.equal(isOpen(reread(blocked.id)), true);
});

test("Moot is only for Blocked items, and only the pilot's", (t) => {
  tempDeck(t);
  const ticket = aTicket('Design');
  takeLive(ticket.id);
  const design = postItem({
    kind: KIND_QUESTION, title: 'Schema for Design', body: 'which?', repo: REPO,
    options: ['A', 'B'], recommended: 'A', ticket: ticket.id, blocking: true,
  });
  const why = `${MOOT} no longer matters`;
  assert.equal(isMoot(reread(design.id), why, PILOT), false, 'a blocking design question still needs the user');
  assert.throws(() => resolveItem(design.id, why, PILOT), refusedNaming(design.id, 'blocking'));

  const blocked = reread(aBlocked(ticket).id);
  assert.equal(isMoot(blocked, why, QA), false, 'a QA writer');
  assert.equal(isMoot(blocked, why, undefined), false, 'an unstamped writer');
  assert.equal(isMoot(blocked, MOOT, PILOT), false, 'a Moot with no reason');
  assert.equal(isMoot(blocked, 'done another way', PILOT), false, 'no Moot prefix');
  assert.equal(isMoot({ ...blocked, kind: KIND_WALKTHROUGH }, why, PILOT), false, 'a Blocked walkthrough');
});
