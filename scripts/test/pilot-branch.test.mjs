/**
 * S1 of pilot-branch: the pilot branch and the one push guard (spec 1, 4; L4, L12).
 * Each case runs against a scratch bare origin and a clone of it; nothing reaches GitHub.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { assertPushable, remoteDefaultBranch } = await import('../pilot-branch.mjs');
const { base } = await import('../base.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A bare origin with one commit on `main`, `main` its tip, and a clone of it with origin/HEAD set. */
function scratchRepos(t) {
  return gitFixture(t, 'pilot-branch:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const { origin, sha } = seed(root, [{ branch: 'main', files: {}, message: 'main' }]);
  const work = path.join(root, 'work');
  // A clone of a repository with a HEAD sets origin/HEAD itself.
  git(root, 'clone', '-q', origin, work);
  return { origin, work, main: sha.main };
}

async function printed(cwd) {
  const said = [];
  const warned = [];
  const code = await base({ cwd, say: (text) => said.push(text), warn: (text) => warned.push(text) });
  return { code, out: said.join(''), err: warned.join('') };
}

test('base creates pilot from the default tip when the remote has none', async (t) => {
  const { origin, work, main } = scratchRepos(t);
  const { code, out } = await printed(work);
  assert.equal(code, 0);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), main, 'origin has pilot at main\'s tip');
  // Pilot is created at main's tip, and the run is cut from it (landed-pr-closed A1).
  assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', main)} (created from main)\n`);
});

test('base never creates pilot over an existing one', async (t) => {
  // Origin's pilot one commit past main, landed before this clone was made.
  const { origin, work, pilot: ahead } = gitFixture(t, 'pilot-branch:landed', (root) => {
    const { origin: bare, sha } = seed(root, [
      { branch: 'main', files: {}, message: 'main' },
      { branch: 'pilot', from: 'main', files: {}, message: 'landed' },
    ]);
    const clone = path.join(root, 'work');
    git(root, 'clone', '-q', bare, clone);
    return { origin: bare, work: clone, pilot: sha.pilot };
  });
  const { code, out } = await printed(work);
  assert.equal(code, 0);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), ahead, 'the existing pilot is kept');
  assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')}\n`);
});

test('assertPushable refuses the default branch by name', async (t) => {
  const { work } = scratchRepos(t);
  const run = (args) => git(work, ...args);
  assert.throws(() => assertPushable('main', { git: run }), /\bmain\b/);
  assert.throws(() => assertPushable('refs/heads/main', { git: run }), /\bmain\b/);
  assert.throws(() => assertPushable('HEAD:main', { git: run }), /\bmain\b/);
  for (const ref of ['heads/main', 'abc123:refs/heads/main', 'Main', 'HEAD', '@', '--all', '--mirror', '+pilot', 'refs/heads/*:refs/heads/*', ':refs/heads/*', 'refs/tags/main', 'feat/x y', '']) {
    assert.throws(() => assertPushable(ref, { git: run }), /refusing to push/, `${JSON.stringify(ref)} is refused`);
  }
  assert.throws(() => assertPushable('a:b:c', { git: run }), /not a plain <src>:<branch> refspec/);
  for (const ref of ['-x:pilot', 'a..b:pilot', 'x y:pilot']) assert.throws(() => assertPushable(ref, { git: run }), /not a plain <src>:<branch> refspec/, ref);
  for (const ref of ['pilot', 'feat/x', 'design/x', 'refs/heads/pilot', 'abc123:refs/heads/pilot']) assert.doesNotThrow(() => assertPushable(ref, { git: run }), ref);
});

test('assertPushable reads the remote\'s default: a renamed default is refused though origin/HEAD still says main', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(work, 'push', '-q', 'origin', 'main:trunk');
  git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
  assert.equal(git(work, 'symbolic-ref', 'refs/remotes/origin/HEAD'), 'refs/remotes/origin/main', 'the local ref is stale');
  assert.throws(() => assertPushable('trunk', { git: (args) => git(work, ...args) }), /refusing to push trunk: it is the default branch \(trunk\)/);
  assert.doesNotThrow(() => assertPushable('main', { git: (args) => git(work, ...args) }));
});

test('assertPushable refuses every ref when the remote cannot be asked, whatever origin/HEAD says', async (t) => {
  const { work } = scratchRepos(t);
  git(work, 'remote', 'set-url', 'origin', path.join(work, 'no-such-origin.git'));
  assert.throws(() => assertPushable('pilot', { git: (args) => git(work, ...args) }), /no default branch known/);
});

test('assertPushable refuses every ref when the remote has no default branch', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/gone');
  assert.throws(() => assertPushable('pilot', { git: (args) => git(work, ...args) }), /no default branch known/);
});

/** A runner in `cwd` that counts its `ls-remote` calls; `fail` throws on that many first calls. */
function countingRunner(cwd, fail = 0) {
  const runner = (args) => {
    if (args[0] === 'ls-remote') {
      runner.asked += 1;
      if (runner.asked <= fail) throw Object.assign(new Error('origin could not be reached'), { status: 128 });
    }
    return git(cwd, ...args);
  };
  runner.asked = 0;
  return runner;
}

test('remoteDefaultBranch: one runner asks once (cheap-suite spec 3)', (t) => {
  const { work } = scratchRepos(t);
  const runner = countingRunner(work);
  assert.deepEqual([remoteDefaultBranch(runner), remoteDefaultBranch(runner), remoteDefaultBranch(runner)], ['main', 'main', 'main']);
  assert.equal(runner.asked, 1, 'ls-remote runs once per runner');
});

test('remoteDefaultBranch: a new runner asks again after the remote\'s HEAD is renamed', (t) => {
  // The memo is keyed on the runner, not the directory: a cwd-keyed cache would hand the second runner the stale name.
  const { origin, work } = scratchRepos(t);
  const first = countingRunner(work);
  assert.equal(remoteDefaultBranch(first), 'main');
  git(work, 'push', '-q', 'origin', 'main:trunk');
  git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
  assert.equal(remoteDefaultBranch(first), 'main', 'one runner keeps the answer it was given');
  assert.equal(first.asked, 1);
  assert.equal(remoteDefaultBranch(countingRunner(work)), 'trunk', 'a new runner reads the new name');
});

test('remoteDefaultBranch: a failure is asked again, then the answer is kept', (t) => {
  const { work } = scratchRepos(t);
  const runner = countingRunner(work, 1);
  assert.throws(() => remoteDefaultBranch(runner), /no default branch known \(origin could not be asked\)/);
  assert.equal(remoteDefaultBranch(runner), 'main', 'the throw was not remembered');
  assert.equal(remoteDefaultBranch(runner), 'main');
  assert.equal(runner.asked, 2, 'asked once for the failure and once for the answer');
});
