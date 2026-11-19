/**
 * audit-f14 S2 (spec 5; L9, A7): an unchained run on origin with a host is cut from the default
 * branch, and `pilot base` says so; a run on another remote, or with no host, keeps `base pilot`.
 * Scratch bare repositories only; nothing reaches GitHub or a deck.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { base } = await import('../base.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** origin.git holds `main` and a `pilot` one commit ahead; fork.git holds the same `pilot`; work clones origin. */
function scratchRepos(t) {
  return gitFixture(t, 'base-main:scratchRepos', (root) => {
    const origin = path.join(root, 'origin.git');
    const fork = path.join(root, 'fork.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'init', '-q', '--bare', '-b', 'main', fork);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(work, 'push', '-q', 'origin', 'main');
    git(work, 'commit', '-q', '--allow-empty', '-m', 'landed on pilot');
    git(work, 'push', '-q', 'origin', 'HEAD:pilot');
    git(work, 'remote', 'add', 'fork', fork);
    git(work, 'push', '-q', 'fork', 'HEAD:pilot');
    git(work, 'reset', '-q', '--hard', 'origin/main');
    git(work, 'remote', 'set-head', 'origin', 'main');
    return { origin, work, mainTip: git(origin, 'rev-parse', 'refs/heads/main'), pilotTip: git(origin, 'rev-parse', 'refs/heads/pilot') };
  });
}

async function printed(cwd) {
  const said = [];
  const warned = [];
  const code = await base({ cwd, say: (text) => said.push(text), warn: (text) => warned.push(text) });
  return { code, out: said.join(''), err: warned.join('') };
}

test('an unchained run on origin is cut from the default branch', async (t) => {
  const { work, mainTip } = scratchRepos(t);
  assert.deepEqual(await printed(work), { code: 0, out: `base main ${git(work, 'rev-parse', '--short', mainTip)}\n`, err: '' });
});

test('a run on origin with no host keeps pilot', async (t) => {
  const { work, pilotTip } = scratchRepos(t);
  git(work, 'config', 'pilot.host', 'none');
  assert.deepEqual(await printed(work), { code: 0, out: `base pilot ${git(work, 'rev-parse', '--short', pilotTip)}\n`, err: '' });
});

test('a fork remote keeps pilot', async (t) => {
  const { work, pilotTip } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'fork');
  assert.deepEqual(await printed(work), { code: 0, out: `base pilot ${git(work, 'rev-parse', '--short', pilotTip)} on fork\n`, err: '' });
});

test('a bad pilot.host stops the base, naming the key', async (t) => {
  const { work } = scratchRepos(t);
  git(work, 'config', 'pilot.host', '--upload-pack=x');
  const { code, out, err } = await printed(work);
  assert.deepEqual({ code, out }, { code: 1, out: '' });
  assert.match(err, /^pilot base: pilot\.host names "--upload-pack=x"/);
  git(work, 'config', 'pilot.remote', 'fork');
  assert.equal((await printed(work)).code, 0, 'a fork run reads no host');
});
