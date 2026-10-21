/**
 * S1 of git-light-tests: the fixture seam (spec 1, 3, 6; A1, A2). A key is built once per
 * process and restored at the same path before each later test; identity comes from the
 * global config file the module writes, so no builder runs `git config`.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository with one commit; returns its directory and that commit's SHA. */
function oneCommit(dir) {
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'one');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

const builds = { shared: 0, other: 0 };
const counted = (name) => (dir) => {
  builds[name]++;
  return oneCommit(dir);
};

for (const n of [1, 2, 3]) {
  test(`the build runs once per key (${n} of 3)`, (t) => {
    gitFixture(t, 'count:shared', counted('shared'));
    assert.equal(builds.shared, 1, 'one build across three tests that share a key');
  });
}

test('the build runs once per key: two keys, two builds', (t) => {
  gitFixture(t, 'count:shared', counted('shared'));
  gitFixture(t, 'count:other', counted('other'));
  assert.deepEqual(builds, { shared: 1, other: 1 }, 'two keys, two builds in all');
});

let dirtied;
test('a dirtied fixture is pristine for the next test (the dirtying)', (t) => {
  dirtied = gitFixture(t, 'pristine', oneCommit);
  const { dir } = dirtied;
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-q', '-m', 'two');
  git(dir, 'branch', 'stray');
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'u\n');
  assert.notEqual(git(dir, 'rev-parse', 'HEAD'), dirtied.sha);
});

test('a dirtied fixture is pristine for the next test', (t) => {
  assert.ok(dirtied, 'runs after the dirtying test');
  const { dir, sha } = gitFixture(t, 'pristine', oneCommit);
  assert.equal(dir, dirtied.dir, 'the same path');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), sha, "HEAD is the build's SHA");
  assert.equal(git(dir, 'branch', '--list', 'stray'), '', 'the new branch is gone');
  assert.equal(fs.existsSync(path.join(dir, 'b.txt')), false);
  assert.equal(fs.existsSync(path.join(dir, 'untracked.txt')), false, 'the untracked file is gone');
  const again = gitFixture(t, 'pristine', oneCommit);
  assert.notEqual(again.dir, dir, 'a second call after a restore builds fresh too');
  assert.equal(git(again.dir, 'status', '--porcelain'), '');
});

test('a second call in one test gets its own directory', (t) => {
  const first = gitFixture(t, 'twice', oneCommit);
  fs.writeFileSync(path.join(first.dir, 'untracked.txt'), 'u\n');
  const second = gitFixture(t, 'twice', oneCommit);
  assert.notEqual(second.dir, first.dir);
  assert.equal(git(second.dir, 'status', '--porcelain'), '', 'the second is pristine');
  assert.equal(git(first.dir, 'status', '--porcelain'), '?? untracked.txt', 'the first is untouched by the second');
  assert.equal(git(first.dir, 'rev-parse', 'HEAD'), first.sha);
  assert.equal(git(second.dir, 'rev-parse', 'HEAD'), second.sha);
});

test('the fixture dir is its realpath', (t) => {
  const real = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-realpath-')));
  const link = `${real}-link`;
  const saved = {};
  const names = ['TMPDIR', 'TMP', 'TEMP'];
  for (const name of names) saved[name] = process.env[name];
  let seen;
  let resolved;
  try {
    fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    for (const name of names) process.env[name] = link;
    gitFixture(t, 'realpath', (dir) => {
      seen = dir;
      resolved = fs.realpathSync.native(dir);
      return oneCommit(dir);
    });
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    fs.rmSync(link, { recursive: true, force: true });
    fs.rmSync(real, { recursive: true, force: true });
  }
  assert.ok(seen, 'build ran');
  assert.equal(seen, resolved);
  assert.ok(seen.startsWith(real + path.sep), 'the dir is spelled through the real directory, not the link');
});

test('identity comes from the global file', (t) => {
  const { dir, sha } = gitFixture(t, 'identity', oneCommit);
  assert.match(sha, /^[0-9a-f]{40}$/, 'git commit succeeded with no git config call');
  assert.equal(git(dir, 'config', 'user.email'), 't@example.com');
  assert.equal(git(dir, 'config', '--local', '--list').includes('user.'), false, 'no identity in the repository config');
});
