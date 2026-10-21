/**
 * `mergeIntoPilot` is the seam `sync` and `land` share (red-lands-on-pilot S4; L2, L3): a
 * --no-ff merge of one commit into the pilot branch in a temporary worktree, the tests,
 * and a named non-forced push. Every case runs against a scratch bare "origin" and a
 * clone of it; nothing here reaches a real remote.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { mergeIntoPilot } = await import('../sync.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/** A bare origin with main and `pilot`, and a clone with a fetched feature commit `source` on `feat/x`. */
function repos(t, featText = 'x\n', featFile = 'x.txt') {
  return gitFixture(t, `merge-into-pilot:repos:${featFile}:${featText}`, (dir) => buildRepos(dir, featText, featFile));
}

function buildRepos(dir, featText, featFile) {
  const origin = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  commitFile(work, 'shared.txt', 'one\n', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'checkout', '-q', '-b', 'pilot');
  commitFile(work, 'shared.txt', 'pilot\n', 'pilot');
  git(work, 'push', '-q', 'origin', 'pilot');
  git(work, 'checkout', '-q', '-b', 'feat/x', 'main');
  commitFile(work, featFile, featText, 'feat');
  git(work, 'push', '-q', 'origin', 'feat/x');
  git(work, 'fetch', '-q', 'origin');
  return { origin, work, source: git(work, 'rev-parse', 'HEAD'), gitIn: (args) => git(work, ...args) };
}

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const failing = `node -e "console.log('ℹ pass 2'); console.log('ℹ fail 1'); process.exit(1)"`;

test('a source merges into pilot as a new merge commit', (t) => {
  const { origin, work, source, gitIn } = repos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  const result = mergeIntoPilot({ cwd: work, git: gitIn, source, message: 'Merge feat/x into pilot', label: 'feat/x', test: passing });

  assert.equal(result.merged, true, result.line);
  const tip = git(origin, 'rev-parse', 'pilot');
  assert.equal(result.sha, tip, 'pushed');
  assert.equal(git(origin, 'rev-parse', `${tip}^1`), pilotTip, 'the first parent is the old pilot');
  assert.equal(git(origin, 'rev-parse', `${tip}^2`), source, 'the second parent is the source');
  assert.equal(git(origin, 'log', '-1', '--format=%s', tip), 'Merge feat/x into pilot');
});

test('a red run leaves pilot unmoved', (t) => {
  const { origin, work, source, gitIn } = repos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  assert.throws(
    () => mergeIntoPilot({ cwd: work, git: gitIn, source, message: 'Merge feat/x into pilot', label: 'feat/x', test: failing }),
    (err) => err.exitCode === 1 && /2 pass, 1 fail/.test(err.message) && /nothing pushed/.test(err.message),
  );
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('a conflict names its paths and pushes nothing', (t) => {
  const { origin, work, source, gitIn } = repos(t, 'feat\n', 'shared.txt');
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  assert.throws(
    () => mergeIntoPilot({ cwd: work, git: gitIn, source, message: 'Merge feat/x into pilot', label: 'feat/x', test: passing }),
    (err) => err.exitCode === 3 && Array.isArray(err.paths) && err.paths.join() === 'shared.txt' && /nothing pushed/.test(err.message),
  );
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('a source already on pilot merges nothing', (t) => {
  const { origin, work, gitIn } = repos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const source = git(origin, 'rev-parse', 'main');

  const result = mergeIntoPilot({ cwd: work, git: gitIn, source, message: 'Merge main into pilot', label: 'main', test: passing });

  assert.equal(result.merged, false, result.line);
  assert.equal(result.sha, pilotTip);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('a source that is not a full SHA is refused before git sees it', (t) => {
  const { origin, work, source, gitIn } = repos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  for (const bad of [source.slice(0, 7), '--upload-pack=x', 'feat/x']) {
    assert.throws(
      () => mergeIntoPilot({ cwd: work, git: gitIn, source: bad, message: 'm', label: 'x', test: passing }),
      (err) => err.exitCode === 1 && /is not a full commit SHA/.test(err.message),
    );
  }
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});
