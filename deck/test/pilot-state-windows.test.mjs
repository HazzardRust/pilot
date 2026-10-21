/**
 * pilot-state-line S2: `picked up`, `working` and `quiet` read from their windows (spec 3, 5, 6; L3, L4, L11).
 *
 * `pilotStateOf` is pure over a tab, the items, the held-wait map and a clock, so each pin plants a
 * signal at a clock offset from `NOW` and reads the line back: no store, no socket, no deck.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { PICKED_UP_MS, WORKING_MS, pilotStateOf } from '../pilot-state.mjs';
import { repoKey } from '../items.mjs';

const MINE = path.join(os.tmpdir(), 'pilot-state-mine');
const OTHER = path.join(os.tmpdir(), 'pilot-state-other');
const NOW = Date.parse('2026-10-15T09:30:00.000Z');
const MINUTE = 60_000;
const ago = (minutes) => new Date(NOW - minutes * MINUTE).toISOString();

const aRun = (lastSeenAt) => ({ id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: ago(60), lastSeenAt, slices: [] });
const liveTab = (over = {}) => ({ repo: MINE, runs: [aRun(ago(30))], open: [], agents: [], ended: false, ...over });
const aPickup = (resolvedAt, over = {}) => ({ id: 'itm_00000000000h', kind: 'handoff', title: 'Hand-off', body: 'b', repo: MINE, postedAt: ago(40), owner: 'pilot', resolvedAt, ...over });
const anAgent = { agentType: 'pilot-implementer', since: ago(20) };

test('the windows are five and ten minutes (A3)', () => {
  assert.equal(PICKED_UP_MS, 5 * MINUTE);
  assert.equal(WORKING_MS, 10 * MINUTE);
});

test('a hand-off resolved four minutes ago reads picked up', () => {
  const line = pilotStateOf(liveTab(), [aPickup(ago(4))], {}, NOW);
  assert.equal(line.state, 'picked up');
  assert.equal(line.since, ago(4));
  assert.notEqual(pilotStateOf(liveTab(), [aPickup(ago(4), { repo: OTHER })], {}, NOW).state, 'picked up', "another repository's pickup is not this one's");
  assert.notEqual(pilotStateOf(liveTab(), [aPickup(ago(4), { kind: 'crew-handoff' })], {}, NOW).state, 'picked up', "a crew-handoff is not the pilot's (L4)");
});

test('a hand-off resolved six minutes ago does not', () => {
  assert.notEqual(pilotStateOf(liveTab(), [aPickup(ago(6))], {}, NOW).state, 'picked up');
  const postedFirst = aPickup(ago(4), { id: 'itm_0000000000h1', postedAt: ago(50) });
  const postedLast = aPickup(ago(6), { id: 'itm_0000000000h2', postedAt: ago(45) });
  assert.equal(pilotStateOf(liveTab(), [postedFirst, postedLast], {}, NOW).state, 'picked up', 'the newest resolution decides, not the newest post');
  assert.notEqual(pilotStateOf(liveTab(), [aPickup(ago(5))], {}, NOW).state, 'picked up', 'the window is lapsed at exactly five minutes');
  assert.equal(pilotStateOf(liveTab(), [aPickup(new Date(NOW - PICKED_UP_MS + 1).toISOString())], {}, NOW).state, 'picked up', 'and holds a millisecond before');
});

test('a deck write nine minutes ago reads working', () => {
  const line = pilotStateOf(liveTab({ runs: [aRun(ago(30)), { ...aRun(ago(9)), id: 'run_000000000002' }] }), [], {}, NOW);
  assert.equal(line.state, 'working');
  assert.equal(line.since, ago(9), "the newest run's lastSeenAt");
  assert.equal(pilotStateOf(liveTab({ runs: [aRun(ago(10))] }), [], {}, NOW).state, 'quiet', 'the window is lapsed at exactly ten minutes');
  assert.equal(pilotStateOf(liveTab({ runs: [aRun(new Date(NOW - WORKING_MS + 1).toISOString())] }), [], {}, NOW).state, 'working', 'and holds a millisecond before');
});

test('a live crew agent reads working', () => {
  const line = pilotStateOf(liveTab({ agents: [anAgent] }), [], {}, NOW);
  assert.equal(line.state, 'working', 'with no write in the window');
  assert.equal(line.since, new Date(NOW).toISOString(), 'an agent on the roster was seen inside its 90 s window');
});

test('a live run silent for eleven minutes reads quiet', () => {
  const line = pilotStateOf(liveTab({ runs: [aRun(ago(11))] }), [], {}, NOW);
  assert.equal(line.state, 'quiet');
  assert.equal(line.since, ago(11), 'its last signal');
  assert.equal(pilotStateOf(liveTab({ runs: [aRun(ago(11))], ended: true }), [], {}, NOW).state, 'no session', 'no live run is no session, not quiet (L11)');
});

test('precedence holds', () => {
  const open = { ...aPickup(undefined), id: 'itm_00000000000o', postedAt: ago(1) };
  delete open.resolvedAt;
  const held = { [repoKey(MINE)]: NOW - 2 * MINUTE };
  const tab = liveTab({ runs: [aRun(ago(1))], agents: [anAgent] });
  assert.equal(pilotStateOf(tab, [open, aPickup(ago(1))], held, NOW).state, 'handing off', 'an open hand-off over a held wait');
  assert.equal(pilotStateOf(tab, [aPickup(ago(1))], held, NOW).state, 'listening', 'a held wait over a pickup');
  assert.equal(pilotStateOf(tab, [aPickup(ago(1))], {}, NOW).state, 'picked up', 'a pickup over a write');
  assert.equal(pilotStateOf({ ...tab, agents: [] }, [], {}, NOW).state, 'working', 'a write over quiet');
});
