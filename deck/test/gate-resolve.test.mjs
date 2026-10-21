/**
 * A gate passes only on its Sign off press (merge-first spec 6, L12, ADR 0064): `deck_resolve`
 * on a `gate1` or `gate2` whose chosen reply is not Sign off is refused, naming the press and
 * Dismiss, so typed approval never closes a gate; a pressed Sign off still closes it and moves
 * the ticket. Each reply handed to a hook carries its item's kind, which is how the hooks know a
 * gate (L7).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, NOT_YET, SIGN_OFF } from '../items.mjs';
import { DeckRefusal, addReply, dismissItem, listItems, postItem, repliesSince } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { deckOnAPort, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const REPO = path.join('D:', 'work', 'pilot');
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };
const reread = (id) => listItems().find((item) => item.id === id);
const aTicket = () => takeLive(postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Apple', body: shapedTicketBody(), repo: REPO }).id);
const aGate1 = (ticket) => postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...GATE1, ticket });
const resolve = (id) => callTool('deck_resolve', { id, resolution: 'Signed off.' });
const refusedForThePress = (id, kind) => (error) =>
  error instanceof DeckRefusal &&
  error.message ===
    `${id} is a ${kind} the user has not signed: ask them to press Sign off on it, or to Dismiss it there; typed approval does not pass a gate`;

test('deck_resolve on a gate1 with no Sign off is refused naming the press', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  assert.throws(() => resolve(gate.id), refusedForThePress(gate.id, KIND_GATE1));
  addReply(gate.id, NOT_YET);
  assert.throws(() => resolve(gate.id), refusedForThePress(gate.id, KIND_GATE1), 'Not yet is no Sign off either');
  assert.equal(reread(gate.id).resolvedAt, undefined, 'the gate stays open');
  assert.equal(reread(ticket.id).state, 'red', 'the ticket stays red');
  assert.equal(reread(ticket.id).plan, undefined, 'and has no plan');
});

test('deck_resolve on a gate1 whose reply is typed approval is refused', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  addReply(gate.id, 'i sign off');
  assert.throws(() => resolve(gate.id), refusedForThePress(gate.id, KIND_GATE1));
  assert.equal(reread(gate.id).resolvedAt, undefined);
  assert.equal(reread(ticket.id).state, 'red');
});

test('deck_resolve on a gate2 with no Sign off is refused', (t) => {
  tempDeck(t);
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo: REPO, state: 'yellow' });
  takeLive(id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: id });
  assert.throws(() => resolve(gate.id), refusedForThePress(gate.id, KIND_GATE2));
  addReply(gate.id, 'looks good, ship it');
  assert.throws(() => resolve(gate.id), refusedForThePress(gate.id, KIND_GATE2));
  assert.equal(reread(gate.id).resolvedAt, undefined);
});

test('a pressed Sign off still resolves the gate and moves the ticket', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  addReply(gate.id, 'i sign off');
  addReply(gate.id, SIGN_OFF);
  resolve(gate.id);
  assert.ok(reread(gate.id).resolvedAt);
  assert.equal(reread(ticket.id).state, 'yellow');
});

test('a reply handed to a hook carries its item kind', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  addReply(gate.id, 'i sign off');
  const handed = repliesSince(0).replies.find((reply) => reply.itemId === gate.id);
  assert.equal(handed.kind, KIND_GATE1);
});

// The refused gate's exit is the user's Dismiss (L8): it closes the gate unsigned, moves no
// ticket, and lets the pilot post a fresh one; the page draws it on a gate.
test("the user's Dismiss closes an unsigned gate, moves no ticket, and a fresh gate1 then posts", (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  addReply(gate.id, NOT_YET);
  assert.match(renderThreadPage(reread(gate.id), listItems()), /action="\/dismiss-item"/, 'a gate page carries Dismiss');
  dismissItem(gate.id);
  assert.ok(reread(gate.id).resolvedAt, 'closed');
  assert.equal(reread(ticket.id).state, 'red', 'no ticket moves on a Dismiss');
  assert.equal(reread(ticket.id).plan, undefined);
  assert.ok(aGate1(ticket.id).id, 'the fresh gate1 posts');
});

test("the user's Dismiss closes an unsigned gate2, the ticket stays green, and a fresh gate2 then posts", (t) => {
  tempDeck(t);
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo: REPO, state: 'yellow' });
  takeLive(id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: id });
  assert.match(renderThreadPage(reread(gate.id), listItems()), /action="\/dismiss-item"/, 'a gate2 page carries Dismiss');
  dismissItem(gate.id);
  assert.ok(reread(gate.id).resolvedAt, 'closed');
  assert.equal(reread(id).state, 'green', 'a dismissed gate2 is never a signed one');
  assert.equal(reread(id).resolvedAt, undefined);
  // A yellow ticket's gate2 left it green and parked (yellow-agent S4): a green ticket's gate2 is posted on it in hand.
  takeLive(id);
  const again = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it again.', repo: REPO, pr: '#250', sha: '0305828', ticket: id });
  assert.equal(again.ticket, id, 'the fresh gate2 posts');
});

test('posting a gate answers that it closes on the press, not with deck_resolve', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const said = callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...GATE1, ticket: ticket.id }).content[0].text;
  assert.match(said, /^Posted itm_/);
  assert.match(said, /Sign off press/);
  assert.doesNotMatch(said, /close it with deck_resolve/);
});

// Dismiss closes a gate unsigned, so only the deck's own page may press it on a gate: curl, with
// no Origin, is refused there as it is for Create (the S4 security review).
test('POST /dismiss-item on a gate is taken only from the deck page', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  const press = (headers) =>
    fetch(`${base}/dismiss-item`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams({ id: gate.id }),
      redirect: 'manual',
    });
  assert.equal((await press({})).status, 403, 'no Origin: an agent, not the page');
  assert.equal(reread(gate.id).resolvedAt, undefined, 'still open');
  assert.equal((await press({ origin: base })).status, 303, 'the page');
  assert.ok(reread(gate.id).resolvedAt, 'dismissed');
});

// The Sign off reply is the press itself, so on a gate it is the page's alone, as Dismiss is
// (principles review, fix 1): an agent's curl with no Origin, or another site, is refused and
// the gate stays unsigned. Other replies on a gate, and a Sign off on other kinds, are unchanged.
test('POST /reply of Sign off on a gate is taken only from the deck page', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  const reply = (fields, headers) =>
    fetch(`${base}/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams({ id: gate.id, ...fields }),
      redirect: 'manual',
    });
  assert.equal((await reply({ choice: SIGN_OFF }, {})).status, 403, 'no Origin: an agent, not the page');
  assert.equal((await reply({ text: SIGN_OFF }, {})).status, 403, 'typed as the press');
  assert.equal((await reply({ choice: SIGN_OFF, text: 'ship it' }, {})).status, 403, 'the press with a note');
  assert.equal((await reply({ choice: SIGN_OFF }, { origin: 'http://evil.example' })).status, 403, 'another site');
  assert.equal(reread(gate.id).replies?.length ?? 0, 0, 'nothing stored');
  assert.throws(() => resolve(gate.id), refusedForThePress(gate.id, KIND_GATE1), 'the gate stays unsigned');
  assert.equal((await reply({ text: 'i sign off' }, {})).status, 303, 'another reply on a gate is unchanged');
  assert.equal((await reply({ choice: SIGN_OFF }, { origin: base })).status, 303, 'the page');
  resolve(gate.id);
  assert.equal(reread(ticket.id).state, 'yellow', 'signed from the page');
});

test('POST /reply of Sign off on a walkthrough is unchanged', async (t) => {
  const base = await deckOnAPort(t);
  const walk = postItem({ kind: 'walkthrough', title: 'Walk', body: 'Try it.', repo: REPO });
  const answer = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id: walk.id, choice: SIGN_OFF }),
    redirect: 'manual',
  });
  assert.equal(answer.status, 303);
});

// A report closes a ticket on a signed gate2; a gate2 the user dismissed was never signed (fix 2).
test('a report is refused when its ticket\'s newest gate2 was dismissed unsigned', (t) => {
  tempDeck(t);
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo: REPO, state: 'yellow' });
  takeLive(id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: id });
  dismissItem(gate.id);
  assert.throws(
    () => postItem({ kind: 'report', title: 'Report', body: 'Done.', repo: REPO, ticket: id }),
    (error) =>
      error instanceof DeckRefusal &&
      error.message === `a report closes ${id} once a gate2 is signed, and ${gate.id} was dismissed unsigned; post a gate2 the user signs`,
  );
  // A yellow ticket's gate2 leaves it green and parked (yellow-agent S4): a green ticket's gate2 is posted on it in hand.
  takeLive(id);
  const fresh = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it again.', repo: REPO, pr: '#250', sha: '0305828', ticket: id });
  addReply(fresh.id, SIGN_OFF);
  resolve(fresh.id);
  assert.equal(postItem({ kind: 'report', title: 'Report', body: 'Done.', repo: REPO, ticket: id }).ticket, id, 'a signed fresh gate2 lets it post');
});

// Reopening a dismissed gate brings back an earlier Sign off reply as chosen, so only the deck's own
// page may reopen a gate: curl, with no Origin, is refused as it is at Dismiss (QA, fix round).
test('POST /reopen on a gate is taken only from the deck page', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  dismissItem(gate.id);
  const reopen = (headers) =>
    fetch(`${base}/reopen`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams({ id: gate.id }),
      redirect: 'manual',
    });
  assert.equal((await reopen({})).status, 403, 'no Origin: an agent, not the page');
  assert.ok(reread(gate.id).resolvedAt, 'still dismissed');
  assert.equal((await reopen({ origin: base })).status, 303, 'the page');
  assert.equal(reread(gate.id).resolvedAt, undefined, 'reopened');
});
