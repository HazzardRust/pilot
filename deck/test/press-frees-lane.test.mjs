/**
 * S1 of gate2-frees-lane: the Sign off press on a gate2 takes its ticket off the concluding lane in the press's own
 * write (spec 1, L1, L2). Landing is derived from the newest gate2's stored press, never stored; each queued stage
 * lane takes its head in place, concluding first, with no hand-off; one deck line with a `seq` names what went live;
 * and the gate2 thread reads `landing started` (spec 2).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_HANDOFF, KIND_TICKET, NOT_YET, SIGN_OFF, isLanding, liveTicketOf, standingOf } from '../items.mjs';
import { addReply, beginLanding, dismissItem, listItems, noteLaneFilled, pivotTicket, postItem, resolveItem, takeTicket } from '../store.mjs';
import { fillLanes } from '../chain.mjs';
import { aTicket, deckOnAPort, page, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/press');
const reread = (id) => listItems().find((item) => item.id === id);

/** A live green ticket with its gate2 posted, unsigned. */
function aConcluding(title = 'Conclude it', repo = REPO) {
  const ticket = takeLive(aTicket(title, 'green', repo).id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, pr: '#250', sha: '0305827', ticket: ticket.id });
  return { ticket, gate };
}

test('a signed ticket is landing', (t) => {
  tempDeck(t);
  const { ticket, gate } = aConcluding();
  assert.equal(isLanding(reread(ticket.id), listItems()), false, 'not before the press');

  addReply(gate.id, SIGN_OFF);
  assert.equal(isLanding(reread(ticket.id), listItems()), true, 'the press makes it landing');
  assert.equal(reread(ticket.id).landing, undefined, 'derived, never stored on the ticket (L1)');

  resolveItem(gate.id, 'Signed off.');
  assert.equal(isLanding(reread(ticket.id), listItems()), true, 'a closed signed gate2 still holds its press');

  pivotTicket(ticket.id);
  assert.equal(isLanding(reread(ticket.id), listItems()), false, 'a pivot to yellow ends it');
});

test('nothing un-presses: a Not yet after the press leaves it landing, so the filled lane keeps one live ticket', (t) => {
  tempDeck(t);
  const { ticket, gate } = aConcluding();
  const nextGreen = aTicket('Conclude next', 'green', REPO);
  addReply(gate.id, SIGN_OFF);
  fillLanes(REPO);
  addReply(gate.id, NOT_YET);
  assert.equal(isLanding(reread(ticket.id), listItems()), true);
  assert.equal(liveTicketOf(listItems(), REPO, 'green')?.id, nextGreen.id);
});

