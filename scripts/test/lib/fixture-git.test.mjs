import { buildRepos, git } from './land-repos.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { countGit } from './count-git.mjs';

/**
 * The repositories `buildRepos(dir, ['a'])` made before land-batching S6, one git per step as it ran them: a frozen
 * copy of that helper, kept as the oracle a fold is held to, so it is never updated alongside `buildRepos`.
 */
function baseRepos(dir) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  const work = path.join(dir, 'a');
  const commit = (repo, file, text, message) => {
    fs.writeFileSync(path.join(repo, file), text);
    git(repo, 'add', file);
    git(repo, 'commit', '-q', '-m', message);
  };
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(origin, 'config', 'core.logAllRefUpdates', 'always');
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, 'shared.txt', 'one\n', 'main');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
  git(dir, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'feat/a', 'origin/pilot');
  commit(work, 'a.txt', 'a\n', 'feat a');
  git(work, 'push', '-q', 'origin', 'feat/a');
  return { origin, seed, a: work };
}

/**
 * What a repository under `dir` holds, commit SHAs aside: each ref's tree, subject, author and
 * parent count, HEAD, its config with `dir` as `<dir>`, and its status.
 */
function shape(dir, repo, { bare = false } = {}) {
  const refs = git(repo, 'for-each-ref', '--format=%(refname) %(tree) %(subject) | %(authorname) %(authoremail) [%(parent)]')
    .split('\n')
    .map((line) => line.replace(/\[[0-9a-f]{40}\]$/, '[1 parent]'));
  const read = (name) => fs.readFileSync(path.join(repo, bare ? name : `.git/${name}`), 'utf8');
  const config = read('config');
  return {
    refs,
    head: read('HEAD'),
    config: config.replaceAll(dir.replaceAll('\\', '\\\\'), '<dir>').replaceAll(dir, '<dir>'),
    status: bare ? '' : git(repo, 'status', '--porcelain', '--branch'),
  };
}

const tempDir = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-fixture-git-')));

test('buildRepos makes the repositories the base helper made, with fewer git', (t) => {
  const [mine, theirs] = [tempDir(), tempDir()];
  t.after(() => [mine, theirs].forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  const base = countGit(() => baseRepos(theirs));
  const built = countGit(() => buildRepos(mine, ['a']));

  assert.deepEqual(shape(mine, built.value.origin, { bare: true }), shape(theirs, base.value.origin, { bare: true }));
  assert.deepEqual(shape(mine, built.value.seed), shape(theirs, base.value.seed));
  assert.deepEqual(shape(mine, built.value.a), shape(theirs, base.value.a));
  assert.equal(base.git, 12);
  assert.equal(built.git, 10);
});
