/**
 * S4 of overview-one-ticket: `deck_ticket need` and `pivot` (spec 15-18; L7, L8, L10, L15).
 *
 * `need` turns an open yellow ticket green when an open question, walkthrough or gate2 names it;
 * `pivot` turns a green ticket yellow and closes its open gate2 as superseded, unsigned, in the
 * same write, never through `resolveItem`. Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, KIND_TICKET, KIND_WALKTHROUGH, SIGN_OFF } from '../items.mjs';
import { DeckRefusal, addReply, listItems, needTicket, parkTicket, pivotTicket, postItem, registerRun, resolveItem } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');

const stored = (title, state, extra = {}) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state, ...extra });
const aWalkthrough = (ticket) => postItem({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket });
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket });
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) =>
  error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

const deckTicket = async (base, args) => {
  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: args }),
  });
  return answer.json();
};

test('need turns a yellow ticket with an open walkthrough green', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = stored('qa still walking', 'yellow', { live: true });
  aWalkthrough(ticket.id);

  const { content } = await deckTicket(base, { id: ticket.id, action: 'need' });
  assert.equal(content[0].text, `Needed ${ticket.id}: green. Yellow: empty. Planning: empty. Concluding: empty, next ${ticket.id}.`);
  assert.equal(reread(ticket.id).state, 'green', 'stored, not only answered');
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE2).length, 0, 'green with no gate2');
});

test('need is refused by name with nothing open naming the ticket', (t) => {
  tempDeck(t);
  const ticket = stored('nothing asked', 'yellow');
  // A closed question and another ticket's question name nothing open for this one.
  const other = stored('another', 'yellow');
  postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'A or B.', repo: REPO, ticket: other.id });
  const closed = aWalkthrough(ticket.id);
  resolveItem(closed.id, 'walked');

  assert.throws(() => needTicket(ticket.id), refusedNaming(ticket.id, 'question', 'walkthrough', 'gate2'));
  assert.equal(reread(ticket.id).state, 'yellow');
});

test('need is refused on a ticket that is not yellow', (t) => {
  tempDeck(t);
  for (const state of ['red', 'green']) {
    const ticket = stored(state, state);
    postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'A or B.', repo: REPO, ticket: ticket.id });
    assert.throws(() => needTicket(ticket.id), refusedNaming(ticket.id, state, 'yellow'));
    assert.equal(reread(ticket.id).state, state);
  }
  assert.throws(() => needTicket('itm_0123456789ab'), refusedNaming('itm_0123456789ab'));
});

test('posting a walkthrough leaves its ticket yellow', (t) => {
  tempDeck(t);
  const ticket = stored('qa still fixing', 'yellow', { live: true });
  aWalkthrough(ticket.id);
  assert.equal(reread(ticket.id).state, 'yellow');
});

test('pivot turns a green ticket yellow and supersedes its open gate2', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = stored('needs a rethink', 'yellow', { live: true });
  const gate2 = aGate2(ticket.id);
  assert.equal(reread(ticket.id).state, 'green');

  const { content } = await deckTicket(base, { id: ticket.id, action: 'pivot' });
  assert.equal(content[0].text, `Pivoted ${ticket.id}: yellow, gate2 ${gate2.id} superseded.`);
  assert.equal(reread(ticket.id).state, 'yellow');
  const closed = reread(gate2.id);
  assert.equal(closed.resolution, 'superseded by pivot');
  assert.ok(closed.resolvedAt, 'the gate2 is closed');
  assert.deepEqual(closed.replies, [], 'unsigned: no Sign off written for the user');
});

test('pivot is refused while the user has signed its gate2', (t) => {
  tempDeck(t);
  const ticket = stored('signed already', 'yellow', { live: true });
  const gate2 = aGate2(ticket.id);
  addReply(gate2.id, SIGN_OFF);
  assert.throws(() => pivotTicket(ticket.id), refusedNaming(gate2.id, 'signed'));
  assert.equal(reread(ticket.id).state, 'green');
  assert.equal(reread(gate2.id).resolvedAt, undefined);
});

test('a gate2 posts after a pivot and turns the ticket green again', (t) => {
  tempDeck(t);
  const ticket = stored('round two', 'yellow', { live: true });
  aGate2(ticket.id);
  pivotTicket(ticket.id);

  const again = aGate2(ticket.id);
  assert.equal(reread(ticket.id).state, 'green');
  assert.equal(reread(again.id).resolvedAt, undefined, 'the new gate2 is open');
});

test('pivot is refused on a ticket that is not green', (t) => {
  tempDeck(t);
  for (const state of ['red', 'yellow']) {
    const ticket = stored(state, state);
    assert.throws(() => pivotTicket(ticket.id), refusedNaming(ticket.id, state, 'green'));
    assert.equal(reread(ticket.id).state, state);
  }
});

test('need then pivot, with no gate2, turns the ticket yellow again and says so', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = stored('asked then rethought', 'yellow', { live: true });
  aWalkthrough(ticket.id);
  needTicket(ticket.id);

  const { content } = await deckTicket(base, { id: ticket.id, action: 'pivot' });
  assert.equal(content[0].text, `Pivoted ${ticket.id}: yellow.`);
  assert.equal(reread(ticket.id).state, 'yellow');
});

test('a parked green ticket reads "awaiting sign-off" only with an open gate2; turned green by need, "needs you"', (t) => {
  tempDeck(t);
  const needed = stored('needed', 'yellow');
  aWalkthrough(needed.id);
  needTicket(needed.id);
  const signing = stored('signing', 'yellow', { live: true });
  aGate2(signing.id);
  // Already parked: a yellow ticket is never in the main slot, and its gate2 needs no take (yellow-agent S4, ADR 0087).

  const html = renderHomePage(listItems(), [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }], REPO, false, {}, {}, Date.now());
  // Anchored on the ticket's own row element, never the inlined stylesheet.
  const labelOf = (ticket) =>
    html.match(new RegExp(`<li data-state="green"(?: class="in-hand")?>(?:<span class="next">next</span>)?<a href="/thread/${ticket.id}">.*?<span class="ticket-state" data-state="green">([^<]*)</span>`, 's'))?.[1];
  assert.equal(labelOf(needed), 'needs you');
  assert.equal(labelOf(signing), 'awaiting sign-off');
});
