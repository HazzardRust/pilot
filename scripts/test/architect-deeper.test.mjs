/**
 * The architect works deeper, not wider (architect-deeper S2, spec 1; L1).
 * One lint stays: the depth step sits second, before the research. The phrase pins that
 * once held its rules are gone (crew-tests-behaviour S10, L5): prose is not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './lib/area-file.mjs';

const ARCHITECT = read('agents/pilot-architect.md');
const body = ARCHITECT.slice(ARCHITECT.indexOf('\n---', 4) + 4);

test('the depth step is the second section', () => {
  // lint: the architect's section order (heading exists, in order)
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings.slice(0, 2), ['Merge first', 'Depth first'], 'Depth first follows Merge first (spec 1, L1)');
  assert.ok(headings.indexOf('Depth first') < headings.indexOf('Read before you design'), 'the depth step comes before the research (spec 1)');
});
