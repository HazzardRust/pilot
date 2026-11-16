/**
 * `pilot integrate [<slice-branch>]` (independence spec 22.1): one call merges a slice
 * into the feature branch, installs when the lockfile moved, runs the tests, and on
 * green pushes and commits the run record the deck wrote. On red it pushes nothing,
 * commits nothing, and names the failing tests.
 *
 * Every case runs against a scratch bare "origin" and a clone of it; nothing here
 * reaches a real remote. The test command is a one-line node script that prints the
 * summary lines `node --test` prints.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate, main } = await import('../integrate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A bare origin, a clone on `feat/x`, and a pushed `slice/a` that adds one file. */
function scratchRepos(t, sliceFiles = { 'a.txt': 'a\n' }) {
  return gitFixture(t, `integrate:scratchRepos:${JSON.stringify(sliceFiles)}`, (root) => buildScratchRepos(root, sliceFiles));
}

function buildScratchRepos(root, sliceFiles) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
  git(work, 'add', 'base.txt');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x');
  git(work, 'push', '-q', 'origin', 'HEAD:main', 'HEAD:pilot');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'checkout', '-q', '-b', 'slice/a');
  for (const [file, text] of Object.entries(sliceFiles)) {
    fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    fs.writeFileSync(path.join(work, file), text);
  }
  git(work, 'add', ...Object.keys(sliceFiles));
  git(work, 'commit', '-q', '-m', 'the slice');
  git(work, 'push', '-q', 'origin', 'slice/a');
  git(work, 'checkout', '-q', 'feat/x');
  git(work, 'branch', '-q', '-D', 'slice/a');
  return { origin, work };
}

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const failing = `node -e "console.log('✖ broken thing (1.2ms)'); console.log('ℹ pass 2'); console.log('ℹ fail 1'); process.exit(1)"`;
// The base is pilot, which feat/x already holds; gh knows no PR.
const gh = (args) => (args[0] === 'pr' ? '[]' : 'me\n');
const quiet = { install: () => {}, gh };

test('green: a no-ff merge naming the slice, pushed, reported in one line', (t) => {
  const { origin, work } = scratchRepos(t);

  const result = integrate('slice/a', { cwd: work, test: passing, ...quiet });

  assert.equal(result.ok, true);
  const head = git(work, 'rev-parse', '--short', 'HEAD');
  assert.equal(result.line, `integrated slice/a at ${head} (base pilot@${git(work, 'rev-parse', '--short', 'origin/pilot')}): 3 pass, 0 fail; pushed; deleted slice/a`);
  assert.doesNotMatch(result.line, /\n/);
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'Merge slice/a');
  assert.equal(git(work, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge commit, not a fast-forward');
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'), 'pushed');
});

test('green: the run record the deck wrote is committed after the merge and pushed again', (t) => {
  const { origin, work } = scratchRepos(t);
  const record = path.join(work, 'docs', 'design', 'x', 'run.json');
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, '{"slug": "x", "slices": [{"slice": "S1 The first slice", "branch": "slice/a"}]}\n');

  const result = integrate('slice/a', { cwd: work, test: passing, trailers: ['Claude-Session: s'], ...quiet });

  assert.equal(result.ok, true);
  assert.equal(git(work, 'status', '--porcelain'), '', 'nothing left uncommitted');
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'chore(x): run record');
  assert.match(git(work, 'log', '-1', '--format=%B'), /Claude-Session: s/, 'the trailer rides on it');
  assert.match(git(work, 'log', '-2', '--format=%B'), /feat\(x\): S1 the first slice[\s\S]*Claude-Session: s/, 'and on the merge, subjected from the record');
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'), 'both pushed');
});

test('red: nothing merged, committed or pushed, and the failing tests are named', (t) => {
  const { origin, work } = scratchRepos(t);
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/a', { cwd: work, test: failing, ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/a: slice\/a merged red: 2 pass, 1 fail; failing: broken thing; log .+\.log; not pushed$/);
  assert.deepEqual(result.failing, ['broken thing']);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'no commit');
  assert.equal(git(work, 'status', '--porcelain'), '', 'the merge was undone');
  assert.equal(git(origin, 'rev-parse', 'feat/x'), before, 'nothing pushed');
});

