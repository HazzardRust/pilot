/**
 * A feature already landed on `pilot` takes no base when a slice is integrated into it
 * (red-lands-on-pilot spec 3; L6): `pilot` by then holds later features, and taking it would
 * pull them into this feature's PR. Landing is read from `Merge <head> into pilot` on
 * `origin/pilot`'s first-parent history. Every case runs on a scratch bare origin under
 * os.tmpdir(); nothing reaches a real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { integrate, landedOnPilot, landingMessage } = await import('../integrate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const short = (cwd, ref) => git(cwd, 'rev-parse', '--short', ref);

/** One commit adding `<branch with - for />.txt`, cut from `from`'s tip when given. */
function commitFile(branch, message, from) {
  const file = `${branch.replace('/', '-')}.txt`;
  return { branch, from, files: { [file]: `${file}\n` }, message };
}

/** A feature cut from `from` (pilot by default) with one commit. */
const feature = (name, from = 'pilot') => commitFile(name, `${name}: work`, from);

/** `name` merged into `into` the way `pilot land` words it; `from` cuts `into` when it is new. */
const land = (name, into = 'pilot', { message = landingMessage(name, into), from } = {}) => ({ branch: into, from, files: {}, merge: [name], message });

/**
 * origin with main and pilot; feat/a landed, then feat/b (cut on pilot after A) landed;
 * feat/c never landed; feat/d's merge message reaches pilot only as a second parent.
 * A slice is pushed off feat/a and feat/c; then `later`'s commits. Answers the clone `work`,
 * B's commit and feat/a's tip `aTip`.
 */
function repos(t, key = 'repos', later = []) {
  return gitFixture(t, `integrate-landed:${key}`, (dir) => buildRepos(dir, later));
}

function buildRepos(dir, later) {
  const work = path.join(dir, 'work');
  const { origin, sha } = seed(dir, [
    { branch: 'main', files: { 'main.txt': 'main.txt\n' }, message: 'main' },
    feature('feat/a', 'main'),
    feature('feat/c', 'main'),
    land('feat/a', 'pilot', { from: 'main' }),
    feature('feat/b'),
    land('feat/b'),
    feature('feat/d'),
    land('feat/d', 'side', { from: 'pilot' }),
    land('side', 'pilot', { message: 'Merge side' }),
    commitFile('slice/a-s2', 'slice/a-s2: the slice', 'feat/a'),
    commitFile('slice/c-s1', 'slice/c-s1: the slice', 'feat/c'),
    ...later,
  ]);
  git(dir, 'clone', '-q', origin, work);
  return { work, bCommit: sha['feat/b'], aTip: sha['feat/a'] };
}

/** Several refs in one rev-parse (L5): each assert still reads its own. */
const revs = (cwd, ...refs) => git(cwd, 'rev-parse', ...refs).split('\n');

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const quiet = { install: () => {}, test: passing, push: false };

test("a landed feature's integration takes no base", (t) => {
  const { work, bCommit } = repos(t);
  git(work, 'checkout', '-q', 'feat/a');

  const result = integrate('slice/a-s2', { cwd: work, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.equal(result.line, `integrated slice/a-s2 at ${short(work, 'HEAD')} (base skipped: feat/a is on pilot): 3 pass, 0 fail; not pushed (--no-push)`);
  assert.notEqual(spawnStatus(work, 'merge-base', '--is-ancestor', bCommit, 'HEAD'), 0, "B's commit stays out of feat/a");
  const [first, feat, second, slice] = revs(work, 'HEAD^1', 'origin/feat/a', 'HEAD^2', 'origin/slice/a-s2');
  assert.equal(first, feat, 'the slice merges straight onto feat/a');
  assert.equal(second, slice);
});

test('an unlanded feature still takes the base', (t) => {
  const { work } = repos(t);
  git(work, 'checkout', '-q', 'feat/c');

  const result = integrate('slice/c-s1', { cwd: work, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.ok(result.line.includes(`(base pilot@${short(work, 'origin/pilot')})`), result.line);
  assert.equal(git(work, 'log', '-1', '--format=%s', 'HEAD^1'), 'Merge base pilot');
  const [base, pilot] = revs(work, 'HEAD^1^2', 'origin/pilot');
  assert.equal(base, pilot);
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
  // pilot then gains an empty one-parent commit carrying feat/e's landing subject.
  const { work } = repos(t, 'squash', [{ branch: 'pilot', files: {}, message: landingMessage('feat/e', 'pilot') }]);
  assert.equal(landedOnPilot(work, 'feat/e'), false, 'a squash titled as a landing is not one');

  git(work, 'checkout', '-q', '-B', 'feat/a', 'origin/pilot');
  assert.equal(landedOnPilot(work, 'feat/a'), false, 'its own landing merge is behind it');
});

test('a landed feature with no slice and nothing to merge pushes nothing', (t) => {
  const { work, aTip: before } = repos(t);
  git(work, 'checkout', '-q', 'feat/a');

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
