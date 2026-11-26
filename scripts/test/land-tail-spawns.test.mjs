/**
 * The landing's tail on the landing's own fetch and worktree list (land-batching S5, A3): it deletes the
 * same branches and removes the same worktrees as on the base, and a prune told the base is fetched
 * fetches nothing. The expected lines were recorded on the base (S2's tip) before any product change.
 */

import { git, commitFile, repos, passing, fakeGh, land } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { prune } = await import('../worktrees.mjs');
const { deleteMerged } = await import('../branches.mjs');

/** Paths as `git worktree list` writes them, which is how the landing names them. */
const listed = (repo) => git(repo, 'worktree', 'list', '--porcelain').split('\n')
  .filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));

test('the tail deletes and removes what it did before', (t) => {
  const { gitIn, x } = repos(t, 'x');
  const root = path.dirname(x);
  // A merged design/x on origin, and a slice worktree merged into the feature: design/x at the feature's tip
  // before the merge (its first parent), pushed with the slice and the feature in one push.
  const slice = path.join(root, 'x-s1');
  git(x, 'worktree', 'add', '-q', '-b', 'slice/x-s1', slice, 'HEAD');
  commitFile(slice, 's1.txt', 's1\n', 'slice s1');
  git(x, 'merge', '-q', '--no-ff', '-m', 'feat(x): S1', 'slice/x-s1');
  git(x, 'push', '-q', 'origin', 'HEAD^1:refs/heads/design/x', 'slice/x-s1', 'feat/x');
  const as = Object.fromEntries(listed(x).map((p) => [path.basename(p), p]));

  const value = land({ cwd: x, git: gitIn(x), host: fakeGh().host, test: passing });

  assert.deepEqual(value.deleted, ['design/x', 'slice/x-s1']);
  assert.deepEqual(value.kept, []);
  assert.equal(value.deleteFailed, undefined);
  assert.deepEqual(value.cleared, [`removed ${as['x-s1']}`]);
  assert.equal(fs.existsSync(slice), false);
  assert.equal(git(x, 'ls-remote', '--heads', 'origin', 'design/x', 'slice/x-s1'), '', 'both are gone from origin');
});

test('a branch moved since the landing fetched is refused by the lease, not deleted', (t) => {
  const { seed, gitIn, x } = repos(t, 'x');
  // One commit behind feat/x, so merged into it; at its tip it would be kept as nothing landed.
  git(x, 'push', '-q', 'origin', 'HEAD~1:refs/heads/design/x', 'HEAD~1:refs/heads/design/other');
  git(x, 'fetch', '-q', '--prune', 'origin');
  // Another session moves design/x after the fetch the landing made.
  git(seed, 'fetch', '-q', 'origin');
  git(seed, 'checkout', '-q', '-b', 'design/x', 'origin/design/x');
  commitFile(seed, 'late.txt', 'late\n', 'late');
  git(seed, 'push', '-q', 'origin', 'design/x');
  const moved = git(seed, 'rev-parse', 'HEAD');

  assert.throws(
    () => deleteMerged({ git: gitIn(x), host: null, select: (name) => name === 'design/x', into: 'feat/x', fetched: true }),
    /git push origin --delete failed/,
  );
  assert.equal(git(seed, 'ls-remote', 'origin', 'refs/heads/design/x').split('\t')[0], moved, 'origin keeps the moved branch');
  assert.notEqual(git(seed, 'ls-remote', 'origin', 'refs/heads/design/other'), '', 'a branch select does not take stays');
});

/** A clone of a bare origin with a worktree merged into origin/main, then origin made unreachable. */
function unreachable(t) {
  const { seed: work } = repos(t, 'x');
  const dir = path.join(path.dirname(work), 'merged');
  git(work, 'worktree', 'add', '-q', '-b', 'merged', dir, 'HEAD');
  commitFile(dir, 'm.txt', 'm\n', 'merged');
  git(work, 'merge', '-q', '--ff-only', 'merged');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'remote', 'set-url', 'origin', path.join(path.dirname(work), 'gone.git'));
  return { work, dir };
}

test('the tail fetches nothing', (t) => {
  const { work, dir } = unreachable(t);
  // Without `fetched` the fetch runs, as `pilot worktrees prune` alone does, and fails on the gone origin.
  assert.throws(() => prune(work, 'origin/main'), /git fetch origin failed/);
  assert.ok(fs.existsSync(dir));
  // Told the base is fetched, no fetch runs, so the gone origin is never reached.
  const result = prune(work, 'origin/main', { fetched: true });
  assert.deepEqual(result.removed.map((p) => path.basename(p)), ['merged']);
  assert.deepEqual(result.failed, []);
});
