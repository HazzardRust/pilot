/**
 * S1 of pilot-branch: the pilot branch and the one push guard (spec 1, 4; L4, L12).
 * Each case runs against a scratch bare origin and a clone of it; nothing reaches GitHub.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { assertPushable } = await import('../pilot-branch.mjs');
const { base } = await import('../base.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A bare origin with one commit on `main`, and a clone of it with origin/HEAD set. */
function scratchRepos(t) {
  return gitFixture(t, 'pilot-branch:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  return { origin, work };
}

async function printed(cwd) {
  const said = [];
  const warned = [];
  const code = await base({ cwd, say: (text) => said.push(text), warn: (text) => warned.push(text) });
  return { code, out: said.join(''), err: warned.join('') };
}

test('base creates pilot from the default tip when the remote has none', async (t) => {
  const { origin, work } = scratchRepos(t);
  const main = git(origin, 'rev-parse', 'refs/heads/main');
  const { code, out } = await printed(work);
  assert.equal(code, 0);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), main, 'origin has pilot at main\'s tip');
  assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', main)} (created from main)\n`);
});

test('base never creates pilot over an existing one', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(work, 'checkout', '-q', '-b', 'pilot');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'landed');
  git(work, 'push', '-q', 'origin', 'pilot');
  git(work, 'checkout', '-q', 'main');
  const ahead = git(origin, 'rev-parse', 'refs/heads/pilot');
  const { code, out } = await printed(work);
  assert.equal(code, 0);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), ahead, 'the existing pilot is kept');
  assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', ahead)}\n`);
});

test('assertPushable refuses the default branch by name', async (t) => {
  const { work } = scratchRepos(t);
  const run = (args) => git(work, ...args);
  assert.throws(() => assertPushable('main', { git: run }), /\bmain\b/);
  assert.throws(() => assertPushable('refs/heads/main', { git: run }), /\bmain\b/);
  assert.throws(() => assertPushable('HEAD:main', { git: run }), /\bmain\b/);
  for (const ref of ['heads/main', 'abc123:refs/heads/main', 'Main', 'HEAD', '@', '--all', '--mirror', '+pilot', 'refs/heads/*:refs/heads/*', ':refs/heads/*', 'refs/tags/main', 'feat/x y', '']) {
    assert.throws(() => assertPushable(ref, { git: run }), /refusing to push/, `${JSON.stringify(ref)} is refused`);
  }
  assert.throws(() => assertPushable('a:b:c', { git: run }), /not a plain <src>:<branch> refspec/);
  for (const ref of ['-x:pilot', 'a..b:pilot', 'x y:pilot']) assert.throws(() => assertPushable(ref, { git: run }), /not a plain <src>:<branch> refspec/, ref);
  for (const ref of ['pilot', 'feat/x', 'design/x', 'refs/heads/pilot', 'abc123:refs/heads/pilot']) assert.doesNotThrow(() => assertPushable(ref, { git: run }), ref);
});

test('assertPushable reads the remote\'s default: a renamed default is refused though origin/HEAD still says main', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(work, 'push', '-q', 'origin', 'main:trunk');
  git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
  assert.equal(git(work, 'symbolic-ref', 'refs/remotes/origin/HEAD'), 'refs/remotes/origin/main', 'the local ref is stale');
  assert.throws(() => assertPushable('trunk', { git: (args) => git(work, ...args) }), /refusing to push trunk: it is the default branch \(trunk\)/);
  assert.doesNotThrow(() => assertPushable('main', { git: (args) => git(work, ...args) }));
});

test('assertPushable refuses every ref when the remote cannot be asked, whatever origin/HEAD says', async (t) => {
  const { work } = scratchRepos(t);
  git(work, 'remote', 'set-url', 'origin', path.join(work, 'no-such-origin.git'));
  assert.throws(() => assertPushable('pilot', { git: (args) => git(work, ...args) }), /no default branch known/);
});

test('assertPushable refuses every ref when the remote has no default branch', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/gone');
  assert.throws(() => assertPushable('pilot', { git: (args) => git(work, ...args) }), /no default branch known/);
});
