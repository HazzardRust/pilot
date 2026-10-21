/**
 * three-lanes S1, spec 1, 2, 3, 4; L2, L3, L4.
 *
 * A repository holds one live planning (red) ticket and one live concluding (green) ticket at once,
 * beside the co-pilot's implementing one. The lane is the ticket's stage; `live: true` stays (L2).
 */

import './no-open.mjs';

import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { KIND_QUESTION, KIND_TICKET, isBehind, nextTicketOf } from '../items.mjs';
import { lanesFrom } from '../lanes.mjs';

const { DeckRefusal, listItems, requestSwitch, takeTicket } = await import('../store.mjs');
const { lanesNotice } = createRequire(import.meta.url)('../../hooks/session-handoff.js');

const ALPHA = path.resolve('D:/work/alpha');
const REPO = 'D:/work/alpha';

const aTicket = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: ALPHA, sliceCount: 60, state });
const stored = (id) => listItems().find((item) => item.id === id);
const ticket = (id, state, more = {}) => ({ kind: 'ticket', id, title: id, repo: REPO, state, ...more });
const question = (id, ticketId) => ({ kind: KIND_QUESTION, id, title: id, repo: REPO, ticket: ticketId });

test('a concluding take leaves the planning ticket live', (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  const green = aTicket('Concluding', 'green');
  takeTicket(red.id);
  takeTicket(green.id);
  assert.equal(stored(red.id).live, true, 'the planning ticket stays live');
  assert.equal(stored(green.id).live, true, 'the concluding ticket is live');
  assert.throws(() => requestSwitch(ALPHA, green.id), /already in hand/, 'a live concluding ticket is in hand though a planning one is live first');
});

test("Continue refuses the row the rail marks: a stage's head while no ticket is live, never beside a live one (spec 4)", (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  const green = aTicket('Concluding', 'green');
  aTicket('Later', 'green');
  assert.throws(() => requestSwitch(ALPHA, green.id), /already in hand/, 'no ticket live: the green head is the concluding lane\'s');
  takeTicket(red.id);
  assert.equal(requestSwitch(ALPHA, green.id).to, green.id, 'beside a live red ticket the green head keeps its Continue');
});

test('a second planning take is refused naming the live one', (t) => {
  tempDeck(t);
  const first = aTicket('First', 'red');
  const second = aTicket('Second', 'red');
  takeTicket(first.id);
  assert.throws(() => takeTicket(second.id), (error) => {
    assert.ok(error instanceof DeckRefusal);
    assert.match(error.message, new RegExp(`^${first.id} is live in planning`));
    return true;
  });
  assert.equal(stored(second.id).live, undefined, 'nothing is written');
});

test('each lane fills from its own queue', () => {
  const items = [ticket('itm_g1', 'green'), ticket('itm_g2', 'green'), ticket('itm_r1', 'red'), ticket('itm_y1', 'yellow'), question('itm_q1', 'itm_g2')];
  assert.equal(nextTicketOf(items, REPO, 'red')?.id, 'itm_r1', 'the red head, though a green waits and a yellow is open');
  assert.equal(nextTicketOf(items, REPO, 'green')?.id, 'itm_g2', 'the asked green before the green head');
});

test('an empty concluding lane with a green queued is refused', () => {
  const read = lanesFrom([ticket('itm_r1', 'red', { live: true }), ticket('itm_g1', 'green')], REPO, { switching: {}, coPilot: null });
  assert.match(read.refusal, /concluding/);
  assert.match(read.refusal, /itm_g1/);
});

test('the hook prints three lane lines', () => {
  const read = lanesFrom([ticket('itm_r1', 'red', { live: true }), ticket('itm_g1', 'green')], REPO, { switching: {}, coPilot: { ticket: 'itm_y1', live: true } });
  assert.equal(read.planning, 'planning: itm_r1');
  assert.equal(read.concluding, 'concluding: empty → next itm_g1');
  assert.equal(read.coPilot, 'co-pilot: itm_y1');
  assert.equal(lanesNotice(read), 'Lanes now:\nplanning: itm_r1\nconcluding: empty → next itm_g1\nco-pilot: itm_y1');
});

test('a live concluding ticket\'s question is not behind a live planning ticket', () => {
  const items = [ticket('itm_r1', 'red', { live: true }), ticket('itm_g1', 'green', { live: true }), question('itm_q1', 'itm_r1'), question('itm_q2', 'itm_g1')];
  assert.equal(isBehind(items[2], items), false, 'the planning ticket\'s question');
  assert.equal(isBehind(items[3], items), false, 'the concluding ticket\'s question');
});
