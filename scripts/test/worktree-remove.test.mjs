/**
 * `removeTree` (prune-worktrees S1; L2-L6): the one guarded removal keeps every tree whose loss
 * would lose a tracked, untracked or unpushed change, unlinks links before git removes the tree,
 * and never deletes through one. Every case runs in a scratch clone of a bare origin under the
 * system temp directory; nothing here touches a real checkout.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { removeTree, keptLine } = await import('../worktree-remove.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

/** A clone `work` of a bare origin whose main ignores node_modules; `add` cuts a tree with one commit, pushed unless told. */
function scratch(t) {
  return gitFixture(t, 'worktree-remove:scratch', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    fs.writeFileSync(path.join(work, '.gitignore'), 'node_modules\n');
    git(work, 'add', '.gitignore');
    git(work, 'commit', '-q', '-m', 'main');
    git(work, 'push', '-q', 'origin', 'main');
    const add = (name, { push = true, files = { [`${name}.txt`]: name } } = {}) => {
      const dir = path.join(root, name);
      git(work, 'worktree', 'add', '-q', '-b', name, dir, 'origin/main');
      for (const [file, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), body);
      }
      git(dir, 'add', '.');
      git(dir, 'commit', '-q', '-m', name);
      if (push) git(dir, 'push', '-q', 'origin', name);
      return dir;
    };
    return { root, work, add };
  });
}

