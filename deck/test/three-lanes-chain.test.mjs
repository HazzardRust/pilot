/**
 * S4 of three-lanes: a chained start fills each empty stage lane from its own head (spec 7; A4), concluding first,
 * and the one hand-off names every ticket it took. A lane with a live ticket, or a switch pending, is skipped alone.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { aTicket, postStored, tempDeck } from '../testUtils.mjs';
import { HANDOFF_FAILED, KIND_HANDOFF } from '../items.mjs';
import { FINISHED_CLEAN } from '../runs.mjs';

const { MAX_TEXT_BYTES, addReply, listItems, registerRun, requestSwitch, setSlices, takeTicket } = await import('../store.mjs');
const { chainNext } = await import('../chain.mjs');

const ALPHA = path.resolve('D:/work/alpha');
const reread = (id) => listItems().find((item) => item.id === id);

test('a start with a red and a green queued takes both', (t) => {
  tempDeck(t);
  const red = aTicket('Plan it', 'red', ALPHA);
  const green = aTicket('Conclude it', 'green', ALPHA);

  const { handoff, taken } = chainNext(ALPHA, { atStart: true });

  assert.deepEqual(taken, [green.id, red.id], 'concluding first, then planning');
  assert.equal(reread(green.id).live, true);
  assert.equal(reread(red.id).live, true);
  assert.equal(handoff.kind, KIND_HANDOFF);
  assert.equal(handoff.next, green.id, 'the concluding head is the hand-off\'s ticket');
  assert.ok(handoff.body.includes(red.id), 'the hand-off names the planning ticket too');
  assert.equal(listItems().filter((item) => item.kind === KIND_HANDOFF).length, 1, 'one hand-off');
});

test('Handoff failed on a two-ticket hand-off puts both tickets down', (t) => {
  tempDeck(t);
  const red = aTicket('Plan it', 'red', ALPHA);
  const green = aTicket('Conclude it', 'green', ALPHA);
  const { handoff } = chainNext(ALPHA, { atStart: true });

  addReply(handoff.id, HANDOFF_FAILED);

  assert.equal(reread(green.id).live, undefined);
  assert.equal(reread(red.id).live, undefined);
});

test('a live planning ticket leaves the chain taking the green head only', (t) => {
  tempDeck(t);
  const live = aTicket('Planning now', 'red', ALPHA);
  takeTicket(live.id);
  const waiting = aTicket('Plan next', 'red', ALPHA);
  const green = aTicket('Conclude it', 'green', ALPHA);

  const { handoff, taken } = chainNext(ALPHA, { atStart: true });

  assert.deepEqual(taken, [green.id]);
  assert.equal(handoff.next, green.id);
  assert.equal(reread(waiting.id).live, undefined, 'the queued red waits behind the live one');
  assert.equal(reread(live.id).live, true);
});

test('a hand-off with no room to name the planning head leaves that head queued', (t) => {
  tempDeck(t);
  const red = aTicket('Plan it', 'red', ALPHA);
  const body = 'x'.repeat(MAX_TEXT_BYTES - 10);
  const green = postStored({ kind: 'ticket', title: 'Conclude it', body, repo: ALPHA, sliceCount: 3, state: 'green' });

  const { handoff, taken } = chainNext(ALPHA, { atStart: true });

  assert.deepEqual(taken, [green.id], 'only what the hand-off can name is taken');
  assert.equal(handoff.body, body);
  assert.equal(reread(red.id).live, undefined);
});

test('under the mark a finish takes both heads in place', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const red = aTicket('Plan it', 'red', ALPHA);
  const green = aTicket('Conclude it', 'green', ALPHA);
  setSlices(run.id, [], undefined, { slug: 'feature-one', finished: FINISHED_CLEAN });

  assert.deepEqual(chainNext(ALPHA, { pastMark: () => false }), { handoff: null, reason: 'under the mark', taken: [green.id, red.id] });
});

test('a switching lane is skipped, not the whole chain', (t) => {
  tempDeck(t);
  aTicket('Plan one', 'red', ALPHA);
  const to = aTicket('Plan two', 'red', ALPHA);
  requestSwitch(ALPHA, to.id);
  const green = aTicket('Conclude it', 'green', ALPHA);

  const { handoff, taken } = chainNext(ALPHA, { atStart: true });

  assert.deepEqual(taken, [green.id], 'the concluding head is taken');
  assert.equal(handoff.next, green.id);
  assert.equal(reread(to.id).live, undefined, 'the switching lane is left to its switch');
});
