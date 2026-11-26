/**
 * audit-f1 S1: `pilotTip` answers the run's pilot ref and its sha (spec 1, 4; L1, L6, L8, A2),
 * on real temp repositories with local bare remotes; nothing reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pilotTip } from '../pilot-tip.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'pilot-tip.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * A bare origin whose `pilot` is three commits ahead of a clone's HEAD on `main`, at `tip`. Under `newer`,
 * origin's `pilot` has moved two commits past `tip`, to `newer`, and `tip` is branch `old`; the clone has
 * fetched `newer`. One seed and one clone each.
 */
function stale(t, { newer = false } = {}) {
  return gitFixture(t, `pilot-tip:${newer ? 'newer' : 'stale'}`, (root) => {
    const ahead = newer ? 'old' : 'pilot';
    const { origin, sha } = seed(root, [
      { branch: 'main', files: {}, message: 'base' },
      ...[1, 2, 3].map((n) => ({ branch: ahead, files: {}, message: `pilot ${n}`, ...(n === 1 ? { from: 'main' } : {}) })),
      ...(newer ? [4, 5].map((n) => ({ branch: 'pilot', files: {}, message: `pilot ${n}`, ...(n === 4 ? { from: 'old' } : {}) })) : []),
    ]);
    const work = path.join(root, 'work');
    git(root, 'clone', '-q', origin, work);
    return { root, origin, work, tip: sha[ahead], newer: sha.pilot };
  });
}

/** `git config pilot.remote <name>` with no git spawned: git reads the last value a key has in `.git/config`. */
const setRunRemote = (repo, name) => fs.appendFileSync(path.join(repo, '.git', 'config'), `[pilot]\n\tremote = ${name}\n`);

function emptyDir(t) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-tip-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the pilot tip ahead of HEAD is answered', (t) => {
  const { work, tip } = stale(t);
  assert.deepEqual(pilotTip({ cwd: work }), { ref: 'origin/pilot', sha: tip, behind: 3 });
  assert.equal(execFileSync(process.execPath, [CLI], { cwd: work, encoding: 'utf8' }), `origin/pilot ${tip}\n`);
});

test('the run remote and local mode name their ref', (t) => {
  const { root, work, tip } = stale(t);
  const fork = path.join(root, 'fork.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', fork);
  git(work, 'remote', 'add', 'fork', fork);
  git(work, 'push', '-q', 'fork', `${tip}:refs/heads/pilot`);
  setRunRemote(work, 'fork');
  assert.deepEqual(pilotTip({ cwd: work }), { ref: 'fork/pilot', sha: tip, behind: 3 });

  git(work, 'branch', 'pilot', tip);
  setRunRemote(work, 'none');
  assert.deepEqual(pilotTip({ cwd: work }), { ref: 'pilot', sha: tip, behind: 3 });
});

test('a bad remote, no repo and no ref answer null', (t) => {
  const { work } = stale(t);
  setRunRemote(work, 'nowhere');
  assert.equal(pilotTip({ cwd: work }), null, 'a pilot.remote that is not a remote here');

  const plain = emptyDir(t);
  assert.equal(pilotTip({ cwd: plain }), null, 'not a repository');
  const cli = spawnSync(process.execPath, [CLI], { cwd: plain, encoding: 'utf8' });
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [1, '', 'pilot-tip: no pilot ref and no HEAD commit here\n'], 'no line to cut at');

  const bare = emptyDir(t);
  const origin = path.join(bare, 'origin.git');
  const clone = path.join(bare, 'clone');
  seed(bare, [{ branch: 'main', files: {}, message: 'base' }], { pilot: 'main' });
  git(bare, 'clone', '-q', origin, clone);
  git(clone, 'update-ref', '-d', 'refs/remotes/origin/pilot');
  assert.equal(pilotTip({ cwd: clone, fetch: true }), null, 'no tracking ref');
  assert.throws(() => git(clone, 'rev-parse', '--verify', '-q', 'refs/remotes/origin/pilot'), 'fetch made no tracking ref (A2)');
  assert.equal(
    execFileSync(process.execPath, [CLI], { cwd: clone, encoding: 'utf8' }),
    `HEAD ${git(clone, 'rev-parse', 'HEAD')}\n`,
    'the CLI falls back to HEAD',
  );
});

test("fetch reads the remote's newer tip, offline keeps the tracking ref", (t) => {
  const { root, work, tip, newer } = stale(t, { newer: true });
  git(work, 'update-ref', 'refs/remotes/origin/pilot', tip);

  assert.equal(pilotTip({ cwd: work }).sha, tip, 'no fetch without fetch');
  git(work, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  assert.deepEqual(pilotTip({ cwd: work, fetch: true }), { ref: 'origin/pilot', sha: tip, behind: 3 }, 'offline');
  git(work, 'remote', 'set-url', 'origin', path.join(root, 'origin.git'));
  assert.deepEqual(pilotTip({ cwd: work, fetch: true }), { ref: 'origin/pilot', sha: newer, behind: 5 });
});
