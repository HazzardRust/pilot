/**
 * user-pilot-branch S4 (spec 2, 3; L1, L8, L9): after the move, `restack` retargets the signed-in user's open feature
 * PRs from the legacy `pilot` to their `<login>-pilot`, and never reads, edits or pushes another author's PR.
 * Origin is a scratch bare repository whose HEAD is `main`; the host is a stub whose `reviews` honours `mine` by each
 * PR's author, as `--author @me` does, and whose `edit` moves the PR's base. `PILOT_BRANCH` is unset here (L7), so the
 * name is derived from the stub's login.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { restack } from '../stack.mjs';

const ME = 'HazzardRust';
const NAME = 'hazzardrust-pilot';
const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Origin with main, the legacy `pilot`, and feat/a, feat/b, feat/c off main; `work` is the clone restack runs in. */
function build(dir) {
  const origin = path.join(dir, 'origin.git');
  run(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(dir, 'seed');
  run(dir, 'clone', '-q', origin, seed);
  run(seed, 'checkout', '-q', '-b', 'main');
  fs.writeFileSync(path.join(seed, 'x.txt'), 'x\n');
  run(seed, 'add', 'x.txt');
  run(seed, 'commit', '-q', '-m', 'main');
  for (const branch of ['pilot', 'feat/a', 'feat/b', 'feat/c']) run(seed, 'branch', branch);
  run(seed, 'push', '-q', 'origin', 'main', 'pilot', 'feat/a', 'feat/b', 'feat/c');
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
