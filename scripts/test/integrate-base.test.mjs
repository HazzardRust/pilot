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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const short = (cwd, ref) => git(cwd, 'rev-parse', '--short', ref);
const root = path.resolve(import.meta.dirname, '..', '..');

function commitFile(work, file, text, message) {
  fs.writeFileSync(path.join(work, file), text);
  git(work, 'add', file);
  git(work, 'commit', '-q', '-m', message);
}

/** On `branch` in `work`, commit one file and push it, then come back to `feat/b`. */
function pushTo(work, branch, file, text) {
  git(work, 'checkout', '-q', branch);
  commitFile(work, file, text, `${branch}: ${file}`);
  git(work, 'push', '-q', 'origin', branch);
  git(work, 'checkout', '-q', 'feat/b');
}

/**
 * main, `pilot` from main, `feat/b` from `pilot`, and a pushed `slice/b-s1` off `feat/b`;
 * the clone is on `feat/b`, `origin/HEAD` names main. With `pilot: false` origin has no
 * pilot branch.
 */
function pilotRepos(t, { pilot = true } = {}) {
  return gitFixture(t, `integrate-base:pilotRepos:${pilot}`, (dir) => buildPilotRepos(dir, pilot));
}

function buildPilotRepos(dir, pilot) {
  const origin = path.join(dir, 'origin.git');
  const seed = path.join(dir, 'seed');
  const work = path.join(dir, 'work');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commitFile(seed, 'main.txt', 'main\n', 'main');
  commitFile(seed, 'shared.txt', 'one\n', 'shared');
  git(seed, 'push', '-q', 'origin', 'main');
  if (pilot) git(seed, 'push', '-q', 'origin', 'main:pilot');
  git(seed, 'checkout', '-q', '-b', 'feat/b');
  commitFile(seed, 'b.txt', 'b\n', 'feat/b: b.txt');
  git(seed, 'push', '-q', 'origin', 'feat/b');
  git(seed, 'checkout', '-q', '-b', 'slice/b-s1');
  commitFile(seed, 's.txt', 's\n', 'the slice');
  git(seed, 'push', '-q', 'origin', 'slice/b-s1');
  git(dir, 'clone', '-q', '-b', 'feat/b', origin, work);
  if (pilot) git(work, 'branch', '-q', 'pilot', 'origin/pilot');
  return { origin, work };
}

/** A `gh` that records every call and answers none. */
function recordingGh() {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return Object.assign(gh, { calls });
}

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const failing = `node -e "console.log('✖ broken thing (1.2ms)'); console.log('ℹ pass 2'); console.log('ℹ fail 1'); process.exit(1)"`;
const quiet = { findPr: () => null, install: () => {}, test: passing };

test('integrate merges origin/pilot before the slice', (t) => {
  const { origin, work } = pilotRepos(t);
  pushTo(work, 'pilot', 'p2.txt', 'p2\n');
  const pilotTip = git(work, 'rev-parse', 'origin/pilot');

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), trailers: ['Claude-Session: s'], ...quiet });

  assert.equal(result.ok, true, result.line);
  // S7's suffix after the push: this gh fails every call, so the slice is kept.
  assert.equal(result.line.replace(/; kept slice\/b-s1: gh failed: .*$/, ''), `integrated slice/b-s1 at ${short(work, 'HEAD')} (base pilot@${short(work, pilotTip)}): 3 pass, 0 fail; pushed`);
  assert.equal(git(work, 'rev-parse', 'HEAD^1^2'), pilotTip, 'the base is the first merge, in its own commit');
  assert.equal(git(work, 'log', '-1', '--format=%s', 'HEAD^1'), 'Merge base pilot');
  assert.match(git(work, 'log', '-1', '--format=%B', 'HEAD^1'), /\n\nClaude-Session: s\s*$/, 'the trailer rides on it');
  assert.equal(git(work, 'rev-parse', 'HEAD^2'), git(work, 'rev-parse', 'origin/slice/b-s1'), 'then the slice');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), git(work, 'rev-parse', 'HEAD'), 'pushed');
});

