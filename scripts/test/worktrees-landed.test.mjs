/**
 * A landed run's prune (lander-tail spec 3; L5, A1, A2, A4, A5; ADR 0171). Once `feat/<slug>`,
 * less a tail of run-record-only commits, is in the base, `prune --run <slug>` takes every run
 * worktree, the detached land dir included, unmoved or holding untracked and ignored files, and
 * keeps only a tree with a modified tracked file other than its own run.json. Before landing it
 * prunes exactly as ADR 0081 says. Every case runs in a scratch clone of a bare origin.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { landedRun, main, prune, runWorktrees } = await import('../worktrees.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const BASE = 'origin/main';
const SLUG = 'run';
const RECORD = `docs/design/${SLUG}/run.json`;

const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const commit = (dir, file, text, message = file) => {
  write(dir, file, text);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', message);
};

/**
 * The six trees of a landed run: feat (landed, then a record-only commit, run.json modified in
 * place), qa (unmoved, an untracked file and an ignored `node_modules/`), fix (merged, an untracked
 * file), slice s1 (unmoved), the detached `work-land-run`, and slice s2 (merged, a tracked file
 * modified). Plus another slug's merged tree, which is never this run's.
 *
 * Origin is seeded: main's first commit names `node_modules/` in `.gitignore`, then feat, s2 and fix,
 * each cut from it, merge into main, then the other slug's branch, then feat's record-only tail. A
 * worked tree is cut at main's first commit and moved to its branch's tip, so its reflog says it
 * moved; an unmoved one is cut where the base stood before the other slug merged (`origin/main~1`).
 */
function landedFixture(root) {
  const { origin } = seed(root, [
    { branch: 'main', files: { '.gitignore': 'node_modules/\n' }, message: '.gitignore' },
    { branch: `feat/${SLUG}`, files: { [RECORD]: '{"v":1}' }, message: RECORD },
    { branch: `feat/${SLUG}`, files: { 'feature.txt': 'feature' }, message: 'feature.txt' },
    { branch: `slice/${SLUG}-s2`, from: 'main', files: { 's2.txt': 's2' }, message: 's2.txt' },
    { branch: `fix/${SLUG}`, from: 'main', files: { 'fix.txt': 'fix' }, message: 'fix.txt' },
    ...[`feat/${SLUG}`, `slice/${SLUG}-s2`, `fix/${SLUG}`].map((branch) => ({ branch: 'main', files: {}, message: `merge ${branch}`, merge: [branch] })),
    { branch: 'slice/other-s1', files: { 'other.txt': 'other' }, message: 'other.txt' },
    { branch: 'main', files: {}, message: 'merge slice/other-s1', merge: ['slice/other-s1'] },
    { branch: `feat/${SLUG}`, files: { [RECORD]: '{"v":2}' }, message: 'chore: run record' },
  ]);
  const work = path.join(root, 'work');
  git(root, 'clone', '-q', origin, work);
  const add = (name, branch, from) => {
    const dir = path.join(root, name);
    git(work, 'worktree', 'add', '-q', '-b', branch, dir, from ?? 'origin/main~1');
    if (from) git(dir, 'merge', '-q', '--ff-only', `origin/${branch}`);
    return dir;
  };
  const first = 'origin/main~4';
  const feat = add('feat', `feat/${SLUG}`, first);
  const s2 = add('s2', `slice/${SLUG}-s2`, first);
  const fix = add('fix', `fix/${SLUG}`, first);
  write(feat, RECORD, '{"v":3}');
  write(fix, 'stray.txt', 'untracked');
  write(s2, 's2.txt', 'changed');
  const qa = add('qa', `qa/${SLUG}`);
  write(qa, 'notes.txt', 'untracked');
  write(qa, 'node_modules/x/y.js', 'ignored');
  const s1 = add('s1', `slice/${SLUG}-s1`);
  const land = path.join(root, 'work-land-run');
  git(work, 'worktree', 'add', '-q', '--detach', land, 'origin/main~1');
  const other = add('other', 'slice/other-s1', first);
  return { work, trees: { feat, qa, fix, s1, land, s2 }, other };
}

const fixture = (t) => gitFixture(t, 'worktrees-landed:landed', landedFixture);
const names = (paths) => paths.map((p) => path.basename(p)).sort();
const states = (kept) => Object.fromEntries(kept.map(({ path: p, state }) => [path.basename(p), state]));

