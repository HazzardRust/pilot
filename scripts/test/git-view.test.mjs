/**
 * `gitView` (land-batching L2-L4): one command's git runner that asks a read once per epoch, forgets
 * every answer on a write, and never remembers a throw. Real git on a scratch repository.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { countGit } from './lib/count-git.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { gitView } from '../git-view.mjs';

/** A clone of a bare origin holding one commit on main. */
const clone = (t) =>
  gitFixture(t, 'git-view:clone', (dir) => {
    const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
    const origin = path.join(dir, 'origin.git');
    const work = path.join(dir, 'work');
    run(dir, 'init', '-q', '--bare', '-b', 'main', origin);
    run(dir, 'clone', '-q', origin, work);
    run(work, 'commit', '-q', '--allow-empty', '-m', 'one');
    run(work, 'push', '-q', 'origin', 'main');
    run(work, 'config', 'pilot.remote', 'origin');
    return { work };
  }).work;

test('a read is asked once per epoch', (t) => {
  const work = clone(t);
  const read = ['config', '--get', 'pilot.remote'];

  const twice = countGit(() => {
    const git = gitView(work);
    return [git(read), git(read)];
  });
  assert.deepEqual(twice.value, ['origin', 'origin']);
  assert.equal(twice.git, 1);

  const across = countGit(() => {
    const git = gitView(work);
    git(read);
    git(['fetch', '-q', 'origin']);
    return git(read);
  });
  assert.equal(across.value, 'origin');
  assert.equal(across.git, 3, 'the read, the fetch, the read again');
});

test('rev-list, diff and log are asked once per epoch', (t) => {
  const work = clone(t);
  for (const read of [['rev-list', '--count', 'HEAD'], ['diff', '--name-only', 'HEAD'], ['log', '-1', '--format=%H']]) {
    const twice = countGit(() => {
      const git = gitView(work);
      return [git(read), git(read)];
    });
    assert.equal(twice.value[0], twice.value[1]);
    assert.equal(twice.git, 1, `${read[0]} asked twice in one epoch`);

    for (const write of [['commit', '-q', '--allow-empty', '-m', 'between'], ['fetch', '-q', 'origin']]) {
      const across = countGit(() => {
        const git = gitView(work);
        git(read);
        git(write);
        git(read);
      });
      assert.equal(across.git, 3, `${read[0]}, ${write[0]}, ${read[0]} again`);
    }
  }
});

test('a diff or log that writes a file, or diffs files outside git, is never a read', (t) => {
  const work = clone(t);
  const asked = [];
  const git = gitView(work, { run: (args) => (asked.push(args.join(' ')), 'x') });
  const shapes = [['diff', '--output=d.patch', 'HEAD'], ['diff', '--output', 'd.patch'], ['log', '--output=l.txt', '-1'], ['log', '--output', 'l.txt', '-1'], ['diff', '--no-index', 'a', 'b']];
  for (const args of shapes) {
    git(args);
    git(args);
  }
  assert.equal(asked.length, shapes.length * 2);
});

test('forget drops every answer, for a write made outside the view', (t) => {
  const work = clone(t);
  const { git: spawned } = countGit(() => {
    const git = gitView(work);
    git(['rev-parse', 'HEAD']);
    git.forget();
    git(['rev-parse', 'HEAD']);
  });
  assert.equal(spawned, 2);
});

test('a throw is not remembered', (t) => {
  const work = clone(t);
  const missing = ['rev-parse', '-q', '--verify', 'refs/heads/nowhere'];
  const { git: spawned } = countGit(() => {
    const git = gitView(work);
    for (let i = 0; i < 2; i++) assert.throws(() => git(missing), (err) => err.status === 1);
  });
  assert.equal(spawned, 2);
});

test('a write is run every time, never answered from memory', (t) => {
  const work = clone(t);
  const asked = [];
  const git = gitView(work, { run: (args) => (asked.push(args.join(' ')), 'x') });
  for (const args of [['symbolic-ref', 'HEAD', 'refs/heads/other'], ['config', 'pilot.remote', 'none'], ['-c', 'a=b', 'rev-parse', 'HEAD'], ['worktree', 'add', 'd'], ['rev-parse', 'HEAD']]) {
    git(args);
    git(args);
  }
  assert.deepEqual(asked, [
    'symbolic-ref HEAD refs/heads/other', 'symbolic-ref HEAD refs/heads/other',
    'config pilot.remote none', 'config pilot.remote none',
    '-c a=b rev-parse HEAD', '-c a=b rev-parse HEAD',
    'worktree add d', 'worktree add d',
    'rev-parse HEAD',
  ]);
});
