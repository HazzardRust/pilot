/**
 * S1 of pilot-branch: `pilot base` names the pilot branch and its tip, in one line
 * (spec 1; L12, L13). Each case runs against a scratch bare origin and a clone of it;
 * nothing reaches GitHub or a deck. A lint at the end keeps the architect off the default branch.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

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

/** One seed and one clone, on `main`. */
function buildScratchRepos(root) {
  const { origin } = seed(root, [
    { branch: 'main', files: {}, message: 'main' },
    ...['feat/a', 'feat/b'].map((branch) => ({ branch, from: 'main', files: {}, message: branch })),
  ], { pilot: 'main' });
  const work = path.join(root, 'work');
  git(root, 'clone', '-q', origin, work);
  return { origin, work };
}

async function printed(cwd) {
  const said = [];
  const warned = [];
  const code = await base({ cwd, say: (text) => said.push(text), warn: (text) => warned.push(text) });
  return { code, out: said.join(''), err: warned.join('') };
}

test('the move from the legacy pilot says so on stderr, with a host and under none', async (t) => {
  const pinned = process.env.PILOT_BRANCH;
  delete process.env.PILOT_BRANCH;
  t.after(() => (pinned === undefined ? delete process.env.PILOT_BRANCH : (process.env.PILOT_BRANCH = pinned)));
  const moved = 'created octo-pilot from pilot; the legacy pilot is left for you to delete\n';

  const hosted = scratchRepos(t).work;
  const said = [];
  const warned = [];
  const code = await base({ cwd: hosted, say: (text) => said.push(text), warn: (text) => warned.push(text), host: { login: () => 'Octo' } });
  assert.equal(code, 0, warned.join(''));
  assert.match(said.join(''), /^base main [0-9a-f]+\n$/, 'stdout is unchanged');
  assert.equal(warned.join(''), moved);

  const none = scratchRepos(t).work;
  git(none, 'config', 'pilot.host', 'none');
  git(none, 'config', 'pilot.branch', 'octo-pilot');
  const { code: noneCode, out, err } = await printed(none);
  assert.equal(noneCode, 0, err);
  assert.match(out, /^base octo-pilot [0-9a-f]+ \(created from pilot\)\n$/);
  assert.equal(err, moved);
});

test('base prints the default branch even with open feat/ branches', async (t) => {
  const { work } = scratchRepos(t);
  const { code, out } = await printed(work);
  assert.equal(code, 0);
  assert.equal(out, `base main ${git(work, 'rev-parse', '--short', 'origin/main')}\n`);
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

test('pilot-architect.md does not cut from the default branch', () => {
  const architect = fs.readFileSync(path.join(ROOT, 'agents', 'pilot-architect.md'), 'utf8');
  const where = architect.slice(architect.indexOf('## Where you work'), architect.indexOf('## The artefact'));
  // lint: the architect's Where you work names no origin/<default-branch>
  assert.doesNotMatch(where, /origin\/<default-branch>/);
});
