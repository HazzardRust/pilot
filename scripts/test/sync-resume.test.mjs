/**
 * `pilot sync` resumes the worktree an earlier conflict kept for the lander (lander S3):
 * a committed resolution is tested and pushed, a merge still open is refused and kept.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { sync } = await import('../sync.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;

/** Origin with pilot and main each changing main's shared.txt their own way; `work` clones it. */
function build(dir) {
  const { origin, sha } = seed(dir, [
    { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' },
    { branch: 'pilot', files: { 'shared.txt': 'pilot\n' }, message: 'pilot' },
    { branch: 'main', files: { 'shared.txt': 'main\n' }, message: 'main again' },
  ]);
  const work = path.join(dir, 'work');
  git(dir, 'clone', '-q', origin, work);
  return { origin, work, sha, gitIn: (args) => git(work, ...args) };
}

/** A conflicted sync, leaving the kept worktree `dir` mid-merge. */
function conflicted(t) {
  const fx = gitFixture(t, 'sync-resume:repos', build);
  const dir = path.join(path.dirname(fx.work), `${path.basename(fx.work)}-sync`).replaceAll(path.sep, '/'); // git's spelling
  assert.throws(() => sync({ cwd: fx.work, git: fx.gitIn, test: passing }), (err) => err.exitCode === 3);
  return { ...fx, dir };
}

test('a committed resolution in the sync worktree is tested and pushed', (t) => {
  const { origin, work, sha, gitIn, dir } = conflicted(t);
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'resolved\n');
  git(dir, 'add', 'shared.txt');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-edit');
  const resolution = git(dir, 'rev-parse', 'HEAD');

  const result = sync({ cwd: work, git: gitIn, test: passing });

  assert.equal(result.line, `synced pilot ${resolution.slice(0, 7)} (main@${sha.main.slice(0, 7)}): 3 pass, 0 fail`);
  assert.equal(git(origin, 'rev-parse', 'pilot'), resolution);
  assert.equal(fs.existsSync(dir), false, 'the worktree is removed');
});

test('a sync worktree still mid-merge is refused and kept', (t) => {
  const { origin, work, sha, gitIn, dir } = conflicted(t);
  const pilotTip = sha.pilot;

  assert.throws(
    () => sync({ cwd: work, git: gitIn, test: passing }),
    (err) => err.exitCode === 3 && err.message.includes(`finish and commit the resolution in ${dir}`),
  );
  assert.ok(fs.existsSync(dir), 'kept');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});
