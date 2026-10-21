/**
 * three-lanes S3, spec 6: the Tickets rail reads `laneOf` for both stages. Both live tickets wear the in-hand mark,
 * each stage's queue carries its own `next`, and the panel names each stage's state. Every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aTicket, page, rowsOf, tempDeck } from '../testUtils.mjs';
import { queueView } from '../tickets.mjs';

const { listItems, takeTicket } = await import('../store.mjs');

const NEXT = '<span class="next">next</span>';
const inHand = (row) => /^<li data-state="[a-z]+" class="in-hand"/.test(row);
const stageStates = (html) => html.match(/<div class="tickets-state" data-planning-state="([a-z]+)" data-concluding-state="([a-z]+)" data-co-pilot-state="[a-z]+">/)?.slice(1);

test('both live tickets wear the in-hand mark', (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  const green = aTicket('Concluding', 'green');
  const waiting = aTicket('Waiting', 'red');
  takeTicket(red.id);
  takeTicket(green.id);
  const rows = rowsOf(page());
  assert.ok(inHand(rows[red.id]), 'the live planning row is in hand');
  assert.ok(inHand(rows[green.id]), 'the live concluding row is in hand');
  assert.ok(!inHand(rows[waiting.id]), 'a queued row behind a live one is not');
  assert.ok(rows[waiting.id].includes(NEXT), 'a held lane still chips its next (A-f5)');
});

test('with nothing live, each open stage has its own row in hand', (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  const green = aTicket('Concluding', 'green');
  aTicket('Behind', 'red');
  const rows = rowsOf(page());
  assert.deepEqual(Object.keys(rows).filter((id) => inHand(rows[id])).sort(), [red.id, green.id].sort());
});

test('each queue carries its own next', (t) => {
  tempDeck(t);
  const redHead = aTicket('Red head', 'red');
  const redSecond = aTicket('Red second', 'red');
  const greenHead = aTicket('Green head', 'green');
  const greenSecond = aTicket('Green second', 'green');
  aTicket('Built', 'yellow'); // an open yellow once put green first across both stages; each stage now has its own head
  const rows = rowsOf(page());
  assert.ok(rows[redHead.id].includes(NEXT), "the red queue's next is the red head");
  assert.ok(rows[greenHead.id].includes(NEXT), "the green queue's next is the green head");
  assert.ok(!rows[redSecond.id].includes(NEXT) && !rows[greenSecond.id].includes(NEXT), 'no other row is next');
});

test('the panel names both stage states', (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  aTicket('Concluding', 'green');
  takeTicket(red.id);
  assert.deepEqual(stageStates(page()), ['held', 'queued']);
});

test("queueView's live is the live planning ticket, never a live concluding one", (t) => {
  tempDeck(t);
  const green = aTicket('Concluding', 'green');
  const red = aTicket('Planning', 'red');
  takeTicket(green.id);
  assert.equal(queueView(listItems(), green.repo).live, null, 'a live concluding ticket alone is not the red queue live');
  takeTicket(red.id);
  assert.equal(queueView(listItems(), red.repo).live.id, red.id);
});
