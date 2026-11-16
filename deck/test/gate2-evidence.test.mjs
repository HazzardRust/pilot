/**
 * S1 of walkthrough-surface (spec 6): one module reads a gate2's evidence. `gate2EvidenceGaps` is the short-path
 * check moved behind its new name; a ticket without a short plan has no gaps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gate2EvidenceGaps } from '../gate2-evidence.mjs';

test('a short-path gate2 missing its Gate line is a gap', () => {
  const ticket = { plan: { sliceCount: 2 } };
  const body = 'Verdict: S1 clean\nVerdict: S2 clean';
  assert.deepEqual(gate2EvidenceGaps(ticket, { body }), ["a short-path gate2 carries a Gate: line, the slice gate's pass and fail counts"]);
});

test('a ticket with no plan has no gaps', () => {
  assert.deepEqual(gate2EvidenceGaps({}, { body: 'anything' }), []);
});
