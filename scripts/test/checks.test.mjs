// ci-gate S1, spec 7, 9, 10; L1-L4, A2. The **Checks** seam: one commit's host checks read as one **Verdict**, one
// gate and one **Check line**, over the GitHub adapter on a fake `run`. 0 processes start.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { githubHost } from '../../deck/host-github.mjs';
import { checkLine, checksAt, checksGate, ciConfigured, parseCheckLine } from '../checks.mjs';

const SHA = '5fef2abeeab467094301df1737d521b3898d1739';
/** PR #121's head as `gh api …/check-runs` answered it live on 2026-11-20, kept to the fields the adapter reads. */
const PR121 = {
  total_count: 3,
  check_runs: [
    { conclusion: 'failure', html_url: 'https://github.com/HazzardRust/pilot/actions/runs/44519608298/job/135544546761', name: 'gate (ubuntu-latest)', status: 'completed' },
    { conclusion: 'failure', html_url: 'https://github.com/HazzardRust/pilot/actions/runs/44519608298/job/135544546622', name: 'gate (windows-latest)', status: 'completed' },
    { conclusion: 'failure', html_url: 'https://github.com/HazzardRust/pilot/actions/runs/44519608298/job/135544546237', name: 'gate (macos-latest)', status: 'completed' },
  ],
};
const [UBUNTU, WINDOWS, MACOS] = PR121.check_runs.map((run) => run.name);

/** #121's run `at`, as GitHub would give it in another state. */
const runAs = (at, status, conclusion) => ({ ...PR121.check_runs[at], status, conclusion });
const answering = (runs, total = runs.length) => githubHost(() => JSON.stringify({ total_count: total, check_runs: runs }));
const throwing = (err) => githubHost(() => { throw err; });
const verdictOf = (host) => checksAt({ host, sha: SHA });

test('a failed run is red, named', () => {
  const verdict = verdictOf(githubHost(() => JSON.stringify(PR121)));
  assert.deepEqual(verdict, { state: 'red', sha: SHA, failed: [UBUNTU, WINDOWS, MACOS], pending: [] });
  assert.equal(checkLine(verdict), 'checks red at 5fef2ab: gate (ubuntu-latest), gate (windows-latest), gate (macos-latest)');
});

test('pending, none, unread are told apart', () => {
  assert.deepEqual(verdictOf(answering([runAs(0, 'in_progress', null)])), { state: 'pending', sha: SHA, failed: [], pending: [UBUNTU] });
  assert.deepEqual(verdictOf(answering([])), { state: 'none', sha: SHA, failed: [], pending: [] });
  assert.deepEqual(checksAt({ host: null, sha: SHA }), { state: 'none', sha: SHA, failed: [], pending: [], why: 'no host' });
  const unread = verdictOf(throwing(Object.assign(new Error('Command failed: gh api'), { stderr: 'HTTP 401: Bad credentials\nmore' })));
  assert.deepEqual(unread, { state: 'unread', sha: SHA, failed: [], pending: [], why: 'HTTP 401: Bad credentials' });
  const crlf = verdictOf(throwing(Object.assign(new Error('Command failed: gh api'), { stderr: 'HTTP 502: Bad gateway\r\nmore\r\n' })));
  assert.deepEqual(parseCheckLine(checkLine(crlf)), { state: 'unread', sha7: '5fef2ab', names: ['HTTP 502: Bad gateway'] }, "Windows stderr's CRLF");
  assert.equal(verdictOf(githubHost(() => 'not json')).state, 'unread', 'an answer that is not JSON');
  assert.equal(verdictOf(githubHost(() => '{"check_runs":{}}')).state, 'unread', 'an answer that is not the shape');
  assert.equal(verdictOf(answering([runAs(0, 'completed', 'success')], 101)).state, 'unread', 'runs past the one page are never read as fewer');
  assert.equal(verdictOf(answering([runAs(0, 'completed', 'startup_failure')])).state, 'unread', 'a conclusion off the list is never guessed');
  assert.throws(() => checksAt({ host: githubHost(() => assert.fail('no run')), sha: '5fef2ab' }), /full commit sha/);
  assert.throws(() => checksAt({ host: null, sha: 'pilot' }), /full commit sha/);
});

/** A host over a run that records each call's second argument and answers per verb. */
const recording = () => {
  const calls = [];
  const run = (args, opts) => {
    calls.push({ args, opts });
    if (args[0] === 'api' && args[1] === 'user') return 'me';
    if (args[0] === 'api') return JSON.stringify({ total_count: 0, check_runs: [] });
    if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/o/r/pull/7\n';
    if (args[0] === 'pr' && args[1] === 'list') return '[]';
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ number: 7, state: 'OPEN', comments: [] });
    return '';
  };
  return { calls, host: githubHost(run) };
};

test('a hung gh is unread: only the checks read carries a timeout', () => {
  const { calls, host } = recording();
  verdictOf(host);
  assert.deepEqual(calls.map((call) => call.opts), [{ timeout: 30000 }], 'the checks read passes 30 s');
  const timedOut = Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' });
  assert.deepEqual(verdictOf(throwing(timedOut)), { state: 'unread', sha: SHA, failed: [], pending: [], why: 'spawnSync gh ETIMEDOUT' });
});

