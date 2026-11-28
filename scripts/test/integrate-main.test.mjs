/**
 * audit-f14 S3 (spec 5; L5, A7): `baseOf` for a run cut from the default branch, and where a chain ends.
 * An unchained run (record base the default branch's own name) takes the default branch, never pilot, so its PR
 * range holds only its own commits. A chained run takes `feat/<N>` until N's tip is in the default branch by
 * ancestry; N's landing on pilot does not end it. Every case runs against a scratch bare origin whose HEAD is
 * `trunk` (so nothing passes by assuming `main`) and a clone of it.
 */

import '../../deck/test/no-open.mjs';

import { gitFixture } from './lib/git-fixture.mjs';
import { seed as seedHistory } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { baseOf, integrate } = await import('../integrate.mjs');
const { chainGuard } = await import('../land.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * trunk; pilot from trunk carrying another feature x's landing; feat/a and feat/b cut from trunk, feat/c cut
 * from feat/a. `clone(branch, slug, base)` checks one out with its run record saying `base`. `next` holds the
 * commits the tests push, seeded up front and left unreferenced on origin; `move(branch, sha)` sets origin's branch
 * to one, as a push of it would.
 */
function stackRepos(t) {
  const { root, origin, next } = gitFixture(t, 'integrate-main:stackRepos', (dir) => {
    const feature = (branch, from) => ({ branch, from, files: { [`${branch.slice(5)}.txt`]: `${branch}\n` }, message: `${branch}: ${branch.slice(5)}.txt` });
    const { origin, sha } = seedHistory(dir, [
      { branch: 'trunk', files: { 'trunk.txt': 'trunk\n' }, message: 'trunk' },
      { branch: 'feat/x', from: 'trunk', files: { 'x.txt': 'x\n' }, message: 'feat/x: x.txt' },
      { branch: 'pilot', from: 'trunk', files: {}, merge: ['feat/x'], message: 'Merge feat/x into pilot' },
      feature('feat/a', 'trunk'),
      feature('feat/b', 'trunk'),
      feature('feat/c', 'feat/a'),
      { branch: 'next/trunk', from: 'trunk', files: { 'trunk2.txt': 'trunk2\n' }, message: 'trunk 2' },
      { branch: 'next/pilot-a', from: 'pilot', files: {}, merge: ['feat/a'], message: 'Merge feat/a into pilot' },
      { branch: 'next/trunk-a', from: 'trunk', files: {}, merge: ['feat/a'], message: 'Merge pull request #5 from feat/a' },
    ]);
    git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
    git(origin, 'branch', '-D', 'next/trunk', 'next/pilot-a', 'next/trunk-a');
    return { root: dir, origin, next: { trunk: sha['next/trunk'], pilotA: sha['next/pilot-a'], trunkA: sha['next/trunk-a'] } };
  });
  const move = (branch, sha) => git(origin, 'update-ref', `refs/heads/${branch}`, sha);
  const clone = (branch, slug, base) => {
    const work = path.join(root, `work-${slug}`);
    git(root, 'clone', '-q', '-b', branch, origin, work);
    const file = path.join(work, 'docs', 'design', slug, 'run.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ slug, branch, base }, null, 2)}\n`);
    return work;
  };
  return { origin, next, move, clone };
}

const quiet = { install: () => {}, test: `node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`, host: githubHost(() => { throw new Error('no gh'); }) };

test('a record base of the default branch is not read as a chain', (t) => {
  const { clone } = stackRepos(t);
  const work = clone('feat/b', 'b', 'trunk');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/trunk' });
  // S2's security MEDIUM: such a record no longer reaches the landing as if chained.
  assert.doesNotThrow(() => chainGuard({ cwd: work }));
  // A plain branch name that is not the default branch is no run base.
  const other = clone('feat/a', 'a', 'release');
  assert.throws(() => baseOf(other, 'origin'), /base "release"/);
});

test('the PR range holds only the feature', (t) => {
  const { next, move, clone } = stackRepos(t);
  const work = clone('feat/b', 'b', 'trunk');
  move('trunk', next.trunk);
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/trunk' }, 'an unchained run takes the default branch');

  const out = integrate(undefined, { cwd: work, ...quiet });
  assert.equal(out.ok, true, out.line);
  assert.match(out.line, /^took base trunk@[0-9a-f]+ at /);

  git(work, 'fetch', '-q', 'origin');
  const range = git(work, 'rev-list', 'origin/trunk..origin/feat/b').split('\n').filter(Boolean);
  const pilots = new Set(git(work, 'rev-list', 'origin/trunk..origin/pilot').split('\n').filter(Boolean));
  assert.ok(fs.existsSync(path.join(work, 'trunk2.txt')), 'trunk is taken');
  assert.ok(range.length > 0, 'b\'s own commits are in the range');
  assert.deepEqual(range.filter((id) => pilots.has(id)), [], 'no commit of pilot\'s');
  assert.doesNotMatch(git(work, 'log', '--format=%s', 'origin/trunk..origin/feat/b'), /into pilot|x\.txt/);
});

test('a chain outlives its landing on pilot', (t) => {
  const { next, move, clone } = stackRepos(t);
  const work = clone('feat/c', 'c', 'feat/a');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/feat/a', chained: 'feat/a' });
  assert.throws(() => chainGuard({ cwd: work }), /built on feat\/a, which has not landed/);

  move('pilot', next.pilotA);
  git(work, 'fetch', '-q', 'origin');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/feat/a', chained: 'feat/a' }, 'landed on pilot, not yet in trunk');
  // The landing guard's end is unchanged (L5): N on pilot first.
  assert.doesNotThrow(() => chainGuard({ cwd: work }));

  move('trunk', next.trunkA);
  git(work, 'fetch', '-q', 'origin');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/trunk' }, 'a\'s tip is in trunk');
});

test('a chain whose lower branch is gone ends only once that branch landed', (t) => {
  const { origin, next, move, clone } = stackRepos(t);
  const work = clone('feat/c', 'c', 'feat/a');
  git(origin, 'branch', '-D', 'feat/a');
  git(work, 'fetch', '-q', '--prune', 'origin');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/feat/a', chained: 'feat/a' }, 'gone unlanded: still chained');
  assert.throws(() => chainGuard({ cwd: work }), /built on feat\/a, which has not landed/);
  const gone = integrate(undefined, { cwd: work, ...quiet });
  assert.equal(gone.ok, false);
  assert.match(gone.line, /: feat\/a is gone from origin and has not landed on pilot; nothing merged or pushed$/);

  // a's landing, seeded before the delete on origin.
  move('pilot', next.pilotA);
  git(work, 'fetch', '-q', '--prune', 'origin');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/trunk' }, 'gone after landing: the default branch');
});
