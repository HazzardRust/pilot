/**
 * idle-main-lane S1, spec 1, 3; L2, L7; ADR 0123.
 *
 * `lanesFrom` is the one place the stage lanes' rule (three-lanes S1) and its spellings live: the lane lines, the
 * `Planning:` and `Concluding:` clause and the refusal line every surface prints. Pure, so these pins build items by hand.
 */

import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lanesFrom } from '../lanes.mjs';

const { lanesNotice } = createRequire(import.meta.url)('../../hooks/session-handoff.js');

const REPO = 'D:/work/alpha';
const OTHER = 'D:/work/beta';
const AT = '2026-10-11T10:00:00.000Z';

const ticket = (id, state, more = {}) => ({ kind: 'ticket', id, title: id, repo: REPO, state, ...more });
const lanes = (items, options = {}) => lanesFrom(items, REPO, { switching: {}, coPilot: null, ...options });

test('a red pick with no live ticket is refused', () => {
  const read = lanes([ticket('itm_g1', 'red')]);
  assert.equal(read.refusal, 'planning lane empty; itm_g1 is queued — deck_ticket take it first');
  assert.equal(read.planning, 'planning: empty → next itm_g1');
  assert.equal(read.stageClause, 'Planning: empty, next itm_g1. Concluding: empty');
});

// three-lanes spec 2, 3, A4: each lane names its own pick, and the concluding lane's refusal comes first.
test('each lane names its own pick, the concluding refusal first', () => {
  const read = lanes([ticket('itm_g1', 'red'), ticket('itm_r1', 'green'), ticket('itm_y1', 'yellow')]);
  assert.equal(read.refusal, 'concluding lane empty; itm_r1 is queued — deck_ticket take it first');
  assert.equal(read.planning, 'planning: empty → next itm_g1');
  assert.equal(read.concluding, 'concluding: empty → next itm_r1');
});

test('nothing green or red queued refuses nothing', () => {
  const read = lanes([ticket('itm_c1', 'red', { resolvedAt: AT }), ticket('itm_o1', 'red', { repo: OTHER })]); // an open yellow is the yellow lane's refusal (yellow-lane S1)
  assert.equal(read.refusal, null);
  assert.equal(read.planning, 'planning: empty');
  assert.equal(read.concluding, 'concluding: empty');
  assert.equal(read.stageClause, 'Planning: empty. Concluding: empty');
});

test('a live ticket or a pending switch in a lane refuses nothing there', () => {
  const live = lanes([ticket('itm_l1', 'red', { live: true }), ticket('itm_g1', 'red')]);
  assert.equal(live.refusal, null);
  assert.equal(live.planning, 'planning: itm_l1');
  assert.equal(live.stageClause, 'Planning: itm_l1 live. Concluding: empty');

  const switching = lanes([ticket('itm_g1', 'red')], { switching: { main: { from: null, to: 'itm_g1', at: AT } } });
  assert.equal(switching.refusal, null, 'a stored main record reads as the lane of its to (three-lanes L4)');
  assert.equal(switching.planning, 'planning: itm_g1');
  assert.equal(switching.stageClause, 'Planning: itm_g1. Concluding: empty', 'a pending switch is not yet live');
});

test('an open handoff in the directory refuses nothing', () => {
  const handoff = { kind: 'handoff', id: 'itm_h1', title: 'Next', repo: REPO };
  const read = lanes([ticket('itm_g1', 'red'), handoff]);
  assert.equal(read.refusal, null);
  assert.equal(read.planning, 'planning: empty → next itm_g1', 'the lane line still names the pick');

  assert.notEqual(lanes([ticket('itm_g1', 'red'), { ...handoff, resolvedAt: AT }]).refusal, null, 'a closed handoff exempts nothing');
  assert.notEqual(lanes([ticket('itm_g1', 'red'), { ...handoff, repo: OTHER }]).refusal, null, 'another directory\'s handoff exempts nothing');
});

test('a live co-pilot is named and a released one names its next', () => {
  const items = [ticket('itm_y1', 'yellow')];
  assert.equal(lanes(items, { coPilot: { ticket: 'itm_y1', live: true } }).coPilot, 'co-pilot: itm_y1');
  assert.equal(lanes(items, { coPilot: { ticket: 'itm_y1', live: false } }).coPilot, 'co-pilot: empty → next itm_y1');
  assert.equal(lanes(items, { coPilot: null }).coPilot, 'co-pilot: empty → next itm_y1');
  assert.equal(lanes([], { coPilot: null }).coPilot, 'co-pilot: none');
});

test('every lane line lanesFrom spells is one the session-start hook echoes', () => {
  const switching = { main: { from: null, to: 'itm_g1', at: AT } };
  const states = {
    empty: [[], {}],
    'pick green': [[ticket('itm_r1', 'green')], {}],
    'pick red': [[ticket('itm_g1', 'red')], {}],
    live: [[ticket('itm_l1', 'red', { live: true })], {}],
    'both live': [[ticket('itm_l1', 'red', { live: true }), ticket('itm_l2', 'green', { live: true })], {}],
    switching: [[ticket('itm_g1', 'red')], { switching }],
  };
  for (const [name, [items, options]] of Object.entries(states)) {
    for (const coPilot of [{ ticket: 'itm_y1', live: true }, null]) {
      const read = lanes(items, { ...options, coPilot });
      assert.notEqual(lanesNotice(read), null, `${name}, co-pilot ${coPilot ? 'live' : 'none'}`);
    }
  }
  const read = lanes([ticket('itm_g1', 'red')]);
  assert.equal(lanesNotice({ ...read, planning: `Note: ${read.planning}` }), null, 'prose before a lane line is never echoed');
});
