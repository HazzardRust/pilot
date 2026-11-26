/**
 * `seed(dir, history, refs)` (test-body-git S1, L3): a fixture's origin history written by one
 * `git init --bare` and one `git fast-import`, the same history a porcelain build makes.
 */

import { gitFixture } from './git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { countGit } from './count-git.mjs';
import { seed } from './seed.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Each commit of `branch` as `subject | tree | author | parent subjects in order`, sorted. */
function shape(repo, branch) {
  const rows = git(repo, 'log', branch, '--format=%H%x09%T%x09%P%x09%an <%ae>%x09%s').split('\n').map((line) => line.split('\t'));
  const subject = new Map(rows.map(([hash, , , , s]) => [hash, s]));
  return rows.map(([, tree, parents, author, s]) => `${s} | ${tree} | ${author} | ${parents.split(' ').filter(Boolean).map((p) => subject.get(p)).join(', ')}`).sort();
}

/** `branch`'s raw commit messages, untrimmed, children first (the porcelain build's dates tie). */
const messages = (repo, branch) => execFileSync('git', ['log', '--topo-order', branch, '--format=%B%x00'], { cwd: repo, encoding: 'utf8' });

const BRANCHES =['main', 'feat/a', 'side', 'release'];

/** The porcelain way: three branches, four commits (one a merge), and `release` on feat/a's tip. */
function porcelain(dir) {
  const work = path.join(dir, 'work');
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    fs.writeFileSync(path.join(work, file), text);
  };
  git(dir, 'init', '-q', '-b', 'main', work);
  write('a.txt', 'a\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'checkout', '-q', '-b', 'feat/a');
  write('b.txt', 'b\n');
  write('dir/c.txt', 'c\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'feature');
  git(work, 'branch', 'release');
  git(work, 'checkout', '-q', '-b', 'side');
  write('a.txt', 'side\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'side work');
  git(work, 'checkout', '-q', 'main');
  git(work, 'merge', '-q', '--no-ff', '-m', 'merge feat/a', 'feat/a');
  return work;
}

const HISTORY = [
  { branch: 'main', files: { 'a.txt': 'a\n' }, message: 'base' },
  { branch: 'feat/a', files: { 'b.txt': 'b\n', 'dir/c.txt': 'c\n' }, message: 'feature' },
  { branch: 'side', files: { 'a.txt': 'side\n' }, message: 'side work' },
  { branch: 'main', files: {}, message: 'merge feat/a', merge: ['feat/a'] },
];

test('a seeded origin equals a built one', (t) => {
  const dir = gitFixture(t, 'seed:equals', (root) => root);
  const built = countGit(() => porcelain(dir));
  const seeded = countGit(() => seed(dir, HISTORY, { release: 'feat/a' }));
  const { origin, sha } = seeded.value;
  t.diagnostic(`git: porcelain ${built.git}, seed ${seeded.git}`);

  assert.equal(seeded.git, 2, `one init and one fast-import (the porcelain build took ${built.git})`);
  assert.equal(origin, path.join(dir, 'origin.git'));
  assert.equal(git(origin, 'symbolic-ref', 'HEAD'), 'refs/heads/main');
  for (const branch of BRANCHES) {
    assert.deepEqual(shape(origin, branch), shape(built.value, branch), `${branch}: trees, subjects, authors and parents`);
    assert.equal(messages(origin, branch), messages(built.value, branch), `${branch}: whole messages, trailing newline and all`);
    assert.equal(sha[branch], git(origin, 'rev-parse', branch), `${branch}: its tip in sha`);
  }
  assert.equal(sha.release, sha['feat/a'], 'a ref names the tip it was set to');
});

test('commit times count up in history order', (t) => {
  const dir = gitFixture(t, 'seed:times', (root) => root);
  const { origin } = seed(dir, HISTORY);

  const times = git(origin, 'log', '--all', '--reverse', '--topo-order', '--format=%at %ct').split('\n');
  assert.deepEqual(times.map((line) => line.split(' ')[0]), times.map((line) => line.split(' ')[1]), 'author and committer times agree');
  const at = times.map((line) => Number(line.split(' ')[0]));
  assert.deepEqual([...at].sort((a, b) => a - b), at, `topological and date order agree: ${at}`);
  assert.equal(new Set(at).size, HISTORY.length, 'no two commits share a time');
});

test('a branch or path that could break the stream is refused before any git', (t) => {
  const dir = gitFixture(t, 'seed:refused', (root) => root);
  const bad = [
    [[{ branch: 'main\nreset refs/heads/x', files: {}, message: 'm' }], undefined, /branch/],
    [[{ branch: 'main', files: { 'a\nb': 'x' }, message: 'm' }], undefined, /path/],
    [[{ branch: 'main', files: {}, message: 'm', merge: ['nowhere'] }], undefined, /nowhere/],
    [[{ branch: 'main', files: {}, message: 'm' }], { 'x y': 'main' }, /branch/],
    [[{ branch: 'main', files: {}, message: 'm' }], { pilot: 'nowhere' }, /nowhere/],
    [[{ branch: 'main', files: {}, message: 'm' }, { branch: 'side', files: {}, message: 's' }], { side: 'main' }, /already/],
  ];
  for (const [history, refs, error] of bad) {
    const { git: spawned } = countGit(() => assert.throws(() => seed(dir, history, refs), error));
    assert.equal(spawned, 0, `refused before any git: ${error}`);
  }
  assert.equal(fs.existsSync(path.join(dir, 'origin.git')), false, 'nothing written');
});
