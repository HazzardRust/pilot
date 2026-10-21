/**
 * S4 of yellow-agent (spec 8; L11; yellow-is-the-subdecks L5, ADR 0087): the deck never leaves a
 * yellow ticket in the main slot. The write that turns a ticket yellow (a gate1 Sign off, a pivot)
 * drops its `live`, and a store written before that reads an unheld live yellow ticket as not live.
 * The writes are pinned on the store file itself, since the read would hide a write that kept it.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, SIGN_OFF } from '../items.mjs';
import { addReply, listItems, pivotTicket, postItem, resolveItem, storeFile, takeTicket } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };

const aTicket = (title, state, extra = {}) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state, ...extra });
const reread = (id) => listItems().find((item) => item.id === id);
const stored = (id) => JSON.parse(fs.readFileSync(storeFile(), 'utf8')).items.find((item) => item.id === id);

test('a stored yellow ticket live with no holder does not stop a main take of a red ticket', (t) => {
  tempDeck(t);
  const stranded = aTicket('Signed, never parked', 'yellow', { live: true });
  const red = aTicket('Next red', 'red');

  assert.equal(takeTicket(red.id).live, true, 'the main take succeeds');
  assert.equal(reread(stranded.id).live, undefined, 'the yellow ticket reads not live');
  assert.equal(stored(stranded.id).live, undefined, 'and the take wrote it so');
});

test('a gate1 Sign off leaves its now-yellow ticket not live', (t) => {
  tempDeck(t);
  const ticket = takeLive(postItem({ kind: KIND_TICKET, sliceCount: 3, title: 'Apple', body: shapedTicketBody(), repo: REPO }).id);
  const gate = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...GATE1, ticket: ticket.id });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');

  assert.equal(stored(ticket.id).state, 'yellow');
  assert.equal(stored(ticket.id).live, undefined, 'the sign write itself drops live');
});

test('a pivot leaves its now-yellow ticket not live', (t) => {
  tempDeck(t);
  const ticket = aTicket('Needs a rethink', 'green', { live: true });
  pivotTicket(ticket.id);

  assert.equal(stored(ticket.id).state, 'yellow');
  assert.equal(stored(ticket.id).live, undefined, 'the pivot write itself drops live');
});

// Assumed by main: a gate2 on a yellow ticket needs no take (amends ticket-states L9 for the co-pilot's lane, spec 5 with spec 8).
const aGate2 = (ticket) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket });

test('a gate2 on a yellow ticket not live posts and turns it green', (t) => {
  tempDeck(t);
  const ticket = aTicket('Co-pilot built it', 'yellow');
  assert.equal(aGate2(ticket.id).ticket, ticket.id);
  assert.equal(reread(ticket.id).state, 'green');
});

test('a gate2 on a green ticket not live is still refused', (t) => {
  tempDeck(t);
  const ticket = aTicket('Back from a need', 'green');
  assert.throws(() => aGate2(ticket.id), new RegExp(`${ticket.id} is not live; deck_ticket take it first`));
});
