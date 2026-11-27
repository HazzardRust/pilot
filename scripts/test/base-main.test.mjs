/**
 * audit-f14 S2 (spec 5; L9, A7): an unchained run on origin with a host is cut from the default
 * branch, and `pilot base` says so; a run on another remote, or with no host, keeps `base pilot`.
 * Scratch bare repositories only; nothing reaches GitHub or a deck.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { base } = await import('../base.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** origin.git holds `main` and a `pilot` one commit ahead; fork.git holds the same `pilot`; work clones origin. */
function scratchRepos(t) {
  return gitFixture(t, 'base-main:scratchRepos', (root) => {
    // One seed, one init, one clone (its `-c` writes the remote `fork` as `git remote add` does) and one push.
    const { origin, sha } = seed(root, [
      { branch: 'main', files: {}, message: 'main' },
      { branch: 'pilot', from: 'main', files: {}, message: 'landed on pilot' },
    ]);
    const fork = path.join(root, 'fork.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', fork);
    git(root, 'clone', '-q', '-c', `remote.fork.url=${fork}`, '-c', 'remote.fork.fetch=+refs/heads/*:refs/remotes/fork/*', origin, work);
    git(work, 'push', '-q', 'fork', 'origin/pilot:refs/heads/pilot');
    return { origin, work, mainTip: sha.main, pilotTip: sha.pilot };
  });
}

/** `git config <key> <value>` for a `pilot.` key with no git spawned: git reads the last value a key has in `.git/config`. */
const setPilot = (repo, key, value) => fs.appendFileSync(path.join(repo, '.git', 'config'), `[pilot]\n\t${key} = ${value}\n`);

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
  setPilot(work, 'host','none');
  assert.deepEqual(await printed(work), { code: 0, out: `base pilot ${git(work, 'rev-parse', '--short', pilotTip)}\n`, err: '' });
});

test('a fork remote keeps pilot', async (t) => {
  const { work, pilotTip } = scratchRepos(t);
  setPilot(work, 'remote','fork');
  assert.deepEqual(await printed(work), { code: 0, out: `base pilot ${git(work, 'rev-parse', '--short', pilotTip)} on fork\n`, err: '' });
});

test('a bad pilot.host stops the base, naming the key', async (t) => {
  const { work } = scratchRepos(t);
  setPilot(work, 'host','--upload-pack=x');
  const { code, out, err } = await printed(work);
  assert.deepEqual({ code, out }, { code: 1, out: '' });
  assert.match(err, /^pilot base: pilot\.host names "--upload-pack=x"/);
  setPilot(work, 'remote','fork');
  assert.equal((await printed(work)).code, 0, 'a fork run reads no host');
});
