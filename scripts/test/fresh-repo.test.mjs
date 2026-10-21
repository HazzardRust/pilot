/**
 * S1 of fresh-public-repo: the builder makes a one-commit bare repository from `main`'s
 * tree, signed only with the GitHub noreply address, and refuses while `pilot` holds
 * work `main` lacks (spec 2, 3, 6; L1-L3, A1). Each case builds a temp source repository
 * and a temp `--out`; nothing reaches the real checkout or a remote.
 */

// The fixture seam imports fake-home.mjs first and gives every git below the identity
// t@example.com, which is the "other" address the builder must never pick up.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { buildOrphan } = await import('../fresh-repo.mjs');
const { base } = await import('../base.mjs');

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fresh-repo.mjs');
const NOREPLY = '12345+someone@users.noreply.github.com';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function scratchDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-fresh-repo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/** A source repository with two commits on `main`, `pilot` at `main`, and `ahead` one file past it. */
function source(t) {
  return gitFixture(t, 'fresh-repo:source', (root) => {
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '-b', 'main', work);
    fs.mkdirSync(path.join(work, 'dir'));
    fs.writeFileSync(path.join(work, 'a.txt'), 'one\n');
    fs.writeFileSync(path.join(work, 'dir', 'b.txt'), 'two\n');
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'first');
    fs.writeFileSync(path.join(work, 'a.txt'), 'one again\n');
    git(work, 'commit', '-q', '-am', 'second');
    git(work, 'branch', 'pilot');
    git(work, 'checkout', '-q', '-b', 'ahead');
    fs.writeFileSync(path.join(work, 'unlanded.txt'), 'wip\n');
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'unlanded');
    git(work, 'checkout', '-q', 'main');
    return { work };
  });
}

test('the orphan has one commit and the source tree', (t) => {
  const { work } = source(t);
  const out = path.join(scratchDir(t), 'out.git');
  const built = buildOrphan({ cwd: work, from: 'main', pilot: 'pilot', email: NOREPLY, out });
  assert.equal(git(out, 'rev-list', '--count', 'main'), '1');
  assert.equal(git(out, 'rev-parse', 'main^{tree}'), git(work, 'rev-parse', 'main^{tree}'));
  assert.equal(built.tree, git(work, 'rev-parse', 'main^{tree}'));
  assert.equal(built.sha, git(out, 'rev-parse', 'main'));
  assert.equal(git(out, 'for-each-ref', '--format=%(refname)'), 'refs/heads/main', 'main is the only ref');
  const held = git(out, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)').split('\n').sort();
  const wanted = [built.sha, ...git(work, 'rev-list', '--objects', '--no-object-names', built.tree).split('\n')].sort();
  assert.deepEqual(held, wanted, 'out holds the commit and the tree\'s objects, nothing of the history');
});

test('an unknown or dashed ref is refused and nothing is built', (t) => {
  const { work } = source(t);
  const out = path.join(scratchDir(t), 'out.git');
  for (const from of ['nope', '--output=x']) {
    assert.throws(
      () => buildOrphan({ cwd: work, from, pilot: 'pilot', email: NOREPLY, out }),
      { message: `fresh-repo: ${from} is not a commit` },
    );
  }
  assert.equal(fs.existsSync(out), false);
});

test('the commit carries only the given address', (t) => {
  const { work } = source(t);
  assert.equal(git(work, 'config', 'user.email'), 't@example.com', 'the source repo has another address');
  const out = path.join(scratchDir(t), 'out.git');
  buildOrphan({ cwd: work, from: 'main', pilot: 'pilot', email: NOREPLY, name: 'Someone', out });
  assert.equal(git(out, 'log', '-1', '--format=%ae %ce', 'main'), `${NOREPLY} ${NOREPLY}`);
  assert.equal(git(out, 'log', '-1', '--format=%an %cn', 'main'), 'Someone Someone');
});

test('pilot ahead of main is refused and nothing is built', (t) => {
  const { work } = source(t);
  const out = path.join(scratchDir(t), 'out.git');
  assert.throws(
    () => buildOrphan({ cwd: work, from: 'main', pilot: 'ahead', email: NOREPLY, out }),
    { message: 'fresh-repo: ahead has changes main lacks' },
  );
  assert.equal(fs.existsSync(out), false);
});

test('a personal address is refused', (t) => {
  const { work } = source(t);
  const out = path.join(scratchDir(t), 'out.git');
  assert.throws(
    () => buildOrphan({ cwd: work, from: 'main', pilot: 'pilot', email: 'me@gmail.com', out }),
    { message: 'fresh-repo: me@gmail.com is not a GitHub noreply address' },
  );
  assert.equal(fs.existsSync(out), false);
});

test('an existing out is refused and left as it was', (t) => {
  const { work } = source(t);
  const out = scratchDir(t);
  fs.writeFileSync(path.join(out, 'keep.txt'), 'mine\n');
  assert.throws(
    () => buildOrphan({ cwd: work, from: 'main', pilot: 'pilot', email: NOREPLY, out }),
    { message: `fresh-repo: ${out} exists` },
  );
  assert.deepEqual(fs.readdirSync(out), ['keep.txt']);
});

test('pilot base accepts the result', async (t) => {
  const { work } = source(t);
  const root = scratchDir(t);
  const out = path.join(root, 'out.git');
  const run = spawnSync(process.execPath, [SCRIPT, '--from', 'main', '--pilot', 'pilot', '--email', NOREPLY, '--out', out], { cwd: work, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const sha = git(out, 'rev-parse', 'main');
  assert.equal(run.stdout, `fresh-repo: ${sha} in ${out}; push with: git -C ${out} push <url> main\n`);
  const clone = path.join(root, 'clone');
  git(root, 'clone', '-q', out, clone);
  const said = [];
  const code = await base({ cwd: clone, say: (text) => said.push(text), warn: (text) => said.push(text) });
  assert.equal(code, 0, said.join(''));
  assert.equal(said.join(''), `base pilot ${git(clone, 'rev-parse', '--short', sha)} (created from main)\n`);
});

test('the CLI exits 1 with the refusal on stderr and builds nothing', (t) => {
  const { work } = source(t);
  const out = path.join(scratchDir(t), 'out.git');
  const run = spawnSync(process.execPath, [SCRIPT, '--from', 'main', '--pilot', 'ahead', '--email', NOREPLY, '--out', out], { cwd: work, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, 'fresh-repo: ahead has changes main lacks\n');
  assert.equal(fs.existsSync(out), false);
});
