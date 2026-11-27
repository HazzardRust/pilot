/**
 * Which trees are a run's (prune-run-trees S1; spec 1, 2, 3; L1-L3, A1). `runTrees` names a run's
 * slice trees and also its fix-round (`fix/<slug>-<any>`), re-cut (`design/<slug>-recut`) and untagged
 * fund (`<home>-fund-<slug>`) trees, each with how it was reached; a longer known slug keeps its own
 * trees; `prune --run` gives each of them one line on the landed path and the not-landed one.
 * Every case runs in a scratch clone of a bare origin.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { prune, runTrees } = await import('../worktrees.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const BASE = 'origin/main';
const SLUG = 'run';

/**
 * A landed run `run` with one clean tree of each kind, all at the base: the slice `s1`, the fix-round
 * `drift`, the re-cut `recut` and the detached, untagged `work-fund-run`. `feat/run` is merged on
 * origin; the tests pass `landed` themselves, so no local feat ref is made for `landedRun`.
 */
function kindsFixture(root) {
  const { origin } = seed(root, [
    { branch: 'main', files: { 'a.txt': 'a' }, message: 'a.txt' },
    { branch: `feat/${SLUG}`, files: { 'feature.txt': 'feature' }, message: 'feature.txt' },
    { branch: 'main', files: {}, message: `merge feat/${SLUG}`, merge: [`feat/${SLUG}`] },
  ]);
  const work = path.join(root, 'work');
  git(root, 'clone', '-q', origin, work);
  const add = (name, branch) => {
    const dir = path.join(root, name);
    git(work, 'worktree', 'add', '-q', '-b', branch, dir, BASE);
    return dir;
  };
  const trees = {
    s1: add('s1', `slice/${SLUG}-s1`),
    drift: add('drift', `fix/${SLUG}-drift`),
    recut: add('recut', `design/${SLUG}-recut`),
    fund: path.join(root, `work-fund-${SLUG}`),
  };
  git(work, 'worktree', 'add', '-q', '--detach', trees.fund, BASE);
  return { root, work, trees };
}

/**
 * One origin where slugs `x` and `x-y` are each known by a feat branch, and two clones of it: `collision`
 * with one tree on `fix/x-y-drift`, and `recut` with a re-cut tree on `design/x-recut`, whose local ref
 * is a branch like any.
 */
function slugsFixture(root) {
  const { origin } = seed(root, [
    { branch: 'main', files: { 'a.txt': 'a' }, message: 'a.txt' },
    { branch: 'feat/x', files: { 'x.txt': 'x' }, message: 'x.txt' },
    { branch: 'feat/x-y', from: 'main', files: { 'y.txt': 'y' }, message: 'y.txt' },
  ]);
  const clone = (name, branch, tree) => {
    const work = path.join(root, name);
    git(root, 'clone', '-q', origin, work);
    git(work, 'worktree', 'add', '-q', '-b', branch, path.join(root, tree), 'origin/main');
    return work;
  };
  return { collision: clone('work-collision', 'fix/x-y-drift', 'drift'), recut: clone('work-recut', 'design/x-recut', 'recut') };
}

const kinds = (t) => gitFixture(t, 'worktrees-run-trees:kinds', kindsFixture);
const slugs = (t) => gitFixture(t, 'worktrees-run-trees:slugs', slugsFixture);
const base = (p) => path.basename(p);
const sorted = (paths) => paths.map(base).sort();
const lines = ({ removed, kept, failed }) => [...removed, ...kept.map((k) => k.path), ...failed.map((f) => f.path)];
const listed = (work) => git(work, 'worktree', 'list', '--porcelain').split('\n')
  .filter((line) => line.startsWith('worktree ')).map((line) => base(line.slice('worktree '.length)));

test('each kind of run tree is reached', (t) => {
  const { work } = kinds(t);
  const found = Object.fromEntries(runTrees(work, SLUG).map(({ path: p, by }) => [base(p), by]));
  assert.deepEqual(found, { s1: 'branch', drift: 'name', recut: 'name', [`work-fund-${SLUG}`]: 'name' });
});

test('a landed prune removes them all', (t) => {
  const { work, trees } = kinds(t);
  const result = prune(work, BASE, { run: SLUG, landed: true, fetched: true });
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.kept, []);
  assert.deepEqual(sorted(result.removed), sorted(Object.values(trees)));
  const left = listed(work);
  for (const dir of Object.values(trees)) assert.ok(!left.includes(base(dir)), `${dir} is still registered`);
});

test('every run tree gets one line on both paths', (t) => {
  const { root, work } = kinds(t);
  const land = path.join(root, `work-land-${SLUG}`);
  git(work, 'worktree', 'add', '-q', '--detach', land, BASE);
  const before = runTrees(work, SLUG);
  assert.ok(before.some(({ path: p, by }) => base(p) === base(land) && by === 'land'), 'the land dir is a run tree');
  const notLanded = prune(work, BASE, { run: SLUG, dryRun: true, fetched: true });
  assert.deepEqual(sorted(lines(notLanded)), sorted(before.filter(({ by }) => by !== 'land').map(({ path: p }) => p)));
  // A dry run selects and judges as the real one does; the removal itself is the test above's.
  const landed = prune(work, BASE, { run: SLUG, landed: true, dryRun: true, fetched: true });
  assert.deepEqual(sorted(lines(landed)), sorted(before.map(({ path: p }) => p)));
});

test('the longest known slug wins', (t) => {
  const { collision: work } = slugs(t);
  assert.deepEqual(runTrees(work, 'x'), []);
  assert.deepEqual(runTrees(work, 'x-y').map(({ path: p, by }) => [base(p), by]), [['drift', 'name']]);
});

test('a recut ref is not a known run', (t) => {
  const { recut: work } = slugs(t);
  assert.deepEqual(runTrees(work, 'x').map(({ path: p, by }) => [base(p), by]), [['recut', 'name']]);
});
