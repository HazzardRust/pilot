/**
 * pilot-state-line S1: the pilot's state is read, never set (ADR 0149, L1–L4).
 *
 * `pilotStateOf` is pure over a tab, the items, the held-wait map and a clock, so every
 * pin here plants those four and reads the line back: no store, no socket, no deck.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { pilotStateOf } from '../pilot-state.mjs';
import { repoKey } from '../items.mjs';

const MINE = path.join(os.tmpdir(), 'pilot-state-mine');
const OTHER = path.join(os.tmpdir(), 'pilot-state-other');
const AT = '2026-10-15T09:00:00.000Z';
const NOW = Date.parse('2026-10-15T09:30:00.000Z');

const liveTab = (over = {}) => ({ repo: MINE, runs: [], open: [], agents: [], ended: false, ...over });
const aHandoff = (over = {}) => ({ id: 'itm_00000000000h', kind: 'handoff', title: 'Hand-off', body: 'b', repo: MINE, postedAt: AT, owner: 'pilot', ...over });

test('an open hand-off reads handing off from its postedAt', () => {
  const line = pilotStateOf(liveTab(), [aHandoff()], {}, NOW);
  assert.equal(line.state, 'handing off');
  assert.equal(line.since, AT);
  assert.notEqual(
    pilotStateOf(liveTab(), [aHandoff({ repo: OTHER })], {}, NOW).state,
    'handing off',
    "another repository's hand-off is not this one's",
  );
  assert.notEqual(
    pilotStateOf(liveTab(), [aHandoff({ resolvedAt: AT })], {}, NOW).state,
    'handing off',
    'a resolved hand-off is no longer handing off',
  );
});

test("a crew-handoff is not the pilot's", () => {
  const line = pilotStateOf(liveTab(), [aHandoff({ kind: 'crew-handoff' })], {}, NOW);
  assert.notEqual(line.state, 'handing off');
});

test('a held wait reads listening from its start', () => {
  const start = Date.parse('2026-10-15T09:20:00.000Z');
  const line = pilotStateOf(liveTab(), [], { [repoKey(MINE)]: start }, NOW);
  assert.equal(line.state, 'listening');
  assert.equal(line.since, new Date(start).toISOString());
  assert.equal(
    pilotStateOf(liveTab(), [aHandoff()], { [repoKey(MINE)]: start }, NOW).state,
    'handing off',
    'an open hand-off outranks a held wait (L3)',
  );
  assert.equal(pilotStateOf(liveTab(), [], { [repoKey(OTHER)]: start }, NOW).state, 'quiet', "another repository's wait is not this one's");
});

test('an ended tab reads no session', () => {
  const line = pilotStateOf(liveTab({ ended: true }), [], {}, NOW);
  assert.equal(line.state, 'no session');
  assert.equal(line.since, null);
});

test('the line names the live ticket or says none', () => {
  const ticket = { id: 'itm_00000000000t', kind: 'ticket', title: 'The state line', body: 'b', repo: MINE, postedAt: AT, live: true };
  assert.equal(pilotStateOf(liveTab(), [ticket], {}, NOW).ticket, 'The state line');
  assert.equal(pilotStateOf(liveTab(), [{ ...ticket, live: false }], {}, NOW).ticket, null);
  assert.equal(pilotStateOf(liveTab(), [{ ...ticket, repo: OTHER }], {}, NOW).ticket, null);
  assert.equal(pilotStateOf(liveTab(), [], {}, NOW).ticket, null);
});
