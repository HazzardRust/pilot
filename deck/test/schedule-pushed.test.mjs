/**
 * S4 of pilot-develop-line (spec 3): no slice PR is opened, so a slice row's state once its branch is pushed
 * is `pushed <sha7>`. A single `pushed` blocker with a branch pipelines as a `draft` one did, and a `pushed`
 * row is in phase doing: neither startable itself nor done.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startable } from '../schedule.mjs';
import { phaseOf } from '../status.mjs';

const rows = (state, branch = 'slice/demo-s1') => [
  { slice: 'S1 first', state, branch },
  { slice: 'S2 second', state: 'planned', after: ['S1'] },
];

test('a pushed blocker pipelines', () => {
  assert.deepEqual(startable(rows('pushed abc1234'), 5), [{ slice: 'S2 second', from: 'slice/demo-s1' }]);
  assert.deepEqual(startable(rows('Pushed abc1234'), 5), [{ slice: 'S2 second', from: 'slice/demo-s1' }]);
  assert.deepEqual(startable(rows('pushed abc1234', null), 5), [], 'a pushed blocker without a branch holds its dependant');
});

test('pushed reads as doing', () => {
  assert.equal(phaseOf('pushed abc1234'), 'doing');
  const starts = startable([{ slice: 'S1 first', state: 'pushed abc1234', branch: 'slice/demo-s1' }], 5);
  assert.deepEqual(starts, [], 'a pushed row is not startable itself');
  assert.deepEqual(startable(rows('pushed abc1234'), 5).map((start) => start.from), ['slice/demo-s1'], 'not done, so its dependant branches from it, not from feat');
});

test('a draft blocker still pipelines', () => {
  assert.deepEqual(startable(rows('draft PR #7'), 5), [{ slice: 'S2 second', from: 'slice/demo-s1' }]);
});
