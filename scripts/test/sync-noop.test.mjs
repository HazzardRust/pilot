/**
 * `pilot sync` answers early, pushing nothing and running no suite, when merging
 * origin/main into pilot would change no file (one-integration-line S6): the user merged
 * pilot into main by merge commit or by squash, so main holds only pilot's tree.
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

/**
 * A bare origin with main and pilot (one file ahead), then main's own `next` commit, and the caller's clone on pilot;
 * `dir` is the fixture's directory, `sha` each branch's tip.
 */
function repos(t, next) {
  return gitFixture(t, `sync-noop:${next.message}`, (dir) => {
    const { origin, sha } = seed(dir, [
      { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' },
      { branch: 'pilot', files: { 'p.txt': 'p\n' }, message: 'pilot: p.txt' },
      { branch: 'main', ...next },
    ]);
    const work = path.join(dir, 'work');
    git(dir, 'clone', '-q', '-b', 'pilot', origin, work);
    return { dir, origin, work, sha, gitIn: (args) => git(work, ...args) };
  });
}

/** A test command that leaves a mark when run. */
const marked = (dir) => `node -e "require('fs').writeFileSync('${path.join(dir, 'ran').replaceAll('\\', '/')}', '')"`;

function assertNoop(result, { dir, origin, sha }) {
  assert.equal(result.merged, false);
  assert.equal(result.sha, sha.pilot);
  assert.equal(result.line, `pilot already has main@${sha.main.slice(0, 7)}`);
  assert.equal(git(origin, 'rev-parse', 'pilot'), sha.pilot, 'nothing pushed');
  assert.equal(fs.existsSync(path.join(dir, 'ran')), false, 'no suite run');
}

test('main that merged pilot is a no-op', (t) => {
  const r = repos(t, { merge: ['pilot'], files: {}, message: 'Merge pilot' });

  assertNoop(sync({ cwd: r.work, git: r.gitIn, test: marked(r.dir) }), r);
});

test('a squash of pilot is a no-op too', (t) => {
  const r = repos(t, { files: { 'p.txt': 'p\n' }, message: 'Squash pilot' });

  assertNoop(sync({ cwd: r.work, git: r.gitIn, test: marked(r.dir) }), r);
});

test('real work on main still syncs', (t) => {
  const r = repos(t, { files: { 'm2.txt': 'm2\n' }, message: 'main: m2.txt' });

  const result = sync({ cwd: r.work, git: r.gitIn, test: 'node -e "0"' });

  assert.equal(result.merged, true, result.line);
  assert.equal(git(r.origin, 'log', '-1', '--format=%s', 'pilot'), 'Merge main into pilot');
});
