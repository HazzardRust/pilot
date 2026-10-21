/**
 * `pilot integrate` reads `pilot` and the slice on the run remote (pilot-fork spec 4, 5;
 * L1, L3): a second bare remote, local mode (`none`), and unset, where every argv is
 * today's. `feat/<slug>` is pushed to origin in all three. gh is injected; nothing here
 * reaches GitHub.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');

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

function buildScratchRepos(root, runs) {
  const origin = path.join(root, 'origin.git');
  const second = path.join(root, 'second.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '--bare', '-b', 'main', second);
  git(root, 'clone', '-q', origin, work);
  git(work, 'remote', 'add', 'second', second);
  git(work, 'checkout', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
  git(work, 'add', 'base.txt');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x', 'HEAD:main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  if (runs !== 'origin') git(work, 'config', 'pilot.remote', runs);

  const place = (branch) => {
    if (runs === 'none') return;
    git(work, 'push', '-q', runs, branch);
    git(work, 'branch', '-q', '-D', branch);
  };
  git(work, 'checkout', '-q', '-b', 'pilot');
  fs.writeFileSync(path.join(work, 'pilot.txt'), 'pilot\n');
  git(work, 'add', 'pilot.txt');
  git(work, 'commit', '-q', '-m', 'on pilot');
  git(work, 'checkout', '-q', '-b', 'slice/x-s1', 'feat/x');
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
  git(work, 'add', 'a.txt');
  git(work, 'commit', '-q', '-m', 'the slice');
  git(work, 'checkout', '-q', 'feat/x');
  place('pilot');
  place('slice/x-s1');
  return { origin, second, work };
}

const listed = (bare) => git(bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/').split('\n');

test('integrate merges a slice from the second remote and pushes feat to origin', (t) => {
  const { origin, second, work } = scratchRepos(t, 'second');

  const result = integrate('slice/x-s1', { cwd: work, test: passing, install: () => {}, gh: noPr() });

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

  const result = integrate('slice/x-s1', { cwd: work, test: passing, install: () => {}, gh: noPr() });

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
    result = integrate('slice/x-s1', { cwd: work, test: passing, install: () => {}, gh: noPr(asked) });
  } finally {
    if (before === undefined) delete process.env.GIT_TRACE;
    else process.env.GIT_TRACE = before;
  }

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(asked, [
    ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,state,headRefName,headRefOid,isCrossRepository'],
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
    // S7: the merged slice is deleted after the push.
    'fetch -q origin',
    `push -q --force-with-lease=refs/heads/slice/x-s1:${tip} origin --delete refs/heads/slice/x-s1`,
  ]);
});
