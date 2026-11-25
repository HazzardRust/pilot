/**
 * user-pilot-branch S2 (spec 1, 2, 3; L5, L8): integrate and sync land on the user's pilot branch,
 * `pilot.branch` in the clone's local config, and still see the landings made onto the legacy
 * `pilot` before the move. The gate pins `PILOT_BRANCH=pilot` (L7), so this file unsets it before
 * anything reads it. Every case runs on a scratch bare origin under os.tmpdir(); nothing reaches a
 * real remote.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

delete process.env.PILOT_BRANCH;

const { baseOf, integrate, landedOnPilot, landingMessage, trial } = await import('../integrate.mjs');
const { sync } = await import('../sync.mjs');
const { pilotBranch } = await import('../pilot-branch.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function commitFile(repo, file, message) {
  fs.writeFileSync(path.join(repo, file), `${file}\n`);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/** origin with `main` and the seed on it; answers the paths. */
function seeded(dir) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commitFile(seed, 'main.txt', 'main');
  git(seed, 'push', '-q', 'origin', 'main');
  return { origin, seed };
}

/** A clone of `origin` at `dir/<name>` storing `branch` as its pilot branch. */
function clone(dir, origin, name, branch, at = 'main') {
  const work = path.join(dir, name);
  git(dir, 'clone', '-q', '-b', at, origin, work);
  git(work, 'config', '--local', 'pilot.branch', branch);
  return work;
}

/**
 * feat/x landed on the legacy `pilot` before the move; the move copied it to `hazzardrust-pilot`,
 * feat/y landed there after it, and the legacy `pilot` is gone from origin.
 */
function movedRepos(t) {
  return gitFixture(t, 'integrate-user-branch:moved', (dir) => {
    const { origin, seed } = seeded(dir);
    git(seed, 'checkout', '-q', '-b', 'pilot');
    for (const [head, into] of [['feat/x', 'pilot'], ['feat/y', 'hazzardrust-pilot']]) {
      if (into !== 'pilot') git(seed, 'checkout', '-q', '-B', into);
      git(seed, 'checkout', '-q', '-b', head);
      commitFile(seed, `${head.replace('/', '-')}.txt`, `${head}: work`);
      git(seed, 'checkout', '-q', into);
      git(seed, 'merge', '-q', '--no-ff', '-m', `Merge ${head} into ${into}`, head);
    }
    git(seed, 'push', '-q', 'origin', 'hazzardrust-pilot');
    return { work: clone(dir, origin, 'work', 'hazzardrust-pilot') };
  });
}

test("a slice merge names the user's branch", (t) => {
  const { work } = movedRepos(t);

  assert.equal(landingMessage('feat/x', pilotBranch((args) => git(work, ...args))), 'Merge feat/x into hazzardrust-pilot');
});

test('a pre-move landing still counts', (t) => {
  const { work } = movedRepos(t);

  assert.equal(landedOnPilot(work, 'feat/x'), true, 'landed onto the legacy pilot before the move');
  assert.equal(landedOnPilot(work, 'feat/y'), true, 'landed onto hazzardrust-pilot after the move');
  assert.equal(landedOnPilot(work, 'feat/z'), false, 'never landed');
});

test('a record based on pilot reads as the branch', (t) => {
  const { work } = movedRepos(t);
  git(work, 'checkout', '-q', '-b', 'feat/m');
  const record = path.join(work, 'docs', 'design', 'm', 'run.json');
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, `${JSON.stringify({ slug: 'm', branch: 'feat/m', base: 'pilot' }, null, 2)}\n`);

  assert.deepEqual(baseOf(work, 'origin'), { ref: 'origin/hazzardrust-pilot' });
});

test("no integration or trial onto another user's pilot branch", (t) => {
  const { work } = movedRepos(t);
  git(work, 'checkout', '-q', '-b', 'bob-pilot');

  const said = integrate(undefined, { cwd: work, test: 'node -e ""', install: () => {}, push: false });
  const tried = trial({ cwd: work });

  assert.equal(said.ok, false);
  assert.match(said.line, /refusing to integrate onto bob-pilot.*nothing merged or pushed$/);
  assert.equal(tried.ok, false);
  assert.match(tried.line, /^trial NOT run: refusing to try bob-pilot on itself/);
  assert.equal(git(work, 'ls-remote', '--heads', 'origin', 'bob-pilot'), '', 'nothing pushed');
});

test('sync touches only its own branch', (t) => {
  const { origin, a, b } = gitFixture(t, 'integrate-user-branch:two', (dir) => {
    const { origin, seed } = seeded(dir);
    git(seed, 'push', '-q', 'origin', 'main:a-pilot', 'main:b-pilot');
    commitFile(seed, 'later.txt', 'main: later');
    git(seed, 'push', '-q', 'origin', 'main');
    return { origin, a: clone(dir, origin, 'a', 'a-pilot'), b: clone(dir, origin, 'b', 'b-pilot') };
  });
  const before = git(origin, 'rev-parse', 'b-pilot');
  const passing = `node -e "console.log('ℹ pass 1'); console.log('ℹ fail 0')"`;

  const said = sync({ cwd: a, git: (args) => git(a, ...args), test: passing, keep: path.join(path.dirname(a), 'a-sync') });

  assert.equal(said.merged, true, said.line);
  assert.match(said.line, /^synced a-pilot /);
  assert.equal(git(origin, 'rev-parse', 'a-pilot'), said.sha);
  assert.equal(git(origin, 'log', '-1', '--format=%s', 'a-pilot'), 'Merge main into a-pilot');
  assert.equal(git(origin, 'rev-parse', 'b-pilot'), before, "b-pilot's tip unchanged");
  assert.equal(git(origin, 'for-each-ref', '--format=%(refname)', 'refs/heads/pilot'), '', 'no legacy pilot written');
  git(b, 'fetch', '-q', 'origin');
  assert.equal(git(b, 'rev-parse', 'origin/b-pilot'), before, "clone b fetches its branch where it was");
});
