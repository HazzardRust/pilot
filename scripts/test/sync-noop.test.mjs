/**
 * `pilot sync` answers early, pushing nothing and running no suite, when merging
 * origin/main into pilot would change no file (one-integration-line S6): the user merged
 * pilot into main by merge commit or by squash, so main holds only pilot's tree.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { sync } = await import('../sync.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/** A bare origin with main and pilot (one file ahead), a seed clone to move them, and the caller's clone. */
function repos(t) {
  return gitFixture(t, 'sync-noop:repos', (dir) => {
    const origin = path.join(dir, 'origin.git');
    const seed = path.join(dir, 'seed');
    const work = path.join(dir, 'work');
    git(dir, 'init', '--bare', '-b', 'main', origin);
    git(dir, 'clone', '-q', origin, seed);
    git(seed, 'checkout', '-q', '-b', 'main');
    commitFile(seed, 'shared.txt', 'one\n', 'main');
    git(seed, 'push', '-q', 'origin', 'main');
    git(seed, 'checkout', '-q', '-b', 'pilot');
    commitFile(seed, 'p.txt', 'p\n', 'pilot: p.txt');
    git(seed, 'push', '-q', 'origin', 'pilot');
    git(dir, 'clone', '-q', '-b', 'pilot', origin, work);
    return { origin, seed, work, gitIn: (args) => git(work, ...args) };
  });
}

/** A test command that leaves a mark when run. */
const marked = (dir) => `node -e "require('fs').writeFileSync('${path.join(dir, 'ran').replaceAll('\\', '/')}', '')"`;

function assertNoop(result, { origin, seed }, pilotTip) {
  const mainTip = git(origin, 'rev-parse', 'main');
  assert.equal(result.merged, false);
  assert.equal(result.sha, pilotTip);
  assert.equal(result.line, `pilot already has main@${mainTip.slice(0, 7)}`);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'nothing pushed');
  assert.equal(fs.existsSync(path.join(seed, 'ran')), false, 'no suite run');
}

test('main that merged pilot is a no-op', (t) => {
  const r = repos(t);
  const pilotTip = git(r.origin, 'rev-parse', 'pilot');
  git(r.seed, 'checkout', '-q', 'main');
  git(r.seed, 'merge', '-q', '--no-ff', '-m', 'Merge pilot', 'pilot');
  git(r.seed, 'push', '-q', 'origin', 'main');

  assertNoop(sync({ cwd: r.work, git: r.gitIn, test: marked(r.seed) }), r, pilotTip);
});

test('a squash of pilot is a no-op too', (t) => {
  const r = repos(t);
  const pilotTip = git(r.origin, 'rev-parse', 'pilot');
  git(r.seed, 'checkout', '-q', 'main');
  git(r.seed, 'merge', '-q', '--squash', 'pilot');
  git(r.seed, 'commit', '-q', '-m', 'Squash pilot');
  git(r.seed, 'push', '-q', 'origin', 'main');

  assertNoop(sync({ cwd: r.work, git: r.gitIn, test: marked(r.seed) }), r, pilotTip);
});

test('real work on main still syncs', (t) => {
  const r = repos(t);
  git(r.seed, 'checkout', '-q', 'main');
  commitFile(r.seed, 'm2.txt', 'm2\n', 'main: m2.txt');
  git(r.seed, 'push', '-q', 'origin', 'main');

  const result = sync({ cwd: r.work, git: r.gitIn, test: 'node -e "0"' });

  assert.equal(result.merged, true, result.line);
  assert.equal(git(r.origin, 'log', '-1', '--format=%s', 'pilot'), 'Merge main into pilot');
});
