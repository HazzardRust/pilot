/**
 * S6 of pilot-fork: `pilot branches prune` deletes merged run branches, guarded (spec 6, 7, 8;
 * L4, L5, L13). Real git against scratch bare repositories; the host is injected, so nothing reaches
 * GitHub or a deck.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { deleteMerged, main } = await import('../branches.mjs');
const { hostFor } = await import('../../deck/host.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const PILOT = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));
const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Main's first commit, and an empty commit cut from `from`'s tip or merging `branch` into main, as `seed` takes them. */
const MAIN = { branch: 'main', files: {}, message: 'main' };
const cut = (branch, from = 'main') => ({ branch, from, files: {}, message: branch });
const merge = (branch) => ({ branch: 'main', files: {}, message: `merge ${branch}`, merge: [branch] });

/**
 * Origin seeded with `history` (and `refs`), the run remote `second.git`, and a clone `work` with
 * both remotes and `config` set; `sha` is each seeded branch's tip. `second` is empty, or with
 * `second: true` a bare copy of origin: a branch lives on one remote only (`remoteOf`), so the run
 * remote's copies of `feat/` branches, and origin's of the rest, are never candidates.
 */
function scratchRepos(t, key, history, { refs, second = false, config = {} } = {}) {
  return gitFixture(t, `branches:${key}`, (root) => {
    const { origin, sha } = seed(root, history, refs);
    const runRemote = path.join(root, 'second.git');
    const work = path.join(root, 'work');
    if (second) run(root, 'clone', '-q', '--bare', origin, runRemote);
    else run(root, 'init', '-q', '--bare', '-b', 'main', runRemote);
    const settings = { 'remote.second.url': runRemote, 'remote.second.fetch': '+refs/heads/*:refs/remotes/second/*', ...config };
    run(root, 'clone', '-q', ...Object.entries(settings).flatMap(([name, value]) => ['-c', `${name}=${value}`]), origin, work);
    const git = (args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const heads = (bare) => run(bare, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads');
    return { root, origin, second: runRemote, work, git, sha, heads };
  });
}

/** The repositories three tests share: origin's main and one slice cut from it. */
const oneSlice = (t) => scratchRepos(t, 'one-slice', [MAIN, cut('slice/x-s1')]);

/** The GitHub **Host** over a gh that answers `pr list` with every PR in `prs`, keyed by head branch, and records every call. */
function fakeGh(prs = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return JSON.stringify(Object.entries(prs).flatMap(([head, list]) => list.map((p) => ({ ...p, headRefName: head }))));
  };
  return { host: githubHost(gh), calls };
}
const only = (...names) => (branch) => names.includes(branch);

const pr = (number, state, headRefOid) => ({ number, state, headRefOid, isCrossRepository: false });

test('the guard refuses anything but run prefixes', (t) => {
  const { git } = scratchRepos(t, 'guard', [MAIN, cut('feature/x'), cut('Feat/x')], { refs: { pilot: 'main' } });
  const { kept } = deleteMerged({ git, host: fakeGh().host, select: () => true, dryRun: true });
  assert.deepEqual(kept, [
    { branch: 'Feat/x', why: 'not merged into origin/main' }, // the prefix is compared without case
    { branch: 'feature/x', why: 'refused: not a plain run branch' },
    { branch: 'main', why: 'refused: not a plain run branch' },
    { branch: 'pilot', why: 'refused: not a plain run branch' },
  ]);
});

test('a clone with no pilot branch name still prunes', (t) => {
  const { git, work } = oneSlice(t);
  const pinned = process.env.PILOT_BRANCH;
  delete process.env.PILOT_BRANCH;
  t.after(() => {
    if (pinned === undefined) delete process.env.PILOT_BRANCH;
    else process.env.PILOT_BRANCH = pinned;
  });
  assert.throws(() => run(work, 'config', '--get', 'pilot.branch'), 'no stored name');
  const { kept } = deleteMerged({ git, host: null, select: only('slice/x-s1'), dryRun: true });
  assert.deepEqual(kept, [{ branch: 'slice/x-s1', why: 'not merged into origin/main' }]);
});

test('a merged review deletes, an open one keeps', (t) => {
  const { git, origin, heads, sha } = scratchRepos(t, 'merged-review', [MAIN, cut('feat/x'), cut('slice/x-s1')]);
  const [open, merged] = [sha['feat/x'], sha['slice/x-s1']];
  const { host, calls } = fakeGh({ 'feat/x': [pr(3, 'OPEN', open)], 'slice/x-s1': [pr(4, 'MERGED', merged)] });
  const kept = [{ branch: 'feat/x', why: 'PR #3 open' }];
  assert.deepEqual(deleteMerged({ git, host, select: only('feat/x', 'slice/x-s1') }), { deleted: ['slice/x-s1'], kept });
  assert.equal(calls.length, 1, 'one review read for every branch');
  const left = heads(origin);
  assert.match(left, /^feat\/x /m);
  assert.doesNotMatch(left, /slice\/x-s1/);
});

test('none judges by ancestry', (t) => {
  // Main merges feat/x, so it is ahead of it.
  const history = [MAIN, cut('slice/x-s1'), cut('feat/x'), merge('feat/x')];
  const { git, work, origin, heads, sha } = scratchRepos(t, 'none', history, { config: { 'pilot.host': 'none' } });
  const late = sha['slice/x-s1'];
  const host = hostFor(work);
  assert.equal(host, null, 'no host, so no host call, at none');
  const kept = [{ branch: 'slice/x-s1', why: 'not merged into origin/main' }];
  assert.deepEqual(deleteMerged({ git, host, select: only('feat/x', 'slice/x-s1') }), { deleted: ['feat/x'], kept });
  assert.match(heads(origin), new RegExp(`^slice/x-s1 ${late}$`, 'm'));
});

test('a failed read keeps everything', (t) => {
  const { git, origin, heads } = scratchRepos(t, 'failed-read', [MAIN, cut('slice/x-s1'), merge('slice/x-s1')]);
  const host = githubHost(() => { throw Object.assign(new Error('gh: not logged in\nrun gh auth login'), { status: 4 }); });
  const kept = [{ branch: 'slice/x-s1', why: 'host failed: gh: not logged in' }];
  assert.deepEqual(deleteMerged({ git, host, select: only('slice/x-s1') }), { deleted: [], kept }, 'kept though its tip is in origin/main');
  assert.match(heads(origin), /^slice\/x-s1 /m);
});

test('a merged PR whose branch has moved since is kept', (t) => {
  const history = [MAIN, cut('slice/x-s1'), { branch: 'slice/x-s1', files: {}, message: 'after the merge' }];
  const { git, work, origin, heads } = scratchRepos(t, 'moved-since', history);
  const merged = run(work, 'rev-parse', 'origin/slice/x-s1~1');
  const { host } = fakeGh({ 'slice/x-s1': [pr(4, 'MERGED', merged)] });
  const kept = [{ branch: 'slice/x-s1', why: 'tip moved after PR #4 merged' }];
  assert.deepEqual(deleteMerged({ git, host, select: only('slice/x-s1') }), { deleted: [], kept });
  assert.match(heads(origin), /^slice\/x-s1 /m);
});

test('a branch with no PR is deleted only when its tip is in into', (t) => {
  const history = [MAIN, cut('design/x'), cut('design/x-late'), cut('feat/x', 'design/x')];
  const { git, origin, second, heads, sha } = scratchRepos(t, 'no-pr', history, { second: true, config: { 'pilot.remote': 'second' } });
  const { host } = fakeGh();
  const kept = [{ branch: 'design/x-late', why: 'not merged into origin/feat/x' }];
  assert.deepEqual(deleteMerged({ git, host, select: only('design/x', 'design/x-late'), into: 'feat/x' }), { deleted: ['design/x'], kept });
  assert.equal(heads(second).split('\n').filter((line) => line.startsWith('design/')).join(), `design/x-late ${sha['design/x-late']}`);
  const onOrigin = heads(origin);
  assert.match(onOrigin, /^feat\/x /m, 'origin is not touched');
  assert.match(onOrigin, /^design\/x /m, "origin's copy is the run remote's to judge, so it stays");
});

test('a branch with no PR and no commits of its own is kept, since nothing has landed', (t) => {
  const { git, origin, heads } = scratchRepos(t, 'no-commits', [MAIN], { refs: { 'slice/x-s1': 'main' } });
  const { host } = fakeGh();
  const kept = [{ branch: 'slice/x-s1', why: 'nothing landed: its tip is origin/main' }];
  assert.deepEqual(deleteMerged({ git, host, select: only('slice/x-s1') }), { deleted: [], kept });
  assert.match(heads(origin), /^slice\/x-s1 /m);
});

test('wait polls an open PR until gh reads it merged', (t) => {
  const { git, origin, heads, sha } = oneSlice(t);
  const tip = sha['slice/x-s1'];
  let asked = 0;
  const host = githubHost(() => JSON.stringify([{ ...pr(5, (asked += 1) > 1 ? 'MERGED' : 'OPEN', tip), headRefName: 'slice/x-s1' }]));
  assert.deepEqual(deleteMerged({ git, host, select: only('slice/x-s1'), wait: 5000 }), { deleted: ['slice/x-s1'], kept: [] });
  assert.equal(asked, 2);
  assert.doesNotMatch(heads(origin), /slice\/x-s1/);
});

/** Runs `main` with the host injected; answers its exit code and the lines it printed. */
function prune(cwd, host, ...args) {
  const out = [];
  const code = main(['prune', ...args], { cwd, host, write: (text) => out.push(text) });
  return { code, lines: out.join('').split('\n').filter(Boolean) };
}

test('dry-run deletes nothing', (t) => {
  // Main's second commit is feat/x's tip; feat/y and slice/x-s1 are cut from either side of it.
  const history = [MAIN, cut('feat/y'), { branch: 'main', files: {}, message: 'feat/x' }, cut('slice/x-s1')];
  const { work, origin, second, heads, sha } = scratchRepos(t, 'dry-run', history, {
    refs: { 'feat/x': 'main' }, second: true, config: { 'pilot.remote': 'second' },
  });
  const [feat, open] = [sha['feat/x'], sha['feat/y']];
  const { host } = fakeGh({ 'feat/x': [pr(6, 'MERGED', feat)], 'feat/y': [pr(7, 'OPEN', open)] });
  const before = [heads(origin), heads(second)];

  const dry = prune(work, host, '--slug', 'x', '--dry-run');
  assert.equal(dry.code, 0);
  assert.deepEqual(dry.lines, ['would delete feat/x', 'kept slice/x-s1: not merged into origin/main', 'dry run: would delete 1, kept 1; nothing deleted']);
  assert.deepEqual([heads(origin), heads(second)], before, 'both remotes unchanged');

  const real = prune(work, host, '--slug', 'x');
  assert.equal(real.code, 0);
  assert.deepEqual(real.lines, ['deleted feat/x', 'kept slice/x-s1: not merged into origin/main', 'deleted 1, kept 1']);
  const left = heads(origin);
  assert.doesNotMatch(left, /^feat\/x /m);
  assert.match(left, /^feat\/y /m, "another run's branch is not judged");
  assert.match(heads(second), /^feat\/x /m, "the run remote's copy of a feat branch is origin's to judge, so it stays");
});

test("prune needs --slug, and leaves another run's fresh branch alone", (t) => {
  // slice/y-s1 holds main's first commit; main has moved on from it.
  const history = [{ ...MAIN, branch: 'slice/y-s1' }, { branch: 'main', files: {}, message: 'main moves on' }];
  const { work, origin, heads } = scratchRepos(t, 'needs-slug', history);
  const { host } = fakeGh();
  const before = heads(origin);
  assert.equal(prune(work, host).code, 2, 'no --slug is a usage error');
  assert.deepEqual(prune(work, host, '--slug', 'x').lines, ['deleted 0, kept 0']);
  assert.equal(heads(origin), before, 'slice/y-s1 survives, though its tip is in origin/main');
});

test('a branch that moves after it is judged is not deleted', (t) => {
  const { git, work, origin, heads, sha } = scratchRepos(t, 'moves-after', [MAIN, cut('slice/x-s1'), cut('later', 'slice/x-s1')]);
  const [tip, moved] = [sha['slice/x-s1'], sha.later];
  const racing = (args) => {
    if (args[0] === 'push') run(work, 'push', '-q', 'origin', `${moved}:refs/heads/slice/x-s1`);
    return git(args);
  };
  const { host } = fakeGh({ 'slice/x-s1': [pr(4, 'MERGED', tip)] });
  assert.throws(() => deleteMerged({ git: racing, host, select: only('slice/x-s1') }), /git push origin --delete failed/);
  assert.match(heads(origin), new RegExp(`^slice/x-s1 ${moved}$`, 'm'), 'the lease held');
});

test("a deleted branch's sha still resolves", (t) => {
  const merged = { ...cut('feat/x'), message: 'Merge slice/x-s1', merge: ['slice/x-s1'] };
  const { root, git, origin, sha } = scratchRepos(t, 'deleted-sha', [MAIN, cut('slice/x-s1'), merged]);
  const tip = sha['slice/x-s1'];
  const { host } = fakeGh({ 'slice/x-s1': [pr(8, 'MERGED', tip)] });
  assert.deepEqual(deleteMerged({ git, host, select: only('slice/x-s1') }).deleted, ['slice/x-s1']);
  const fresh = path.join(root, 'fresh');
  run(root, 'clone', '-q', origin, fresh);
  assert.equal(spawnSync('git', ['cat-file', '-e', tip], { cwd: fresh }).status, 0);
});

test('pilot branches is wired: a misspelt word is its usage line, and help names it', (t) => {
  const { work } = oneSlice(t);
  const env = { ...process.env, PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };
  const cli = (...args) => spawnSync(process.execPath, [PILOT, ...args], { cwd: work, encoding: 'utf8', env });
  const bad = cli('branches', 'prnue');
  assert.deepEqual([bad.status, bad.stdout, bad.stderr], [2, '', 'usage: pilot branches prune --slug <slug> [--dry-run]\n']);
  assert.match(cli('--help').stdout, /^ {2}pilot branches prune --slug <slug> \[--dry-run\]$/m);
});

test("a failed push to the run remote reports what origin already lost, before NOT pruned", (t) => {
  const history = [MAIN, cut('feat/x'), cut('slice/x-s1'), cut('qa/x')];
  const { work, origin, second, heads, sha } = scratchRepos(t, 'failed-push', history, { second: true, config: { 'pilot.remote': 'second' } });
  const [feat, slice, qa] = [sha['feat/x'], sha['slice/x-s1'], sha['qa/x']];
  const hook = path.join(second, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const { host } = fakeGh({ 'feat/x': [pr(9, 'MERGED', feat)], 'slice/x-s1': [pr(10, 'MERGED', slice)], 'qa/x': [pr(11, 'OPEN', qa)] });

  const { code, lines } = prune(work, host, '--slug', 'x');
  assert.equal(code, 1);
  assert.deepEqual(lines.slice(0, 2), ['deleted feat/x', 'kept qa/x: PR #11 open']);
  assert.match(lines[2], /^NOT pruned: git push second --delete failed/);
  assert.doesNotMatch(heads(origin), /^feat\/x /m);
  assert.match(heads(second), /^slice\/x-s1 /m);
});