function cli(...argv) {
  const [out, err] = [[], []];
  const status = main(argv, { out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) }, read: () => [] });
  return { status, stdout: out.join(''), stderr: err.join('') };
}

test("a landed run's prune removes all but tracked dirt", (t) => {
  const { work, trees, other } = fixture(t);
  const result = prune(work, BASE, { run: SLUG, landed: true });
  assert.deepEqual(result.failed, []);
  assert.deepEqual(names(result.removed), ['feat', 'fix', 'qa', 's1', 'work-land-run']);
  assert.deepEqual(states(result.kept), { s2: 'merged-dirty' });
  for (const name of ['feat', 'fix', 'qa', 's1', 'land']) assert.equal(fs.existsSync(trees[name]), false, name);
  assert.equal(fs.readFileSync(path.join(trees.s2, 's2.txt'), 'utf8'), 'changed', 'the tracked change is untouched');
  assert.ok(fs.existsSync(other), "another slug's tree stays");
  assert.doesNotMatch(git(work, 'worktree', 'list', '--porcelain'), /^prunable/m);
  const left = git(work, 'branch', '--format=%(refname:short)').split('\n').sort();
  assert.deepEqual(left, ['main', 'slice/other-s1', `slice/${SLUG}-s2`]);
});

test('the land dir on a non-run branch keeps that branch', (t) => {
  const { work, trees } = fixture(t);
  git(trees.land, 'checkout', '-q', '--no-track', '-b', 'other', BASE);
  // The main checkout is behind the base, so git's -d refuses a branch the base holds: only -D would take it.
  git(work, 'checkout', '-q', '-b', 'behind', 'HEAD~1');
  prune(work, BASE, { run: SLUG, landed: true });
  assert.equal(fs.existsSync(trees.land), false, 'the land dir goes');
  assert.match(git(work, 'branch', '--format=%(refname:short)'), /^other$/m, "a branch that is not the run's stays");
});

test('the same fixture before landing removes nothing it did not before', (t) => {
  const { work, trees } = fixture(t);
  const result = prune(work, BASE, { run: SLUG });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(states(result.kept), { feat: 'open', qa: 'open', fix: 'merged-dirty', s1: 'open', s2: 'merged-dirty' });
  for (const dir of Object.values(trees)) assert.ok(fs.existsSync(dir), dir);
});

test('a record-only tail is still landed', (t) => {
  const { work, trees } = fixture(t);
  git(work, 'fetch', '-q', 'origin');
  assert.equal(landedRun(work, BASE, SLUG), true, 'one run.json-only commit past the base');
  commit(trees.feat, 'late.txt', 'late', 'a source commit');
  assert.equal(landedRun(work, BASE, SLUG), false, 'one source commit past the base');
  assert.equal(landedRun(work, BASE, 'nobody'), false, 'no feat branch');
  // A feat branch just cut from the base is in it, but nothing has landed: its run's trees are live.
  git(work, 'branch', 'feat/fresh', BASE);
  assert.equal(landedRun(work, BASE, 'fresh'), false, 'a fresh feat branch');
  git(work, 'worktree', 'add', '-q', path.join(path.dirname(work), 'fresh'), 'feat/fresh');
  commit(path.join(path.dirname(work), 'fresh'), `docs/design/fresh/run.json`, '{}', 'chore: run record');
  assert.equal(landedRun(work, BASE, 'fresh'), false, 'a fresh feat branch with only a record commit');
});

test("the land dir is the run's", (t) => {
  const { work } = fixture(t);
  assert.deepEqual(names(runWorktrees(work, SLUG)), ['feat', 'fix', 'qa', 's1', 's2', 'work-land-run']);
  assert.deepEqual(names(runWorktrees(work, 'other')), ['other']);
});

test('the CLI prunes a landed run', (t) => {
  const { work } = fixture(t);
  const result = cli('prune', '--run', SLUG, '--base', BASE, '--repo', work);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.filter((line) => /^removed /.test(line)).length, 5, result.stdout);
  assert.deepEqual(lines.filter((line) => /^kept /.test(line)).map((line) => line.replace(/\s+\S+$/, '')), ['kept merged-dirty']);
  assert.match(result.stdout, /^kept merged-dirty\s+\S*s2$/m);
});
