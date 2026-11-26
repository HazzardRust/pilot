/**
 * `pilot integrate` reads `pilot` and the slice on the run remote (pilot-fork spec 4, 5;
 * L1, L3): a second bare remote, local mode (`none`), and unset, where every argv is
 * today's. `feat/<slug>` is pushed to origin in all three. gh is injected; nothing here
 * reaches GitHub.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const noPr = (asked = []) => (args) => {
  asked.push(args);
  return args[0] === 'pr' ? '[]' : 'me\n';
};

/**
 * `origin.git` with `main` and `feat/x`, and `second.git`, named `second` in the work clone.
 * `pilot` and `slice/x-s1` (adding a.txt) go where `runs` says: `origin`, `second`, or
 * `none` for local branches. The pilot branch carries pilot.txt, which feat/x lacks.
 */
function scratchRepos(t, runs) {
  return gitFixture(t, `integrate-remote:scratchRepos:${runs}`, (root) => buildScratchRepos(root, runs));
}

// The base commit, then `pilot` and the slice each one commit off it (test-body-git S12: seeded, L3). Seeded alone
// into another directory, the same base is the same commit, since `seed`'s times and identity are fixed.
const BASE = { branch: 'main', files: { 'base.txt': 'base\n' }, message: 'base' };
const RUN = [
  { ...BASE, branch: 'slice/x-s1' },
  { branch: 'pilot', from: 'slice/x-s1', files: { 'pilot.txt': 'pilot\n' }, message: 'on pilot' },
  { branch: 'slice/x-s1', files: { 'a.txt': 'a\n' }, message: 'the slice' },
];

function buildScratchRepos(root, runs) {
  const work = path.join(root, 'work');
  // Under `origin` the run's branches are origin's own; else origin holds main and feat/x, and the run's
  // branches are in `second.git` (the second remote, fetched) or fetched into the work clone as local branches.
  const { origin } = runs === 'origin'
    ? seed(root, [BASE, { ...RUN[1], from: 'main' }, { ...RUN[2], from: 'main' }], { 'feat/x': 'main' })
    : seed(root, [BASE], { 'feat/x': 'main' });
  const other = path.join(root, runs);
  if (runs !== 'origin') fs.mkdirSync(other);
  const second = runs === 'origin' ? path.join(root, 'second.git') : seed(other, RUN).origin;
  const remote = runs === 'second' ? ['-c', `remote.second.url=${second}`, '-c', 'remote.second.fetch=+refs/heads/*:refs/remotes/second/*'] : [];
  const setting = runs === 'origin' ? [] : ['-c', `pilot.remote=${runs}`];
  git(root, 'clone', '-q', ...remote, ...setting, '-b', 'feat/x', origin, work);
  if (runs === 'second') git(work, 'fetch', '-q', 'second');
  if (runs === 'none') git(work, 'fetch', '-q', second, 'pilot:pilot', 'slice/x-s1:slice/x-s1');
  return { origin, second, work };
}

const listed = (bare) => git(bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/').split('\n');

test('integrate merges a slice from the second remote and pushes feat to origin', (t) => {
  const { origin, second, work } = scratchRepos(t, 'second');

  const result = integrate('slice/x-s1', { cwd: work, test: passing, install: () => {}, host: githubHost(noPr()) });

  assert.equal(result.ok, true, result.line);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'), 'feat/x pushed to origin');
  assert.equal(git(origin, 'show', 'feat/x:a.txt'), 'a', "origin's feat/x holds the slice");
  assert.equal(git(origin, 'show', 'feat/x:pilot.txt'), 'pilot', "and second's pilot as the base");
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'Merge slice/x-s1');
  assert.deepEqual(listed(origin).sort(), ['feat/x', 'main'], 'origin lists no slice/ or pilot');
  assert.ok(!listed(second).includes('feat/x'), 'feat/ never pushed to the run remote');
});

test('integrate under none merges a local slice', (t) => {
  const { origin, work } = scratchRepos(t, 'none');

  const result = integrate('slice/x-s1', { cwd: work, test: passing, install: () => {}, host: githubHost(noPr()) });

  assert.equal(result.ok, true, result.line);
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'Merge slice/x-s1');
  assert.match(result.line, new RegExp(`\(base pilot@${git(work, 'rev-parse', '--short', 'pilot')}\)`), 'the base is the local pilot');
  assert.equal(git(origin, 'show', 'feat/x:pilot.txt'), 'pilot');
  assert.equal(git(origin, 'show', 'feat/x:a.txt'), 'a');
  assert.deepEqual(listed(origin).sort(), ['feat/x', 'main'], 'origin lists no slice/ or pilot');
});

test('with the setting unset the argv is today\'s', (t) => {
  const { work } = scratchRepos(t, 'origin');
  const tip = git(work, 'rev-parse', 'origin/slice/x-s1');
  const trace = path.join(work, '..', 'trace.log');
  const asked = [];
  const before = process.env.GIT_TRACE;
  process.env.GIT_TRACE = trace;
  let result;
  try {
    result = integrate('slice/x-s1', { cwd: work, test: passing, install: () => {}, host: githubHost(noPr(asked)) });
  } finally {
    if (before === undefined) delete process.env.GIT_TRACE;
    else process.env.GIT_TRACE = before;
  }

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(asked.filter((args) => !args[1]?.includes('/check-runs')), [
    ['pr', 'list', '--state', 'all', '--json', 'number,state,baseRefName,headRefName,headRefOid,body,isCrossRepository', '--limit', '1000'],
  ]);
  const argv = fs.readFileSync(trace, 'utf8')
    .split(/\r?\n/)
    .map((line) => /trace: built-in: git ((?:fetch|merge|push) .*)$/.exec(line)?.[1])
    .filter(Boolean);
  assert.deepEqual(argv, [
    'fetch -q --prune origin',
    "merge -q --no-ff -m 'Merge base pilot' origin/pilot",
    'merge --no-ff --no-commit origin/slice/x-s1',
    'push -q origin feat/x',
    // S7: the merged slice is deleted after the push; land-batching S9 (A3): off integrate's own fetch, with no second one.
    `push -q --force-with-lease=refs/heads/slice/x-s1:${tip} origin --delete refs/heads/slice/x-s1`,
  ]);
});
