/**
 * `pilot integrate` takes one base, the pilot branch, before the slice (pilot-branch
 * spec 3; L5), in its own merge commit; one test run judges both merges, and red or a
 * stop resets to the start. Every case runs against a scratch bare "origin" and a clone
 * of it, with `gh` a function that records its calls; nothing here reaches a real remote
 * or real GitHub.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const short = (cwd, ref) => git(cwd, 'rev-parse', '--short', ref);
/** Several refs in one rev-parse (L5): each assert still reads its own. */
const revs = (cwd, ...refs) => git(cwd, 'rev-parse', ...refs).split('\n');
const root = path.resolve(import.meta.dirname, '..', '..');

const BASE = [
  { branch: 'main', files: { 'main.txt': 'main\n' }, message: 'main' },
  { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'shared' },
  { branch: 'feat/b', files: { 'b.txt': 'b\n' }, message: 'feat/b: b.txt' },
  { branch: 'slice/b-s1', files: { 's.txt': 's\n' }, message: 'the slice' },
];

/** One commit of `file` on `branch`, as seed history; `from` cuts the branch's first commit. */
const pushed = (branch, file, text, from) => ({ branch, from, files: { [file]: text }, message: `${branch}: ${file}` });

/**
 * main, `pilot` from main, `feat/b` from `pilot`, and a pushed `slice/b-s1` off `feat/b`, then
 * `later`'s commits; the clone is on `feat/b`, `origin/HEAD` names main. Key `no-pilot` has no
 * pilot branch. Answers `before`, feat/b's tip, and `pilotTip`.
 */
function pilotRepos(t, key = 'base', later = []) {
  return gitFixture(t, `integrate-base:pilotRepos:${key}`, (dir) => {
    const pilot = key !== 'no-pilot';
    const moved = later.some((commit) => commit.branch === 'pilot');
    const { origin, sha } = seed(dir, [...BASE, ...later], pilot && !moved ? { pilot: 'main' } : {});
    const work = path.join(dir, 'work');
    git(dir, 'clone', '-q', '-b', 'feat/b', origin, work);
    if (pilot) git(work, 'branch', '-q', 'pilot', 'origin/pilot');
    return { origin, work, before: sha['feat/b'], pilotTip: sha.pilot };
  });
}

/** pilot one commit past main: what most cases take as the base. */
const pilotMoved = (t) => pilotRepos(t, 'p2', [pushed('pilot', 'p2.txt', 'p2\n', 'main')]);

/** pilot one commit past main, then main one commit on past where pilot was cut. */
const bothMoved = (t) => pilotRepos(t, 'p2-m2', [pushed('pilot', 'p2.txt', 'p2\n', 'main'), pushed('main', 'm2.txt', 'm2\n')]);

/** The GitHub **Host** over a `gh` that records every call and answers none. */
function recordingGh() {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return Object.assign(githubHost(gh), { calls });
}

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const failing = `node -e "console.log('✖ broken thing (1.2ms)'); console.log('ℹ pass 2'); console.log('ℹ fail 1'); process.exit(1)"`;
const quiet = { install: () => {}, test: passing };

test('integrate merges origin/pilot before the slice', (t) => {
  const { origin, work, pilotTip } = pilotMoved(t);

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), trailers: ['Claude-Session: s'], ...quiet });

  assert.equal(result.ok, true, result.line);
  const [head, baseMerged, slice, sliceTip] = revs(work, 'HEAD', 'HEAD^1^2', 'HEAD^2', 'origin/slice/b-s1');
  // S7's suffix after the push: this gh fails every call, so the slice is kept.
  assert.equal(result.line.replace(/; kept slice\/b-s1: host failed: .*$/, ''), `integrated slice/b-s1 at ${short(work, 'HEAD')} (base pilot@${short(work, pilotTip)}): 3 pass, 0 fail; pushed`);
  assert.equal(baseMerged, pilotTip, 'the base is the first merge, in its own commit');
  const [subject, message] = git(work, 'log', '-1', '--format=%s%x00%B', 'HEAD^1').split('\0');
  assert.equal(subject, 'Merge base pilot');
  assert.match(message, /\n\nClaude-Session: s\s*$/, 'the trailer rides on it');
  assert.equal(slice, sliceTip, 'then the slice');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), head, 'pushed');
});

