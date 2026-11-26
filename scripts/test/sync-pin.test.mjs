/**
 * The sync pin (land-batching spec 3, 4; S4): what one `pilot sync` prints on a seeded repository with
 * main ahead of pilot, with every SHA as `<sha>`, and the merge it leaves on pilot, recorded on the
 * base before any product change; the git one sync spawns; and `removeWorktree`'s prune, run only when
 * the removal failed. Nothing here reaches a real remote.
 */

import { git, commitFile, repos, passing } from './lib/land-repos.mjs';
import { countGit } from './lib/count-git.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { main, removeWorktree } = await import('../sync.mjs');

/** A clone `x` whose origin has main one commit ahead of pilot, and `pilot.test` set so `pilot sync` runs as it is used. */
function ahead(t) {
  const { origin, seed, x } = repos(t, 'x');
  commitFile(seed, 'm.txt', 'm\n', 'main ahead');
  git(seed, 'push', '-q', 'origin', 'main');
  git(x, 'config', 'pilot.test', passing);
  return { origin, x, before: git(origin, 'rev-parse', 'pilot'), mainTip: git(origin, 'rev-parse', 'main') };
}

/** `pilot sync` run in `cwd` as the CLI runs it: its exit code and stdout. */
function pilotSync(t, cwd) {
  const was = process.cwd();
  process.chdir(cwd);
  t.after(() => process.chdir(was));
  const said = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => said.push(String(text));
  try {
    return { code: main([]), out: said.join('') };
  } finally {
    process.stdout.write = write;
    process.chdir(was);
  }
}

test('sync prints what it printed on the base and leaves the same merge on pilot', (t) => {
  const { origin, x, before, mainTip } = ahead(t);

  const { code, out } = pilotSync(t, x);

  assert.equal(code, 0);
  assert.equal(out.replace(/\b[0-9a-f]{7,40}\b/g, '<sha>'), 'synced pilot <sha> (main@<sha>): 3 pass, 0 fail\n');
  assert.equal(git(origin, 'log', '-1', '--format=%s', 'pilot'), 'Merge main into pilot');
  assert.equal(git(origin, 'log', '-1', '--format=%P', 'pilot'), `${before} ${mainTip}`);
});

// 19 measured on the base for this sync (land-batching S4; the slice's census said 18), 14 after; the bar is 14.
const BASE_GIT = 19;
const BAR_GIT = 14;

test('one sync spawns at most 14 git', (t) => {
  const { x } = ahead(t);
  const { value, git: spawned } = countGit(() => pilotSync(t, x));
  assert.equal(value.code, 0, value.out);
  assert.ok(spawned <= BAR_GIT, `one sync spawned ${spawned} git, over ${BAR_GIT} (${BASE_GIT} on the base)`);
});

test('with no pilot branch name and no host to derive one, sync refuses naming why the host could not be chosen', (t) => {
  const { origin, x, before } = ahead(t);
  git(x, 'config', 'pilot.host', 'not-a-host');
  const was = process.env.PILOT_BRANCH;
  delete process.env.PILOT_BRANCH;
  t.after(() => (was === undefined ? delete process.env.PILOT_BRANCH : (process.env.PILOT_BRANCH = was)));

  const { code, out } = pilotSync(t, x);

  assert.equal(code, 1);
  assert.match(out, /^NOT synced: no pilot branch name: .* \(no host: pilot\.host names "not-a-host": .+\); nothing pushed\n$/);
  assert.equal(git(origin, 'rev-parse', 'pilot'), before);
});

/** A detached worktree of `x` at `<x>-wt`, its path. */
function worktree(x) {
  const dir = `${x}-wt`;
  git(x, 'worktree', 'add', '-q', '--detach', dir);
  return dir;
}

const listed = (x, dir) => git(x, 'worktree', 'list', '--porcelain').replaceAll('\\', '/').includes(`worktree ${dir.replaceAll('\\', '/')}\n`);

test('a removed worktree is not pruned again', (t) => {
  const { x } = repos(t, 'x');
  const dir = worktree(x);

  const { value: gone, git: spawned } = countGit(() => removeWorktree(x, dir));

  assert.equal(gone, true);
  assert.equal(spawned, 1);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(listed(x, dir), false);
});

test('a locked worktree, which remove refuses, still prunes', (t) => {
  const { x } = repos(t, 'x');
  const dir = worktree(x);
  git(x, 'worktree', 'lock', dir);
  const calls = [];
  const recording = (args) => {
    calls.push(args.join(' '));
    return git(x, ...args);
  };

  const gone = removeWorktree(x, dir, recording);

  assert.equal(gone, true);
  assert.equal(fs.existsSync(path.join(dir, '.git')), false);
  // The removal was refused, so the prune ran after it.
  assert.equal(calls.at(-1), 'worktree prune');
});
