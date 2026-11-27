/**
 * A tree tagged to a run at creation (prune-worktrees S2; spec 3, 10; L7, A1). `pilot worktrees add
 * --run <slug>` writes the slug into the tree's git admin dir; `runWorktrees` then counts the tree as
 * the run's wherever it lives and whatever it has checked out, and a landed prune removes it through
 * `removeTree`. Every tree is made in the fixture's temp dir or a temp dir of its own, never a real checkout.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { main, prune, runWorktrees, tagOf } = await import('../worktrees.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
const BASE = 'origin/main';
const SLUG = 'x';

/** A clone `work` of a bare origin with one pushed commit. */
function repo(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
  git(work, 'add', 'a.txt');
  git(work, 'commit', '-q', '-m', 'a');
  git(work, 'push', '-q', 'origin', 'main');
  return { root, work };
}

const fixture = (t) => gitFixture(t, 'worktrees-tagged:repo', repo);

function cli(...argv) {
  const [out, err] = [[], []];
  const status = main(argv, { out: { write: (s) => out.push(s) }, err: { write: (s) => err.push(s) }, read: () => [] });
  return { status, stdout: out.join(''), stderr: err.join('') };
}

/** `pilot worktrees add --run <slug> --detach <dir> <base>` in `work`, asserted to succeed. */
function addTagged(work, slug, dir) {
  const result = cli('add', '--repo', work, '--run', slug, '--detach', dir, BASE);
  assert.equal(result.status, 0, result.stderr);
  return dir;
}

/** A temp dir outside the fixture's root, so outside the repo's parent; removed after the test. */
function elsewhere(t) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'tagged-elsewhere-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const norm = (p) => path.resolve(p).replaceAll('\\', '/').toLowerCase();
const has = (list, dir) => list.some((p) => norm(p) === norm(dir));
const listed = (work) => git(work, 'worktree', 'list', '--porcelain').split('\n')
  .filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));

test('a tagged detached tree is the run\'s', (t) => {
  const { root, work } = fixture(t);
  const mine = addTagged(work, SLUG, path.join(root, 'mine'));
  const theirs = addTagged(work, 'y', path.join(root, 'theirs'));
  assert.equal(tagOf(work, mine), SLUG);
  assert.equal(tagOf(work, theirs), 'y');
  assert.equal(tagOf(work, work), null, 'the main checkout carries no tag');
  const run = runWorktrees(work, SLUG);
  assert.ok(has(run, mine), 'the tagged detached tree is the run\'s');
  assert.ok(!has(run, theirs), 'a tree tagged to another run is not');
  assert.ok(!has(run, work), 'never the main checkout');
});

test('add writes no tag when git refuses, and passes git\'s exit on', (t) => {
  const { root, work } = fixture(t);
  const result = cli('add', '--repo', work, '--run', SLUG, '--detach', path.join(root, 'bad'), 'no-such-ref');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no-such-ref/);
  assert.deepEqual(runWorktrees(work, SLUG), []);
  assert.equal(cli('add', '--repo', work, '--run', '../evil', '--detach', path.join(root, 'evil'), BASE).status, 2, 'a slug that is not a name is a usage error');
  assert.equal(fs.existsSync(path.join(root, 'evil')), false, 'nothing is added on a usage error');
});

test('a landed prune takes tagged trees wherever they live', (t) => {
  const { root, work } = fixture(t);
  const detached = addTagged(work, SLUG, path.join(root, 'detached'));
  const outside = addTagged(work, SLUG, path.join(elsewhere(t), 'tree'));
  const result = prune(work, BASE, { run: SLUG, landed: true });
  assert.deepEqual(result.failed, []);
  assert.equal(result.removed.length, 2);
  for (const dir of [detached, outside]) {
    assert.equal(fs.existsSync(dir), false, dir);
    assert.ok(!has(listed(work), dir), `${dir} is not in git worktree list`);
  }
});

test('the report\'s left list sees a dirty tagged tree a landed prune kept', (t) => {
  const { root, work } = fixture(t);
  const dirty = addTagged(work, SLUG, path.join(root, 'dirty'));
  fs.writeFileSync(path.join(dirty, 'a.txt'), 'changed\n');
  const result = prune(work, BASE, { run: SLUG, landed: true });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept.map(({ path: p, state }) => [norm(p), state]), [[norm(dirty), 'merged-dirty']]);
  assert.ok(has(runWorktrees(work, SLUG), dirty), 'runWorktrees still names it');
});
