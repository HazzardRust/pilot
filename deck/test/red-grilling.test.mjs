/**
 * Green-phase grilling (ticket-states spec 17, 20; L6, L21, L22): a question names its ticket, waits
 * without holding the Stop gate while that ticket is not live, and lets the ticket's gate2 be posted; a
 * blocking one holds back its Sign off until it closes (yellow-lane L3). The first green ticket opens the Tickets tab with its previews.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, KIND_TICKET, NOT_YET, SIGN_OFF, chosenOf, openQuestionsOf } from '../items.mjs';
import { DeckRefusal, addReply, dismissItem, listItems, parkTicket, postItem, registerRun, resolveItem } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { awaitsUser: holds } = createRequire(import.meta.url)('../../hooks/stop-gate.js');
const awaitsUser = (item, items) => holds(item, [item.id], items);

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title, state = 'yellow') => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state });
const askOn = (ticket, title = `About ${ticket?.title}`, extra = {}) =>
  postItem({ kind: KIND_QUESTION, title, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ...(ticket && { ticket: ticket.id }), ...extra });
const answered = (question) => {
  addReply(question.id, 'A');
  resolveItem(question.id, 'A');
};
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));
const page = () => {
  const run = registerRun({ repo: REPO, pid: process.pid });
  return renderHomePage(listItems(), [{ ...run, feature: 'x' }], REPO, false, {}, {}, Date.now());
};
const rowOf = (html, ticket) => html.match(new RegExp(`<li data-state="[a-z]+"(?: class="in-hand")?>(?:<span class="next"(?: data-lane="co-pilot")?>next</span>)?<a href="/thread/${ticket.id}">.*?</details></li>`, 's'))?.[0] ?? '';

test('a question on a parked ticket does not hold the Stop gate', (t) => {
  tempDeck(t);
  const ticket = aTicket('Parked');
  takeLive(ticket.id);
  const question = askOn(ticket);
  // Already parked: a yellow ticket is never in the main slot, and its gate2 needs no take (yellow-agent S4, ADR 0087).

  assert.equal(question.ticket, ticket.id, 'a question carries its ticket');
  assert.deepEqual(openQuestionsOf(listItems(), ticket.id).map((item) => item.id), [question.id]);
  assert.equal(awaitsUser(reread(question.id), listItems()), false);
});

test('a question on the live ticket does', (t) => {
  tempDeck(t);
  const ticket = aTicket('Live', 'red');
  takeLive(ticket.id);
  const question = askOn(ticket);
  const plain = askOn(undefined, 'No ticket');

  for (const item of [question, plain]) {
    assert.equal(awaitsUser(reread(item.id), listItems()), true, item.title);
  }
  assert.throws(() => askOn({ id: 'itm_0123456789ab' }), refusedNaming('itm_0123456789ab'), 'a ticket on no item is refused');
  assert.throws(() => askOn(plain), refusedNaming(plain.id, 'not a ticket'), 'a question names a ticket, not another item');
  const theirs = postStored({ kind: KIND_TICKET, title: 'Theirs', body: shapedTicketBody('t'), repo: path.resolve('D:/work/other'), state: 'red' });
  assert.throws(() => askOn(theirs), refusedNaming(theirs.id, 'another directory'), "another directory's ticket is refused");
});

test('gate2 can be posted while its ticket has open questions, and the ticket turns green', (t) => {
  tempDeck(t);
  const ticket = aTicket('Asked');
  takeLive(ticket.id);
  askOn(ticket);

  const gate2 = aGate2(ticket);
  assert.equal(gate2.ticket, ticket.id);
  assert.equal(reread(ticket.id).state, 'green');
});

test('Sign off on that gate2 is refused by name until the blocking questions close', (t) => {
  tempDeck(t);
  const ticket = aTicket('Asked');
  takeLive(ticket.id);
  const gate2 = aGate2(ticket);
  const first = askOn(ticket, 'First', { blocking: true });
  const second = askOn(ticket, 'Second', { blocking: true });

  assert.throws(
    () => addReply(gate2.id, SIGN_OFF),
    (error) => error instanceof DeckRefusal && error.message === `gate2 ${gate2.id} waits on 2 open blocking item(s) on ticket ${ticket.id}: ${first.id}, ${second.id}; answer them or press Assume the default first`,
  );
  assert.equal(chosenOf(reread(gate2.id)), null, 'nothing stored');
  addReply(gate2.id, NOT_YET);
  assert.equal(chosenOf(reread(gate2.id)), NOT_YET, 'Not yet is never held back');

  answered(first);
  assert.throws(() => addReply(gate2.id, SIGN_OFF), refusedNaming('1 open blocking item(s)', second.id));
  answered(second);
  addReply(gate2.id, SIGN_OFF);
  assert.equal(chosenOf(reread(gate2.id)), SIGN_OFF, 'signed once they close');
});

test('a Sign off pressed before a question was posted is refused at resolve, by the same words (QA F1)', (t) => {
  tempDeck(t);
  const ticket = aTicket('Signed early');
  takeLive(ticket.id);
  const gate2 = aGate2(ticket);
  addReply(gate2.id, SIGN_OFF);
  const late = askOn(ticket, 'Late', { blocking: true });

  assert.throws(
    () => resolveItem(gate2.id, 'signed off'),
    (error) => error instanceof DeckRefusal && error.message === `gate2 ${gate2.id} waits on 1 open blocking item(s) on ticket ${ticket.id}: ${late.id}; answer them or press Assume the default first`,
  );
  assert.equal(reread(gate2.id).resolvedAt, undefined, 'still open');
  answered(late);
  resolveItem(gate2.id, 'signed off');
  assert.equal(typeof reread(gate2.id).resolvedAt, 'string', 'closes once the question does');
});

// L22 revised (S18): no question of another ticket, and none naming no ticket, refuses the post.
test('an open question not naming the ticket refuses nothing', (t) => {
  tempDeck(t);
  const ticket = aTicket('Ours');
  const other = aTicket('Theirs');
  takeLive(ticket.id);
  askOn(undefined, 'No ticket');
  askOn(other);

  aGate2(ticket);
  assert.equal(reread(ticket.id).state, 'green');
});

test('the row shows the question count', (t) => {
  tempDeck(t);
  const ticket = aTicket('Asked');
  const quiet = aTicket('Quiet');
  takeLive(ticket.id);
  askOn(ticket, 'One');
  askOn(ticket, 'Two');

  assert.match(rowOf(page(), ticket), /<span class="questions">2 questions<\/span>/);
  assert.doesNotMatch(rowOf(page(), quiet), /class="questions"/);
});

test('the first green ticket carries its queued questions and its gate2, the Tickets tab left shut (overview-one-ticket A2)', (t) => {
  tempDeck(t);
  aTicket('Red', 'red');
  const ticket = aTicket('Green one');
  takeLive(ticket.id);
  const question = askOn(ticket, 'Which colour');
  const gate2 = aGate2(ticket);
  // Already parked: a yellow ticket is never in the main slot, and its gate2 needs no take (yellow-agent S4, ADR 0087).

  const html = page();
  assert.match(html, /<details class="tab" id="tickets">/, 'the tab no longer opens itself');
  const row = rowOf(html, ticket);
  assert.match(row, /<span class="next">next<\/span>/, "nextTicketOf's pick");
  assert.match(row, /<details class="previews"><summary>threads<\/summary>/, 'the previews start folded, as spec does');
  assert.match(row, new RegExp(`class="previews".*href="/thread/${question.id}">Which colour<.*href="/thread/${gate2.id}">Gate 2<`, 's'));

  resolveItem(question.id, 'A');
  dismissItem(gate2.id); // an unsigned gate leaves by the user's Dismiss (merge-first L8)
  assert.doesNotMatch(rowOf(page(), ticket), /class="previews"/, 'nothing open, no previews');
});

test('a red head leaves the Tickets tab as the user left it, a question waiting or not (overview-one-ticket A2)', (t) => {
  tempDeck(t);
  const red = aTicket('Red', 'red');
  assert.match(page(), /<details class="tab" id="tickets">/);

  takeLive(red.id);
  const question = askOn(red, 'Which way');
  parkTicket(red.id);
  assert.match(page(), /<details class="tab" id="tickets">/, 'a head a question waits on no longer opens it');
  assert.match(rowOf(page(), red), new RegExp(`class="previews".*href="/thread/${question.id}">Which way<`, 's'));
});
