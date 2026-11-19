/**
 * `pilot checks [<ref>] [--wait <min>]` (ci-gate S2, spec 7): one exit code per **Verdict**, a bounded wait, and a
 * ref that is a commit or a usage error. Fake host, fake git and a fake clock: nothing here starts a process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../checks-cli.mjs';

const SHA = '5fef2ab0123456789abcdef0123456789abcdef0';
const check = (name, outcome) => ({ name, outcome });
const ANSWERS = {
  green: [check('test', 'pass')],
  red: [check('test', 'fail'), check('lint', 'pass')],
  pending: [check('test', 'pending')],
  none: [],
};

/** A host answering `states` in turn (the last one repeats); `unread` throws. Records every sha it is asked. */
function fakeHost(...states) {
  const asked = [];
  return {
    asked,
    checks(sha) {
      asked.push(sha);
      const state = states[Math.min(asked.length, states.length) - 1];
      if (state === 'unread') throw Object.assign(new Error('gh failed'), { stderr: 'HTTP 502: bad gateway' });
      return ANSWERS[state];
    },
  };
}

/** A git that verifies only `HEAD`, `5fef2ab` and the all-digit `1234567`, and lists `tree`, recording its argv. */
function fakeGit(tree = '.github/workflows/ci.yml\0') {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse' && ['HEAD^{commit}', '5fef2ab^{commit}', '1234567^{commit}'].includes(args.at(-1))) return SHA;
    if (args[0] === 'ls-tree') return tree;
    throw Object.assign(new Error('git failed'), { stderr: 'fatal: Needed a single revision' });
  };
  return Object.assign(git, { calls });
}

/** A clock that only moves when slept on. */
function fakeClock() {
  let at = 0;
  const slept = [];
  return { slept, now: () => at, sleep: async (ms) => { slept.push(ms); at += ms; } };
}

async function runChecks(t, argv, host, git = fakeGit()) {
  const out = [];
  const err = [];
  t.mock.method(process.stdout, 'write', (chunk) => out.push(String(chunk)));
  t.mock.method(process.stderr, 'write', (chunk) => err.push(String(chunk)));
  const clock = fakeClock();
  const code = await main(argv, { cwd: '.', host, git, sleep: clock.sleep, now: clock.now });
  t.mock.restoreAll();
  return { code, out: out.join(''), err: err.join(''), slept: clock.slept, git };
}

test('each state has its exit code', async (t) => {
  const want = {
    green: [0, 'checks green at 5fef2ab\n'],
    red: [1, 'checks red at 5fef2ab: test\n'],
    pending: [4, 'checks pending at 5fef2ab: test\n'],
    none: [5, 'checks none at 5fef2ab\n'],
    unread: [6, 'checks unread at 5fef2ab: HTTP 502: bad gateway\n'],
  };
  for (const [state, [code, line]] of Object.entries(want)) {
    const host = fakeHost(state);
    const run = await runChecks(t, [], host);
    assert.deepEqual([run.code, run.out], [code, line], state);
    assert.deepEqual(host.asked, [SHA], `${state}: the full sha HEAD resolves to, read once`);
  }
});

test('no host (pilot.host none) is none, exit 5', async (t) => {
  const run = await runChecks(t, ['5fef2ab'], null);
  assert.deepEqual([run.code, run.out], [5, 'checks none at 5fef2ab: no host\n']);
});

test('wait ends when it stops pending', async (t) => {
  const host = fakeHost('pending', 'pending', 'red');
  const run = await runChecks(t, ['--wait', '5'], host);
  assert.deepEqual([run.code, run.out], [1, 'checks red at 5fef2ab: test\n'], 'the last line only');
  assert.deepEqual(run.slept, [30_000, 30_000]);
  assert.equal(host.asked.length, 3);
});

