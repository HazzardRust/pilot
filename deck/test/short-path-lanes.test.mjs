/**
 * S2 of short-path (spec 1; L3): the yellow lane's line for a short-path head tells the pilot to build it itself
 * (claim it and spawn its implementer), not to wait for a co-pilot. A long head keeps today's line. Pure, built by hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lanesFrom } from '../lanes.mjs';

const REPO = 'D:/work/alpha';

const ticket = (id, sliceCount) => ({ kind: 'ticket', id, title: id, repo: REPO, state: 'yellow', plan: { sliceCount, gate1: 'itm_0', artefact: 'a.md' } });
const lanes = (items, coPilot = null) => lanesFrom(items, REPO, { switching: {}, coPilot });

test('a short head tells the pilot to build it', () => {
  for (const count of [1, 2]) {
    const read = lanes([ticket('itm_s1', count)]);
    assert.equal(read.refusal, 'yellow lane empty; itm_s1 is short path — deck_ticket co-pilot it and spawn its implementer');
    assert.equal(read.coPilot, 'co-pilot: empty → next itm_s1 (short path)');
  }
});

test("a long head keeps today's line", () => {
  const read = lanes([ticket('itm_l1', 3)]);
  assert.equal(read.refusal, 'yellow lane empty; itm_l1 is planned — deck_ticket co-pilot it first');
  assert.equal(read.coPilot, 'co-pilot: empty → next itm_l1');
});

test('a held short ticket refuses nothing', () => {
  const read = lanes([ticket('itm_s1', 2)], { ticket: 'itm_s1', live: true });
  assert.equal(read.refusal, null);
  assert.equal(read.coPilot, 'co-pilot: itm_s1');
});
