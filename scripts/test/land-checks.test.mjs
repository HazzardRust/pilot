// ci-gate S3, spec 1, 9; L4, L5, L8, L10, A2. A landing reads the feature tip's checks before anything is recorded or
// pushed, and a red, pending or unread answer refuses it. One fixture landing; the rest through `checksGate`.

import { git, commitFile, repos, fakeGh, passing, land } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { githubHost } from '../../deck/host-github.mjs';
import { checksGate } from '../checks.mjs';

/** PR #121's three runs as `gh api …/check-runs` answered them live on 2026-11-20 (S1's capture), all `failure`. */
const PR121 = [
  { conclusion: 'failure', html_url: 'https://github.com/HazzardRust/pilot/actions/runs/44519608298/job/135544546761', name: 'gate (ubuntu-latest)', status: 'completed' },
  { conclusion: 'failure', html_url: 'https://github.com/HazzardRust/pilot/actions/runs/44519608298/job/135544546622', name: 'gate (windows-latest)', status: 'completed' },
  { conclusion: 'failure', html_url: 'https://github.com/HazzardRust/pilot/actions/runs/44519608298/job/135544546237', name: 'gate (macos-latest)', status: 'completed' },
];
const SHA = '5fef2abeeab467094301df1737d521b3898d1739';
const gate = (host) => checksGate({ host, git: () => assert.fail('no tree read'), sha: SHA, at: 'land' });

test('a red feature does not land', (t) => {
  const { origin, gitIn, a: work } = repos(t, 'a');
  commitFile(work, 'more.txt', 'more\n', 'unpushed');
  const [pilot, feat, tip] = [git(origin, 'rev-parse', 'pilot'), git(origin, 'rev-parse', 'feat/a'), git(work, 'rev-parse', 'HEAD')];
  const { host, calls } = fakeGh([], undefined, { checks: PR121 });

  assert.throws(() => land({ cwd: work, git: gitIn(work), host, test: passing }), (err) => {
    assert.equal(err.exitCode, 1);
    assert.equal(err.message, `NOT landed: checks red at ${tip.slice(0, 7)}: gate (ubuntu-latest), gate (windows-latest), gate (macos-latest); nothing pushed`);
    return true;
  });
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilot, 'origin/pilot unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/a'), feat, 'the feature is not pushed');
  assert.ok(calls.some((args) => args[0] === 'api' && args[1].includes(`/commits/${tip}/check-runs`)), 'the tip itself is read');
});

test('pending does not land', () => {
  const pending = gate(githubHost(() => JSON.stringify({ total_count: 1, check_runs: [{ ...PR121[2], status: 'in_progress', conclusion: null }] })));
  assert.deepEqual([pending.ok, pending.line], [false, 'checks pending at 5fef2ab: gate (macos-latest)']);
});

test('unread does not land', () => {
  const unread = gate(githubHost(() => { throw Object.assign(new Error('Command failed: gh api'), { stderr: 'HTTP 401: Bad credentials\n' }); }));
  assert.deepEqual([unread.ok, unread.line], [false, 'checks unread at 5fef2ab: HTTP 401: Bad credentials']);
});
