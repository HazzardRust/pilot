/**
 * S1 of remote-run-branches: which run owns a branch name (spec 1, 2; L2, L3, L6). A run is
 * known by its `feat/<s>` or `design/<s>` ref, never a `design/<s>-recut`, and a branch belongs
 * to the longest known slug that names it. Pure: no git.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { knownRuns, runOwns } from '../run-names.mjs';

test('the longest known slug owns a branch', () => {
  const known = knownRuns(['feat/x', 'feat/x-y', 'design/x-recut', 'main', 'slice/x-s1']);

  assert.deepEqual([...known].sort(), ['x', 'x-y'], 'design/x-recut adds no known run');
  for (const branch of ['fix/x-y-drift', 'design/x-y-recut']) {
    assert.equal(runOwns(branch, 'x', known), false, `${branch} is not x's`);
    assert.equal(runOwns(branch, 'x-y', known), true, `${branch} is x-y's`);
  }
});

test("a run owns its own names and none of another prefix's", () => {
  const known = knownRuns(['feat/x']);
  const owned = ['feat/x', 'design/x', 'fix/x', 'qa/x', 'fix/x-drift', 'fix/x-s1', 'slice/x-base', 'slice/x-s1', 'qa/x-2', 'design/x-recut'];
  const foreign = ['slice/x', 'feat/x-2', 'design/x-y', 'slice/xx-s1', 'fix/xy', 'drift/x-1', 'main', 'pilot', 'x'];

  assert.deepEqual(owned.filter((b) => !runOwns(b, 'x', known)), [], 'every run name is owned');
  assert.deepEqual(foreign.filter((b) => runOwns(b, 'x', known)), [], 'no foreign name is owned');
});

test('a known run named by the branch exactly is its owner', () => {
  const known = knownRuns(['design/x-y']);

  assert.equal(runOwns('qa/x-y', 'x', known), false);
  assert.equal(runOwns('fix/x-y-s1', 'x', known), false);
  assert.equal(runOwns('fix/x-yz', 'x', known), true, 'x-yz is not x-y');
});
