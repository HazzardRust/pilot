/**
 * S3 of human-steps: a human step sent with deck_status is kept on the run record
 * (spec 7, L5). Every test takes its own store (`tempDeck`).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { registerRun, setSlices, recordFor, DeckRefusal } = await import('../store.mjs');

const REPO = 'D:/work/pilot';
const SLUG = 'human-steps';

const send = (run, step) => setSlices(run.id, [], undefined, { slug: SLUG, step });

test('a sent step is kept in order', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  send(run, 'Set STRIPE_KEY in Vercel (value in 1Password)');
  send(run, '  Merge the main PR  ');
  // A later call that sends no step keeps the steps already recorded.
  setSlices(run.id, [], undefined, { slug: SLUG, next: 'QA' });

  assert.deepEqual(recordFor(REPO).humanSteps, [
    { text: 'Set STRIPE_KEY in Vercel (value in 1Password)' },
    { text: 'Merge the main PR' },
  ]);
});

test('a credential value is refused', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  send(run, 'Merge the main PR');
  const before = recordFor(REPO);

  assert.throws(() => send(run, `Set KEY=ghp_${'a1B2c3D4e5'.repeat(4)}`), DeckRefusal);
  assert.deepEqual(recordFor(REPO), before, 'the record is unchanged');
});

test('the schema bounds hold', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });

  for (const step of ['', '   ', 'x'.repeat(301), 'one line\nand another', 7]) {
    assert.throws(() => send(run, step), DeckRefusal, JSON.stringify(step));
  }
  assert.equal(recordFor(REPO), null, 'nothing was stored');
  assert.throws(() => setSlices(run.id, [], undefined, { step: 'a step' }), DeckRefusal, 'a step with no slug has no record');

  send(run, 'y'.repeat(300));
  for (let n = 2; n <= 20; n += 1) send(run, `step ${n}`);
  assert.equal(recordFor(REPO).humanSteps.length, 20);
  assert.throws(() => send(run, 'step 21'), DeckRefusal, 'a 21st step');
  assert.equal(recordFor(REPO).humanSteps.at(-1).text, 'step 20');
});
