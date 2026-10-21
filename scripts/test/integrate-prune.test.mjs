/**
 * `pilot integrate` deletes the slice it merged, once the push has succeeded (pilot-fork
 * spec 6, 8; L4, L5, A2), through S6's `deleteMerged`: a PR gh reads MERGED at the tip, or
 * with no PR a tip that is an ancestor of the pushed feat branch. Red, `--no-push` and a PR
 * still open delete nothing. gh is injected; every remote is a scratch bare repository.
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
const failing = `node -e "console.log('✖ broken thing (1.2ms)'); console.log('ℹ pass 2'); console.log('ℹ fail 1'); process.exit(1)"`;

/**
 * `origin.git` with `main` and `feat/x`, and `second.git`, named `second` in the work clone.
 * `pilot` and `slice/x-s1` (adding a.txt) go where `runs` says: `origin`, `second`, or `none`
 * for local branches.
 */
function scratchRepos(t, runs) {
  return gitFixture(t, `integrate-prune:scratchRepos:${runs}`, (root) => buildScratchRepos(root, runs));
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
  git(work, 'checkout', '-q', '-b', 'slice/x-s1');
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
  git(work, 'add', 'a.txt');
  git(work, 'commit', '-q', '-m', 'the slice');
  const tip = git(work, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', 'feat/x');
  if (runs === 'none') {
    git(work, 'branch', '-q', 'pilot', 'feat/x');
  } else {
    git(work, 'push', '-q', runs, 'feat/x:pilot', 'slice/x-s1');
    git(work, 'branch', '-q', '-D', 'slice/x-s1');
  }
  return { origin, second, work, tip };
}

/** A gh answering PR #4 for slice/x-s1 in `state` at `tip`, or no PR when `state` is null. */
function ghWith(state, tip, asked = []) {
  return (args) => {
    asked.push(args);
    if (args[0] !== 'pr' || state === null) return '[]';
    const fields = args[args.indexOf('--json') + 1];
    if (fields === 'number,title') return JSON.stringify([{ number: 4, title: 'feat(x): S1 the slice' }]);
    return JSON.stringify([{ number: 4, state, headRefName: 'slice/x-s1', headRefOid: tip, isCrossRepository: false }]);
  };
}

const listed = (bare) => git(bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/').split('\n');
const options = (work, gh, more = {}) => ({ cwd: work, test: passing, install: () => {}, gh, wait: 0, ...more });

test('a merged slice is deleted after the push', (t) => {
  const { origin, work, tip } = scratchRepos(t, 'origin');

  const result = integrate('slice/x-s1', options(work, ghWith('MERGED', tip)));

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /; pushed; deleted slice\/x-s1$/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'), 'feat/x pushed first');
  assert.ok(!listed(origin).includes('slice/x-s1'), 'origin no longer lists the slice');
});

test('a PR gh still reads open keeps the branch', (t) => {
  const { origin, work, tip } = scratchRepos(t, 'origin');

  const result = integrate('slice/x-s1', options(work, ghWith('OPEN', tip)));

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /; pushed; kept slice\/x-s1: PR #4 open$/);
  assert.ok(listed(origin).includes('slice/x-s1'), 'the slice is still on origin');
});

test('a red integration deletes nothing', (t) => {
  const { origin, work, tip } = scratchRepos(t, 'origin');
  const asked = [];

  const result = integrate('slice/x-s1', options(work, ghWith('MERGED', tip, asked), { test: failing }));

  assert.equal(result.ok, false);
  assert.doesNotMatch(result.line, /deleted|kept/);
  assert.ok(listed(origin).includes('slice/x-s1'), 'the slice is still on origin');
  assert.ok(!asked.some((args) => args.includes('number,state,headRefName,headRefOid,isCrossRepository')), 'gh is not asked whether it merged');
});

test('a PR-less slice on the second remote is deleted by ancestry', (t) => {
  const { origin, second, work } = scratchRepos(t, 'second');

  const result = integrate('slice/x-s1', options(work, ghWith(null)));

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /; pushed; deleted slice\/x-s1$/);
  assert.ok(!listed(second).includes('slice/x-s1'), 'the second remote no longer lists the slice');
  assert.ok(listed(origin).includes('feat/x'), 'feat/x stays on origin');
});

test('--no-push deletes nothing', (t) => {
  const { origin, work, tip } = scratchRepos(t, 'origin');

  const result = integrate('slice/x-s1', options(work, ghWith('MERGED', tip), { push: false }));

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /; not pushed \(--no-push\)$/);
  assert.ok(listed(origin).includes('slice/x-s1'), 'the slice is still on origin');
});

test('local mode deletes nothing and asks gh nothing about a merge', (t) => {
  const { work, tip } = scratchRepos(t, 'none');
  const asked = [];

  const result = integrate('slice/x-s1', options(work, ghWith('MERGED', tip, asked)));

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /; pushed$/);
  assert.equal(git(work, 'rev-parse', 'slice/x-s1'), tip, 'the local slice is still there');
  assert.ok(!asked.some((args) => args.includes('number,state,headRefName,headRefOid,isCrossRepository')));
});

test('a feat/ branch integrated as a slice is never deleted', (t) => {
  const { origin, work, tip } = scratchRepos(t, 'origin');
  git(work, 'push', '-q', 'origin', `${tip}:refs/heads/feat/y`);

  const result = integrate('feat/y', options(work, ghWith(null)));

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /; pushed$/);
  assert.ok(listed(origin).includes('feat/y'), 'feat/y is still on origin');
});

test('a refused deletion keeps the slice and names why', (t) => {
  const { second, work } = scratchRepos(t, 'second');
  fs.writeFileSync(path.join(second, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

  const result = integrate('slice/x-s1', options(work, ghWith(null)));

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /; pushed; kept slice\/x-s1: git push second --delete failed: /);
  assert.ok(listed(second).includes('slice/x-s1'), 'the slice is still on the second remote');
});