test('wait is bounded', async (t) => {
  const host = fakeHost('pending');
  const run = await runChecks(t, ['5fef2ab', '--wait', '1'], host);
  assert.equal(run.code, 4);
  assert.equal(run.out, 'checks pending at 5fef2ab: test\n');
  assert.deepEqual([host.asked.length, run.slept], [2, [30_000]], 'reads at 0 s and 30 s; a third would be at the bound');
});

test('wait waits on none while CI is configured at the sha, and not where it is not', async (t) => {
  const host = fakeHost('none', 'none', 'green');
  const run = await runChecks(t, ['--wait'], host);
  assert.deepEqual([run.code, run.out, run.slept], [0, 'checks green at 5fef2ab\n', [30_000, 30_000]], 'runs not yet registered');
  const bare = fakeHost('none', 'green');
  const noCi = await runChecks(t, ['--wait'], bare, fakeGit(''));
  assert.deepEqual([noCi.code, noCi.slept, bare.asked.length], [5, [], 1], 'no CI configured returns at once');
  const noHost = await runChecks(t, ['--wait'], null);
  assert.deepEqual([noHost.code, noHost.slept, noHost.git.calls.length], [5, [], 1], 'no host returns at once, no tree read');
});

test('an unread mid-wait ends the wait, unread', async (t) => {
  const host = fakeHost('pending', 'unread');
  const run = await runChecks(t, ['--wait', '5'], host);
  assert.deepEqual([run.code, run.slept], [6, [30_000]]);
});

test('after a bare --wait an all-digit short sha is the ref, not minutes', async (t) => {
  const host = fakeHost('green');
  const run = await runChecks(t, ['--wait', '1234567'], host);
  assert.equal(run.code, 0);
  assert.deepEqual(run.git.calls, [['rev-parse', '--verify', '--quiet', '1234567^{commit}']]);
});

test('a bare --wait waits up to 20 minutes, and the word after it is the ref', async (t) => {
  const host = fakeHost('pending');
  const run = await runChecks(t, ['--wait', '5fef2ab'], host);
  assert.equal(run.code, 4);
  assert.equal(host.asked.length, 40, 'polls at 0 s to 19.5 min, every 30 s');
  assert.deepEqual(run.git.calls, [['rev-parse', '--verify', '--quiet', '5fef2ab^{commit}']]);
});

test('without --wait, pending is read once', async (t) => {
  const host = fakeHost('pending', 'green');
  const run = await runChecks(t, [], host);
  assert.equal(run.code, 4);
  assert.deepEqual([host.asked.length, run.slept], [1, []]);
});

test('a ref is a commit or usage', async (t) => {
  const usage = [
    ['--wait', '0'],
    ['--wait', '61'],
    ['--wait', '1.5'],
    ['--wait', '1', '--wait', '2'],
    ['-x'],
    ['--output=/tmp/x'],
    ['nosuchref'],
    ['HEAD', '5fef2ab'],
  ];
  for (const argv of usage) {
    const host = fakeHost('green');
    const run = await runChecks(t, argv, host);
    assert.equal(run.code, 2, argv.join(' '));
    assert.equal(run.out, '', `${argv.join(' ')}: nothing on stdout`);
    assert.match(run.err, /pilot checks/, `${argv.join(' ')}: names itself on stderr`);
    assert.deepEqual(host.asked, [], `${argv.join(' ')}: no host call`);
    // Only a ref-shaped word git then fails to verify reaches git; every flag and bad minutes is refused first.
    const reachesGit = argv.includes('nosuchref') || argv.includes('1.5');
    assert.equal(run.git.calls.length, reachesGit ? 1 : 0, `${argv.join(' ')}: git calls`);
  }
});

test('the ref reaches git as one argv entry suffixed ^{commit}, never gh', async (t) => {
  const host = fakeHost('red');
  const run = await runChecks(t, ['5fef2ab'], host);
  assert.equal(run.code, 1);
  assert.deepEqual(run.git.calls, [['rev-parse', '--verify', '--quiet', '5fef2ab^{commit}']]);
  assert.deepEqual(host.asked, [SHA]);
});