const listed = (work, dir) => git(work, 'worktree', 'list', '--porcelain').includes(dir.replaceAll('\\', '/'));
const hasBranch = (work, name) => {
  try { git(work, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`); return true; } catch { return false; }
};

test('a junction is unlinked, never followed', (t) => {
  const { work, add } = scratch(t);
  const sibling = add('sib');
  const tree = add('a');
  fs.mkdirSync(path.join(sibling, 'node_modules', 'pkg'), { recursive: true });
  const target = path.join(sibling, 'node_modules', 'pkg', 'index.js');
  fs.writeFileSync(target, 'module.exports = 42;\n');
  const before = fs.readFileSync(target);
  fs.symlinkSync(path.join(sibling, 'node_modules'), path.join(tree, 'node_modules'), 'junction');

  assert.deepEqual(removeTree(work, tree), { removed: true, branch: 'a' });
  assert.equal(fs.existsSync(tree), false, 'the tree dir is gone');
  assert.equal(listed(work, tree), false);
  assert.deepEqual(fs.readFileSync(target), before, "the sibling's files are byte-identical");
  assert.equal(listed(work, sibling), true);
});

test('dirt keeps a tree: a tracked edit, and an untracked non-ignored file', (t) => {
  const { work, add } = scratch(t);
  const edited = add('edited');
  fs.writeFileSync(path.join(edited, 'edited.txt'), 'changed');
  const stray = add('stray');
  fs.writeFileSync(path.join(stray, 'notes.md'), 'forgot to add');

  assert.deepEqual(removeTree(work, edited), { kept: 'dirty' });
  assert.deepEqual(removeTree(work, stray), { kept: 'dirty' });
  assert.equal(fs.readFileSync(path.join(edited, 'edited.txt'), 'utf8'), 'changed');
  assert.equal(fs.readFileSync(path.join(stray, 'notes.md'), 'utf8'), 'forgot to add');
  assert.equal(listed(work, edited) && listed(work, stray), true);
});

test("the deck's run.json is not dirt, modified or untracked", (t) => {
  const { work, add } = scratch(t);
  const record = 'docs/design/x/run.json';
  const modified = add('modified', { files: { [record]: '{}' } });
  fs.writeFileSync(path.join(modified, record), '{"stage":"landed"}');
  const untracked = add('untracked');
  fs.mkdirSync(path.join(untracked, 'docs/design/x'), { recursive: true });
  fs.writeFileSync(path.join(untracked, record), '{}');

  assert.deepEqual(removeTree(work, modified), { removed: true, branch: 'modified' });
  assert.deepEqual(removeTree(work, untracked), { removed: true, branch: 'untracked' });
  assert.equal(fs.existsSync(modified) || fs.existsSync(untracked), false);
});

test('unpushed work keeps a tree and its branch; the pilot branch or a feat branch holding it does not', (t) => {
  const { work, add } = scratch(t);
  const lone = add('lone', { push: false });
  assert.deepEqual(removeTree(work, lone), { kept: 'unpushed' });
  assert.equal(fs.existsSync(path.join(lone, 'lone.txt')), true);
  assert.equal(hasBranch(work, 'lone'), true);

  // The pilot branch's name is read (user-pilot-branch), here from the repository's config.
  const saved = process.env.PILOT_BRANCH;
  delete process.env.PILOT_BRANCH;
  t.after(() => { if (saved !== undefined) process.env.PILOT_BRANCH = saved; });
  git(work, 'config', '--local', 'pilot.branch', 'me-pilot');
  const landed = add('landed', { push: false });
  git(work, 'branch', 'me-pilot', 'landed');
  assert.deepEqual(removeTree(work, landed), { removed: true, branch: 'landed' });

  const integrated = add('integrated', { push: false });
  git(work, 'branch', 'feat/x', 'integrated');
  assert.deepEqual(removeTree(work, integrated), { removed: true, branch: 'integrated' });
  assert.equal(hasBranch(work, 'feat/x'), true);
});

test('a local feat tree is not its own safe head', (t) => {
  const { work, add } = scratch(t);
  const feat = add('feat/y', { push: false, files: { 'y.txt': 'y' } });
  assert.deepEqual(removeTree(work, feat), { kept: 'unpushed' });
  assert.equal(hasBranch(work, 'feat/y'), true);
});

test('a locked tree, a held tree and the main checkout are kept; a stray dir is not a worktree', (t) => {
  const { root, work, add } = scratch(t);
  const locked = add('locked');
  git(work, 'worktree', 'lock', locked);
  const held = add('held');
  const holder = (dir) => (path.resolve(dir) === path.resolve(held) ? '4242' : null);

  assert.deepEqual(removeTree(work, locked), { kept: 'locked' });
  assert.deepEqual(removeTree(work, held, { holder }), { kept: 'live 4242' });
  assert.deepEqual(removeTree(work, work), { kept: 'main' });
  const stray = path.join(root, 'stray');
  fs.mkdirSync(stray);
  assert.deepEqual(removeTree(work, stray), { kept: 'not a worktree' });
  assert.equal(fs.existsSync(locked) && fs.existsSync(held) && fs.existsSync(stray), true);
});

test('a dir left on disk after the remove step is leftover, and its branch stays', (t) => {
  const { work, add } = scratch(t);
  const tree = add('stuck');
  const remove = () => ({ ok: true, err: '' });
  assert.deepEqual(removeTree(work, tree, { remove }), { kept: 'leftover' });
  assert.equal(hasBranch(work, 'stuck'), true);
});

test('--force only on a landed run: untracked files keep a tree mid-run, not once landed', (t) => {
  const { work, add } = scratch(t);
  const tree = add('scratchy');
  fs.writeFileSync(path.join(tree, 'scratch.log'), 'x');
  const forces = [];
  const spy = (home, dir, force) => {
    forces.push(force);
    git(home, 'worktree', 'remove', ...(force ? ['--force'] : []), dir);
    return { ok: true, err: '' };
  };
  assert.deepEqual(removeTree(work, tree, { remove: spy }), { kept: 'dirty' });
  assert.deepEqual(forces, [], 'a dirty tree never reaches the remove step');
  assert.deepEqual(removeTree(work, tree, { landed: true, remove: spy }), { removed: true, branch: 'scratchy' });
  assert.deepEqual(forces, [true]);
  assert.equal(fs.existsSync(tree), false);

  const clean = add('clean');
  assert.deepEqual(removeTree(work, clean, { remove: spy }), { removed: true, branch: 'clean' });
  assert.deepEqual(forces, [true, false], 'mid-run the removal is never forced');
});

test('a tree holding another worktree inside it is kept, and so is the inner one', (t) => {
  const { work, add } = scratch(t);
  const outer = add('outer');
  const inner = path.join(outer, 'node_modules', 'inner');
  git(work, 'worktree', 'add', '-q', '-b', 'inner', inner, 'origin/main');
  fs.writeFileSync(path.join(inner, 'work.txt'), 'uncommitted');
  assert.deepEqual(removeTree(work, outer), { kept: 'nested' });
  assert.equal(fs.readFileSync(path.join(inner, 'work.txt'), 'utf8'), 'uncommitted');
});

test('a deleted run record is dirt', (t) => {
  const { work, add } = scratch(t);
  const tree = add('deleted', { files: { 'docs/design/x/run.json': '{}' } });
  fs.rmSync(path.join(tree, 'docs/design/x/run.json'));
  assert.deepEqual(removeTree(work, tree), { kept: 'dirty' });
});

test('keptLine names the state and the dir in one line', () => {
  assert.equal(keptLine('/w/a', 'live 4242'), 'kept live 4242 /w/a');
});
