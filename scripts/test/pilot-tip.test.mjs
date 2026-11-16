/**
 * audit-f1 S1: `pilotTip` answers the run's pilot ref and its sha (spec 1, 4; L1, L6, L8, A2),
 * on real temp repositories with local bare remotes; nothing reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';

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

/** A bare origin whose `pilot` is three commits ahead of a clone's HEAD on `main`. */
function stale(t) {
  return gitFixture(t, 'pilot-tip:stale', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'base');
    git(work, 'push', '-q', 'origin', 'HEAD:main');
    for (const n of [1, 2, 3]) git(work, 'commit', '-q', '--allow-empty', '-m', `pilot ${n}`);
    const tip = git(work, 'rev-parse', 'HEAD');
    git(work, 'push', '-q', 'origin', 'HEAD:pilot');
    git(work, 'reset', '-q', '--hard', 'HEAD~3');
    return { root, origin, work, tip };
  });
}

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
  git(work, 'config', 'pilot.remote', 'fork');
  assert.deepEqual(pilotTip({ cwd: work }), { ref: 'fork/pilot', sha: tip, behind: 3 });

  git(work, 'branch', 'pilot', tip);
  git(work, 'config', 'pilot.remote', 'none');
  assert.deepEqual(pilotTip({ cwd: work }), { ref: 'pilot', sha: tip, behind: 3 });
});

test('a bad remote, no repo and no ref answer null', (t) => {
  const { work } = stale(t);
  git(work, 'config', 'pilot.remote', 'nowhere');
  assert.equal(pilotTip({ cwd: work }), null, 'a pilot.remote that is not a remote here');

  const plain = emptyDir(t);
  assert.equal(pilotTip({ cwd: plain }), null, 'not a repository');
  const cli = spawnSync(process.execPath, [CLI], { cwd: plain, encoding: 'utf8' });
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [1, '', 'pilot-tip: no pilot ref and no HEAD commit here\n'], 'no line to cut at');

  const bare = emptyDir(t);
  const origin = path.join(bare, 'origin.git');
  const clone = path.join(bare, 'clone');
  git(bare, 'init', '-q', '--bare', '-b', 'main', origin);
  git(bare, 'clone', '-q', origin, clone);
  git(clone, 'commit', '-q', '--allow-empty', '-m', 'base');
  git(clone, 'push', '-q', 'origin', 'HEAD:main', 'HEAD:pilot');
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
  const { root, work, tip } = stale(t);
  git(work, 'checkout', '-q', '--detach', tip);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'pilot 4');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'pilot 5');
  const newer = git(work, 'rev-parse', 'HEAD');
  git(work, 'push', '-q', 'origin', 'HEAD:pilot');
  git(work, 'update-ref', 'refs/remotes/origin/pilot', tip);
  git(work, 'checkout', '-q', 'main');

  assert.equal(pilotTip({ cwd: work }).sha, tip, 'no fetch without fetch');
  git(work, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  assert.deepEqual(pilotTip({ cwd: work, fetch: true }), { ref: 'origin/pilot', sha: tip, behind: 3 }, 'offline');
  git(work, 'remote', 'set-url', 'origin', path.join(root, 'origin.git'));
  assert.deepEqual(pilotTip({ cwd: work, fetch: true }), { ref: 'origin/pilot', sha: newer, behind: 5 });
});
