/**
 * pilot-state-line S4, spec 10; L6, A4.
 *
 * A window that lapses changes the pilot's state with no write to announce it, so the daemon
 * arms one unref'd timer per pending lapse and the open page is told when it passes. The clock
 * is each test's own (`mock.timers`); no real wait. Nothing here reaches the live deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { changes, announceChange, armStateTimers } = await import('../server-wait.mjs');
const { registerRun } = await import('../store.mjs');
const { PICKED_UP_MS, WORKING_MS } = await import('../pilot-state.mjs');

const START = Date.parse('2026-10-01T10:00:00Z');
const stamp = (ms) => new Date(ms).toISOString();

/** Counts the browser `changed` announcements; the empty temp store keeps re-arming quiet. */
function arm(t) {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const seen = { changed: 0 };
  const onChange = () => { seen.changed += 1; };
  changes.on('deck-changed-browser', onChange);
  t.after(() => changes.off('deck-changed-browser', onChange));
  return seen;
}

const resolvedHandoff = (resolvedAt) => ({ id: 'itm_h', kind: 'handoff', repo: 'D:/work/a', resolvedAt: stamp(resolvedAt) });
const run = (lastSeenAt) => ({ id: 'run_1', repo: 'D:/work/a', lastSeenAt: stamp(lastSeenAt) });

test('a pickup\'s lapse announces once', (t) => {
  const seen = arm(t);
  armStateTimers([resolvedHandoff(START)], []);
  t.mock.timers.tick(PICKED_UP_MS - 1);
  assert.equal(seen.changed, 0, 'nothing before the window ends');
  t.mock.timers.tick(1);
  assert.equal(seen.changed, 1);
  t.mock.timers.tick(PICKED_UP_MS);
  assert.equal(seen.changed, 1, 'once');
});

test('a write\'s lapse announces once', (t) => {
  const seen = arm(t);
  armStateTimers([], [run(START)]);
  t.mock.timers.tick(WORKING_MS - 1);
  assert.equal(seen.changed, 0);
  t.mock.timers.tick(1);
  assert.equal(seen.changed, 1);
  t.mock.timers.tick(WORKING_MS);
  assert.equal(seen.changed, 1, 'once');
});

test('arming twice keeps one timer', (t) => {
  const seen = arm(t);
  for (let i = 0; i < 2; i += 1) armStateTimers([resolvedHandoff(START)], [run(START)]);
  t.mock.timers.tick(WORKING_MS);
  assert.equal(seen.changed, 2, 'one for the pickup, one for the write');
});

test('a lapse already past arms nothing', (t) => {
  const seen = arm(t);
  armStateTimers([resolvedHandoff(START - PICKED_UP_MS)], [run(START - WORKING_MS)]);
  t.mock.timers.tick(WORKING_MS * 2);
  assert.equal(seen.changed, 0);
});

test('a write through the store arms its lapse', (t) => {
  const seen = arm(t);
  registerRun({ repo: 'D:/work/a', pid: process.pid });
  announceChange();
  seen.changed = 0;
  t.mock.timers.tick(WORKING_MS - 1);
  assert.equal(seen.changed, 0, 'nothing before the window ends');
  t.mock.timers.tick(1);
  assert.equal(seen.changed, 1, 'the lapse, announced by the daemon');
});

test('a run seen again announces once, at the new moment', (t) => {
  const seen = arm(t);
  armStateTimers([], [run(START)]);
  t.mock.timers.tick(WORKING_MS / 2);
  armStateTimers([], [run(START + WORKING_MS / 2)]);
  t.mock.timers.tick(WORKING_MS / 2);
  assert.equal(seen.changed, 0, "the first moment announces nothing");
  t.mock.timers.tick(WORKING_MS / 2);
  assert.equal(seen.changed, 1);
  t.mock.timers.tick(WORKING_MS);
  assert.equal(seen.changed, 1, 'once');
});

test('a resolved item of another kind arms nothing', (t) => {
  const seen = arm(t);
  armStateTimers([{ id: 'itm_q', kind: 'question', repo: 'D:/work/a', resolvedAt: stamp(START) }], []);
  t.mock.timers.tick(PICKED_UP_MS + WORKING_MS);
  assert.equal(seen.changed, 0);
});

test('two different lapses both announce', (t) => {
  const seen = arm(t);
  armStateTimers([resolvedHandoff(START)], [run(START)]);
  t.mock.timers.tick(PICKED_UP_MS);
  assert.equal(seen.changed, 1, 'the pickup');
  t.mock.timers.tick(WORKING_MS - PICKED_UP_MS);
  assert.equal(seen.changed, 2, 'then the write');
});
