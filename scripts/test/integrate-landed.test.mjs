/**
 * A feature already landed on `pilot` takes no base when a slice is integrated into it
 * (red-lands-on-pilot spec 3; L6): `pilot` by then holds later features, and taking it would
 * pull them into this feature's PR. Landing is read from `Merge <head> into pilot` on
 * `origin/pilot`'s first-parent history. Every case runs on a scratch bare origin under
 * os.tmpdir(); nothing reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate, landedOnPilot, landingMessage } = await import('../integrate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const short = (cwd, ref) => git(cwd, 'rev-parse', '--short', ref);

function commitFile(repo, file, message) {
  fs.writeFileSync(path.join(repo, file), `${file}\n`);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/** In `seed`, cut `feature` from `from` with one commit, push it, and come back to `pilot`. */
function feature(seed, name, from = 'pilot') {
  git(seed, 'checkout', '-q', '-b', name, from);
  commitFile(seed, `${name.replace('/', '-')}.txt`, `${name}: work`);
  git(seed, 'push', '-q', 'origin', name);
  git(seed, 'checkout', '-q', 'pilot');
}

/** Merge `name` into `into` the way `pilot land` words it, on first parents unless `into` is a side branch. */
function land(seed, name, into = 'pilot', message = landingMessage(name)) {
  git(seed, 'checkout', '-q', into);
  git(seed, 'merge', '-q', '--no-ff', '-m', message, name);
  git(seed, 'push', '-q', 'origin', into);
  git(seed, 'checkout', '-q', 'pilot');
}

/**
 * origin with main and pilot; feat/a landed, then feat/b (cut on pilot after A) landed;
 * feat/c never landed; feat/d's merge message reaches pilot only as a second parent.
 * A slice is pushed off feat/a and feat/c. Answers the clone `work` and B's commit.
 */
function repos(t) {
  return gitFixture(t, 'integrate-landed:repos', buildRepos);
}

function buildRepos(dir) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  const work = path.join(dir, 'work');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commitFile(seed, 'main.txt', 'main');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
  git(seed, 'checkout', '-q', '-b', 'pilot', 'origin/pilot');
  feature(seed, 'feat/a');
  feature(seed, 'feat/c');
  land(seed, 'feat/a');
  feature(seed, 'feat/b');
  land(seed, 'feat/b');
  const bCommit = git(seed, 'rev-parse', 'feat/b');
  feature(seed, 'feat/d');
  git(seed, 'checkout', '-q', '-b', 'side', 'pilot');
  land(seed, 'feat/d', 'side');
  land(seed, 'side', 'pilot', 'Merge side');
  for (const [slice, from] of [['slice/a-s2', 'feat/a'], ['slice/c-s1', 'feat/c']]) {
    git(seed, 'checkout', '-q', '-b', slice, from);
    commitFile(seed, `${slice.replace('/', '-')}.txt`, `${slice}: the slice`);
    git(seed, 'push', '-q', 'origin', slice);
  }
  git(dir, 'clone', '-q', origin, work);
  return { work, bCommit };
}

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const quiet = { findPr: () => null, install: () => {}, test: passing, push: false };

test("a landed feature's integration takes no base", (t) => {
  const { work, bCommit } = repos(t);
  git(work, 'checkout', '-q', 'feat/a');

  const result = integrate('slice/a-s2', { cwd: work, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.equal(result.line, `integrated slice/a-s2 at ${short(work, 'HEAD')} (base skipped: feat/a is on pilot): 3 pass, 0 fail; not pushed (--no-push)`);
  assert.notEqual(spawnStatus(work, 'merge-base', '--is-ancestor', bCommit, 'HEAD'), 0, "B's commit stays out of feat/a");
  assert.equal(git(work, 'rev-parse', 'HEAD^1'), git(work, 'rev-parse', 'origin/feat/a'), 'the slice merges straight onto feat/a');
  assert.equal(git(work, 'rev-parse', 'HEAD^2'), git(work, 'rev-parse', 'origin/slice/a-s2'));
});

test('an unlanded feature still takes the base', (t) => {
  const { work } = repos(t);
  git(work, 'checkout', '-q', 'feat/c');

  const result = integrate('slice/c-s1', { cwd: work, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.ok(result.line.includes(`(base pilot@${short(work, 'origin/pilot')})`), result.line);
  assert.equal(git(work, 'log', '-1', '--format=%s', 'HEAD^1'), 'Merge base pilot');
  assert.equal(git(work, 'rev-parse', 'HEAD^1^2'), git(work, 'rev-parse', 'origin/pilot'));
});

test('landing is read from the first-parent history', (t) => {
  const { work } = repos(t);

  assert.equal(landedOnPilot(work, 'feat/a'), true);
  assert.equal(landedOnPilot(work, 'feat/b'), true);
  assert.equal(landedOnPilot(work, 'feat/c'), false, 'never landed');
  assert.equal(landedOnPilot(work, 'feat/d'), false, 'its merge message is on a second parent only');
  assert.equal(landedOnPilot(work, 'feat'), false, 'a prefix of a landed head is not landed');
});

test('a one-parent commit with the subject, or a new branch reusing a landed slug, is not landed', (t) => {
  const { work } = repos(t);
  git(work, 'checkout', '-q', '--detach', 'origin/pilot');
  git(work, 'commit', '-q', '--allow-empty', '-m', landingMessage('feat/e'));
  git(work, 'push', '-q', 'origin', 'HEAD:pilot');
  git(work, 'checkout', '-q', 'main');
  git(work, 'fetch', '-q', 'origin');
  assert.equal(landedOnPilot(work, 'feat/e'), false, 'a squash titled as a landing is not one');

  git(work, 'checkout', '-q', '-B', 'feat/a', 'origin/pilot');
  assert.equal(landedOnPilot(work, 'feat/a'), false, 'its own landing merge is behind it');
});

test('a landed feature with no slice and nothing to merge pushes nothing', (t) => {
  const { work } = repos(t);
  git(work, 'checkout', '-q', 'feat/a');
  const before = git(work, 'rev-parse', 'origin/feat/a');

  const result = integrate(undefined, { cwd: work, ...quiet, push: true });

  assert.equal(result.ok, true, result.line);
  assert.equal(result.line, `base skipped: feat/a is on pilot, at ${short(work, 'HEAD')}: 3 pass, 0 fail; nothing to push`);
  assert.equal(git(work, 'ls-remote', 'origin', 'refs/heads/feat/a').split('\t')[0], before);
});

function spawnStatus(cwd, ...args) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return 0;
  } catch (err) {
    return err.status;
  }
}
