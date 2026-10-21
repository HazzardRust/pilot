/**
 * `pilot worktrees [prune]` (audit-fixes spec 9, 10; L5, L6, L10). The claims are about
 * which worktrees a prune may take: only merged-clean ones, never the main checkout, a
 * locked, dirty, unmerged or freshly cut one, and nothing at all when the fetch fails.
 * Every case runs in a scratch clone of a bare origin under the system temp directory.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { classify, isRunBranch, main, prune } = await import('../worktrees.mjs');

const PILOT = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const BASE = 'origin/main';

/** A clone of a bare origin; `add(name, { merged, dirty, locked })` cuts and works a worktree. */
function scratch(t) {
  return gitFixture(t, 'worktrees:scratch', buildScratch);
}

function buildScratch(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  const add = (name, { merged = false, dirty = false, locked = false, commit = true, detach = false, branch = name } = {}) => {
    const dir = path.join(root, name);
    if (detach) git(work, 'worktree', 'add', '-q', '--detach', dir, BASE);
    else git(work, 'worktree', 'add', '-q', '-b', branch, dir, BASE);
    if (commit) {
      fs.writeFileSync(path.join(dir, `${name}.txt`), name);
      git(dir, 'add', `${name}.txt`);
      git(dir, 'commit', '-q', '-m', name);
    }
    if (merged) {
      git(work, 'merge', '-q', '--no-ff', '-m', `merge ${name}`, branch);
      git(work, 'push', '-q', 'origin', 'main');
    }
    if (dirty) fs.writeFileSync(path.join(dir, 'stray.txt'), 'untracked');
    if (locked) git(work, 'worktree', 'lock', dir);
    return dir;
  };
  return { root, work, add };
}

/**
 * The prune CLI in process, over an empty process table: the machine's own table may hold a
 * process that cannot be placed, which keeps every tree `live unsure` (landing-keeps-worktrees L3).
 */
function cli(...argv) {
  const [out, err] = [[], []];
  const status = main(argv, { out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) }, read: () => [] });
  return { status, stdout: out.join(''), stderr: err.join('') };
}

const byName = (rows) => Object.fromEntries(rows.map((row) => [path.basename(row.path), row.state]));
const names = (paths) => paths.map((p) => path.basename(p)).sort();
const branches = (work) => git(work, 'branch', '--format=%(refname:short)').split('\n').sort();

test('list names each state', (t) => {
  const { work, add } = scratch(t);
  add('clean', { merged: true });
  add('dirty', { merged: true, dirty: true });
  add('unmerged');
  add('locked', { merged: true, locked: true });
  const rows = classify(work, BASE);
  assert.equal(rows.length, 5);
  assert.deepEqual(byName(rows), {
    work: 'main', clean: 'merged-clean', dirty: 'merged-dirty', unmerged: 'open', locked: 'locked',
  });
  assert.equal(rows.find((row) => path.basename(row.path) === 'clean').branch, 'clean');
});

test('prune removes only the merged-clean worktree and its local branch', (t) => {
  const { work, add } = scratch(t);
  const clean = add('clean', { merged: true });
  add('unmerged');
  const result = prune(work, BASE);
  assert.deepEqual(names(result.removed), ['clean']);
  assert.equal(fs.existsSync(clean), false);
  assert.deepEqual(branches(work), ['main', 'unmerged']);
  assert.deepEqual(result.failed, []);
});

test('keep wins over merged-clean', (t) => {
  const { work, add } = scratch(t);
  const clean = add('clean', { merged: true });
  const result = prune(work, BASE, { keep: ['clean'] });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map(({ path: p, state }) => [path.basename(p), state]), [['work', 'main'], ['clean', 'concluding']]);
  assert.equal(fs.existsSync(clean), true);
  assert.deepEqual(branches(work), ['clean', 'main']);
});

test('prune leaves a dirty merged worktree in place and names it', (t) => {
  const { work, add } = scratch(t);
  const dirty = add('dirty', { merged: true, dirty: true });
  const result = prune(work, BASE);
  assert.deepEqual(result.removed, []);
  assert.ok(fs.existsSync(path.join(dirty, 'stray.txt')));
  assert.equal(byName(result.kept).dirty, 'merged-dirty');
  assert.ok(branches(work).includes('dirty'));
});

test('prune leaves an unmerged worktree in place and names it', (t) => {
  const { work, add } = scratch(t);
  const open = add('unmerged');
  const result = prune(work, BASE);
  assert.deepEqual(result.removed, []);
  assert.ok(fs.existsSync(open));
  assert.equal(byName(result.kept).unmerged, 'open');
});

test('prune never removes the main checkout or a locked worktree', (t) => {
  const { work, add } = scratch(t);
  const locked = add('locked', { merged: true, locked: true });
  const result = prune(work, BASE);
  assert.deepEqual(result.removed, []);
  assert.ok(fs.existsSync(locked));
  assert.ok(fs.existsSync(path.join(work, '.git')));
  assert.deepEqual(byName(result.kept), { work: 'main', locked: 'locked' });
});

test('a failed fetch stops prune before anything is removed', (t) => {
  const { root, work, add } = scratch(t);
  const clean = add('clean', { merged: true });
  git(work, 'remote', 'set-url', 'origin', path.join(root, 'gone.git'));
  assert.throws(() => prune(work, BASE), /fetch/);
  assert.ok(fs.existsSync(clean));
  assert.ok(branches(work).includes('clean'));
});

