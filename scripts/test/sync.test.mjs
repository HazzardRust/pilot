/**
 * `pilot sync` merges the default branch into the pilot branch (pilot-branch spec 5; L20):
 * a --no-ff merge in a temporary detached worktree, the tests, a named non-forced push.
 * Every case runs against a scratch bare "origin" and a clone of it; nothing here reaches
 * a real remote.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { sync } = await import('../sync.mjs');
const { assertPushable } = await import('../pilot-branch.mjs');
const { NO_TEST } = await import('../integrate.mjs');
const { ghStub } = await import('../gh-stub.mjs');

const PILOT = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** One commit of `file` on `branch`, subjected as a push of it would be. */
const pushed = (branch, file, text) => ({ branch, files: { [file]: text }, message: `${branch}: ${file}` });

/**
 * A bare origin with main, `pilot` one file ahead of it and `feat/b` at pilot, then `more` commits; the caller's
 * clone on `feat/b`; `sha` each branch's tip. `shape` names the key: what moved on origin.
 */
function repos(t, shape = 'pilot ahead', ...more) {
  return gitFixture(t, `sync:${shape}`, (dir) => {
    const { origin, sha } = seed(dir, [{ branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' }, pushed('pilot', 'p.txt', 'p\n'), ...more], { 'feat/b': 'pilot' });
    const work = path.join(dir, 'work');
    git(dir, 'clone', '-q', '-b', 'feat/b', origin, work);
    return { origin, work, sha, gitIn: (args) => git(work, ...args) };
  });
}

/** Origin with a new main commit since pilot. */
const mainAhead = (t) => repos(t, 'main ahead', pushed('main', 'm2.txt', 'm2\n'));

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const failing = `node -e "console.log('ℹ pass 2'); console.log('ℹ fail 1'); process.exit(1)"`;

test('sync merges a new main commit into pilot', (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  const mainTip = sha.main;
  const pilotTip = sha.pilot;

  const result = sync({ cwd: work, git: gitIn, test: passing });

  assert.equal(result.merged, true, result.line);
  const tip = git(origin, 'rev-parse', 'pilot');
  assert.equal(result.sha, tip, 'pushed');
  assert.equal(git(origin, 'rev-parse', `${tip}^1`), pilotTip, 'the first parent is pilot');
  assert.equal(git(origin, 'rev-parse', `${tip}^2`), mainTip, 'the second parent is main');
  assert.equal(result.line, `synced pilot ${tip.slice(0, 7)} (main@${mainTip.slice(0, 7)}): 3 pass, 0 fail`);
});

test("sync's main merge allocates no placeholder ADR", (t) => {
  const { origin, work, gitIn } = repos(t, 'main adds a placeholder ADR', pushed('main', 'docs/adr/NNNN-x.md', '# x\n'));

  const result = sync({ cwd: work, git: gitIn, test: passing });

  assert.equal(result.merged, true, result.line);
  assert.equal(result.adr, null);
  assert.equal(git(origin, 'ls-tree', '--name-only', 'pilot', 'docs/adr/'), 'docs/adr/NNNN-x.md');
});

test('a green run with no count line prints what is known, and no ?', (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  const mainTip = sha.main;

  const result = sync({ cwd: work, git: gitIn, test: 'node -e "0"' });

  assert.equal(result.line, `synced pilot ${git(origin, 'rev-parse', '--short=7', 'pilot')} (main@${mainTip.slice(0, 7)})`);
});

test('the sync line carries the scope the run printed', (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  const mainTip = sha.main;
  const scoped = `node -e "console.log('selected 2 of 9 test files since abc1234'); console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;

  const result = sync({ cwd: work, git: gitIn, test: scoped });

  const tip = git(origin, 'rev-parse', '--short=7', 'pilot');
  assert.equal(result.line, `synced pilot ${tip} (main@${mainTip.slice(0, 7)}): 3 pass, 0 fail; selected 2 of 9 test files since abc1234`);
});

test('with no origin/pilot sync stops naming pilot base, and pushes nothing', (t) => {
  const { origin, work, gitIn } = repos(t);
  git(origin, 'branch', '-D', 'pilot');

  assert.throws(() => sync({ cwd: work, git: gitIn, test: 'node -e "0"' }), (err) =>
    err.exitCode === 1 && err.message === 'NOT synced: no origin/pilot (run pilot base first); nothing pushed');
  assert.equal(git(origin, 'branch', '--list', 'pilot'), '');
});

test('a refused push says so, and pilot is unchanged', (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  const pilotTip = sha.pilot;
  fs.writeFileSync(path.join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\necho refused >&2\nexit 1\n', { mode: 0o755 });

  assert.throws(() => sync({ cwd: work, git: gitIn, test: 'node -e "0"' }), (err) =>
    err.exitCode === 1 && /^NOT synced: the push failed \(.+\); nothing pushed$/.test(err.message));
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('sync with nothing new pushes nothing', (t) => {
  const { origin, work, sha, gitIn } = repos(t);
  const pilotTip = sha.pilot;
  const mainTip = sha.main;

  const result = sync({ cwd: work, git: gitIn, test: failing });

  assert.deepEqual({ sha: result.sha, merged: result.merged }, { sha: pilotTip, merged: false });
  assert.equal(result.line, `pilot already has main@${mainTip.slice(0, 7)}`);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('a conflicting main keeps the sync worktree for the lander', (t) => {
  const { origin, work, sha, gitIn } = repos(t, 'pilot and main both change shared.txt', pushed('pilot', 'shared.txt', 'pilot\n'), pushed('main', 'shared.txt', 'main\n'));
  const pilotTip = sha.pilot;
  const dir = path.join(path.dirname(work), `${path.basename(work)}-sync`).replaceAll(path.sep, '/'); // git's spelling

  assert.throws(
    () => sync({ cwd: work, git: gitIn, test: passing }),
    (err) => err.exitCode === 3 && /^NOT synced: main@[0-9a-f]{7} conflicts with pilot in shared\.txt; the lander resolves in /.test(err.message) && err.message.endsWith(`; the lander resolves in ${dir}`),
  );
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'the remote SHA is unchanged');
  assert.ok(fs.existsSync(path.join(dir, '.git')), 'the worktree is kept');
  assert.doesNotThrow(() => git(dir, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), 'mid-merge');
});

test('red tests push nothing', (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  const pilotTip = sha.pilot;

  assert.throws(
    () => sync({ cwd: work, git: gitIn, test: failing }),
    (err) => err.exitCode === 1 && /2 pass, 1 fail/.test(err.message) && /nothing pushed/.test(err.message),
  );
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('from a checkout on the default branch, sync pushes only pilot', (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  git(work, 'checkout', '-q', 'main');
  const mainTip = sha.main;
  const refsBefore = git(origin, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/');

  const result = sync({ cwd: work, git: gitIn, test: passing });

  assert.equal(result.merged, true, result.line);
  assert.equal(git(origin, 'rev-parse', 'main'), mainTip, 'the default branch is unchanged');
  const changed = git(origin, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/')
    .split('\n')
    .filter((line) => !refsBefore.split('\n').includes(line))
    .map((line) => line.split(' ')[0]);
  assert.deepEqual(changed, ['refs/heads/pilot']);
});

test('the guard refuses the push refspec sync uses when it names the default branch', (t) => {
  const { sha, gitIn } = repos(t);
  assert.throws(() => assertPushable(`${sha.pilot}:refs/heads/main`, { git: gitIn }), /default branch/);
  assert.doesNotThrow(() => assertPushable(`${sha.pilot}:refs/heads/pilot`, { git: gitIn }));
});

test('sync leaves the caller\'s checkout untouched', (t) => {
  const { work, sha, gitIn } = mainAhead(t);
  const head = sha.pilot; // the clone's feat/b, cut at pilot

  sync({ cwd: work, git: gitIn, test: passing });

  assert.equal(git(work, 'rev-parse', 'HEAD'), head);
  assert.equal(git(work, 'symbolic-ref', '--short', 'HEAD'), 'feat/b');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.ok(!fs.existsSync(path.join(work, 'm2.txt')));
  assert.equal(git(work, 'worktree', 'list').split('\n').length, 1, 'the temporary worktree is removed');
});

test('with no package.json and no pilot.test, sync refuses and pushes nothing', (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  const pilotTip = sha.pilot;

  assert.throws(
    () => sync({ cwd: work, git: gitIn }),
    (err) => err.exitCode === 1 && err.message === `NOT synced: ${NO_TEST}; nothing pushed`,
  );
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test("the test command is the merged tree's, not the caller's", (t) => {
  const { origin, work, sha, gitIn } = mainAhead(t);
  fs.writeFileSync(path.join(work, 'package.json'), '{}');
  const pilotTip = sha.pilot;

  assert.throws(
    () => sync({ cwd: work, git: gitIn }),
    (err) => err.exitCode === 1 && err.message === `NOT synced: ${NO_TEST}; nothing pushed`,
  );
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('pilot sync with no pilot branch name, signed out, is refused and writes nothing', (t) => {
  const { origin, work } = mainAhead(t);
  const stub = ghStub(); // answers `gh api user` with nothing: signed out
  t.after(() => fs.rmSync(stub.dir, { recursive: true, force: true }));
  const env = { ...process.env, ...stub.env };
  delete env.PILOT_BRANCH;
  const refsBefore = git(origin, 'for-each-ref');

  const run = spawnSync(process.execPath, [PILOT, 'sync'], { cwd: work, env, encoding: 'utf8', windowsHide: true });

  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /no pilot branch name/);
  assert.equal(git(origin, 'for-each-ref'), refsBefore, 'no ref written on origin');
  assert.throws(() => git(work, 'config', '--get', 'pilot.branch'), 'no name stored');
});
