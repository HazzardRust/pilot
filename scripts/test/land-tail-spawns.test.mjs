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
  // Another session moves design/x after the fetch the landing made: one commit on design/x's tip (seed's main,
  // feat/x's parent), pushed from seed, which x never fetches.
  const moved = git(seed, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'late');
  git(seed, 'push', '-q', 'origin', `${moved}:refs/heads/design/x`);

  assert.throws(
    () => deleteMerged({ git: gitIn(x), host: null, select: (name) => name === 'design/x', into: 'feat/x', fetched: true }),
    /git push origin --delete failed/,
  );
  // Both branches in one `ls-remote` (L5): `<sha>\t<ref>` lines.
  const remote = Object.fromEntries(git(seed, 'ls-remote', 'origin', 'refs/heads/design/x', 'refs/heads/design/other').split('\n')
    .map((line) => line.split('\t').reverse()));
  assert.equal(remote['refs/heads/design/x'], moved, 'origin keeps the moved branch');
  assert.notEqual(remote['refs/heads/design/other'] ?? '', '', 'a branch select does not take stays');
});

/** A clone of a bare origin with a worktree merged into origin/main, then origin made unreachable. */
function unreachable(t) {
  const { seed: work } = repos(t, 'x');
  const dir = path.join(path.dirname(work), 'merged');
  git(work, 'worktree', 'add', '-q', '-b', 'merged', dir, 'HEAD');
  commitFile(dir, 'm.txt', 'm\n', 'merged');
  git(work, 'merge', '-q', '--ff-only', 'merged');
  git(work, 'push', '-q', 'origin', 'main');
  // `git remote set-url origin <gone>`, one git fewer: origin's url line in work's config rewritten.
  const config = path.join(work, '.git', 'config');
  const gone = path.join(path.dirname(work), 'gone.git');
  const text = fs.readFileSync(config, 'utf8');
  const moved = text.replace(/(\[remote "origin"\]\n\turl = ).*\n/, (_, head) => `${head}${gone.replaceAll('\\', '\\\\')}\n`);
  if (moved === text) throw new Error(`unreachable: no origin url in ${config}`);
  fs.writeFileSync(config, moved);
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
