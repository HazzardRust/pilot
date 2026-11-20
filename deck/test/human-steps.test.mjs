/**
 * S1 of human-steps: a steps thread stands under its green ticket until the user presses Done,
 * which closes both in one write; no agent closes or posts one, and nothing waits on it
 * (spec 3, 4, 5, 6; L2-L6, ADR 0202).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_REPORT, KIND_STEPS, KIND_TICKET, NOT_YET, SIGN_OFF, CLOSED_BY_USER, isStanding, isRecord, nextTicketOf, stateOf } from '../items.mjs';
import { isReportOwed } from '../owed.mjs';
import { DeckRefusal, closeItem, listItems, postItem, postSteps, reopenItem, repliesSince, resolveItem } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const CHECKS = 'Walk it.\n\n| spec | result | evidence |\n| --- | --- | --- |\n| 1 | pass | ok |';
const reread = (id) => listItems().find((item) => item.id === id);
const STEPS = [{ text: 'Merge the main PR #140 on GitHub.' }, { text: 'Remove D:/work/pilot-s1 when you are done with it.' }];

/** A green ticket whose gate2 the user signed and the deck landed: what the lander's report closes today. */
const aLandedTicket = (title = 'land the thing') => {
  const ticket = postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, state: 'green', live: true, concludedBy: 'itm_0123456789ab' });
  const at = new Date().toISOString();
  postStored({
    kind: KIND_GATE2, title: 'Gate 2', body: CHECKS, repo: REPO, ticket: ticket.id, options: [SIGN_OFF, NOT_YET],
    replies: [{ from: 'user', text: SIGN_OFF, repliedAt: at }], resolution: 'landed abc1234', resolvedAt: at,
    landing: { state: 'landed', sha: 'abc1234def' },
  });
  return ticket;
};
const aReport = (ticket) => postItem({ kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO, ticket });
const aSteps = (ticket, steps = STEPS) => postSteps({ ticket, repo: REPO, title: 'Human steps', steps });
const refused = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('a report leaves its ticket green while a steps thread is open', (t) => {
  tempDeck(t);
  const ticket = aLandedTicket();
  aSteps(ticket.id);
  aReport(ticket.id);
  const after = reread(ticket.id);
  assert.equal(stateOf(after), 'green');
  assert.equal(after.live, undefined);
  assert.equal(after.concludedBy, undefined);
  assert.throws(
    () => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: CHECKS, repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id }),
    refused(ticket.id, 'not live'),
  );
});

test('a report on a ticket with no steps thread closes it as today', (t) => {
  tempDeck(t);
  const ticket = aLandedTicket();
  const report = aReport(ticket.id);
  const after = reread(ticket.id);
  assert.equal(stateOf(after), 'closed');
  assert.equal(after.resolution, `closed by ${report.id}`);
  assert.equal(after.resolvedAt, report.postedAt);
});

test('Done closes thread and ticket and hands nothing to a waiter', (t) => {
  tempDeck(t);
  const ticket = aLandedTicket();
  const steps = aSteps(ticket.id);
  aReport(ticket.id);
  const seqBefore = repliesSince(0).seq;
  closeItem(steps.id);
  const [thread, closed] = [reread(steps.id), reread(ticket.id)];
  assert.equal(thread.resolution, CLOSED_BY_USER);
  assert.deepEqual(thread.replies, [], 'Done writes no reply');
  // The fields a report's close writes (test 2), here naming the thread.
  assert.equal(stateOf(closed), 'closed');
  assert.equal(closed.resolution, `closed by ${steps.id}`);
  assert.equal(closed.resolvedAt, thread.resolvedAt);
  assert.equal(closed.live, undefined);
  assert.equal(closed.concludedBy, undefined);
  assert.throws(() => reopenItem(steps.id), refused(steps.id, 'not reopened'));
  assert.equal(repliesSince(seqBefore).replies.length, 0);
});

test('no agent closes or posts a steps thread', (t) => {
  tempDeck(t);
  const ticket = aLandedTicket();
  const steps = aSteps(ticket.id);
  for (const author of ['pilot', 'pilot:pilot-lander', 'pilot:pilot-qa']) {
    assert.throws(() => resolveItem(steps.id, 'done', author), refused(steps.id, 'Done'), author);
  }
  assert.equal(reread(steps.id).resolvedAt, undefined, 'the thread stays open');
  assert.throws(() => postItem({ kind: KIND_STEPS, title: 'Steps', body: 'Do it.', repo: REPO, ticket: ticket.id }), refused('kind must be one of', '"steps"'));
});

test('the ticket holds no lane and is owed nothing', (t) => {
  tempDeck(t);
  const ticket = aLandedTicket();
  aSteps(ticket.id);
  assert.equal(isReportOwed(reread(ticket.id), listItems()), true, 'owed before the report');
  aReport(ticket.id);
  assert.equal(isReportOwed(reread(ticket.id), listItems()), false);
  const next = postStored({ kind: KIND_TICKET, title: 'the next one', body: shapedTicketBody('the next one'), repo: REPO, state: 'green' });
  assert.equal(nextTicketOf(listItems(), REPO, 'green')?.id, next.id);
});

test('the Stop gate does not hold for it', () => {
  assert.equal(isStanding({ kind: KIND_STEPS }), true);
  assert.equal(isRecord({ kind: KIND_STEPS }), true);
});

test('postSteps refuses a ticket not open green and steps out of shape', (t) => {
  tempDeck(t);
  const ticket = aLandedTicket();
  const yellow = postStored({ kind: KIND_TICKET, title: 'y', body: shapedTicketBody('y'), repo: REPO, state: 'yellow' });
  assert.throws(() => aSteps(yellow.id), refused(yellow.id, 'yellow'));
  assert.throws(() => aSteps('itm_ffffffffffff'), refused('itm_ffffffffffff'));
  assert.throws(() => aSteps(ticket.id, []), refused('1 to 20'));
  assert.throws(() => aSteps(ticket.id, Array.from({ length: 21 }, (_, i) => ({ text: `step ${i}` }))), refused('1 to 20'));
  assert.throws(() => aSteps(ticket.id, [{ text: '   ' }]), refused('step 1'));
  assert.throws(() => aSteps(ticket.id, [{ text: 'x'.repeat(301) }]), refused('step 1', '300'));
  assert.throws(() => aSteps(ticket.id, [{ text: 'one\ntwo' }]), refused('step 1', 'one line'));
  assert.throws(() => aSteps(ticket.id, [{ text: 'Set GH_TOKEN=ghp_' + 'a'.repeat(36) }]), refused('refuses to store these steps'));
  assert.throws(() => postSteps({ ticket: ticket.id, repo: path.join('D:', 'work', 'other'), title: 'Human steps', steps: STEPS }), refused(ticket.id, 'another'));
  assert.equal(listItems().filter((item) => item.kind === KIND_STEPS).length, 0, 'nothing stored');
  const posted = aSteps(ticket.id, [{ text: '  Merge the main PR.  ' }]);
  assert.deepEqual(posted.steps, [{ text: 'Merge the main PR.' }]);
  assert.throws(() => aSteps(ticket.id), refused(posted.id), 'one open steps thread per ticket');
});