test('a red gate that rewrote a merged file still resets', (t) => {
  const { work } = scratchRepos(t, { 'a.txt': 'a\n' });
  const before = git(work, 'rev-parse', 'HEAD');
  const rewriting = `node -e "require('fs').writeFileSync('a.txt','rebuilt\\n'); console.log('ℹ pass 0'); console.log('ℹ fail 1'); process.exit(1)"`;

  const result = integrate('slice/a', { cwd: work, test: rewriting, ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /merged red/);
  assert.doesNotMatch(result.line, /mid-merge/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'HEAD is at start');
  assert.equal(fs.existsSync(path.join(work, '.git', 'MERGE_HEAD')), false, 'no merge in progress');
  assert.equal(git(work, 'status', '--porcelain'), '', 'the merge was undone');
});

test('a red gate keeps a run.json the slice staged and the deck rewrote, and names the stuck reset', (t) => {
  const record = 'docs/design/x/run.json';
  const { work } = scratchRepos(t, { [record]: '{"slug":"x"}\n' });
  const rewriting = `node -e "require('fs').writeFileSync('${record}','{\\"deck\\":1}\\n'); console.log('ℹ pass 0'); console.log('ℹ fail 1'); process.exit(1)"`;

  const result = integrate('slice/a', { cwd: work, test: rewriting, ...quiet });

  assert.equal(fs.readFileSync(path.join(work, record), 'utf8'), '{"deck":1}\n', 'the deck write survives');
  assert.match(result.line, /reset failed/);
});

test('a reset that cannot run is named', (t) => {
  const { work } = scratchRepos(t);
  const locking = `node -e "require('fs').writeFileSync('.git/index.lock',''); console.log('ℹ pass 0'); console.log('ℹ fail 1'); process.exit(1)"`;

  const result = integrate('slice/a', { cwd: work, test: locking, ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /; reset failed \(.+\): .+ is left mid-merge$/);
});

test('a failed npm ci aborts the merge and answers in one line, rather than throwing mid-merge', (t) => {
  const { work } = scratchRepos(t, { 'package-lock.json': '{}\n', 'package.json': '{}\n' });
  const before = git(work, 'rev-parse', 'HEAD');
  const install = () => {
    throw new Error('npm ci exited 1');
  };

  const result = integrate('slice/a', { cwd: work, test: passing, install, gh });

  assert.equal(result.ok, false);
  assert.equal(result.line, 'NOT integrated slice/a: npm ci failed (npm ci exited 1); not pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before);
  assert.equal(git(work, 'status', '--porcelain'), '', 'the merge was undone');
});

test('a push that fails after a green run says the merge is local, in one line', (t) => {
  const { origin, work } = scratchRepos(t);
  fs.writeFileSync(path.join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\necho refused >&2\nexit 1\n', { mode: 0o755 });

  const result = integrate('slice/a', { cwd: work, test: passing, ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^integrated slice\/a locally at [0-9a-f]+ \(base pilot@[0-9a-f]+\): 3 pass, 0 fail; push or record failed \(/);
  assert.doesNotMatch(result.line, /\n/);
});

test('integrate on a default-branch HEAD refuses and pushes nothing', (t) => {
  const { origin, work } = scratchRepos(t);
  git(work, 'checkout', '-q', '-b', 'main', 'origin/main');
  const before = git(work, 'rev-parse', 'HEAD');
  const remoteMain = git(origin, 'rev-parse', 'main');

  const result = integrate('slice/a', { cwd: work, test: passing, ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/a: refusing to push main: it is the default branch \(main\); nothing merged or pushed$/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing merged');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(git(origin, 'rev-parse', 'main'), remoteMain, 'nothing pushed');
});

test('integrate on the pilot branch refuses by name: land is the only way onto pilot', (t) => {
  const { origin, work } = scratchRepos(t);
  git(work, 'checkout', '-q', '-b', 'pilot', 'origin/pilot');
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/a', { cwd: work, test: passing, ...quiet });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT integrated slice\/a: refusing to integrate onto pilot: pilot land is the only way onto it; nothing merged or pushed$/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing merged');
  assert.equal(git(origin, 'rev-parse', 'pilot'), before, 'nothing pushed');
});

test('a red run with no count line says the tests were red', (t) => {
  const { work } = scratchRepos(t);

  const result = integrate(undefined, { cwd: work, test: 'node -e "process.exit(1)"', ...quiet });

  assert.match(result.line, /^base NOT taken: pilot@[0-9a-f]{7} merged red: exit 1; log .+\.log; not pushed$/);
});

test('--no-push merges and tests but leaves origin alone', (t) => {
  const { origin, work } = scratchRepos(t);
  const before = git(origin, 'rev-parse', 'feat/x');

  const result = integrate('slice/a', { cwd: work, test: passing, push: false, ...quiet });

  assert.equal(result.ok, true);
  assert.match(result.line, /; not pushed \(--no-push\)$/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), before);
});

test('npm ci runs when the lockfile changed or node_modules is missing, and not otherwise', (t) => {
  const installs = [];
  const install = (cwd) => installs.push(cwd);

  const locked = scratchRepos(t, { 'package-lock.json': '{}\n' });
  fs.writeFileSync(path.join(locked.work, 'package.json'), '{}\n');
  fs.mkdirSync(path.join(locked.work, 'node_modules'));
  integrate('slice/a', { cwd: locked.work, test: passing, install, gh, push: false });
  assert.equal(installs.length, 1, 'the slice changed the lockfile');

  const plain = scratchRepos(t);
  fs.writeFileSync(path.join(plain.work, 'package.json'), '{}\n');
  integrate('slice/a', { cwd: plain.work, test: passing, install, gh, push: false });
  assert.equal(installs.length, 2, 'a package.json and no node_modules');

  const none = scratchRepos(t);
  integrate('slice/a', { cwd: none.work, test: passing, install, gh, push: false });
  assert.equal(installs.length, 2, 'no package.json, nothing to install');
});

test('with no run record the merge names the branch alone', (t) => {
  const { work } = scratchRepos(t);

  integrate('slice/a', { cwd: work, test: passing, install: () => {}, gh, push: false });

  assert.equal(git(work, 'log', '-1', '--format=%s'), 'Merge slice/a');
});

test('a red pilot integrate names each failing test once', (t) => {
  const { work } = scratchRepos(t);
  const four = `node -e "for (const n of ['one', 'two', 'three', 'four']) console.log('✖ broken ' + n); console.log('ℹ pass 0'); console.log('ℹ fail 4'); process.exit(1)"`;
  const out = [];
  const write = process.stdout.write;
  process.stdout.write = (text) => out.push(String(text));
  let code;
  try {
    code = main(['slice/a', '--no-push'], { cwd: work, test: four, ...quiet });
  } finally {
    process.stdout.write = write;
  }

  assert.equal(code, 1);
  for (const n of ['one', 'two', 'three', 'four']) assert.equal(out.join('').split(`broken ${n}`).length, 2, `broken ${n} once:\n${out.join('')}`);
});

test('main exits 2 when it refuses for a missing test command outside npm', (t) => {
  const { work } = scratchRepos(t);
  const here = process.cwd();
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    process.chdir(work);
    assert.equal(main(['slice/a', '--no-push']), 2);
  } finally {
    process.chdir(here);
    process.stdout.write = write;
  }
});

test('a repository without package.json and without git config pilot.test is refused before any merge', (t) => {
  const { origin, work } = scratchRepos(t);
  const before = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/a', { cwd: work, push: false, ...quiet });

  assert.equal(result.ok, false);
  assert.equal(result.code, 2);
  assert.equal(result.line, 'NOT integrated slice/a: no package.json here; set git config pilot.test "<command>"');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing merged');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(fs.existsSync(path.join(work, 'a.txt')), false, 'the slice is not in the tree');
  assert.equal(git(origin, 'rev-parse', 'feat/x'), before, 'nothing pushed');
});

test('the same repository with git config pilot.test integrates', (t) => {
  const { work } = scratchRepos(t);
  git(work, 'config', 'pilot.test', `node -e "console.log('ℹ pass 4'); console.log('ℹ fail 0')"`);

  const result = integrate('slice/a', { cwd: work, push: false, ...quiet });

  assert.equal(result.ok, true);
  assert.match(result.line, /: 4 pass, 0 fail; not pushed/);
});

test('an npm repository runs npm test', (t) => {
  const { work } = scratchRepos(t);
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ scripts: { test: "node -e \"console.log('ℹ pass 7'); console.log('ℹ fail 0')\"" } }));
  git(work, 'add', 'package.json');
  git(work, 'commit', '-q', '-m', 'npm');
  git(work, 'push', '-q', 'origin', 'feat/x');
  fs.mkdirSync(path.join(work, 'node_modules'));

  const result = integrate('slice/a', { cwd: work, push: false, ...quiet });

  assert.equal(result.ok, true);
  assert.match(result.line, /: 7 pass, 0 fail; not pushed/);
});

test('npm ci never runs without package.json, even when the slice moves a lockfile', (t) => {
  const installs = [];
  const { work } = scratchRepos(t, { 'package-lock.json': '{}\n' });

  const result = integrate('slice/a', { cwd: work, test: passing, install: (cwd) => installs.push(cwd), gh, push: false });

  assert.equal(result.ok, true);
  assert.deepEqual(installs, []);
});

test('a base-only call reads no run record', (t) => {
  const { work } = scratchRepos(t);
  const record = path.join(work, 'docs', 'design', 'x', 'run.json');
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, '{"slug": "x", "slices": []}\n');

  const result = integrate(undefined, { cwd: work, test: passing, ...quiet, push: false });

  assert.equal(result.ok, true, result.line);
});
