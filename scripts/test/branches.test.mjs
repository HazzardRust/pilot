/**
 * S6 of pilot-fork: `pilot branches prune` deletes merged run branches, guarded (spec 6, 7, 8;
 * L4, L5, L13). Real git against scratch bare repositories; gh is injected, so nothing reaches
 * GitHub or a deck.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { deleteMerged, main } = await import('../branches.mjs');

const PILOT = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));
const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** origin.git with main, second.git as `second`, a clone; `commit` answers a new branch's sha. */
function scratchRepos(t) {
  return gitFixture(t, 'branches:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const origin = path.join(root, 'origin.git');
  const second = path.join(root, 'second.git');
  const work = path.join(root, 'work');
  run(root, 'init', '-q', '--bare', '-b', 'main', origin);
  run(root, 'init', '-q', '--bare', '-b', 'main', second);
  run(root, 'clone', '-q', origin, work);
  run(work, 'remote', 'add', 'second', second);
  run(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  run(work, 'push', '-q', 'origin', 'main');
  run(work, 'remote', 'set-head', 'origin', 'main');
  const git = (args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = (branch, from = 'main') => {
    run(work, 'checkout', '-q', '-b', branch, from);
    run(work, 'commit', '-q', '--allow-empty', '-m', branch);
    const sha = run(work, 'rev-parse', 'HEAD');
    run(work, 'checkout', '-q', 'main');
    return sha;
  };
  const heads = (bare) => run(bare, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads');
  return { root, origin, second, work, git, commit, heads };
}

/** A gh that answers `pr list` with every PR in `prs`, keyed by head branch, and records every call. */
function fakeGh(prs = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return JSON.stringify(Object.entries(prs).flatMap(([head, list]) => list.map((p) => ({ ...p, headRefName: head }))));
  };
  return { gh, calls };
}
const only = (...names) => (branch) => names.includes(branch);

const pr = (number, state, headRefOid) => ({ number, state, headRefOid, isCrossRepository: false });

test('the guard refuses anything but run prefixes', (t) => {
  const { git, commit, work } = scratchRepos(t);
  for (const name of ['feature/x', 'Feat/x']) commit(name);
  run(work, 'push', '-q', 'origin', 'main:pilot', 'feature/x', 'Feat/x');
  const { kept } = deleteMerged({ git, gh: fakeGh().gh, select: () => true, dryRun: true });
  assert.deepEqual(kept, [
    { branch: 'Feat/x', why: 'not merged into origin/main' }, // the prefix is compared without case
    { branch: 'feature/x', why: 'refused: not a plain run branch' },
    { branch: 'main', why: 'refused: not a plain run branch' },
    { branch: 'pilot', why: 'refused: not a plain run branch' },
  ]);
});

test("an open PR's branch is kept and named", (t) => {
  const { git, commit, work, origin, heads } = scratchRepos(t);
  const tip = commit('feat/x');
  run(work, 'push', '-q', 'origin', 'feat/x');
  const { gh } = fakeGh({ 'feat/x': [pr(3, 'OPEN', tip)] });
  assert.deepEqual(deleteMerged({ git, gh, select: only('feat/x') }), { deleted: [], kept: [{ branch: 'feat/x', why: 'PR #3 open' }] });
  assert.match(heads(origin), /^feat\/x /m);
});

test("a merged PR's branch is deleted on origin", (t) => {
  const { git, commit, work, origin, heads } = scratchRepos(t);
  const tip = commit('slice/x-s1');
  run(work, 'push', '-q', 'origin', 'slice/x-s1');
  const { gh } = fakeGh({ 'slice/x-s1': [pr(4, 'MERGED', tip)] });
  assert.deepEqual(deleteMerged({ git, gh, select: only('slice/x-s1') }), { deleted: ['slice/x-s1'], kept: [] });
  assert.doesNotMatch(heads(origin), /slice\/x-s1/);
});

test('a merged PR whose branch has moved since is kept', (t) => {
  const { git, commit, work, origin, heads } = scratchRepos(t);
  const merged = commit('slice/x-s1');
  run(work, 'checkout', '-q', 'slice/x-s1');
  run(work, 'commit', '-q', '--allow-empty', '-m', 'after the merge');
  run(work, 'checkout', '-q', 'main');
  run(work, 'push', '-q', 'origin', 'slice/x-s1');
  const { gh } = fakeGh({ 'slice/x-s1': [pr(4, 'MERGED', merged)] });
  const kept = [{ branch: 'slice/x-s1', why: 'tip moved after PR #4 merged' }];
  assert.deepEqual(deleteMerged({ git, gh, select: only('slice/x-s1') }), { deleted: [], kept });
  assert.match(heads(origin), /^slice\/x-s1 /m);
});

test('a branch with no PR is deleted only when its tip is in into', (t) => {
  const { git, commit, work, origin, second, heads } = scratchRepos(t);
  run(work, 'config', 'pilot.remote', 'second');
  commit('design/x');
  commit('design/x-late');
  run(work, 'push', '-q', 'second', 'design/x', 'design/x-late');
  commit('feat/x', 'design/x');
  run(work, 'push', '-q', 'origin', 'feat/x');
  const { gh } = fakeGh();
  const kept = [{ branch: 'design/x-late', why: 'not merged into origin/feat/x' }];
  assert.deepEqual(deleteMerged({ git, gh, select: only('design/x', 'design/x-late'), into: 'feat/x' }), { deleted: ['design/x'], kept });
  assert.equal(heads(second).split('\n').filter((line) => line.startsWith('design/')).join(), `design/x-late ${run(work, 'rev-parse', 'design/x-late')}`);
  assert.match(heads(origin), /^feat\/x /m, 'origin is not touched');
});

test('a branch with no PR and no commits of its own is kept, since nothing has landed', (t) => {
  const { git, work, origin, heads } = scratchRepos(t);
  run(work, 'push', '-q', 'origin', 'main:refs/heads/slice/x-s1');
  const { gh } = fakeGh();
  const kept = [{ branch: 'slice/x-s1', why: 'nothing landed: its tip is origin/main' }];
  assert.deepEqual(deleteMerged({ git, gh, select: only('slice/x-s1') }), { deleted: [], kept });
  assert.match(heads(origin), /^slice\/x-s1 /m);
});

test('no deletion when gh fails', (t) => {
  const { git, commit, work, origin, heads } = scratchRepos(t);
  commit('slice/x-s1');
  run(work, 'push', '-q', 'origin', 'slice/x-s1');
  const gh = () => { throw Object.assign(new Error('gh: not logged in'), { status: 4 }); };
  const kept = [{ branch: 'slice/x-s1', why: 'gh failed: gh: not logged in' }];
  assert.deepEqual(deleteMerged({ git, gh, select: only('slice/x-s1') }), { deleted: [], kept });
  assert.match(heads(origin), /^slice\/x-s1 /m);
});

test('wait polls an open PR until gh reads it merged', (t) => {
  const { git, commit, work, origin, heads } = scratchRepos(t);
  const tip = commit('slice/x-s1');
  run(work, 'push', '-q', 'origin', 'slice/x-s1');
  let asked = 0;
  const gh = () => JSON.stringify([{ ...pr(5, (asked += 1) > 1 ? 'MERGED' : 'OPEN', tip), headRefName: 'slice/x-s1' }]);
  assert.deepEqual(deleteMerged({ git, gh, select: only('slice/x-s1'), wait: 5000 }), { deleted: ['slice/x-s1'], kept: [] });
  assert.equal(asked, 2);
  assert.doesNotMatch(heads(origin), /slice\/x-s1/);
});

/** Runs `main` with gh injected; answers its exit code and the lines it printed. */
function prune(cwd, gh, ...args) {
  const out = [];
  const code = main(['prune', ...args], { cwd, gh, write: (text) => out.push(text) });
  return { code, lines: out.join('').split('\n').filter(Boolean) };
}

test('dry-run deletes nothing', (t) => {
  const { commit, work, origin, second, heads } = scratchRepos(t);
  run(work, 'config', 'pilot.remote', 'second');
  const feat = commit('feat/x');
  const open = commit('feat/y');
  commit('slice/x-s1', 'feat/x');
  run(work, 'push', '-q', 'origin', 'feat/x', 'feat/y', 'feat/x:main');
  run(work, 'push', '-q', 'second', 'slice/x-s1');
  const { gh } = fakeGh({ 'feat/x': [pr(6, 'MERGED', feat)], 'feat/y': [pr(7, 'OPEN', open)] });
  const before = [heads(origin), heads(second)];

  const dry = prune(work, gh, '--slug', 'x', '--dry-run');
  assert.equal(dry.code, 0);
  assert.deepEqual(dry.lines, ['would delete feat/x', 'kept slice/x-s1: not merged into origin/main', 'dry run: would delete 1, kept 1; nothing deleted']);
  assert.deepEqual([heads(origin), heads(second)], before, 'both remotes unchanged');

  const real = prune(work, gh, '--slug', 'x');
  assert.equal(real.code, 0);
  assert.deepEqual(real.lines, ['deleted feat/x', 'kept slice/x-s1: not merged into origin/main', 'deleted 1, kept 1']);
  assert.doesNotMatch(heads(origin), /^feat\/x /m);
  assert.match(heads(origin), /^feat\/y /m, "another run's branch is not judged");
});

test("prune needs --slug, and leaves another run's fresh branch alone", (t) => {
  const { work, origin, heads } = scratchRepos(t);
  const older = run(work, 'rev-parse', 'main');
  run(work, 'commit', '-q', '--allow-empty', '-m', 'main moves on');
  run(work, 'push', '-q', 'origin', 'main', `${older}:refs/heads/slice/y-s1`);
  const { gh } = fakeGh();
  const before = heads(origin);
  assert.equal(prune(work, gh).code, 2, 'no --slug is a usage error');
  assert.deepEqual(prune(work, gh, '--slug', 'x').lines, ['deleted 0, kept 0']);
  assert.equal(heads(origin), before, 'slice/y-s1 survives, though its tip is in origin/main');
});

test('a branch that moves after it is judged is not deleted', (t) => {
  const { git, commit, work, origin, heads } = scratchRepos(t);
  const tip = commit('slice/x-s1');
  run(work, 'push', '-q', 'origin', 'slice/x-s1');
  const moved = commit('later', 'slice/x-s1');
  const racing = (args) => {
    if (args[0] === 'push') run(work, 'push', '-q', 'origin', `${moved}:refs/heads/slice/x-s1`);
    return git(args);
  };
  const { gh } = fakeGh({ 'slice/x-s1': [pr(4, 'MERGED', tip)] });
  assert.throws(() => deleteMerged({ git: racing, gh, select: only('slice/x-s1') }), /git push origin --delete failed/);
  assert.match(heads(origin), new RegExp(`^slice/x-s1 ${moved}$`, 'm'), 'the lease held');
});

test("a deleted branch's sha still resolves", (t) => {
  const { root, git, commit, work, origin } = scratchRepos(t);
  const tip = commit('slice/x-s1');
  run(work, 'checkout', '-q', '-b', 'feat/x', 'main');
  run(work, 'merge', '-q', '--no-ff', '-m', 'Merge slice/x-s1', 'slice/x-s1');
  run(work, 'checkout', '-q', 'main');
  run(work, 'push', '-q', 'origin', 'feat/x', 'slice/x-s1');
  const { gh } = fakeGh({ 'slice/x-s1': [pr(8, 'MERGED', tip)] });
  assert.deepEqual(deleteMerged({ git, gh, select: only('slice/x-s1') }).deleted, ['slice/x-s1']);
  const fresh = path.join(root, 'fresh');
  run(root, 'clone', '-q', origin, fresh);
  assert.equal(spawnSync('git', ['cat-file', '-e', tip], { cwd: fresh }).status, 0);
});

test('pilot branches is wired: a misspelt word is its usage line, and help names it', (t) => {
  const { work } = scratchRepos(t);
  const env = { ...process.env, PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };
  const cli = (...args) => spawnSync(process.execPath, [PILOT, ...args], { cwd: work, encoding: 'utf8', env });
  const bad = cli('branches', 'prnue');
  assert.deepEqual([bad.status, bad.stdout, bad.stderr], [2, '', 'usage: pilot branches prune --slug <slug> [--dry-run]\n']);
  assert.match(cli('--help').stdout, /^ {2}pilot branches prune --slug <slug> \[--dry-run\]$/m);
});

test("a failed push to the run remote reports what origin already lost, before NOT pruned", (t) => {
  const { commit, work, origin, second, heads } = scratchRepos(t);
  run(work, 'config', 'pilot.remote', 'second');
  const feat = commit('feat/x');
  const slice = commit('slice/x-s1');
  const qa = commit('qa/x');
  run(work, 'push', '-q', 'origin', 'feat/x');
  run(work, 'push', '-q', 'second', 'slice/x-s1', 'qa/x');
  const hook = path.join(second, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const { gh } = fakeGh({ 'feat/x': [pr(9, 'MERGED', feat)], 'slice/x-s1': [pr(10, 'MERGED', slice)], 'qa/x': [pr(11, 'OPEN', qa)] });

  const { code, lines } = prune(work, gh, '--slug', 'x');
  assert.equal(code, 1);
  assert.deepEqual(lines.slice(0, 2), ['deleted feat/x', 'kept qa/x: PR #11 open']);
  assert.match(lines[2], /^NOT pruned: git push second --delete failed/);
  assert.doesNotMatch(heads(origin), /^feat\/x /m);
  assert.match(heads(second), /^slice\/x-s1 /m);
});
