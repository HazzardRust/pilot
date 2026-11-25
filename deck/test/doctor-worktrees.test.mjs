/**
 * The `worktrees` row (prune-worktrees S7, spec 6; A5): the census of a seeded repository's trees, read by real
 * git, with the volume (`statfs`), the clock (`now`) and the build-output walk (`sizeOf`) injected. Every tree is
 * made in the fixture's temp dir; nothing reads a real checkout or the real volume's figures.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { worktreesRow } from '../doctor.mjs';
import { leashedGit } from '../slug-clash.mjs';
import { main as worktrees } from '../../scripts/worktrees.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
const DAY = 24 * 60 * 60 * 1000;
const GiB = 1024 ** 3;

/**
 * `r`, the main checkout, with `pilot` (origin's, as last fetched) at its first commit, and beside it: `r-a` on a
 * branch one commit past `pilot`, `r-b` on a branch at `pilot`, `r-d` detached and untagged, `r-t` detached and
 * tagged by `pilot worktrees add --run`, `r-x` a dir git does not list, and `other`, a dir of no `r-` name.
 */
function seed(root) {
  const repo = path.join(root, 'r');
  run(root, 'init', '-q', '-b', 'main', repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  run(repo, 'add', 'a.txt');
  run(repo, 'commit', '-q', '-m', 'a');
  run(repo, 'update-ref', 'refs/remotes/origin/pilot', 'HEAD');
  run(repo, 'worktree', 'add', '-q', '-b', 'a', path.join(root, 'r-a'));
  fs.writeFileSync(path.join(root, 'r-a', 'b.txt'), 'b\n');
  run(path.join(root, 'r-a'), 'add', 'b.txt');
  run(path.join(root, 'r-a'), 'commit', '-q', '-m', 'b');
  run(repo, 'worktree', 'add', '-q', '-b', 'b', path.join(root, 'r-b'));
  run(repo, 'worktree', 'add', '-q', '--detach', path.join(root, 'r-d'));
  const said = [];
  const tagged = worktrees(['add', '--repo', repo, '--run', 'x', '--detach', path.join(root, 'r-t'), 'HEAD'], {
    out: { write: () => {} },
    err: { write: (s) => said.push(s) },
    read: () => [],
  });
  assert.equal(tagged, 0, said.join(''));
  fs.mkdirSync(path.join(root, 'r-x'));
  fs.mkdirSync(path.join(root, 'other'));
  return { root, repo };
}

const fixture = (t) => gitFixture(t, 'doctor-worktrees:seed', seed);

/** A volume of `total` bytes with `free` of them available. */
const volume = (free, total) => () => ({ bsize: 4096, blocks: total / 4096, bavail: free / 4096, bfree: free / 4096 });

/** The row over the seeded repo, `days` ahead of now, on a half-free 100 GiB volume, every walk 1 GiB and done. */
function census(repo, overrides = {}, days = 0) {
  return worktreesRow({
    repo,
    git: leashedGit(repo),
    statfs: volume(50 * GiB, 100 * GiB),
    now: () => Date.now() + days * DAY,
    sizeOf: () => ({ bytes: GiB, partial: false }),
    budgetMs: 10_000,
    ...overrides,
  });
}

test('stale trees are counted: one tree 15 days past its last commit and not in pilot', (t) => {
  const { repo } = fixture(t);
  const walked = [];
  const row = census(repo, { sizeOf: (dir) => (walked.push(path.basename(dir)), { bytes: GiB, partial: false }) }, 15);
  assert.equal(row.name, 'worktrees');
  assert.match(row.detail, /^4 trees, 1 stale \(>14 d, not in pilot\), /, row.detail);
  assert.deepEqual(walked, ['r-a'], 'only the stale tree is walked');
  assert.match(row.detail, /stale build output 1\.0 GB$/, row.detail);
  assert.equal(row.verdict, 'pass', 'a stale tree alone never fails the row');
});

test('a tree 13 days past its last commit is not stale, and nothing is walked', (t) => {
  const { repo } = fixture(t);
  const row = census(repo, { sizeOf: () => assert.fail('no tree is stale, so none is walked') }, 13);
  assert.match(row.detail, /^4 trees, 0 stale /, row.detail);
  assert.match(row.detail, /stale build output 0\.0 GB$/, row.detail);
});

test('untagged detached trees and orphan dirs are counted', (t) => {
  const { repo } = fixture(t);
  const row = census(repo);
  assert.match(row.detail, /, 1 untagged detached, 1 orphan dirs; /, row.detail);
});

test('low disk fails under 10% free and passes at 30%', (t) => {
  const { repo } = fixture(t);
  const low = census(repo, { statfs: volume(9 * GiB, 100 * GiB) });
  assert.equal(low.verdict, 'fail', low.detail);
  assert.match(low.detail, /; 9\.0 GB free of 100\.0 GB; /, low.detail);
  assert.ok(low.steps?.length, 'a failing row says what to do');
  const roomy = census(repo, { statfs: volume(30 * GiB, 100 * GiB) });
  assert.equal(roomy.verdict, 'pass', roomy.detail);
});

test('an unreadable volume is cannot tell, never a pass', (t) => {
  const { repo } = fixture(t);
  const row = census(repo, { statfs: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); } });
  assert.equal(row.verdict, 'cannot tell', row.detail);
});

test('the size walk stops at its budget and says so with ≥', (t) => {
  const { repo } = fixture(t);
  let clock = Date.now() + 15 * DAY;
  const slow = () => {
    clock += 10_001;
    return { bytes: 2 * GiB, partial: true };
  };
  const row = census(repo, { now: () => clock, sizeOf: slow });
  assert.match(row.detail, /stale build output ≥2\.0 GB$/, row.detail);
});

test('a repository git cannot list is cannot tell', () => {
  const row = worktreesRow({
    repo: '/nowhere',
    git: () => { throw Object.assign(new Error('not a git repository'), { status: 128 }); },
    statfs: volume(50 * GiB, 100 * GiB),
    now: () => Date.now(),
    sizeOf: () => assert.fail('nothing is walked'),
    budgetMs: 10_000,
  });
  assert.equal(row.verdict, 'cannot tell');
  assert.match(row.detail, /not a git repository/);
});
