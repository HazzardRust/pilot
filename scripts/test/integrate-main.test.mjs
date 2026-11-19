/**
 * audit-f14 S3 (spec 5; L5, A7): `baseOf` for a run cut from the default branch, and where a chain ends.
 * An unchained run (record base the default branch's own name) takes the default branch, never pilot, so its PR
 * range holds only its own commits. A chained run takes `feat/<N>` until N's tip is in the default branch by
 * ancestry; N's landing on pilot does not end it. Every case runs against a scratch bare origin whose HEAD is
 * `trunk` (so nothing passes by assuming `main`) and a clone of it.
 */

import '../../deck/test/no-open.mjs';

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { baseOf, integrate } = await import('../integrate.mjs');
const { chainGuard } = await import('../land.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function commitFile(work, file, text, message) {
  fs.writeFileSync(path.join(work, file), text);
  git(work, 'add', file);
  git(work, 'commit', '-q', '-m', message);
}

/** `branch` merged into `into` with `message`, as a two-parent commit, pushed from `seed`. */
function mergeInto(seed, into, branch, message) {
  git(seed, 'fetch', '-q', 'origin');
  git(seed, 'checkout', '-q', into);
  git(seed, 'reset', '-q', '--hard', `origin/${into}`);
  git(seed, 'merge', '-q', '--no-ff', '-m', message, `origin/${branch}`);
  git(seed, 'push', '-q', 'origin', into);
}

/**
 * trunk; pilot from trunk carrying another feature x's landing; feat/a and feat/b cut from trunk, feat/c cut
 * from feat/a. `clone(branch, slug, base)` checks one out with its run record saying `base`.
 */
function stackRepos(t) {
  const { root, origin, seed } = gitFixture(t, 'integrate-main:stackRepos', (dir) => {
    const origin = path.join(dir, 'origin.git');
    const seed = path.join(dir, 'seed');
    git(dir, 'init', '--bare', '-b', 'trunk', origin);
    git(dir, 'clone', '-q', origin, seed);
    git(seed, 'checkout', '-q', '-b', 'trunk');
    commitFile(seed, 'trunk.txt', 'trunk\n', 'trunk');
    git(seed, 'push', '-q', 'origin', 'trunk', 'trunk:pilot');
    git(seed, 'checkout', '-q', '-b', 'feat/x');
    commitFile(seed, 'x.txt', 'x\n', 'feat/x: x.txt');
    git(seed, 'push', '-q', 'origin', 'feat/x');
    mergeInto(seed, 'pilot', 'feat/x', 'Merge feat/x into pilot');
    for (const [branch, from] of [['feat/a', 'origin/trunk'], ['feat/b', 'origin/trunk'], ['feat/c', 'origin/feat/a']]) {
      git(seed, 'fetch', '-q', 'origin');
      git(seed, 'checkout', '-q', '-b', branch, from);
      commitFile(seed, `${branch.slice(5)}.txt`, `${branch}\n`, `${branch}: ${branch.slice(5)}.txt`);
      git(seed, 'push', '-q', 'origin', branch);
    }
    return { root: dir, origin, seed };
  });
  const clone = (branch, slug, base) => {
    const work = path.join(root, `work-${slug}`);
    git(root, 'clone', '-q', '-b', branch, origin, work);
    const file = path.join(work, 'docs', 'design', slug, 'run.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ slug, branch, base }, null, 2)}\n`);
    return work;
  };
  return { seed, clone };
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
  const { seed, clone } = stackRepos(t);
  const work = clone('feat/b', 'b', 'trunk');
  git(seed, 'checkout', '-q', 'trunk');
  commitFile(seed, 'trunk2.txt', 'trunk2\n', 'trunk 2');
  git(seed, 'push', '-q', 'origin', 'trunk');
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
  const { seed, clone } = stackRepos(t);
  const work = clone('feat/c', 'c', 'feat/a');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/feat/a', chained: 'feat/a' });
  assert.throws(() => chainGuard({ cwd: work }), /built on feat\/a, which has not landed/);

  mergeInto(seed, 'pilot', 'feat/a', 'Merge feat/a into pilot');
  git(work, 'fetch', '-q', 'origin');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/feat/a', chained: 'feat/a' }, 'landed on pilot, not yet in trunk');
  // The landing guard's end is unchanged (L5): N on pilot first.
  assert.doesNotThrow(() => chainGuard({ cwd: work }));

  mergeInto(seed, 'trunk', 'feat/a', 'Merge pull request #5 from feat/a');
  git(work, 'fetch', '-q', 'origin');
  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/trunk' }, 'a\'s tip is in trunk');
});
