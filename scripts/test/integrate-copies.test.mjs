/**
 * A feature branch that carries pilot's commits as copies (cherry-picked or replayed,
 * so patch-equal but not the same commits) is what makes taking the base conflict
 * (design-docs-only spec 3; L3, L7). `pilotLineage` answers whether the branch has
 * pilot's tip and how many of its commits are copies, and integrate's base failure line
 * names that count. Every case runs on a scratch bare "origin" and a clone of it; nothing
 * here reaches a real remote, and no `gh` is called.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');
const { pilotLineage } = await import('../pilot-branch.mjs');
const UP = 'refs/remotes/origin/pilot';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * origin has `main` (base, shared.txt) and, unless `pilot: false`, `pilot` two commits
 * ahead of it: p1 (p1.txt) and p2 (p2.txt and a change to shared.txt). The clone `work`
 * sits on main with origin/pilot fetched; the copies are made from `pilot`'s commits.
 */
function repos(t, { pilot = true } = {}) {
  return gitFixture(t, `integrate-copies:repos:${pilot}`, (dir) => buildRepos(dir, pilot));
}

/**
 * Each shape of `feat/x` a test checks out, seeded with the history and kept in `work` unreferenced (its branch gone
 * from origin and the clone): the copies are new commits with pilot's patches, as `cherry-pick -x` made them.
 */
const P1 = { 'p1.txt': 'p1\n' };
const P2 = { 'p2.txt': 'p2\n', 'shared.txt': 'pilot\n' };
const X = { files: { 'x.txt': 'x\n' }, message: 'x' };
const SHAPES = [
  { branch: 'x/tip', from: 'pilot', ...X },
  { branch: 'x/copy', from: 'main', files: P1, message: 'p1 (copy)' },
  { branch: 'x/copy', ...X },
  { branch: 'x/merged', from: 'main', files: P1, message: 'p1 (copy)' },
  { branch: 'x/merged', files: {}, merge: ['pilot'], message: 'merge pilot' },
  { branch: 'x/merged-on', from: 'x/merged', ...X },
  { branch: 'x/conflict-copies', from: 'main', files: P1, message: 'p1 (copy)' },
  { branch: 'x/conflict-copies', files: P2, message: 'p2 (copy)' },
  { branch: 'x/conflict-copies', files: { 'shared.txt': 'feature\n' }, message: 'x: shared' },
  { branch: 'x/conflict-clean', from: 'main', files: { 'shared.txt': 'feature\n' }, message: 'x: shared' },
];

function buildRepos(dir, pilot) {
  const work = path.join(dir, 'work');
  const { origin, sha } = seed(dir, [
    { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'base' },
    ...(pilot ? [{ branch: 'pilot', files: P1, message: 'p1' }, { branch: 'pilot', files: P2, message: 'p2' }, ...SHAPES] : []),
  ]);
  git(dir, 'clone', '-q', origin, work);
  if (!pilot) return { origin, work };
  const shapes = [...new Set(SHAPES.map((commit) => commit.branch))];
  git(origin, 'branch', '-q', '-D', ...shapes);
  git(work, 'branch', '-q', '-D', '-r', ...shapes.map((shape) => `origin/${shape}`));
  // The clone holds a local pilot too, as the build that committed it there did.
  git(work, 'branch', '-q', '--no-track', 'pilot', 'origin/pilot');
  return { origin, work, shape: Object.fromEntries(shapes.map((shape) => [shape.slice(2), sha[shape]])) };
}

/** `feat/x` checked out at `sha`, one of the seeded shapes. */
const featAt = (work, sha) => git(work, 'checkout', '-q', '-b', 'feat/x', sha);

test('a branch cut from pilot\'s tip has no copies', (t) => {
  const { work, shape } = repos(t);
  featAt(work, shape.tip);
  assert.deepEqual(pilotLineage(work, 'feat/x'), { upstream: UP, tip: true, copies: 0 });
});

test('a branch with one pilot commit cherry-picked onto an older base', (t) => {
  const { work, shape } = repos(t);
  featAt(work, shape.copy);
  assert.deepEqual(pilotLineage(work, 'feat/x'), { upstream: UP, tip: false, copies: 1 });
});

test('a branch that merged pilot after a replay still counts its copies', (t) => {
  const { work, shape } = repos(t);
  featAt(work, shape.merged);
  const lineage = pilotLineage(work, 'feat/x');
  assert.equal(lineage.tip, true);
  assert.equal(lineage.copies, 1);
});

test('a branch that commits on after merging pilot still counts its copies', (t) => {
  const { work, shape } = repos(t);
  featAt(work, shape['merged-on']);
  assert.deepEqual(pilotLineage(work, 'feat/x'), { upstream: UP, tip: true, copies: 1 });
});

test('a repository with no origin/pilot', (t) => {
  const { work } = repos(t, { pilot: false });
  assert.deepEqual(pilotLineage(work, 'main'), { upstream: UP });
});

test('a ref that does not resolve throws', (t) => {
  const { work } = repos(t);
  assert.throws(() => pilotLineage(work, 'no-such-branch'));
  assert.throws(() => pilotLineage(work, '--output=x'));
});

/** feat/x pushed to origin, with a commit of its own to shared.txt that pilot's p2 conflicts with. */
function conflicting(work, tip) {
  featAt(work, tip);
  git(work, 'push', '-q', 'origin', 'feat/x');
  return tip;
}

const run = (work) => integrate(undefined, { cwd: work, test: 'exit 0', install: () => {} });

test('a base conflict on a branch carrying copies names the count', (t) => {
  const { origin, work, shape } = repos(t);
  // p1 and p2 are copied cleanly; feat/x's own change to shared.txt is what conflicts.
  const tip = conflicting(work, shape['conflict-copies']);
  const result = run(work);
  assert.equal(result.ok, false);
  assert.match(result.line, /^base NOT taken: taking base pilot stopped \(.+\); not pushed; 2 of feat\/x's commits are copies of pilot's$/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), tip);
  assert.equal(git(work, 'rev-parse', 'HEAD'), tip);
});

test('a base conflict on a clean branch names no count', (t) => {
  const { origin, work, shape } = repos(t);
  const tip = conflicting(work, shape['conflict-clean']);
  const result = run(work);
  assert.equal(result.ok, false);
  assert.match(result.line, /^base NOT taken: taking base pilot stopped \(.+\); not pushed$/);
  assert.doesNotMatch(result.line, /copies of pilot's/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), tip);
});
