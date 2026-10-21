/**
 * S18 of ticket-states (spec 17 revised, L22 revised): only a blocking question stops its own ticket
 * turning green. A gate2 post and its Sign off are refused only by an open blocking item on its own
 * ticket (yellow-lane L3, deck/test/gate2-blockers.test.mjs); the away answer and the sub-deck's chain skip a blocking
 * question, and Assume the default answers it with the recommended option and makes it plain.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { ASSUME_DEFAULT, KIND_GATE2, KIND_QUESTION, KIND_TICKET, chosenOf, gate2Blockers, isBlocking, nextTicketOf } from '../items.mjs';
import { DeckRefusal, addReply, listItems, parkTicket, postItem, registerRun, resolveItem } from '../store.mjs';
import { callTool } from '../server.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { deckOnAPort, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title, state = 'yellow') => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state });
const aQuestion = (ticket, extra = {}) => ({
  kind: KIND_QUESTION, title: `About ${ticket.title}`, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket: ticket.id, ...extra,
});
const ask = (ticket, extra) => postItem(aQuestion(ticket, extra));
const askBlocking = (ticket) => ask(ticket, { title: `Schema for ${ticket.title}`, blocking: true });
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('a gate2 post is refused by name only by an open blocking question on its own ticket', (t) => {
  tempDeck(t);
  const plainTicket = aTicket('Plain');
  takeLive(plainTicket.id);
  ask(plainTicket);
  aGate2(plainTicket);
  assert.equal(reread(plainTicket.id).state, 'green', 'a plain question lets the gate2 post');

  const ours = aTicket('Ours');
  takeLive(ours.id);
  const blocker = askBlocking(ours);
  assert.equal(isBlocking(reread(blocker.id)), true);
  assert.deepEqual(gate2Blockers(listItems(), ours.id), [blocker.id]);
  assert.throws(() => aGate2(ours), refusedNaming('gate2', blocker.id));
  assert.equal(reread(ours.id).state, 'yellow', 'not green');

  const theirs = aTicket('Theirs');
  takeLive(theirs.id);
  aGate2(theirs);
  assert.equal(reread(theirs.id).state, 'green', "another ticket's blocking question refuses nothing");

  const loose = aTicket('Loose');
  takeLive(loose.id);
  postItem({ kind: KIND_QUESTION, title: 'No ticket', body: 'which?', repo: REPO, options: ['A'], recommended: 'A' });
  aGate2(loose);
  assert.equal(reread(loose.id).state, 'green', 'a question naming no ticket refuses nothing');
});

test("a gate1 is refused by its own ticket's open question and an unticketed one, never another ticket's (spec 17)", (t) => {
  tempDeck(t);
  const aGate1 = (ticket) => postItem({
    kind: 'gate1', title: 'Gate 1', body: 'design', repo: REPO, artefact: 'docs/design/x/architecture.md', sha: '0305827',
    locked: 1, slices: '| S1 |', sliceCount: 1, surface: false, branch: 'feat/x', ticket: ticket.id,
  });
  const green = aTicket('Green', 'green');
  ask(green);
  const red = aTicket('Red', 'red');
  takeLive(red.id);
  const own = ask(red);
  assert.throws(() => aGate1(red), refusedNaming('gate1', own.id));
  resolveItem(own.id, 'A');
  const loose = postItem({ kind: KIND_QUESTION, title: 'No ticket', body: 'which?', repo: REPO, options: ['A'], recommended: 'A' });
  assert.throws(() => aGate1(red), refusedNaming('gate1', loose.id));
  resolveItem(loose.id, 'A');
  aGate1(red);
});

test('blocking is a question field, a boolean, and needs ticket and recommended', (t) => {
  tempDeck(t);
  const ticket = aTicket('Asked');
  assert.throws(() => postItem({ kind: KIND_GATE2, title: 'G', body: 'b', repo: REPO, pr: '#1', sha: '0305827', ticket: ticket.id, blocking: true }), refusedNaming('takes no blocking'));
  assert.throws(() => ask(ticket, { blocking: 'yes' }), refusedNaming('blocking', 'true or false'));
  assert.throws(() => ask(ticket, { blocking: true, recommended: undefined }), refusedNaming('blocking', 'recommended'));
  assert.throws(() => ask(ticket, { blocking: true, ticket: undefined }), refusedNaming('blocking', 'ticket'));
  assert.equal(ask(ticket, { blocking: false }).blocking, undefined, 'plain is the default and is not stored');
});

test('Assume the default answers with the recommended option and lifts the refusal', async (t) => {
  const origin = await deckOnAPort(t);
  const ticket = aTicket('Ours');
  takeLive(ticket.id);
  const blocker = askBlocking(ticket);
  assert.throws(() => aGate2(ticket), refusedNaming(blocker.id));

  const answer = await fetch(`${origin}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ id: blocker.id, choice: ASSUME_DEFAULT }),
  });
  assert.equal(answer.status, 303);

  const stored = reread(blocker.id);
  assert.equal(chosenOf(stored), 'A', 'answered with the recommended option');
  assert.equal(stored.replies.at(-1).from, 'user', "recorded as the user's");
  assert.equal(isBlocking(stored), false, 'made plain');
  const gate2 = aGate2(ticket);
  assert.equal(reread(ticket.id).state, 'green', 'the refusal lifts');
  assert.deepEqual(gate2Blockers(listItems(), ticket.id), [], 'plain, so Sign off no longer waits on it (yellow-lane L3)');

  addReply(blocker.id, ASSUME_DEFAULT);
  assert.equal(reread(blocker.id).replies.length, 1, 'a second press inside the repeat window is that one reply again');

  const plain = ask(ticket, { title: 'Plain' });
  addReply(plain.id, ASSUME_DEFAULT);
  assert.equal(reread(plain.id).replies.at(-1).text, ASSUME_DEFAULT, 'on a plain question it is only words');
});

// overview-one-ticket S6 (spec 23; L19, L20) replaced ticket-states B4's skip: a blocker parks nothing.
test('nextTicketOf: the main deck never takes a yellow ticket, blocked or not', (t) => {
  tempDeck(t);
  const blocked = aTicket('Blocked');
  aTicket('After');
  askBlocking(blocked);

  assert.equal(nextTicketOf(listItems(), REPO), undefined);
});

test('two yellow tickets reach green when the first stashed a plain question', (t) => {
  tempDeck(t);
  const first = aTicket('First');
  const second = aTicket('Second');

  // A yellow ticket is never in the main slot, and its gate2 needs no take (yellow-agent S4, ADR 0087).
  ask(first);
  aGate2(first);

  aGate2(second);
  assert.deepEqual([first, second].map((ticket) => reread(ticket.id).state), ['green', 'green']);
});

test('the row counts blocking questions and the card badges one, with Assume the default', (t) => {
  tempDeck(t);
  const ticket = aTicket('Asked');
  const blocker = askBlocking(ticket);
  ask(ticket, { title: 'Plain' });
  const run = registerRun({ repo: REPO, pid: process.pid });
  const home = renderHomePage(listItems(), [{ ...run, feature: 'x' }], REPO, false, {}, {}, Date.now());

  const row = home.match(new RegExp(`<li data-state="yellow">(?:<span class="next" data-lane="co-pilot">next</span>)?<a href="/thread/${ticket.id}">.*?</details></li>`, 's'))?.[0] ?? '';
  assert.match(row, /<span class="questions">2 questions \(1 blocking\)<\/span>/);
  assert.match(row, /<span class="blocking">blocking<\/span>/);

  const page = renderThreadPage(reread(blocker.id), listItems());
  assert.match(page, /question<span class="blocking">blocking<\/span>/, 'the badge on the question');
  assert.match(page, new RegExp(`<button type="submit" name="choice" value="${ASSUME_DEFAULT}" class="assume"`));
  const plain = listItems().find((item) => item.title === 'Plain');
  assert.doesNotMatch(renderThreadPage(plain, listItems()), /question<span class="blocking">|value="Assume the default"/);
});

test('a blocking question is never closed unanswered, which would lift its refusal', (t) => {
  tempDeck(t);
  const ticket = aTicket('Ours');
  const blocker = askBlocking(ticket);

  assert.throws(() => resolveItem(blocker.id, 'went with A'), refusedNaming(blocker.id, 'blocking', ASSUME_DEFAULT));
  assert.equal(isBlocking(reread(blocker.id)), true, 'still open and blocking');
  addReply(blocker.id, 'B, the schema needs it');
  resolveItem(blocker.id, 'B');
  assert.deepEqual(gate2Blockers(listItems(), ticket.id), [], 'closed once the user answered');
});
