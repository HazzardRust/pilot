/**
 * A landing first brings the feature worktree to `origin/feat/<slug>`, fast-forward only
 * (clean-landing spec 5, L4); `pilot land` takes no `--test` (spec 11, L12).
 * Every case runs against a scratch bare "origin" and clones of it, with `gh` faked.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { catchUp, main } = await import('../land.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const gitIn = (repo) => (args) => git(repo, ...args);
const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const gh = (args) => (args[1] === 'list' ? '[]' : '');

function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/**
 * A bare origin with main and pilot, and `work`: a clone on `feat/a` with `a.mjs` committed,
 * pushed unless `push` is false, then with the run's own `run.json` committed and pushed when
 * `record` is true. Once `feat/a` is pushed, `fix(n)` pushes `fix(n)` to it from a second clone,
 * as QA's worktree does before the press, and answers the new tip.
 */
function repos(t, { push = true, record = false } = {}) {
  return gitFixture(t, `land-catchup:repos:${push}:${record}`, (dir) => buildRepos(dir, { push, record }));
}

function buildRepos(dir, { push, record }) {
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '--bare', '-b', 'main', origin);
  const seed = path.join(dir, 'seed');
  git(dir, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commitFile(seed, 'shared.txt', 'one\n', 'main');
  git(seed, 'push', '-q', 'origin', 'main', 'main:pilot');
  const work = path.join(dir, 'work');
  git(dir, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'feat/a', 'origin/pilot');
  commitFile(work, 'a.mjs', 'export const a = 1;\n', 'feat a');
  if (push) git(work, 'push', '-q', 'origin', 'feat/a');
  git(work, 'config', 'pilot.test', passing);
  if (record) {
    fs.mkdirSync(path.join(work, 'docs', 'design', 'a'), { recursive: true });
    commitFile(work, 'docs/design/a/run.json', '{"slug":"a"}\n', 'chore(a): run record');
    git(work, 'push', '-q', 'origin', 'feat/a');
  }
  const qa = path.join(dir, 'qa');
  if (push) git(dir, 'clone', '-q', '-b', 'feat/a', origin, qa);
  const fix = (n) => {
    commitFile(qa, `fix${n}.mjs`, `${n}\n`, `qa fix ${n}`);
    git(qa, 'push', '-q', 'origin', 'feat/a');
    return git(qa, 'rev-parse', 'HEAD');
  };
  return { origin, work, fix };
}

/** `main`'s stdout and stderr and exit code. */
function mainSays(argv, inject) {
  const out = [];
  const err = [];
  const [write, writeErr] = [process.stdout.write, process.stderr.write];
  process.stdout.write = (text) => out.push(String(text));
  process.stderr.write = (text) => err.push(String(text));
  try {
    return { code: main(argv, inject), out: out.join(''), err: err.join('') };
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
  }
}

test("a worktree one commit behind origin lands with origin's commit", (t) => {
  const { origin, work, fix } = repos(t);
  const fixed = fix(1);

  const said = mainSays([], { cwd: work, git: gitIn(work), gh });

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /^caught up 1 commits from origin\/feat\/a\nlanded feat\/a on pilot at [0-9a-f]{7}\n/);
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), fixed, "pilot holds origin's tip");
  assert.equal(git(work, 'rev-parse', 'HEAD'), fixed, 'the worktree is at origin');

  const again = fix(2);
  assert.deepEqual(catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), { moved: 1 });
  assert.equal(git(work, 'rev-parse', 'HEAD'), again);
  assert.deepEqual(catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), { moved: 0 }, 'level with origin moves nothing');
});

test('a diverged worktree is refused with both SHAs', (t) => {
  const { origin, work, fix } = repos(t);
  const theirs = fix(1);
  commitFile(work, 'mine.mjs', 'mine\n', 'local work');
  const ours = git(work, 'rev-parse', 'HEAD');
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const message = `NOT landed: feat/a has diverged from origin/feat/a (local ${ours.slice(0, 7)}, origin ${theirs.slice(0, 7)}); nothing pushed`;

  assert.throws(() => catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), (err) => err.exitCode === 1 && err.message === message);
  const said = mainSays([], { cwd: work, git: gitIn(work), gh });
  assert.equal(said.code, 1);
  assert.equal(said.out, `${message}\n`);
  assert.equal(git(work, 'rev-parse', 'HEAD'), ours, 'the worktree unmoved');
  assert.equal(git(origin, 'rev-parse', 'feat/a'), theirs, 'origin unmoved');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unmoved');

  // A git that cannot answer is a refusal that says nothing was pushed, never read as diverged or absent.
  for (const broken of ['for-each-ref', 'rev-parse', 'rev-list']) {
    const failing = (args) => {
      if (args[0] === broken) throw new Error(`${broken} broke`);
      return git(work, ...args);
    };
    assert.throws(
      () => catchUp({ cwd: work, git: failing, head: 'feat/a' }),
      (err) => err.exitCode === 1 && err.message === `NOT landed: git ${broken} failed (${broken} broke); nothing pushed`,
      broken,
    );
  }
});

