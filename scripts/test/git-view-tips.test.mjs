/**
 * `tipOf` and `holdsIn` (land-batching L4): every tip in an epoch from one `for-each-ref` snapshot,
 * HEAD from one `rev-parse`, an ancestry check asked once; a write through the view refreshes both.
 * Real git on a scratch repository.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { countGit } from './lib/count-git.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { gitView, holdsIn, tipOf } from '../git-view.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * A clone of a seeded bare origin with `pilot` at one commit and `feat/x` (and main, checked out) one commit
 * past it; `pilot` and `feature` are their SHAs as seeded.
 */
const clone = (t) =>
  gitFixture(t, 'git-view-tips:clone', (dir) => {
    const { origin, sha } = seed(dir, [
      { branch: 'pilot', files: {}, message: 'one' },
      { branch: 'feat/x', from: 'pilot', files: {}, message: 'two' },
    ], { main: 'feat/x' });
    const work = path.join(dir, 'work');
    run(dir, 'clone', '-q', origin, work);
    return { work, pilot: sha.pilot, feature: sha['feat/x'] };
  });

test('every tip in an epoch costs one spawn', (t) => {
  const { work, pilot, feature } = clone(t);

  const { value, git: spawned } = countGit(() => {
    const git = gitView(work);
    return [tipOf(git, 'refs/remotes/origin/pilot'), tipOf(git, 'refs/remotes/origin/feat/x'), tipOf(git, 'refs/remotes/origin/feat/none')];
  });

  assert.deepEqual(value, [pilot, feature, null]);
  assert.notEqual(pilot, feature);
  assert.equal(spawned, 1);
});

test('a write refreshes the snapshot', (t) => {
  const { work } = clone(t);
  const git = gitView(work);
  const before = tipOf(git, 'refs/heads/main');
  const head = tipOf(git, 'HEAD');

  git(['commit', '-q', '--allow-empty', '-m', 'three']);

  const after = run(work, 'rev-parse', 'HEAD');
  assert.notEqual(after, before);
  assert.equal(head, before);
  assert.equal(tipOf(git, 'refs/heads/main'), after);
  assert.equal(tipOf(git, 'HEAD'), after);
});

test('an ancestry check is asked once', (t) => {
  const { work, pilot, feature } = clone(t);
  const ancestor = ['merge-base', '--is-ancestor', pilot, feature];
  const not = ['merge-base', '--is-ancestor', feature, pilot];

  const { value, git: spawned } = countGit(() => {
    const git = gitView(work);
    return [holdsIn(git, ancestor), holdsIn(git, ancestor), holdsIn(git, not), holdsIn(git, not)];
  });

  assert.deepEqual(value, [true, true, false, false]);
  assert.equal(spawned, 2, 'one spawn per distinct check, a false one remembered too');
});

test('a remembered false and a remembered null are asked again after a write', (t) => {
  const { work, feature } = clone(t);
  const git = gitView(work);
  const ancestor = ['merge-base', '--is-ancestor', feature, 'refs/heads/later'];
  assert.equal(tipOf(git, 'refs/heads/later'), null);
  assert.equal(holdsIn(git, ancestor), false);

  git(['branch', 'later', feature]);

  assert.equal(tipOf(git, 'refs/heads/later'), feature);
  assert.equal(holdsIn(git, ancestor), true);
});

test('a short or non-branch ref name is refused', (t) => {
  const git = gitView(clone(t).work);
  assert.throws(() => tipOf(git, 'pilot'), /full branch ref/);
  assert.throws(() => tipOf(git, 'refs/tags/v1'), /full branch ref/);
});
