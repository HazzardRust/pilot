/**
 * S1 of fresh-public-repo: the builder makes a one-commit bare repository from `main`'s
 * tree, signed only with the GitHub noreply address, and refuses while `pilot` holds
 * work `main` lacks (spec 2, 3, 6; L1-L3, A1). Each case builds a temp source repository
 * and a temp `--out`; nothing reaches the real checkout or a remote.
 */

// The fixture seam imports fake-home.mjs first and gives every git below the identity
// t@example.com, which is the "other" address the builder must never pick up.
import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

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
    const { origin } = seed(root, [
      { branch: 'main', files: { 'a.txt': 'one\n', 'dir/b.txt': 'two\n' }, message: 'first' },
      { branch: 'main', files: { 'a.txt': 'one again\n' }, message: 'second' },
      { branch: 'ahead', from: 'main', files: { 'unlanded.txt': 'wip\n' }, message: 'unlanded' },
    ], { pilot: 'main' });
    const work = path.join(root, 'work');
    // Every branch local, as in the repository the builder runs in: the refspec fetches heads to heads.
    git(root, 'clone', '-q', '-c', 'remote.origin.fetch=+refs/heads/*:refs/heads/*', origin, work);
    return { work };
  });
}

test('the orphan has one commit and the source tree', (t) => {
  const { work } = source(t);
  const out = path.join(scratchDir(t), 'out.git');
  const built = buildOrphan({ cwd: work, from: 'main', pilot: 'pilot', email: NOREPLY, out });
  assert.equal(git(out, 'rev-list', '--count', 'main'), '1');
  const [outTree, outSha] = git(out, 'rev-parse', 'main^{tree}', 'main').split('\n');
  const sourceTree = git(work, 'rev-parse', 'main^{tree}');
  assert.equal(outTree, sourceTree);
  assert.equal(built.tree, sourceTree);
  assert.equal(built.sha, outSha);
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
  const [emails, names] = git(out, 'log', '-1', '--format=%ae %ce%n%an %cn', 'main').split('\n');
  assert.equal(emails, `${NOREPLY} ${NOREPLY}`);
  assert.equal(names, 'Someone Someone');
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
