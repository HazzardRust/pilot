/**
 * `integrate` reads the feature tip's host checks before any merge (ci-gate S4, L4): red refuses with
 * nothing merged or pushed; pending passes and the line is the one integrate printed before.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A bare origin, a clone on `feat/x`, and a pushed `slice/a` that adds one file. */
function scratchRepos(t) {
  return gitFixture(t, 'integrate-checks:scratchRepos', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'checkout', '-q', '-b', 'feat/x');
    fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
    git(work, 'add', 'base.txt');
    git(work, 'commit', '-q', '-m', 'base');
    git(work, 'push', '-q', '-u', 'origin', 'feat/x');
    git(work, 'push', '-q', 'origin', 'HEAD:main', 'HEAD:pilot');
    git(work, 'remote', 'set-head', 'origin', 'main');
    git(work, 'checkout', '-q', '-b', 'slice/a');
    fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
    git(work, 'add', 'a.txt');
    git(work, 'commit', '-q', '-m', 'the slice');
    git(work, 'push', '-q', 'origin', 'slice/a');
    git(work, 'checkout', '-q', 'feat/x');
    git(work, 'branch', '-q', '-D', 'slice/a');
    return { origin, work };
  });
}

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
/** A host whose one check run is `outcome`; everything else answers as the integrate tests' stub does. */
const hostWith = (name, outcome) => ({ ...githubHost((args) => (args[0] === 'pr' ? '[]' : 'me\n')), checks: () => [{ name, outcome }] });

test('a red tip takes no slice', (t) => {
  const { origin, work } = scratchRepos(t);
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/a', { cwd: work, test: passing, install: () => {}, host: hostWith('ci / unit', 'fail') });

  assert.equal(result.ok, false);
  assert.equal(result.line, `NOT integrated slice/a: checks red at ${before.slice(0, 7)}: ci / unit; fix the feature first; nothing merged or pushed`);
  assert.deepEqual(result.failing, []);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD is at start');
  assert.equal(git(origin, 'rev-parse', 'feat/x'), before, 'nothing pushed');
  assert.equal(git(work, 'status', '--porcelain'), '', 'nothing left behind');
});

test('pending passes silently', (t) => {
  const { origin, work } = scratchRepos(t);

  const result = integrate('slice/a', { cwd: work, test: passing, install: () => {}, host: hostWith('ci / unit', 'pending') });

  assert.equal(result.ok, true);
  const head = git(work, 'rev-parse', '--short', 'HEAD');
  assert.equal(result.line, `integrated slice/a at ${head} (base pilot@${git(work, 'rev-parse', '--short', 'origin/pilot')}): 3 pass, 0 fail; pushed; deleted slice/a`);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'), 'pushed');
});
