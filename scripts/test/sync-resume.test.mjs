/**
 * `pilot sync` resumes the worktree an earlier conflict kept for the lander (lander S3):
 * a committed resolution is tested and pushed, a merge still open is refused and kept.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { sync } = await import('../sync.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;

function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

function build(dir) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  const work = path.join(dir, 'work');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commitFile(seed, 'shared.txt', 'one\n', 'main');
  git(seed, 'push', '-q', 'origin', 'main');
  git(seed, 'push', '-q', 'origin', 'main:pilot');
  git(seed, 'checkout', '-q', '-b', 'pilot');
  commitFile(seed, 'shared.txt', 'pilot\n', 'pilot');
  git(seed, 'push', '-q', 'origin', 'pilot');
  git(seed, 'checkout', '-q', 'main');
  commitFile(seed, 'shared.txt', 'main\n', 'main again');
  git(seed, 'push', '-q', 'origin', 'main');
  git(dir, 'clone', '-q', origin, work);
  return { origin, work, gitIn: (args) => git(work, ...args) };
}

/** A conflicted sync, leaving the kept worktree `dir` mid-merge. */
function conflicted(t) {
  const fx = gitFixture(t, 'sync-resume:repos', build);
  const dir = path.join(path.dirname(fx.work), `${path.basename(fx.work)}-sync`).replaceAll(path.sep, '/'); // git's spelling
  assert.throws(() => sync({ cwd: fx.work, git: fx.gitIn, test: passing }), (err) => err.exitCode === 3);
  return { ...fx, dir };
}

test('a committed resolution in the sync worktree is tested and pushed', (t) => {
  const { origin, work, gitIn, dir } = conflicted(t);
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'resolved\n');
  git(dir, 'add', 'shared.txt');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-edit');
  const resolution = git(dir, 'rev-parse', 'HEAD');

  const result = sync({ cwd: work, git: gitIn, test: passing });

  assert.equal(result.line, `synced pilot ${resolution.slice(0, 7)} (main@${git(origin, 'rev-parse', 'main').slice(0, 7)}): 3 pass, 0 fail`);
  assert.equal(git(origin, 'rev-parse', 'pilot'), resolution);
  assert.equal(fs.existsSync(dir), false, 'the worktree is removed');
});

test('a sync worktree still mid-merge is refused and kept', (t) => {
  const { origin, work, gitIn, dir } = conflicted(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  assert.throws(
    () => sync({ cwd: work, git: gitIn, test: passing }),
    (err) => err.exitCode === 3 && err.message.includes(`finish and commit the resolution in ${dir}`),
  );
  assert.ok(fs.existsSync(dir), 'kept');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});
