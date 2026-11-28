/**
 * audit-f14 S8 (spec 6, 8; L3, L12): after the lower feature A is squash-merged into main, `restack` rebases the
 * upper branch B onto main and pushes it leased on the tip it fetched, only when B has landed on pilot. Origin is a
 * scratch bare repository whose HEAD is `main`, every ref update logged; the host is a stub answering `reviews` by
 * its query. The tests read only origin's refs, origin's ref logs and restack's lines.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { restack } from '../stack.mjs';
import { sync } from '../sync.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tip = (origin, branch) => run(origin, 'rev-parse', `refs/heads/${branch}`);

/**
 * Origin with main, feat/a off main and feat/b off feat/a (two commits); pilot off main with A, and B when `landed`,
 * merged in with the landing's subject; then A squashed into main, as the user's squash button does, and `after`.
 * `hand/b` is feat/b plus one commit, the tip a push by hand would leave. Every later ref update is logged; `work`
 * is restack's checkout.
 */
function build(dir, landed, after) {
  const { origin, sha } = seed(dir, [
    { branch: 'main', files: { 'x.txt': 'x\n' }, message: 'main' },
    { branch: 'feat/a', files: { 'a.txt': 'a\n' }, message: 'feat a' },
    { branch: 'feat/b', files: { 'b.txt': 'b\n' }, message: 'feat b one' },
    { branch: 'feat/b', files: { 'b2.txt': 'b2\n' }, message: 'feat b two' },
    { branch: 'hand/b', from: 'feat/b', files: { 'b3.txt': 'b3\n' }, message: 'pushed by hand' },
    { branch: 'pilot', from: 'main', merge: ['feat/a'], files: {}, message: 'Merge feat/a into pilot' },
    ...(landed ? [{ branch: 'pilot', merge: ['feat/b'], files: {}, message: 'Merge feat/b into pilot' }] : []),
    { branch: 'main', files: { 'a.txt': 'a\n' }, message: 'feat a (#1)' },
    ...after,
  ]);
  // `git config core.logAllRefUpdates always`, as a line on the [core] that ends a new bare config: no git.
  fs.appendFileSync(path.join(origin, 'config'), '\tlogAllRefUpdates = always\n');
  const work = path.join(dir, 'work');
  run(dir, 'clone', '-q', origin, work);
  return { origin, work, sha, aTip: sha['feat/a'] };
}

const repos = (t, landed = true, after = []) => gitFixture(t, `restack-squash:${landed}:${after.map((c) => c.message)}`, (dir) => build(dir, landed, after));

/** A host whose `reviews` filters `prs` by the query's head and state; every edit is kept in `host.edits`. */
function stubHost(prs) {
  const edits = [];
  return {
    edits,
    reviews: ({ head, state }) => prs.filter((pr) => (head === undefined || pr.head === head) && (state === 'all' || pr.state === state)),
    edit: (number, change) => (edits.push([number, change]), {}),
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
  const { origin, work, sha, aTip } = repos(t);
  const before = sha['feat/b'];

  const host = squashed(aTip);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['rebased feat/b onto main (squash of feat/a)', 'retargeted #2 to main']);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(host.edits, [[2, { base: 'main' }]]);
  assert.deepEqual(run(origin, 'log', '--format=%s', 'main..feat/b').split('\n'), ['feat b two', 'feat b one']);
  assert.ok(isAncestor(origin, tip(origin, 'main'), tip(origin, 'feat/b')), 'feat/b stands on main');
  const pushes = out.calls.filter((args) => args[0] === 'push');
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0].includes(`--force-with-lease=refs/heads/feat/b:${before}`), pushes[0].join(' '));
});

test('the lease holds', (t) => {
  const { origin, work, sha, aTip } = repos(t);
  let moved;
  const elsewhere = () => {
    if (moved) return;
    run(origin, 'update-ref', 'refs/heads/feat/b', sha['hand/b'], sha['feat/b']);
    moved = sha['hand/b'];
  };

  const host = squashed(aTip);

  const out = restackIn(work, host, elsewhere);

  assert.deepEqual(out.lines, ['not rebased feat/b: moved since fetched']);
  assert.equal(out.exitCode, 1);
  assert.deepEqual(host.edits, [], 'left on feat/a for the next restack');
  assert.equal(tip(origin, 'feat/b'), moved);
  assert.deepEqual(forcedUpdates(origin, 'feat/b'), []);
});

test('an unlanded run is never rewritten', (t) => {
  const { origin, work, sha, aTip } = repos(t, false);
  const before = sha['feat/b'];

  const out = restackIn(work, squashed(aTip));

  assert.deepEqual(out.lines, ['not rebased feat/b: not landed on pilot']);
  assert.equal(out.exitCode, 0);
  assert.equal(tip(origin, 'feat/b'), before);
});

test('a rebase that conflicts is a failure, not a hand conflict', (t) => {
  const { origin, work, sha, aTip } = repos(t, true, [{ branch: 'main', files: { 'b.txt': 'main\n' }, message: 'main takes b.txt' }]);
  const before = sha['feat/b'];

  const out = restackIn(work, squashed(aTip));

  assert.deepEqual(out.lines, ['not rebased feat/b: conflict rebasing onto main']);
  assert.equal(out.exitCode, 1);
  assert.equal(tip(origin, 'feat/b'), before);
});

test('a squashed lower that is no plain feat/ branch is refused', (t) => {
  const { origin, work, sha, aTip } = repos(t);
  const before = sha['feat/b'];
  const lower = 'feat/a..x';
  const host = stubHost([pr({ number: 1, head: lower, state: 'merged', headSha: aTip }), pr({ number: 2, head: 'feat/b', base: lower })]);

  const out = restackIn(work, host);

  assert.equal(out.exitCode, 1);
  assert.match(out.lines[0], /^restack failed for #2: /);
  assert.deepEqual(host.edits, []);
  assert.equal(tip(origin, 'feat/b'), before);
});

test('a branch already rebased is only retargeted', (t) => {
  const { origin, work, aTip } = repos(t);
  restackIn(work, squashed(aTip));
  const rebased = tip(origin, 'feat/b');
  const host = squashed(aTip); // the retarget never reached the host: #2 still reads feat/a

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['retargeted #2 to main']);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(host.edits, [[2, { base: 'main' }]]);
  assert.equal(tip(origin, 'feat/b'), rebased);
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
