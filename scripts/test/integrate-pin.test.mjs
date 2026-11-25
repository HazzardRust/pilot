/**
 * The integrate pin (land-batching spec 3, 4; S3): what one `pilot integrate <slice>` prints on a
 * seeded repository, with every SHA as `<sha>`, and the merge it leaves on the feature branch,
 * recorded on the base before any product change; then its git count against the base's. Nothing
 * here reaches a real remote.
 */

import { git, commitFile, repos, passing, fakeGh } from './lib/land-repos.mjs';
import { countGit } from './lib/count-git.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { integrate, trial } = await import('../integrate.mjs');

const normal = (text) => text.replace(/\b[0-9a-f]{7,40}\b/g, '<sha>');

/** The seeded repos with `slice/x-s1` pushed off `feat/x` and `feat/x` checked out again. */
function seeded(t) {
  const { origin, x } = repos(t, 'x');
  git(x, 'checkout', '-q', '-b', 'slice/x-s1');
  commitFile(x, 's1.txt', 's1\n', 'slice s1');
  git(x, 'push', '-q', 'origin', 'slice/x-s1');
  git(x, 'checkout', '-q', 'feat/x');
  git(x, 'branch', '-q', '-D', 'slice/x-s1');
  return { origin, x, before: git(x, 'rev-parse', 'HEAD'), slice: git(x, 'rev-parse', 'origin/slice/x-s1') };
}

const options = (x) => ({ cwd: x, test: passing, install: () => {}, host: fakeGh().host, trailers: ['Reviewed-by: pilot:typescript-reviewer: approve'] });

test('integrate prints what it printed on the base and leaves the same merge on the feature', (t) => {
  const { origin, x, before, slice } = seeded(t);

  const result = integrate('slice/x-s1', options(x));

  assert.equal(result.ok, true);
  assert.equal(normal(result.line), 'integrated slice/x-s1 at <sha> (base pilot@<sha>): 3 pass, 0 fail; pushed; deleted slice/x-s1');
  assert.equal(git(origin, 'log', '-1', '--format=%B', 'feat/x'), 'Merge slice/x-s1\n\nReviewed-by: pilot:typescript-reviewer: approve');
  assert.equal(git(origin, 'log', '-1', '--format=%P', 'feat/x'), `${before} ${slice}`);
});

// 24 measured on the base 493bd48 for this integration (land-batching S3); after the view, 20; still 20 with
// rev-list, diff and log as reads (S8), since this integration asks each of them once; 18, 75% of 24, once the
// current branch is one argv and the deletion tail reads origin from integrate's own fetch (S9).
const BASE_GIT = 24;
const BAR_GIT = 18;

// The lines the base printed on a detached HEAD (S9): `-q` answers it with no error text of its own.
test('integrate and its trial on a detached HEAD refuse as on the base', (t) => {
  const { origin, x } = seeded(t);
  const tip = git(origin, 'rev-parse', 'feat/x');
  git(x, 'checkout', '-q', '--detach');

  assert.equal(integrate('slice/x-s1', options(x)).line, 'NOT integrated slice/x-s1: fatal: ref HEAD is not a symbolic ref; nothing merged or pushed');
  assert.equal(integrate(undefined, options(x)).line, 'base NOT taken: fatal: ref HEAD is not a symbolic ref; nothing merged or pushed');
  assert.equal(trial({ cwd: x }).line, 'trial NOT run: fatal: ref HEAD is not a symbolic ref');
  assert.equal(git(origin, 'rev-parse', 'feat/x'), tip);
});

test('one integrate spawns at most 18 git, 24 on the base', (t) => {
  const { x } = seeded(t);
  const { value, git: spawned } = countGit(() => integrate('slice/x-s1', options(x)));
  assert.equal(value.ok, true);
  assert.ok(spawned <= BAR_GIT, `one integrate spawned ${spawned} git, over ${BAR_GIT} (${BASE_GIT} on the base)`);
});
