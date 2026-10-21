/**
 * A prune keeps a worktree a live pilot process holds (landing-keeps-worktrees spec 2; L2, L3).
 * `holderOf` maps `pilotProcesses` rows to a worktree's holder: a pid, `'unsure'` when the row's
 * owner cannot be read, or null when nothing stands there. An orphaned row holds nothing; a
 * row at a path under the worktree holds it; a sibling whose name starts the same does not.
 * The rows are given, never read, so replacing how procs reads the table changes none of this.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const procs = await import('../../deck/procs.mjs');
const { holderFrom, prune } = await import('../worktrees.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const BASE = 'origin/main';

/** A clone of a bare origin and `run`: run `s`'s feature worktree, worked and merged, so merged-clean. */
function scratch(t) {
  return gitFixture(t, 'worktrees-holder:scratch', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(work, 'push', '-q', 'origin', 'main');
    const run = path.join(root, 'run');
    git(work, 'worktree', 'add', '-q', '-b', 'slice/s-s1', run, BASE);
    fs.mkdirSync(path.join(run, 'deck'));
    fs.writeFileSync(path.join(run, 'deck', 'a.txt'), 'a');
    git(run, 'add', 'deck/a.txt');
    git(run, 'commit', '-q', '-m', 'a');
    git(work, 'merge', '-q', '--no-ff', '-m', 'merge', 'slice/s-s1');
    git(work, 'push', '-q', 'origin', 'main');
    return { root, work, run };
  });
}

const row = (fields) => ({ pid: 77, kind: 'daemon', owner: 4242, orphan: null, worktree: null, ...fields });
const keptOf = (result) => result.kept.filter(({ state }) => state !== 'main').map(({ path: p, state }) => [path.basename(p), state]);

test('a live leash keeps its worktree', (t) => {
  const { work, run } = scratch(t);
  const result = prune(work, BASE, { run: 's', holder: (dir) => (path.basename(dir) === 'run' ? 4242 : null) });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(keptOf(result), [['run', 'live 4242']]);
  assert.equal(fs.existsSync(run), true);
});

test('an orphaned leash lets it go', (t) => {
  const { work, run } = scratch(t);
  const holder = procs.holderOf([row({ worktree: run, orphan: 'leash 4242 gone' })]);
  assert.equal(holder(run), null);
  const result = prune(work, BASE, { run: 's', holder });
  assert.deepEqual(result.removed.map((p) => path.basename(p)), ['run']);
  assert.equal(fs.existsSync(run), false);
});

test('an unsure daemon keeps it', (t) => {
  const { work, run } = scratch(t);
  const holder = procs.holderOf([row({ worktree: run, orphan: null, owner: null })]);
  assert.equal(holder(run), 'unsure');
  assert.equal(holderFrom(() => { throw new Error('no table'); })(run), 'unsure', 'a table that cannot be read holds every tree');
  const result = prune(work, BASE, { run: 's', holder });
  assert.deepEqual(keptOf(result), [['run', 'live unsure']]);
  assert.equal(fs.existsSync(run), true);
});

test('a path under the worktree counts, a sibling does not', (t) => {
  const { root, run } = scratch(t);
  const sibling = `${run}-land-x`;
  fs.mkdirSync(sibling, { recursive: true });
  t.after(() => fs.rmSync(sibling, { recursive: true, force: true }));
  // The process table writes Windows paths with backslashes, and any case.
  const under = process.platform === 'win32' ? path.join(run, 'deck').toUpperCase().replaceAll('/', '\\') : path.join(run, 'deck');
  assert.equal(procs.holderOf([row({ pid: 9, worktree: under })])(run), 9);
  assert.equal(procs.holderOf([row({ pid: 9, worktree: sibling })])(run), null);
  assert.equal(procs.holderOf([row({ pid: 9, worktree: root })])(run), null, 'a parent of the worktree is not in it');
});

test('a wait reported orphan still holds its tree, since the sweep spares every wait', () => {
  const holder = procs.holderOf([row({ kind: 'wait', owner: null, worktree: '/w/tree', orphan: 'no claude ancestor' })]);
  assert.equal(holder('/w/tree'), 'unsure');
  assert.equal(procs.holderOf([row({ kind: 'daemon', owner: null, worktree: '/w/tree', orphan: 'leash 1 gone' })])('/w/tree'), null, 'an orphaned daemon still holds nothing');
});

test('a leashless daemon in a tree holds it by pid', (t) => {
  const { work, run } = scratch(t);
  // The daemon's parent (ppid 99999) is not in the table and no deck pid is known: it still holds its tree.
  const table = [{ pid: 5150, ppid: 99999, name: 'node', command: `node ${path.join(run, 'deck', 'daemon.mjs')}` }];
  const holder = holderFrom(() => table);
  assert.equal(holder(run), 5150);
  const result = prune(work, BASE, { run: 's', holder });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(keptOf(result), [['run', 'live 5150']]);
  assert.equal(fs.existsSync(run), true);
});

test('a row with a relative worktree makes every directory unsure', () => {
  assert.equal(procs.holderOf([row({ worktree: '.' })])(path.resolve('/anywhere')), 'unsure');
});
