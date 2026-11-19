/**
 * audit-f14 S8 (spec 6, 8; L3, L12): after the lower feature A is squash-merged into main, `restack` rebases the
 * upper branch B onto main and pushes it leased on the tip it fetched, only when B has landed on pilot. Origin is a
 * scratch bare repository whose HEAD is `main`, every ref update logged; the host is a stub answering `reviews` by
 * its query. The tests read only origin's refs, origin's ref logs and restack's lines.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { restack } from '../stack.mjs';
import { sync } from '../sync.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tip = (origin, branch) => run(origin, 'rev-parse', `refs/heads/${branch}`);

function commit(repo, files, message) {
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(repo, file), text);
  run(repo, 'add', ...Object.keys(files));
  run(repo, 'commit', '-q', '-m', message);
}

/** Merges origin's `branch` into pilot in `seed` with the landing's subject, and pushes pilot. */
function land(seed, branch) {
  run(seed, 'checkout', '-q', 'pilot');
  run(seed, 'merge', '-q', '--no-ff', '-m', `Merge ${branch} into pilot`, `origin/${branch}`);
  run(seed, 'push', '-q', 'origin', 'pilot');
}

/**
 * Origin with main, pilot off main, feat/a off main and feat/b off feat/a (two commits); A, and B when `landed`,
 * merged into pilot; then A squashed into main, as the user's squash button does. `work` is restack's checkout.
 */
function build(dir, landed) {
  const origin = path.join(dir, 'origin.git');
  run(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  run(origin, 'config', 'core.logAllRefUpdates', 'always');
  const seed = path.join(dir, 'seed');
  run(dir, 'clone', '-q', origin, seed);
  run(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, { 'x.txt': 'x\n' }, 'main');
  run(seed, 'branch', 'pilot');
  run(seed, 'push', '-q', 'origin', 'main', 'pilot');
  run(seed, 'checkout', '-q', '-b', 'feat/a', 'main');
  commit(seed, { 'a.txt': 'a\n' }, 'feat a');
  run(seed, 'checkout', '-q', '-b', 'feat/b', 'feat/a');
  commit(seed, { 'b.txt': 'b\n' }, 'feat b one');
  commit(seed, { 'b2.txt': 'b2\n' }, 'feat b two');
  run(seed, 'push', '-q', 'origin', 'feat/a', 'feat/b');
  run(seed, 'fetch', '-q', 'origin');
  land(seed, 'feat/a');
  if (landed) land(seed, 'feat/b');
  run(seed, 'checkout', '-q', 'main');
  run(seed, 'merge', '-q', '--squash', 'origin/feat/a');
  run(seed, 'commit', '-q', '-m', 'feat a (#1)');
  run(seed, 'push', '-q', 'origin', 'main');
  const work = path.join(dir, 'work');
  run(dir, 'clone', '-q', origin, work);
  return { origin, seed, work, aTip: tip(origin, 'feat/a') };
}

const repos = (t, landed = true) => gitFixture(t, `restack-squash:${landed}`, (dir) => build(dir, landed));

function stubHost(prs) {
  return {
    reviews: ({ head, state }) => prs.filter((pr) => (head === undefined || pr.head === head) && (state === 'all' || pr.state === state)),
    edit: () => ({}),
  };
}

const pr = (over) => ({ number: 1, state: 'open', base: 'main', head: 'feat/a', headSha: 'a'.repeat(40), body: '', crossRepo: false, ...over });
const squashed = (aTip) => stubHost([pr({ number: 1, head: 'feat/a', state: 'merged', headSha: aTip }), pr({ number: 2, head: 'feat/b', base: 'feat/a' })]);

/** `restack` in `work`; `beforePush` runs ahead of each push restack makes; every git argv kept in `calls`. */
function restackIn(work, host, beforePush = () => {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'push') beforePush();
    return run(work, ...args);
  };
  return { ...restack({ cwd: work, git, host }), calls };
}

/** Origin's logged updates of `branch` that were not fast-forwards: `[old, new]` pairs. */
function forcedUpdates(origin, branch) {
  const log = path.join(origin, 'logs', 'refs', 'heads', branch);
  if (!fs.existsSync(log)) return [];
  const zero = '0'.repeat(40);
  return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean)
    .map((line) => line.split(' ').slice(0, 2))
    .filter(([old, now]) => old !== zero && now !== zero && !isAncestor(origin, old, now));
}

function isAncestor(repo, a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('a squash leaves B with only its commits', (t) => {
  const { origin, work, aTip } = repos(t);
  const before = tip(origin, 'feat/b');

  const out = restackIn(work, squashed(aTip));

  assert.deepEqual(out.lines, ['retargeted #2 to main', 'rebased feat/b onto main (squash of feat/a)']);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(run(origin, 'log', '--format=%s', 'main..feat/b').split('\n'), ['feat b two', 'feat b one']);
  assert.ok(isAncestor(origin, tip(origin, 'main'), tip(origin, 'feat/b')), 'feat/b stands on main');
  const pushes = out.calls.filter((args) => args[0] === 'push');
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0].includes(`--force-with-lease=refs/heads/feat/b:${before}`), pushes[0].join(' '));
});

test('the lease holds', (t) => {
  const { origin, seed, work, aTip } = repos(t);
  let moved;
  const elsewhere = () => {
    if (moved) return;
    run(seed, 'checkout', '-q', '-B', 'feat/b', 'origin/feat/b');
    commit(seed, { 'b3.txt': 'b3\n' }, 'pushed by hand');
    run(seed, 'push', '-q', 'origin', 'feat/b');
    moved = tip(origin, 'feat/b');
  };

  const out = restackIn(work, squashed(aTip), elsewhere);

  assert.deepEqual(out.lines, ['retargeted #2 to main', 'not rebased feat/b: moved since fetched']);
  assert.equal(out.exitCode, 1);
  assert.equal(tip(origin, 'feat/b'), moved);
  assert.deepEqual(forcedUpdates(origin, 'feat/b'), []);
});

test('an unlanded run is never rewritten', (t) => {
  const { origin, work, aTip } = repos(t, false);
  const before = tip(origin, 'feat/b');

  const out = restackIn(work, squashed(aTip));

  assert.deepEqual(out.lines, ['retargeted #2 to main', 'not rebased feat/b: not landed on pilot']);
  assert.equal(tip(origin, 'feat/b'), before);
  assert.deepEqual(out.calls.filter((args) => args[0] === 'push'), []);
});

test('pilot is never forced', (t) => {
  const { origin, work, aTip } = repos(t);

  const out = restackIn(work, squashed(aTip));
  const synced = sync({ cwd: work, test: () => assert.fail('nothing is tested') });

  assert.equal(out.exitCode, 0);
  assert.equal(forcedUpdates(origin, 'feat/b').length, 1, 'the one forced update is feat/b');
  assert.deepEqual(forcedUpdates(origin, 'pilot'), []);
  assert.deepEqual(forcedUpdates(origin, 'main'), []);
  assert.equal(synced.line, `pilot already has main@${tip(origin, 'main').slice(0, 7)}`);
  assert.equal(synced.merged, false);
});
