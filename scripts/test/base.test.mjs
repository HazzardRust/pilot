/**
 * S1 of pilot-branch: `pilot base` names the pilot branch and its tip, in one line
 * (spec 1; L12, L13). Each case runs against a scratch bare origin and a clone of it;
 * nothing reaches GitHub or a deck. The text pins at the end hold the pilot's and the
 * architect's words to it.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { base } = await import('../base.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function scratchDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-base-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/** A bare origin with `main`, an existing `pilot` and two pushed `feat/` branches, and a clone of it. */
function scratchRepos(t) {
  return gitFixture(t, 'base:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main', 'main:pilot');
  git(work, 'remote', 'set-head', 'origin', 'main');
  for (const branch of ['feat/a', 'feat/b']) {
    git(work, 'checkout', '-q', '-b', branch, 'main');
    git(work, 'commit', '-q', '--allow-empty', '-m', branch);
    git(work, 'push', '-q', 'origin', branch);
  }
  git(work, 'checkout', '-q', 'main');
  return { origin, work };
}

async function printed(cwd) {
  const said = [];
  const warned = [];
  const code = await base({ cwd, say: (text) => said.push(text), warn: (text) => warned.push(text) });
  return { code, out: said.join(''), err: warned.join('') };
}

test('base prints the pilot branch even with open feat/ branches', async (t) => {
  const { work } = scratchRepos(t);
  const { code, out } = await printed(work);
  assert.equal(code, 0);
  assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')}\n`);
});

test('base exits 1 and says why when origin is unreachable', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(origin, 'update-ref', '-d', 'refs/heads/pilot');
  git(work, 'remote', 'set-url', 'origin', path.join(work, 'no-such-origin.git'));
  const { code, out, err } = await printed(work);
  assert.equal(code, 1);
  assert.equal(out, '');
  assert.match(err, /^pilot base: git fetch failed: .+\n$/);
  assert.equal(git(origin, 'for-each-ref', 'refs/heads/pilot'), '', 'nothing is pushed');
});

test('base refuses a directory that is not a repository', async (t) => {
  const dir = scratchDir(t);
  const { code, out, err } = await printed(dir);
  assert.equal(code, 1);
  assert.equal(out, '');
  assert.match(err, /a run needs a git repository: run `git init` and add a remote/);
  assert.deepEqual(fs.readdirSync(dir), [], 'nothing is created there');
});

test('base refuses a bare repository, which has no work tree', async (t) => {
  const dir = path.join(scratchDir(t), 'bare.git');
  git(path.dirname(dir), 'init', '-q', '--bare', dir);
  const { code, err } = await printed(dir);
  assert.equal(code, 1);
  assert.match(err, /a run needs a git repository/);
});

test('pilot-architect.md cuts from the pilot branch', () => {
  const architect = fs.readFileSync(path.join(ROOT, 'agents', 'pilot-architect.md'), 'utf8');
  const where = architect.slice(architect.indexOf('## Where you work'), architect.indexOf('## The artefact'));
  assert.match(where, /git worktree add -b design\/<slug> <path> <remote>\/pilot/, 'S5: every run is cut from the pilot branch');
  assert.doesNotMatch(where, /origin\/<default-branch>/);
});
