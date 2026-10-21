/**
 * S4 of ticket-state-accents: take refuses red while an asked red ticket waits (spec 6, L8). `takeTicket`
 * refuses a red ticket when the planning lane's `nextTicketOf` names a different, asked ticket, naming it;
 * a green ticket waits in its own lane (three-lanes spec 2), and the chain's take of the head never refuses.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { KIND_QUESTION, KIND_TICKET } from '../items.mjs';
import { FINISHED_CLEAN } from '../runs.mjs';

const { DeckRefusal, listItems, postItem, registerRun, setSlices, takeTicket } = await import('../store.mjs');
const { chainNext } = await import('../chain.mjs');

const ALPHA = path.resolve('D:/work/alpha');
const BETA = path.resolve('D:/work/beta');

const aTicket = (title, state, repo = ALPHA) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo, sliceCount: 60, state });
const stored = (id) => listItems().find((item) => item.id === id);

test('taking red while a green ticket waits and a yellow is open succeeds (three-lanes spec 2)', (t) => {
  tempDeck(t);
  const red = aTicket('Red', 'red');
  aTicket('Green', 'green');
  aTicket('Yellow', 'yellow');
  assert.equal(takeTicket(red.id).live, true);
});

test('taking red while a red ticket is named by an open question is refused, naming it', (t) => {
  tempDeck(t);
  const plain = aTicket('Plain', 'red');
  const asked = aTicket('Asked', 'red');
  postItem({ kind: KIND_QUESTION, title: 'About Asked', body: 'which?', repo: ALPHA, options: ['A', 'B'], recommended: 'A', ticket: asked.id });
  assert.throws(() => takeTicket(plain.id), new DeckRefusal(`item ${plain.id} is red; ${asked.id} (Asked) waits first: deck_ticket take it`));
  assert.equal(stored(plain.id).live, undefined);
});

test('taking the green ticket succeeds', (t) => {
  tempDeck(t);
  aTicket('Red', 'red');
  const green = aTicket('Green', 'green');
  assert.equal(takeTicket(green.id).live, true);
});

test('with no yellow open, taking red while a green ticket waits succeeds (session-row L7)', (t) => {
  tempDeck(t);
  aTicket('Green', 'green');
  const red = aTicket('Red', 'red');
  assert.equal(takeTicket(red.id).live, true);
});

test('taking red with no green or asked ticket succeeds', (t) => {
  tempDeck(t);
  aTicket('First', 'red');
  const second = aTicket('Second', 'red');
  assert.equal(takeTicket(second.id).live, true);
});

test("the chain's own take of nextTicketOf's head always passes", (t) => {
  tempDeck(t);
  aTicket('Red', 'red');
  const green = aTicket('Green', 'green');
  aTicket('Yellow', 'yellow'); // session-row L7: an open yellow keeps green before red
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  setSlices(run.id, [], undefined, { slug: 'feature-one', finished: FINISHED_CLEAN });
  assert.equal(chainNext(ALPHA).handoff.next, green.id);
  assert.equal(stored(green.id).live, true);
});

test('a green ticket in another directory does not refuse this one', (t) => {
  tempDeck(t);
  aTicket('Other green', 'green', BETA);
  const red = aTicket('Red', 'red');
  assert.equal(takeTicket(red.id).live, true);
});

test('a yellow take is never refused, a green ticket waiting or not', (t) => {
  tempDeck(t);
  aTicket('Green', 'green');
  const yellow = aTicket('Yellow', 'yellow');
  assert.equal(takeTicket(yellow.id).live, true);
});

test('a closed question does not make a red ticket wait first', (t) => {
  tempDeck(t);
  const plain = aTicket('Plain', 'red');
  const other = aTicket('Other', 'red');
  postStored({ kind: KIND_QUESTION, title: 'Closed', body: 'which?', repo: ALPHA, ticket: other.id, resolution: 'answered', resolvedAt: other.postedAt });
  assert.equal(takeTicket(plain.id).live, true);
});