test('an unsigned Dismiss, or a newer unsigned gate2, is no landing', (t) => {
  tempDeck(t);
  const { ticket, gate } = aConcluding();
  dismissItem(gate.id);
  assert.equal(isLanding(reread(ticket.id), listItems()), false, 'dismissed unsigned');
  const signed = postItem({ kind: KIND_GATE2, title: 'Gate 2 again', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
  addReply(signed.id, SIGN_OFF);
  assert.equal(isLanding(reread(ticket.id), listItems()), true);
  resolveItem(signed.id, 'Signed off.');
  postItem({ kind: KIND_GATE2, title: 'Gate 2 third', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
  assert.equal(isLanding(reread(ticket.id), listItems()), false, 'the newest gate2 is unsigned');
});

test('a landing ticket holds no lane', (t) => {
  tempDeck(t);
  const { ticket, gate } = aConcluding();
  addReply(gate.id, SIGN_OFF);

  assert.equal(reread(ticket.id).live, true, 'still stored live');
  assert.equal(liveTicketOf(listItems(), REPO, 'green'), undefined);
  assert.equal(liveTicketOf(listItems(), REPO), undefined);
});

test('the rail reads landing', (t) => {
  tempDeck(t);
  const { ticket, gate } = aConcluding();
  addReply(gate.id, SIGN_OFF);
  assert.equal(standingOf(reread(ticket.id), listItems(), null), 'landing');
});

test('the Tickets row reads landing, not live', (t) => {
  tempDeck(t);
  const { ticket, gate } = aConcluding('Conclude it', aTicket('Where the lane tests run', 'red').repo);
  addReply(gate.id, SIGN_OFF);
  const row = rowsOf(page())[ticket.id];
  assert.match(row, /<span class="ticket-state" data-state="green">landing<\/span>/);
  assert.doesNotMatch(row, /class="live"/);
});

test('the press fills the concluding lane first', (t) => {
  tempDeck(t);
  const { gate } = aConcluding();
  const red = aTicket('Plan it', 'red', REPO);
  const nextGreen = aTicket('Conclude next', 'green', REPO);
  takeTicket(red.id);
  addReply(gate.id, SIGN_OFF);

  assert.deepEqual(fillLanes(REPO), [nextGreen.id], 'the green head, the planning lane being held');
  assert.equal(reread(nextGreen.id).live, true);
  assert.equal(listItems().filter((item) => item.kind === KIND_HANDOFF).length, 0, 'no hand-off');
  assert.deepEqual(fillLanes(REPO), [], 'both lanes held');
});

test('with no green queued the press takes the planning head when that lane is empty', (t) => {
  tempDeck(t);
  const { gate } = aConcluding();
  const red = aTicket('Plan it', 'red', REPO);
  addReply(gate.id, SIGN_OFF);

  assert.deepEqual(fillLanes(REPO), [red.id]);
  assert.equal(reread(red.id).live, true);
});

test('the press wakes the pilot once', (t) => {
  tempDeck(t);
  const { gate } = aConcluding();
  const before = reread(gate.id).replies.length;

  noteLaneFilled(gate.id, []);
  assert.equal(reread(gate.id).replies.length, before, 'nothing for an empty fill');

  noteLaneFilled(gate.id, ['itm_aaaaaaaaaaaa', 'itm_bbbbbbbbbbbb']);
  const added = reread(gate.id).replies.slice(before);
  assert.equal(added.length, 1, 'one line');
  const [line] = added;
  assert.equal(line.from, 'deck');
  assert.equal(typeof line.seq, 'number');
  assert.match(line.text, /itm_aaaaaaaaaaaa/);
  assert.match(line.text, /itm_bbbbbbbbbbbb/);
});

test('the thread reads landing started', (t) => {
  tempDeck(t);
  const { gate } = aConcluding();
  beginLanding(gate.id, { worktree: 'D:/work/press-wt' });
  assert.equal(reread(gate.id).replies.at(-1).text, 'landing started in D:/work/press-wt');
});

test('a Sign off pressed on the page frees the lane before land runs, with no hand-off', async (t) => {
  let atLand;
  const base = await deckOnAPort(t, {
    land: (id) => {
      atLand = { id, items: listItems() };
    },
  });
  const { ticket, gate } = aConcluding();
  const nextGreen = aTicket('Conclude next', 'green', REPO);

  const answer = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    redirect: 'manual',
    body: new URLSearchParams({ id: gate.id, choice: SIGN_OFF }),
  });

  assert.equal(answer.status, 303);
  assert.equal(atLand?.id, gate.id, 'land ran for the gate2');
  const live = liveTicketOf(atLand.items, REPO, 'green');
  assert.equal(live?.id, nextGreen.id, 'the next green was live before land started');
  assert.equal(standingOf(atLand.items.find((item) => item.id === ticket.id), atLand.items, null), 'landing');
  const note = atLand.items.find((item) => item.id === gate.id).replies.at(-1);
  assert.equal(note.from, 'deck');
  assert.match(note.text, new RegExp(nextGreen.id));
  assert.equal(listItems().filter((item) => item.kind === KIND_HANDOFF).length, 0, 'no hand-off: chainNext was not run');
  assert.equal(listItems().filter((item) => item.kind === KIND_TICKET && item.live === true).length, 2, 'the landing ticket keeps its stored mark');
});
