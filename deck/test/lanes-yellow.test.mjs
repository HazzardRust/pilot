/**
 * yellow-lane S1, spec 1; L2.
 *
 * `lanesFrom`'s one `refusal` carries the yellow lane's line after the main lane's: a yellow ticket
 * open with no live co-pilot is refused, under the same open-hand-off exemption. Pure, built by hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lanesFrom } from '../lanes.mjs';

const REPO = 'D:/work/alpha';
const OTHER = 'D:/work/beta';
const AT = '2026-10-11T10:00:00.000Z';

const ticket = (id, state, more = {}) => ({ kind: 'ticket', id, title: id, repo: REPO, state, ...more });
const handoff = (more = {}) => ({ kind: 'handoff', id: 'itm_h1', title: 'Handoff', repo: REPO, ...more });
const lanes = (items, options = {}) => lanesFrom(items, REPO, { switching: {}, coPilot: null, ...options });
const YELLOW = 'yellow lane empty; itm_y1 is planned — deck_ticket co-pilot it first';

test('yellow with no co-pilot is refused', () => {
  assert.equal(lanes([ticket('itm_y1', 'yellow'), ticket('itm_y2', 'yellow')]).refusal, YELLOW);
  assert.equal(lanes([ticket('itm_y1', 'yellow')], { coPilot: { ticket: 'itm_y1', live: false } }).refusal, YELLOW, 'a released co-pilot holds nothing');
  assert.equal(lanes([ticket('itm_l1', 'red', { live: true }), ticket('itm_y1', 'yellow')]).refusal, YELLOW, 'a live main ticket does not excuse the yellow lane');
});

test('a live co-pilot, or no yellow ticket, refuses nothing', () => {
  assert.equal(lanes([ticket('itm_y1', 'yellow')], { coPilot: { ticket: 'itm_y1', live: true } }).refusal, null);
  assert.equal(lanes([ticket('itm_y1', 'yellow'), ticket('itm_y2', 'yellow')], { coPilot: { ticket: 'itm_y2', live: true } }).refusal, null, 'a co-pilot holding a later yellow ticket');
  assert.equal(lanes([ticket('itm_y1', 'yellow')], { switching: { coPilot: { from: null, to: 'itm_y1', at: AT } } }).refusal, null, 'a pending co-pilot switch');
  assert.equal(lanes([ticket('itm_l1', 'red', { live: true })]).refusal, null);
  assert.equal(lanes([ticket('itm_c1', 'yellow', { resolvedAt: AT }), ticket('itm_o1', 'yellow', { repo: OTHER })]).refusal, null, 'closed or elsewhere');
});

test('an open hand-off suppresses it', () => {
  assert.equal(lanes([ticket('itm_y1', 'yellow'), handoff()]).refusal, null);
  assert.equal(lanes([ticket('itm_y1', 'yellow'), handoff({ resolvedAt: AT })]).refusal, YELLOW, 'a closed hand-off does not');
  assert.equal(lanes([ticket('itm_y1', 'yellow'), handoff({ repo: OTHER })]).refusal, YELLOW, "another directory's does not");
});

test("a stage lane's refusal comes first", () => {
  const read = lanes([ticket('itm_y1', 'yellow'), ticket('itm_g1', 'red')]);
  assert.equal(read.refusal, 'planning lane empty; itm_g1 is queued — deck_ticket take it first');
});
