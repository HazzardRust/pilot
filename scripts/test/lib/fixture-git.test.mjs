import { buildRepos, git } from './land-repos.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { countGit } from './count-git.mjs';

/**
 * The repositories `buildRepos(dir, names)` made before test-body-git S10, one git per step as it ran them after
 * land-batching S6: a frozen copy of that helper, kept as the oracle a seeded build is held to, so it is never
 * updated alongside `buildRepos`.
 */
function baseRepos(dir, names) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  const commit = (repo, file, text, message) => {
    fs.writeFileSync(path.join(repo, file), text);
    git(repo, 'add', file);
    git(repo, 'commit', '-q', '-m', message);
  };
  git(dir, 'init', '--bare', '-b', 'main', origin);
  fs.appendFileSync(path.join(origin, 'config'), '\tlogAllRefUpdates = always\n');
  git(dir, 'clone', '-q', origin, seed);
  commit(seed, 'shared.txt', 'one\n', 'main');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
  const built = { origin, seed };
  for (const name of names) {
    const work = path.join(dir, name);
    git(dir, 'clone', '-q', origin, work);
    git(work, 'checkout', '-q', '-b', `feat/${name}`, 'origin/pilot');
    commit(work, `${name}.txt`, `${name}\n`, `feat ${name}`);
    git(work, 'push', '-q', 'origin', `feat/${name}`);
    built[name] = work;
  }
  return built;
}

/**
 * What a repository under `dir` holds, commit SHAs aside: each ref's commit and parents by subject (every subject
 * is unique here), tree, and author; each reflog's entries, times aside (`landedRun` reads a branch's oldest);
 * HEAD; its config with `dir` as `<dir>`; its status and the files on disk.
 */
function shape(dir, repo, { bare = false } = {}) {
  const subjects = new Map(git(repo, 'log', '--all', '--format=%H %s').split('\n').map((line) => [line.slice(0, 40), line.slice(41)]));
  const bySubject = (shas) => shas.split(' ').filter(Boolean).map((sha) => subjects.get(sha) ?? (/^0+$/.test(sha) ? 'none' : sha));
  const logs = path.join(repo, bare ? 'logs' : '.git/logs');
  const reflogs = fs.readdirSync(logs, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(logs, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort()
    .map((ref) => [ref, fs.readFileSync(path.join(logs, ref), 'utf8').trim().split('\n').map((line) => {
      const [, from, to, who, message] = line.match(/^(\S+) (\S+) (.*?) \d+ [+-]\d{4}\t(.*)$/);
      return `${bySubject(from)} -> ${bySubject(to)} by ${who}: ${message.replaceAll(dir, '<dir>')}`;
    })]);
  const refs = git(repo, 'for-each-ref', '--format=%(refname) %(symref)|%(objectname)|%(parent)|%(tree)|%(authorname) %(authoremail)')
    .split('\n')
    .map((line) => {
      const [name, commit, parents, ...rest] = line.split('|');
      return [name, bySubject(commit), bySubject(parents), ...rest].join(' | ');
    });
  const read = (name) => fs.readFileSync(path.join(repo, bare ? name : `.git/${name}`), 'utf8');
  const config = read('config');
  return {
    refs,
    reflogs,
    head: read('HEAD'),
    config: config.replaceAll(dir.replaceAll('\\', '\\\\'), '<dir>').replaceAll(dir, '<dir>'),
    status: bare ? '' : git(repo, 'status', '--porcelain', '--branch'),
    files: bare ? [] : fs.readdirSync(repo).filter((file) => file !== '.git').map((file) => `${file}: ${fs.readFileSync(path.join(repo, file), 'utf8')}`),
  };
}

const tempDir = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-fixture-git-')));

test('a seeded buildRepos makes the same repositories', (t) => {
  const [mine, theirs] = [tempDir(), tempDir()];
  t.after(() => [mine, theirs].forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  const base = countGit(() => baseRepos(theirs, ['a', 'b']));
  const built = countGit(() => buildRepos(mine, ['a', 'b']));

  assert.deepEqual(shape(mine, built.value.origin, { bare: true }), shape(theirs, base.value.origin, { bare: true }));
  for (const repo of ['seed', 'a', 'b']) assert.deepEqual(shape(mine, built.value[repo]), shape(theirs, base.value[repo]), repo);
  assert.equal(base.git, 15);
  assert.equal(built.git, 5, 'a seed is an init and a fast-import; each repository one clone');
  assert.ok(built.git <= base.git * 0.4, `${built.git} git against the base's ${base.git}`);
});

test('clone cuts a later feature from any ref, as before', (t) => {
  const [mine, theirs] = [tempDir(), tempDir()];
  t.after(() => [mine, theirs].forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  const built = buildRepos(mine, ['a']);
  const work = built.clone('c', 'origin/feat/a');
  const base = baseRepos(theirs, ['a']);
  git(theirs, 'clone', '-q', base.origin, path.join(theirs, 'c'));
  git(path.join(theirs, 'c'), 'checkout', '-q', '-b', 'feat/c', 'origin/feat/a');
  fs.writeFileSync(path.join(theirs, 'c', 'c.txt'), 'c\n');
  git(path.join(theirs, 'c'), 'add', 'c.txt');
  git(path.join(theirs, 'c'), 'commit', '-q', '-m', 'feat c');
  git(path.join(theirs, 'c'), 'push', '-q', 'origin', 'feat/c');

  assert.deepEqual(shape(mine, work), shape(theirs, path.join(theirs, 'c')));
  assert.deepEqual(shape(mine, built.origin, { bare: true }), shape(theirs, base.origin, { bare: true }));
});