test('tracked changes are refused by name; an untracked file is not', (t) => {
  const { origin, work, fix } = repos(t);
  const fixed = fix(1);
  const before = git(work, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(work, 'a.mjs'), 'export const a = 2;\n');
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  assert.throws(
    () => catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }),
    (err) => err.exitCode === 1 && err.message === `NOT landed: ${work} has uncommitted changes in a.mjs; nothing pushed`,
  );
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the worktree unmoved');
  assert.equal(fs.readFileSync(path.join(work, 'a.mjs'), 'utf8'), 'export const a = 2;\n', 'the change kept, never stashed');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unmoved');

  // An untracked file the fast-forward would overwrite stops it, by name, with nothing lost.
  git(work, 'checkout', '--', 'a.mjs');
  fs.writeFileSync(path.join(work, 'fix1.mjs'), 'mine\n');
  assert.throws(
    () => catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }),
    (err) => err.exitCode === 1 && err.message.startsWith(`NOT landed: the fast-forward of ${work} to origin/feat/a stopped (`) && err.message.endsWith('); nothing pushed'),
  );
  assert.equal(fs.readFileSync(path.join(work, 'fix1.mjs'), 'utf8'), 'mine\n');

  // An ignored file there, which git would overwrite silently, stops it by name, kept.
  fs.appendFileSync(path.join(work, '.git', 'info', 'exclude'), 'fix1.mjs\n');
  assert.throws(
    () => catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }),
    (err) => err.exitCode === 1 && err.message === `NOT landed: ${work} has ignored files origin/feat/a would overwrite: fix1.mjs; nothing pushed`,
  );
  assert.equal(fs.readFileSync(path.join(work, 'fix1.mjs'), 'utf8'), 'mine\n', 'the ignored file kept');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'the worktree unmoved');
  fs.rmSync(path.join(work, 'fix1.mjs'));

  fs.writeFileSync(path.join(work, 'tmp.log'), 'scratch\n');
  assert.deepEqual(catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), { moved: 1 });
  assert.equal(git(work, 'rev-parse', 'HEAD'), fixed);
  assert.ok(fs.existsSync(path.join(work, 'tmp.log')), 'the untracked file stays');

  // Level with origin, a tracked change is not the catch-up's to refuse: nothing moves.
  fs.writeFileSync(path.join(work, 'a.mjs'), 'export const a = 3;\n');
  assert.deepEqual(catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), { moved: 0 });
  assert.equal(fs.readFileSync(path.join(work, 'a.mjs'), 'utf8'), 'export const a = 3;\n');
});

test("the run's own run.json is discarded before the fast-forward; any other change still refuses", (t) => {
  const { work, fix } = repos(t, { record: true });
  const record = path.join(work, 'docs', 'design', 'a', 'run.json');
  const fixed = fix(1);
  fs.writeFileSync(record, '{"slug":"a","next":"land"}\n');
  fs.writeFileSync(path.join(work, 'a.mjs'), 'export const a = 2;\n');

  assert.throws(
    () => catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }),
    (err) => err.message === `NOT landed: ${work} has uncommitted changes in a.mjs; nothing pushed`,
  );
  git(work, 'checkout', '--', 'a.mjs');
  assert.deepEqual(catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), { moved: 1 });
  assert.equal(git(work, 'rev-parse', 'HEAD'), fixed);
  assert.equal(git(work, 'status', '--porcelain'), '', "the mirror's copy discarded");
});

test('no origin branch yet lands as today', (t) => {
  const { origin, work } = repos(t, { push: false });
  const tip = git(work, 'rev-parse', 'HEAD');

  assert.deepEqual(catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), { moved: 0 });
  const said = mainSays([], { cwd: work, git: gitIn(work), gh });
  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /^landed feat\/a on pilot/);
  assert.equal(git(origin, 'rev-parse', 'feat/a'), tip, 'the first push creates it');
  assert.equal(git(origin, 'rev-parse', 'pilot^2'), tip);
});

test('pilot land --test is a usage error', (t) => {
  const { origin, work, fix } = repos(t);
  const before = git(work, 'rev-parse', 'HEAD');
  fix(1);
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const ran = path.join(work, 'ran.txt');
  const command = `node -e "require('fs').writeFileSync('ran.txt', '')"`;

  for (const argv of [['--test', command], ['--test'], ['now']]) {
    const said = mainSays(argv, { cwd: work, git: gitIn(work), gh });
    assert.deepEqual(said, { code: 1, out: '', err: 'usage: pilot land\n' }, argv.join(' '));
  }
  assert.ok(!fs.existsSync(ran), 'the command never runs');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing caught up');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unmoved');
});