test('integrate with no branch takes pilot alone', (t) => {
  const { origin, work } = pilotRepos(t);
  pushTo(work, 'pilot', 'p2.txt', 'p2\n');
  const pilotTip = git(work, 'rev-parse', 'origin/pilot');

  const result = integrate(undefined, { cwd: work, gh: recordingGh(), ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.equal(result.line, `took base pilot@${short(work, pilotTip)} at ${short(work, 'HEAD')}: 3 pass, 0 fail; pushed`);
  assert.equal(git(work, 'rev-parse', 'HEAD^2'), pilotTip);
  assert.equal(git(origin, 'rev-parse', 'feat/b'), git(work, 'rev-parse', 'HEAD'), 'pushed');
});

test('the base is pilot even when main moved, and no PR is read for it', (t) => {
  const { work } = pilotRepos(t);
  pushTo(work, 'main', 'm2.txt', 'm2\n');
  const pilotTip = git(work, 'rev-parse', 'origin/pilot');
  const gh = recordingGh();

  const result = integrate('slice/b-s1', { cwd: work, gh, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, new RegExp(`\\(base pilot@${short(work, pilotTip)}\\)`));
  assert.ok(!fs.existsSync(path.join(work, 'm2.txt')), 'main\'s new commit is not taken');
  const forBase = gh.calls.filter((args) => !args.includes('number,state,headRefName,headRefOid,isCrossRepository'));
  assert.deepEqual(forBase, [], 'gh is never asked about a PR body for the base, only whether the slice merged');
});

test('a missing origin/pilot exits 1 naming pilot base', (t) => {
  const { origin, work } = pilotRepos(t, { pilot: false });
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.equal(result.line, 'NOT integrated slice/b-s1: no origin/pilot (run pilot base first); nothing merged or pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'no fallback to the default branch');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('a pilot branch deleted on origin is missing, though the clone still has its tracking ref', (t) => {
  const { origin, work } = pilotRepos(t);
  git(origin, 'branch', '-D', 'pilot');

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), ...quiet });

  assert.equal(result.line, 'NOT integrated slice/b-s1: no origin/pilot (run pilot base first); nothing merged or pushed');
});

test('a conflict taking the base aborts, resets to the start and names the base', (t) => {
  const { origin, work } = pilotRepos(t);
  commitFile(work, 'shared.txt', 'b\n', 'feat/b: shared');
  git(work, 'push', '-q', 'origin', 'feat/b');
  pushTo(work, 'pilot', 'shared.txt', 'p\n');
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: taking base pilot stopped \(/);
  assert.doesNotMatch(result.line, /\n/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before);
  assert.equal(git(work, 'status', '--porcelain'), '', 'the merge was undone');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('a slice conflict after the base is taken resets the base merge too', (t) => {
  const { origin, work } = pilotRepos(t);
  pushTo(work, 'pilot', 'p2.txt', 'p2\n');
  pushTo(work, 'feat/b', 's.txt', 'not the slice\n');
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: the merge stopped \(/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the base merge is reset too');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.throws(() => git(work, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), 'no merge left in progress');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('red tests reset both merges; nothing is pushed', (t) => {
  const { origin, work } = pilotRepos(t);
  pushTo(work, 'pilot', 'p2.txt', 'p2\n');
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), ...quiet, test: failing });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: slice\/b-s1 merged red: 2 pass, 1 fail; failing: broken thing; log .+\.log; not pushed$/);
  assert.deepEqual(result.failing, ['broken thing']);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the base merge is reset too');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('a lockfile moved by the base merge alone runs npm ci', (t) => {
  const { work } = pilotRepos(t);
  pushTo(work, 'pilot', 'package.json', '{}\n');
  pushTo(work, 'pilot', 'package-lock.json', '{}\n');
  const installs = [];

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), ...quiet, install: (cwd) => installs.push(cwd), push: false });

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(installs, [work], 'judged against where the call began, not the base merge');
});

test('a failed commit of the slice merge resets both merges; nothing is pushed', (t) => {
  const { origin, work } = pilotRepos(t);
  pushTo(work, 'pilot', 'p2.txt', 'p2\n');
  const before = git(work, 'rev-parse', 'HEAD');
  // pre-commit runs for the slice's `git commit`, not for the base's `git merge`.
  fs.writeFileSync(path.join(work, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho refused >&2\nexit 1\n', { mode: 0o755 });

  const result = integrate('slice/b-s1', { cwd: work, gh: recordingGh(), ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/b-s1: the commit failed \(.+\); not pushed$/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the base merge is reset too');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(git(origin, 'rev-parse', 'feat/b'), before, 'nothing pushed');
});

test('step 7 lands before QA\'s tip and diffs against the base; the fundamentalist reads the base', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\s+/g, ' ');
  const step7 = /### 7\. Feature-level principles review[^#]*?(?= ### 8\.)/.exec(read('agents/pilot.md'))[0];
  assert.match(step7, /`feat\/<slug>` against its base as the diff/);
  assert.doesNotMatch(step7, /against the default branch/);
  assert.match(step7, /`pilot land`[^.]*tip SHA/, 'red-lands-on-pilot L1: the landing comes before the tip goes to QA');
  assert.doesNotMatch(step7, /`pilot integrate` alone/);
  const step5 = /### 5\. Integrate the slice[^#]*?(?= ### 6\.)/.exec(read('agents/pilot.md'))[0];
  assert.match(step5, /takes the base first/);
  const fundamentalist = read('agents/pilot-fundamentalist.md');
  assert.match(fundamentalist, /the base the brief names to diff against/);
  assert.doesNotMatch(fundamentalist, /the default branch as the base/);
});