test('integrate with no branch takes pilot alone', (t) => {
  const { origin, work, pilotTip } = pilotMoved(t);

  const result = integrate(undefined, { cwd: work, host: recordingGh(), ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.equal(result.line, `took base pilot@${short(work, pilotTip)} at ${short(work, 'HEAD')}: 3 pass, 0 fail; pushed`);
  const [head, baseMerged] = revs(work, 'HEAD', 'HEAD^2');
  assert.equal(baseMerged, pilotTip);
  assert.equal(git(origin, 'rev-parse', 'feat/b'), head, 'pushed');
});

test('the base is pilot even when main moved, and no PR is read for it', (t) => {
  const { work, pilotTip } = bothMoved(t);
  const host = recordingGh();

  const result = integrate('slice/b-s1', { cwd: work, host, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, new RegExp(`\\(base pilot@${short(work, pilotTip)}\\)`));
  assert.ok(!fs.existsSync(path.join(work, 'm2.txt')), 'main\'s new commit is not taken');
  const forBase = host.calls.filter((args) => !(args[0] === 'pr' && args[1] === 'list' && args.includes('all')) && !args[1]?.includes('/check-runs'));
  assert.deepEqual(forBase, [], 'gh is never asked about a PR body for the base, only whether the slice merged');
});

test('a missing origin/pilot exits 1 naming pilot base', (t) => {
  const { origin, work, before } = pilotRepos(t, 'no-pilot');

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.equal(result.line, 'NOT integrated slice/b-s1: no origin/pilot (run pilot base first); nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'no fallback to the default branch');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('a pilot branch deleted on origin is missing, though the clone still has its tracking ref', (t) => {
  const { origin, work } = bothMoved(t);
  git(origin, 'branch', '-D', 'pilot');

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), ...quiet });

  assert.equal(result.line, 'NOT integrated slice/b-s1: no origin/pilot (run pilot base first); nothing merged or pushed');
});

test('a conflict taking the base aborts, resets to the start and names the base', (t) => {
  const { origin, work, before } = pilotRepos(t, 'conflict', [
    { branch: 'feat/b', files: { 'shared.txt': 'b\n' }, message: 'feat/b: shared' },
    pushed('pilot', 'shared.txt', 'p\n', 'main'),
  ]);

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: taking base pilot stopped \(/);
  assert.doesNotMatch(result.line, /\n/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before);
  assert.equal(git(work, 'status', '--porcelain'), '', 'the merge was undone');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('a slice conflict after the base is taken resets the base merge too', (t) => {
  const { origin, work, before } = pilotRepos(t, 'slice-conflict', [
    pushed('pilot', 'p2.txt', 'p2\n', 'main'),
    pushed('feat/b', 's.txt', 'not the slice\n'),
  ]);

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: the merge stopped \(/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the base merge is reset too');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.throws(() => git(work, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), 'no merge left in progress');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('red tests reset both merges; nothing is pushed', (t) => {
  const { origin, work, before } = pilotMoved(t);

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), ...quiet, test: failing });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: slice\/b-s1 merged red: 2 pass, 1 fail; failing: broken thing; log .+\.log; not pushed$/);
  assert.deepEqual(result.failing, ['broken thing']);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the base merge is reset too');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('a lockfile moved by the base merge alone runs npm ci', (t) => {
  const { work } = pilotRepos(t, 'lockfile', [
    pushed('pilot', 'package.json', '{}\n', 'main'),
    pushed('pilot', 'package-lock.json', '{}\n'),
  ]);
  const installs = [];

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), ...quiet, install: (cwd) => installs.push(cwd), push: false });

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(installs, [work], 'judged against where the call began, not the base merge');
});

test('a failed commit of the slice merge resets both merges; nothing is pushed', (t) => {
  const { origin, work, before } = pilotMoved(t);
  // pre-commit runs for the slice's `git commit`, not for the base's `git merge`.
  fs.writeFileSync(path.join(work, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho refused >&2\nexit 1\n', { mode: 0o755 });

  const result = integrate('slice/b-s1', { cwd: work, host: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: the commit failed \(.+\); not pushed$/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the base merge is reset too');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('step 7 and the fundamentalist never diff against the default branch', () => {
  // lint: forbidden patterns, the default branch as the diff base and integrate alone
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\s+/g, ' ');
  const step7 = /### 7\. Feature-level principles review[^#]*?(?= ### 8\.)/.exec(read('agents/pilot.md'))[0];
  assert.doesNotMatch(step7, /against the default branch/);
  assert.doesNotMatch(step7, /`pilot integrate` alone/);
  assert.doesNotMatch(read('agents/pilot-fundamentalist.md'), /the default branch as the base/);
});
