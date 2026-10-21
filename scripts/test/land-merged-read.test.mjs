/**
 * S2 of pilot-develop-line: the feature PR reads merged, never closed (spec 2; A1). `comment`
 * polls the PR for MERGED up to `wait` ms, then comments; `gh pr close` is never called. `gh` is
 * always faked and `sleep` injected, so no test waits.
 */

import { repos, passing, fakeGh, mainSays } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { comment } = await import('../land.mjs');

const called = (calls, verb) => calls.filter((args) => args[0] === 'pr' && args[1] === verb);
const open7 = [{ number: 7, headRefName: 'feat/a', baseRefName: 'pilot', state: 'OPEN' }];

test('an open PR that turns merged is commented, not closed', () => {
  const { gh, calls } = fakeGh(open7, undefined, { views: ['OPEN', 'OPEN', 'MERGED'] });
  const slept = [];

  comment({ gh, head: 'feat/a', sha: 'abc1234', counts: null, sleep: (ms) => slept.push(ms) });

  assert.equal(called(calls, 'close').length, 0);
  assert.equal(called(calls, 'view').length, 3);
  assert.equal(slept.length, 2);
  assert.deepEqual(called(calls, 'comment'), [['pr', 'comment', '7', '--body', 'landed on pilot at abc1234']]);
});

test('a PR still open after the wait is commented and named', (t) => {
  const { gitIn, a } = repos(t, 'a');
  const { gh, calls } = fakeGh(open7, undefined, { views: ['OPEN'] });
  const slept = [];

  const said = mainSays([], { cwd: a, git: gitIn(a), gh, test: passing, wait: 5000, sleep: (ms) => slept.push(ms) });

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /feature PR #7 still reads open\n/);
  assert.equal(called(calls, 'close').length, 0);
  assert.equal(called(calls, 'comment').length, 1);
  assert.ok(slept.reduce((sum, ms) => sum + ms, 0) >= 5000, 'it waited the whole wait');
});

test('already landed comments on nothing', () => {
  const { gh, calls } = fakeGh(open7, undefined, { views: ['OPEN'] });

  comment({ gh, head: 'feat/a', sha: 'abc1234', counts: null, already: true, sleep: () => assert.fail('no wait') });

  assert.equal(called(calls, 'close').length, 0);
  assert.equal(called(calls, 'comment').length, 0);
  assert.equal(called(calls, 'view').length, 0);
});
