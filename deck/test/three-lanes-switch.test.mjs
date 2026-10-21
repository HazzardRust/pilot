/**
 * three-lanes S2, spec 5; L4: a switch moves one lane and leaves the other live. Continue on a red ticket switches
 * the planning lane and on a green one the concluding lane, each with its own record, `switches[repo][lane]`; a
 * pending switch locks its own lane only. A `main` record stored before S2 reads as the lane of its `to`.
 * Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from '../items.mjs';
import { aTicket, takeLive, tempDeck } from '../testUtils.mjs';

// Destructured from the namespace, so a name this slice has yet to export fails only the tests that call it.
const { DeckRefusal, cancelSwitch, listItems, refuseLaneSwitch, requestSwitch, storeFile, takeTicket } = await import('../store.mjs');

const REPO = path.resolve('D:/work/pilot');

const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
const liveOf = (id) => listItems().find((item) => item.id === id).live;
const locked = (to) => (err) => err instanceof DeckRefusal && err.message.includes(to);

test('a planning switch leaves the concluding ticket live', (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  const green = aTicket('Concluding', 'green');
  takeLive(red.id);
  takeLive(green.id);
  const redTo = aTicket('Next planning', 'red');
  const greenTo = aTicket('Next concluding', 'green');

  requestSwitch(REPO, redTo.id);
  requestSwitch(REPO, greenTo.id);
  takeTicket(redTo.id);

  assert.equal(liveOf(redTo.id), true, 'the planning lane switched');
  assert.equal(liveOf(red.id), undefined, 'its from is parked');
  assert.equal(liveOf(green.id), true, 'the concluding ticket is still live');
  const lanes = stored().switches[repoKey(REPO)];
  assert.equal(lanes.planning, undefined, 'the planning record is cleared');
  assert.equal(lanes.concluding?.to, greenTo.id, 'the concluding switch is still pending');
});

test('a pending planning switch does not lock the concluding lane', (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  takeLive(red.id);
  const redTo = aTicket('Next planning', 'red');
  requestSwitch(REPO, redTo.id);

  assert.throws(() => refuseLaneSwitch(null, REPO, 'planning'), locked(redTo.id), 'the planning lane is switching');
  assert.doesNotThrow(() => refuseLaneSwitch(null, REPO, 'concluding'));
  const green = aTicket('Concluding', 'green');
  takeTicket(green.id);
  assert.equal(liveOf(green.id), true, 'a concluding take goes through');
});

test("a stored main record reads as its target's lane", (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  takeLive(red.id);
  const greenTo = aTicket('Concluding', 'green');
  // A record written before S2, straight into the store: no store migration reads it.
  const deck = stored();
  deck.switches = { [repoKey(REPO)]: { main: { from: null, to: greenTo.id, at: 'then' } } };
  fs.writeFileSync(storeFile(), JSON.stringify(deck), 'utf8');

  assert.throws(() => refuseLaneSwitch(null, REPO, 'concluding'), locked(greenTo.id), 'the lane of main.to is switching');
  assert.doesNotThrow(() => refuseLaneSwitch(null, REPO, 'planning'));
  takeTicket(greenTo.id);
  assert.equal(stored().switches[repoKey(REPO)].main, undefined, 'its completing take clears it');
});

test('cancel on a stored main record clears it', (t) => {
  tempDeck(t);
  const redTo = aTicket('Planning', 'red');
  const deck = stored();
  deck.switches = { [repoKey(REPO)]: { main: { from: null, to: redTo.id, at: 'then' } } };
  fs.writeFileSync(storeFile(), JSON.stringify(deck), 'utf8');

  cancelSwitch(REPO, redTo.id);
  assert.equal(stored().switches[repoKey(REPO)].main, undefined, 'the main record is cleared');
  assert.doesNotThrow(() => refuseLaneSwitch(null, REPO, 'planning'));
});
