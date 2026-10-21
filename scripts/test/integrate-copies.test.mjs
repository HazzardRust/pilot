/**
 * A feature branch that carries pilot's commits as copies (cherry-picked or replayed,
 * so patch-equal but not the same commits) is what makes taking the base conflict
 * (design-docs-only spec 3; L3, L7). `pilotLineage` answers whether the branch has
 * pilot's tip and how many of its commits are copies, and integrate's base failure line
 * names that count. Every case runs on a scratch bare "origin" and a clone of it; nothing
 * here reaches a real remote, and no `gh` is called.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');
const { pilotLineage } = await import('../pilot-branch.mjs');
const UP = 'refs/remotes/origin/pilot';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function commitFile(work, file, text, message) {
  fs.writeFileSync(path.join(work, file), text);
  git(work, 'add', file);
  git(work, 'commit', '-q', '-m', message);
}

/**
 * origin has `main` (base, shared.txt) and, unless `pilot: false`, `pilot` two commits
 * ahead of it: p1 (p1.txt) and p2 (p2.txt and a change to shared.txt). The clone `work`
 * sits on main with origin/pilot fetched; the copies are made from `pilot`'s commits.
 */
function repos(t, { pilot = true } = {}) {
  return gitFixture(t, `integrate-copies:repos:${pilot}`, (dir) => buildRepos(dir, pilot));
}

function buildRepos(dir, pilot) {
  const origin = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  commitFile(work, 'shared.txt', 'one\n', 'base');
  git(work, 'push', '-q', 'origin', 'main');
  const pilotCommits = [];
  if (pilot) {
    git(work, 'checkout', '-q', '-b', 'pilot');
    commitFile(work, 'p1.txt', 'p1\n', 'p1');
    pilotCommits.push(git(work, 'rev-parse', 'HEAD'));
    fs.writeFileSync(path.join(work, 'p2.txt'), 'p2\n');
    commitFile(work, 'shared.txt', 'pilot\n', 'p2');
    pilotCommits.push(git(work, 'rev-parse', 'HEAD'));
    git(work, 'push', '-q', 'origin', 'pilot');
    git(work, 'checkout', '-q', 'main');
  }
  git(work, 'fetch', '-q', 'origin');
  return { origin, work, pilotCommits };
}

/** `feat/x` from `from`, with `picks` cherry-picked onto it (`-x`, so a new commit with the same patch even onto pilot's own parent). */
function featFrom(work, from, picks = []) {
  git(work, 'checkout', '-q', '-b', 'feat/x', from);
  for (const sha of picks) git(work, 'cherry-pick', '-x', sha);
}

test('a branch cut from pilot\'s tip has no copies', (t) => {
  const { work } = repos(t);
  featFrom(work, 'origin/pilot');
  commitFile(work, 'x.txt', 'x\n', 'x');
  assert.deepEqual(pilotLineage(work, 'feat/x'), { upstream: UP, tip: true, copies: 0 });
});

test('a branch with one pilot commit cherry-picked onto an older base', (t) => {
  const { work, pilotCommits } = repos(t);
  featFrom(work, 'main', [pilotCommits[0]]);
  commitFile(work, 'x.txt', 'x\n', 'x');
  assert.deepEqual(pilotLineage(work, 'feat/x'), { upstream: UP, tip: false, copies: 1 });
});

test('a branch that merged pilot after a replay still counts its copies', (t) => {
  const { work, pilotCommits } = repos(t);
  featFrom(work, 'main', [pilotCommits[0]]);
  git(work, 'merge', '-q', '--no-ff', '-m', 'merge pilot', 'origin/pilot');
  const lineage = pilotLineage(work, 'feat/x');
  assert.equal(lineage.tip, true);
  assert.equal(lineage.copies, 1);
});

test('a branch that commits on after merging pilot still counts its copies', (t) => {
  const { work, pilotCommits } = repos(t);
  featFrom(work, 'main', [pilotCommits[0]]);
  git(work, 'merge', '-q', '--no-ff', '-m', 'merge pilot', 'origin/pilot');
  commitFile(work, 'x.txt', 'x\n', 'x');
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
function conflicting(work, picks) {
  featFrom(work, 'main', picks);
  commitFile(work, 'shared.txt', 'feature\n', 'x: shared');
  git(work, 'push', '-q', 'origin', 'feat/x');
  return git(work, 'rev-parse', 'HEAD');
}

const run = (work) => integrate(undefined, { cwd: work, test: 'exit 0', findPr: () => null, install: () => {} });

test('a base conflict on a branch carrying copies names the count', (t) => {
  const { origin, work, pilotCommits } = repos(t);
  // p1 and p2 are copied cleanly; feat/x's own change to shared.txt is what conflicts.
  const tip = conflicting(work, pilotCommits);
  const result = run(work);
  assert.equal(result.ok, false);
  assert.match(result.line, /^base NOT taken: taking base pilot stopped \(.+\); not pushed; 2 of feat\/x's commits are copies of pilot's$/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), tip);
  assert.equal(git(work, 'rev-parse', 'HEAD'), tip);
});

test('a base conflict on a clean branch names no count', (t) => {
  const { origin, work } = repos(t);
  const tip = conflicting(work, []);
  const result = run(work);
  assert.equal(result.ok, false);
  assert.match(result.line, /^base NOT taken: taking base pilot stopped \(.+\); not pushed$/);
  assert.doesNotMatch(result.line, /copies of pilot's/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), tip);
});
