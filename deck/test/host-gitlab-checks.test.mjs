// ci-gate S8, spec 8; L1, L3. GitLab answers the same **Check**s: `checks(sha)` reads the commit's latest statuses
// over the one allowed `glab api` GET. Every run here is a fake, refused before `execFileSync`, or started in a cwd
// that does not exist, so no `glab` process starts. The statuses fixture is written from GitLab's docs example, not
// captured: no GitLab remote exists here (S8 Misses).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { gitlabHost, glabRun } from '../host-gitlab.mjs';
import { checksAt } from '../../scripts/checks.mjs';

const SHA = '5fef2abeeab467094301df1737d521b3898d1739';
const STATUSES = `projects/:id/repository/commits/${SHA}/statuses?per_page=100&page=1`;
const fixture = JSON.parse(fs.readFileSync(new URL('fixtures/glab/commit_statuses.json', import.meta.url), 'utf8'));

/** A gitlab host over a fake run answering `pages` in turn, recording `{ args, input, opts }` per call. */
function answering(...pages) {
  const calls = [];
  const host = gitlabHost((args, input, opts) => {
    calls.push({ args, input, opts });
    return JSON.stringify(pages[calls.length - 1] ?? []);
  });
  return { host, calls };
}

const status = (name, state) => ({ ...fixture[0], name, status: state });

test('statuses map to outcomes', () => {
  const { host, calls } = answering(fixture);
  assert.deepEqual(host.checks(SHA), [
    { name: 'test', outcome: 'fail' },
    { name: 'lint', outcome: 'pending' },
    { name: 'build', outcome: 'pass' },
  ]);
  assert.deepEqual(calls, [{ args: ['api', STATUSES], input: undefined, opts: { timeout: 30000 } }], 'one GET, with the checks timeout');
  const table = {
    success: 'pass', skipped: 'pass', failed: 'fail', canceled: 'fail',
    created: 'pending', pending: 'pending', running: 'pending', manual: 'pending',
    waiting_for_resource: 'pending', preparing: 'pending', scheduled: 'pending',
  };
  const all = Object.keys(table).map((state) => status(state, state));
  assert.deepEqual(answering(all).host.checks(SHA).map((check) => [check.name, check.outcome]), Object.entries(table));
  for (const odd of ['canceling', 'passed', undefined, null]) {
    assert.throws(() => answering([status('x', odd)]).host.checks(SHA), /glab api statuses: x .*status/, String(odd));
  }
  assert.throws(() => answering([{ status: 'success' }]).host.checks(SHA), /no name/);
  assert.throws(() => answering({ message: '404 Not found' }).host.checks(SHA), /not a list/);
});

test('a full page reads on to the next', () => {
  const full = Array.from({ length: 100 }, (_, at) => status(`job ${at}`, 'success'));
  const { host, calls } = answering(full, [status('last', 'failed')]);
  const checks = host.checks(SHA);
  assert.equal(checks.length, 101);
  assert.deepEqual(checks.at(-1), { name: 'last', outcome: 'fail' });
  assert.deepEqual(calls.map(({ args }) => args.at(-1)), [STATUSES, STATUSES.replace('&page=1', '&page=2')]);
  let pages = 0;
  const endless = gitlabHost(() => (pages += 1, JSON.stringify(full)));
  assert.throws(() => endless.checks(SHA), /more than 99900 statuses/);
  assert.equal(pages, 999, 'no page past the allowlist is asked for');
});

test('the verdict is the same', () => {
  assert.deepEqual(checksAt({ host: answering(fixture).host, sha: SHA }), { state: 'red', sha: SHA, failed: ['test'], pending: ['lint'] });
  assert.deepEqual(checksAt({ host: answering([status('build', 'success')]).host, sha: SHA }), { state: 'green', sha: SHA, failed: [], pending: [] });
  assert.equal(checksAt({ host: answering([status('x', 'canceling')]).host, sha: SHA }).state, 'unread');
});

test('only the one GET reaches glab', () => {
  const { host, calls } = answering(fixture);
  for (const sha of ['5fef2ab', SHA.toUpperCase(), `${SHA}/../x`, 'pilot', undefined]) {
    assert.throws(() => host.checks(sha), /not a full commit sha/, String(sha));
  }
  assert.equal(calls.length, 0, 'a short sha starts no run');
  // The real runner: each refusal throws before `execFileSync`, so no `glab` process starts. A cwd that does not
  // exist means even an allowed call cannot start one; it fails on the spawn, not on the allowlist.
  const glab = glabRun(fileURLToPath(new URL('./no-such-dir-ci-gate-s8/', import.meta.url)));
  const refused = [
    [['api', STATUSES.replace(SHA, '5fef2ab')]],
    [['api', STATUSES.replace(SHA, SHA.toUpperCase())]],
    [['api', '--method', 'POST', STATUSES]],
    [['api', '-X', 'POST', '-H', 'Content-Type: application/json', '--input', '-', STATUSES], '{}'],
    [['api', '--input', '-', STATUSES], '{}'],
    [['api', '-H', 'Content-Type: application/json', STATUSES]],
    [['api', '-F', 'name=@/etc/passwd', STATUSES]],
    [['api', '-f', 'state=success', STATUSES]],
    [['api', `projects/:id/pipelines?sha=${SHA}`]],
    [['api', `projects/:id/statuses/${SHA}`]],
    [['api', STATUSES.replace(':id', 'other%2Frepo')]],
    [['api', STATUSES.replace(':id', ':fullpath')]],
    [['api', `${STATUSES}&all=true`]],
    [['api', STATUSES.replace('per_page=100', 'per_page=1')]],
    [['api', STATUSES.replace('&page=1', '&page=0')]],
    [['api', STATUSES.replace('&page=1', '&page=1000')]],
    [['api', STATUSES.replace('/statuses', '/../statuses')]],
  ];
  for (const [args, input] of refused) assert.throws(() => glab(args, input), /not a host verb/, args.join(' '));
  for (const page of ['&page=1', '&page=999']) {
    assert.throws(() => glab(['api', STATUSES.replace('&page=1', page)]), (err) => !/not a host verb/.test(err.message), 'the GET passes the allowlist');
  }
});