test('--dry-run removes nothing and names what it would', (t) => {
  const { work, add } = scratch(t);
  const clean = add('clean', { merged: true });
  const result = prune(work, BASE, { dryRun: true });
  assert.deepEqual(names(result.removed), ['clean']);
  assert.ok(fs.existsSync(clean));
  assert.ok(branches(work).includes('clean'));
});

test('a fresh worktree at main\'s tip is listed as open, not removed', (t) => {
  const { work, add } = scratch(t);
  const fresh = add('fresh', { commit: false });
  const detached = add('detached', { commit: false, detach: true });
  const result = prune(work, BASE);
  assert.deepEqual(result.removed, []);
  assert.ok(fs.existsSync(fresh) && fs.existsSync(detached));
  assert.deepEqual(byName(result.kept), { work: 'main', fresh: 'open', detached: 'open' });
});

test('a worktree with no reflog is listed as open', (t) => {
  const { work, add } = scratch(t);
  add('nolog', { merged: true });
  fs.rmSync(path.join(work, '.git', 'logs', 'refs', 'heads', 'nolog'));
  assert.equal(byName(classify(work, BASE)).nolog, 'open');
});

test('pilot worktrees prints one row per worktree, and prune --dry-run names its pick', (t) => {
  const { work, add } = scratch(t);
  const clean = add('clean', { merged: true });
  const run = (...args) => spawnSync(process.execPath, [PILOT, 'worktrees', ...args, '--repo', work], { encoding: 'utf8' });
  const list = run();
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /^merged-clean\s+clean\s+\S/m);
  assert.match(list.stdout, /^main\s+main\s+\S/m);
  const dry = cli('prune', '--dry-run', '--repo', work);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^would remove\s+\S*clean/m);
  assert.ok(fs.existsSync(clean));
  assert.equal(run('prune', '--bogus').status, 2);
});

test('without --base, the base is the default branch origin names, here master', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-wt-master-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'master', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'first');
  git(work, 'push', '-q', 'origin', 'HEAD:master');

  const run = spawnSync(process.execPath, [PILOT, 'worktrees', '--repo', work], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^\S+\s+master\s+\S/m);
});

test('a worktree added on an existing merged branch is open until it moves', (t) => {
  const { root, work, add } = scratch(t);
  const first = add('reused', { merged: true });
  git(work, 'worktree', 'remove', first);
  const again = path.join(root, 'again');
  git(work, 'worktree', 'add', '-q', again, 'reused');
  assert.equal(byName(classify(work, BASE)).again, 'open');
  assert.deepEqual(prune(work, BASE).removed, []);
  assert.ok(fs.existsSync(again));
});

test("prune with run removes that slug's merged-clean worktrees only", (t) => {
  const { work, add } = scratch(t);
  const mine = add('mine', { merged: true, branch: 'slice/run-s1' });
  const feat = add('feat', { merged: true, branch: 'feat/run' });
  const other = add('other', { merged: true, branch: 'slice/other-s1' });
  const plain = add('plain', { merged: true });
  const dry = cli('prune', '--dry-run', '--run', 'run', '--base', BASE, '--repo', work);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(dry.stdout.trim().split('\n').map((line) => path.basename(line.split(/\s+/).pop())).sort(), ['feat', 'mine']);
  const result = prune(work, BASE, { run: 'run' });
  assert.deepEqual(names(result.removed), ['feat', 'mine']);
  assert.deepEqual(result.kept, [], "only the run's worktrees are reported");
  assert.equal(fs.existsSync(mine) || fs.existsSync(feat), false);
  assert.ok(fs.existsSync(other) && fs.existsSync(plain), "another slug's merged-clean worktree is kept");
  assert.deepEqual(branches(work), ['main', 'plain', 'slice/other-s1']);
});

test('a slug that prefixes another does not take its branches', () => {
  for (const branch of ['slice/clean-landing-s1', 'slice/clean-landing-s10', 'slice/clean-landing-s11', 'fix/clean-landing-s4', 'feat/clean-landing', 'design/clean-landing', 'fix/clean-landing', 'qa/clean-landing']) {
    assert.equal(isRunBranch(branch, 'clean-landing'), true, branch);
  }
  assert.equal(isRunBranch('slice/clean-s1', 'clean'), true);
  for (const branch of ['feat/clean-landing-x', 'slice/clean-', 'slice/clean', 'main', 'feature/clean', 'slice/cleaner-s1', 'slice/clean-landing-s1x']) {
    assert.equal(isRunBranch(branch, 'clean-landing') || isRunBranch(branch, 'clean'), false, branch);
  }
  assert.equal(isRunBranch(null, 'clean'), false);
  // Landing clean leaves clean-landing's slices alone.
  for (const branch of ['slice/clean-landing-s1', 'fix/clean-landing-s4']) assert.equal(isRunBranch(branch, 'clean'), false, branch);
});

test('prune --run with no --base reads the run remote\'s pilot, not main', (t) => {
  const { root, work, add } = scratch(t);
  const tree = add('landed', { branch: 'slice/run-s1' });
  // Landed on origin by someone else: the clone's tracking ref is stale until the prune fetches.
  git(path.join(root, 'origin.git'), 'fetch', '-q', work, 'slice/run-s1:refs/heads/pilot');
  const result = cli('prune', '--run', 'run', '--repo', work);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^removed /m);
  assert.equal(fs.existsSync(tree), false, 'a tree merged into pilot but not main is removed');
});