test('other verbs are unchanged: no run receives a timeout', () => {
  const { calls, host } = recording();
  host.reviews({ state: 'open' });
  host.review(7);
  host.open({ base: 'main', head: 'x', title: 't', body: 'b', label: 'l' });
  host.edit(7, { title: 't', body: 'b', label: 'l' });
  host.comment(7, 'hi');
  host.upsertComment(7, '<!--m-->', 'hi');
  host.signedIn();
  assert.ok(calls.length >= 7);
  assert.deepEqual(calls.filter((call) => call.opts !== undefined), []);
});

test('red wins over pending; neutral and skipped pass', () => {
  const mixed = verdictOf(answering([runAs(0, 'completed', 'failure'), runAs(1, 'queued', null)]));
  assert.deepEqual(mixed, { state: 'red', sha: SHA, failed: [UBUNTU], pending: [WINDOWS] });
  const passed = verdictOf(answering([runAs(0, 'completed', 'neutral'), runAs(1, 'completed', 'skipped'), runAs(2, 'completed', 'success')]));
  assert.deepEqual(passed, { state: 'green', sha: SHA, failed: [], pending: [] });
  for (const word of ['cancelled', 'timed_out', 'action_required', 'stale']) {
    assert.equal(verdictOf(answering([runAs(0, 'completed', word), runAs(1, 'completed', 'success')])).state, 'red', word);
  }
});

/** A fake `git` whose `ls-tree -z` of the sha lists `files`, NUL-ended as git prints them; any other call fails the test. */
const treeOf = (files) => (args) => {
  assert.deepEqual(args, ['ls-tree', '-r', '-z', '--name-only', SHA, '--', '.github/workflows', '.gitlab-ci.yml']);
  return files.map((file) => `${file}\0`).join('');
};
const WORKFLOW = treeOf(['.github/workflows/gate.yml']);
const BARE = treeOf([]);

test('the gate fails closed', () => {
  const gate = (host, git = WORKFLOW) => checksGate({ host, git, sha: SHA });
  const green = gate(answering([runAs(0, 'completed', 'success')]));
  assert.deepEqual([green.ok, green.line], [true, 'checks green at 5fef2ab']);
  assert.equal(gate(githubHost(() => JSON.stringify(PR121))).ok, false);
  assert.deepEqual([gate(answering([runAs(2, 'in_progress', null)])).ok, gate(answering([runAs(2, 'in_progress', null)])).line], [false, 'checks pending at 5fef2ab: gate (macos-latest)']);
  const timedOut = Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' });
  for (const host of [throwing(new Error('gh: not logged in')), throwing(timedOut), githubHost(() => '{')]) {
    const refused = gate(host);
    assert.equal(refused.ok, false);
    assert.match(refused.line, /^checks unread at 5fef2ab: \S/);
  }
  assert.equal(gate(throwing(timedOut)).line, 'checks unread at 5fef2ab: spawnSync gh ETIMEDOUT');
  assert.deepEqual([gate(answering([])).ok, gate(answering([])).line], [false, 'checks none at 5fef2ab']);
  assert.deepEqual([gate(answering([]), BARE).ok, gate(answering([]), BARE).line], [true, 'checks none at 5fef2ab: no CI configured']);
  assert.deepEqual([gate(null, BARE).ok, gate(null, BARE).line], [true, 'checks none at 5fef2ab: no host']);
  assert.equal(gate(answering([]), () => { throw new Error('git broke'); }).ok, false, 'an unreadable tree counts as CI configured');
});

test('CI configured is a workflow file or .gitlab-ci.yml in the tree', () => {
  for (const file of ['.github/workflows/gate.yml', '.github/workflows/release.yaml', '.gitlab-ci.yml', '.github/workflows/prüfung.yml']) assert.equal(ciConfigured(treeOf([file]), SHA), true, file);
  assert.equal(ciConfigured(treeOf(['.github/workflows/README.md', '.github/workflows/old/gate.yml']), SHA), false);
  assert.equal(ciConfigured(BARE, SHA), false);
  assert.throws(() => ciConfigured(BARE, '--output=x'), /full commit sha/);
});

test('the line round-trips', () => {
  const verdicts = [
    { state: 'red', sha: SHA, failed: [UBUNTU, MACOS], pending: [WINDOWS] },
    { state: 'pending', sha: SHA, failed: [], pending: [WINDOWS] },
    { state: 'green', sha: SHA, failed: [], pending: [] },
    { state: 'none', sha: SHA, failed: [], pending: [], why: 'no host' },
    { state: 'unread', sha: SHA, failed: [], pending: [], why: 'HTTP 401: Bad credentials' },
  ];
  const names = [[UBUNTU, MACOS], [WINDOWS], [], ['no host'], ['HTTP 401: Bad credentials']];
  verdicts.forEach((verdict, at) => assert.deepEqual(parseCheckLine(checkLine(verdict)), { state: verdict.state, sha7: '5fef2ab', names: names[at] }));
  for (const line of ['', 'checks blue at 5fef2ab', 'checks green at 5FEF2AB', 'checks green at 5fef2a', 'checks green 5fef2ab', 'checks red at 5fef2ab: ', ' checks green at 5fef2ab']) {
    assert.equal(parseCheckLine(line), null, JSON.stringify(line));
  }
});
