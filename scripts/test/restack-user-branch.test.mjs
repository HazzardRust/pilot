/**
 * user-pilot-branch S4 (spec 2, 3; L1, L8, L9): after the move, `restack` retargets the signed-in user's open feature
 * PRs from the legacy `pilot` to their `<login>-pilot`, and never reads, edits or pushes another author's PR.
 * Origin is a scratch bare repository whose HEAD is `main`; the host is a stub whose `reviews` honours `mine` by each
 * PR's author, as `--author @me` does, and whose `edit` moves the PR's base. `PILOT_BRANCH` is unset here (L7), so the
 * name is derived from the stub's login.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { syncFeaturePr } from '../feature-pr.mjs';
import { restack } from '../stack.mjs';

const ME = 'HazzardRust';
const NAME = 'hazzardrust-pilot';
const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const MAIN = { branch: 'main', files: { 'x.txt': 'x\n' }, message: 'main' };

/** Origin with main, the legacy `pilot`, and feat/a, feat/b, feat/c off main; `work` is the clone restack runs in. */
function build(dir) {
  const { origin } = seed(dir, [MAIN], { pilot: 'main', 'feat/a': 'main', 'feat/b': 'main', 'feat/c': 'main' });
  const work = path.join(dir, 'work');
  run(dir, 'clone', '-q', origin, work);
  return { work };
}

/** The derivation runs: no `PILOT_BRANCH` for this test (L7). */
function unpinned(t) {
  const had = process.env.PILOT_BRANCH;
  delete process.env.PILOT_BRANCH;
  t.after(() => {
    if (had === undefined) delete process.env.PILOT_BRANCH;
    else process.env.PILOT_BRANCH = had;
  });
}

/**
 * A host signed in as `ME`: `reviews` answers copies, filtered by head, state and, under `mine`, author; `edit` moves
 * the stored PR's base, as the next `reviews` reads it.
 */
function stubHost(prs) {
  const edits = [];
  const host = {
    login: () => ME,
    reviews: ({ head, state, mine = false }) =>
      prs
        .filter((pr) => (head === undefined || pr.head === head) && (state === 'all' || pr.state === state) && (!mine || pr.author === ME))
        .map((pr) => ({ ...pr })),
    edit: (number, change) => {
      edits.push([number, change]);
      const pr = prs.find((one) => one.number === number);
      if (change.base) pr.base = change.base;
      return {};
    },
  };
  return { host, edits };
}

const pr = (over) => ({ state: 'open', base: 'pilot', headSha: 'a'.repeat(40), body: '', crossRepo: false, author: ME, ...over });

/** `restack` in `work`, every git argv it runs kept in `calls`. */
function restackIn(work, host) {
  const calls = [];
  const git = (args) => (calls.push(args), run(work, ...args));
  return { ...restack({ cwd: work, git, host }), calls };
}

const repos = (t) => gitFixture(t, 'restack-user-branch', build);

test('the move retargets the user\'s pilot PRs', (t) => {
  unpinned(t);
  const { work } = repos(t);
  const { host, edits } = stubHost([pr({ number: 1, head: 'feat/a' }), pr({ number: 2, head: 'feat/b' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, [`retargeted #1 to ${NAME}`, `retargeted #2 to ${NAME}`]);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(edits, [[1, { base: NAME }], [2, { base: NAME }]]);
});

test('another user\'s PRs are untouched', (t) => {
  unpinned(t);
  const { work } = repos(t);
  const theirs = pr({ number: 3, head: 'feat/c', author: 'someone-else' });
  const { host, edits } = stubHost([pr({ number: 1, head: 'feat/a' }), theirs]);

  const out = restackIn(work, host);

  assert.deepEqual(edits, [[1, { base: NAME }]]);
  assert.equal(theirs.base, 'pilot');
  assert.ok(!out.lines.some((line) => line.includes('#3')), out.lines.join('\n'));
  assert.deepEqual(out.calls.filter((args) => args[0] === 'push'), []);
});

/**
 * After the move: origin's `NAME` holds feat/b's landing under the legacy subject (`into pilot`), copied from the legacy
 * pilot, and feat/a gains a fix after feat/b was cut from it. No `pilot` on origin, so only `NAME` can show the landing.
 */
function buildMoved(dir) {
  // NAME's merge has feat/b's tree, as the `commit-tree feat/b^{tree}` the porcelain build ran gave it.
  const { origin } = seed(dir, [
    MAIN,
    { branch: 'feat/a', files: { 'a.txt': 'a\n' }, message: 'feat a' },
    { branch: 'feat/b', files: { 'b.txt': 'b\n' }, message: 'feat b' },
    { branch: NAME, from: 'main', files: {}, merge: ['feat/b'], message: 'Merge feat/b into pilot' },
    { branch: 'feat/a', files: { 'a.txt': 'a fixed\n' }, message: 'fix a' },
  ]);
  const work = path.join(dir, 'work');
  run(dir, 'clone', '-q', origin, work);
  return { work };
}

test('a landing copied from the legacy pilot still merges forward', (t) => {
  unpinned(t);
  const { work } = gitFixture(t, 'restack-user-branch:moved', buildMoved);
  const { host, edits } = stubHost([pr({ number: 2, head: 'feat/b', base: 'feat/a' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['merged feat/a into feat/b']);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(edits, []);
});

test('pilot pr with host none and no base reads no name', (t) => {
  unpinned(t);
  const { work } = repos(t);

  const out = syncFeaturePr({ host: null, git: (args) => run(work, ...args), record: { slug: 'abc' } });

  assert.deepEqual(out, { line: 'no PR: host none', wrote: 'none' });
});

test('a second restack is level', (t) => {
  unpinned(t);
  const { work } = repos(t);
  const { host, edits } = stubHost([pr({ number: 1, head: 'feat/a' }), pr({ number: 2, head: 'feat/b' })]);
  restackIn(work, host);

  const again = restackIn(work, host);

  assert.deepEqual(again.lines, ['level #1', 'level #2']);
  assert.equal(again.exitCode, 0);
  assert.equal(edits.length, 2);
});
