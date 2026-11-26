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

import { githubHost } from '../../deck/host-github.mjs';
import { greenChecks } from './lib/land-repos.mjs';
import { seed } from './lib/seed.mjs';

const { catchUp, main } = await import('../land.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const gitIn = (repo) => (args) => git(repo, ...args);
const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const host = githubHost(greenChecks((args) => (args[1] === 'list' ? '[]' : '')));

function commitFile(repo, file, text, message) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
}

/**
 * A bare origin with main and pilot, and `work`: a clone on `feat/a` with `a.mjs` committed,
 * pushed unless `push` is false, then with the run's own `run.json` committed and pushed when
 * `record` is true. Once `feat/a` is pushed, `fix(n)` adds a commit holding `fix<n>.mjs` to
 * origin's `feat/a` in one fast-import, as QA's worktree pushes one before the press, and answers the new tip.
 * `pilotTip` and `workTip` are origin's pilot and work's HEAD as built.
 */
function repos(t, { push = true, record = false } = {}) {
  return gitFixture(t, `land-catchup:repos:${push}:${record}`, (dir) => buildRepos(dir, { push, record }));
}

function buildRepos(dir, { push, record }) {
  const history = [
    { branch: 'main', files: { 'shared.txt': 'one\n' }, message: 'main' },
    { branch: 'feat/a', files: { 'a.mjs': 'export const a = 1;\n' }, message: 'feat a' },
  ];
  if (record) history.push({ branch: 'feat/a', files: { 'docs/design/a/run.json': '{"slug":"a"}\n' }, message: 'chore(a): run record' });
  const { origin, sha } = seed(dir, history, { pilot: 'main' });
  const work = path.join(dir, 'work');
  git(dir, 'clone', '-q', '-b', 'feat/a', origin, work);
  // Never pushed: deleting origin's feat/a from work drops work's origin/feat/a with it.
  if (!push) git(work, 'push', '-q', 'origin', '--delete', 'feat/a');
  // `git config pilot.test`, one git fewer: the value quoted, since `;` starts a config comment.
  fs.appendFileSync(path.join(work, '.git', 'config'), `[pilot]\n\ttest = ${JSON.stringify(passing)}\n`);
  const marks = path.join(dir, 'fix.marks');
  const fix = (n) => {
    const data = (text) => `data ${Buffer.byteLength(text)}\n${text}`;
    const stream = [
      'commit refs/heads/feat/a', 'mark :1', `committer test <t@example.com> ${1_700_001_000 + n} +0000`, data(`qa fix ${n}\n`),
      'from refs/heads/feat/a^0', `M 100644 inline fix${n}.mjs`, data(`${n}\n`), 'done', '',
    ].join('\n');
    execFileSync('git', [`--git-dir=${origin}`, 'fast-import', '--quiet', '--done', `--export-marks=${marks}`], { input: stream, stdio: 'pipe' });
    return fs.readFileSync(marks, 'utf8').trim().split(' ')[1];
  };
  return { origin, work, fix, pilotTip: sha.pilot, workTip: sha['feat/a'] };
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

  const said = mainSays([], { cwd: work, git: gitIn(work), host });

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
  const { origin, work, fix, pilotTip } = repos(t);
  const theirs = fix(1);
  commitFile(work, 'mine.mjs', 'mine\n', 'local work');
  const ours = git(work, 'rev-parse', 'HEAD');
  const message = `NOT landed: feat/a has diverged from origin/feat/a (local ${ours.slice(0, 7)}, origin ${theirs.slice(0, 7)}); nothing pushed`;

  assert.throws(() => catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), (err) => err.exitCode === 1 && err.message === message);
  const said = mainSays([], { cwd: work, git: gitIn(work), host });
  assert.equal(said.code, 1);
  assert.equal(said.out, `${message}\n`);
  assert.equal(git(work, 'rev-parse', 'HEAD'), ours, 'the worktree unmoved');
  const [originFeat, originPilot] = git(origin, 'rev-parse', 'feat/a', 'pilot').split('\n');
  assert.equal(originFeat, theirs, 'origin unmoved');
  assert.equal(originPilot, pilotTip, 'pilot unmoved');

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
  const { origin, work, fix, pilotTip, workTip: before } = repos(t);
  const fixed = fix(1);
  fs.writeFileSync(path.join(work, 'a.mjs'), 'export const a = 2;\n');

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
  const { origin, work, workTip: tip } = repos(t, { push: false });

  assert.deepEqual(catchUp({ cwd: work, git: gitIn(work), head: 'feat/a' }), { moved: 0 });
  const said = mainSays([], { cwd: work, git: gitIn(work), host });
  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /^landed feat\/a on pilot/);
  const [originFeat, secondParent] = git(origin, 'rev-parse', 'feat/a', 'pilot^2').split('\n');
  assert.equal(originFeat, tip, 'the first push creates it');
  assert.equal(secondParent, tip);
});

test('pilot land --test is a usage error', (t) => {
  const { origin, work, fix, pilotTip, workTip: before } = repos(t);
  fix(1);
  const ran = path.join(work, 'ran.txt');
  const command = `node -e "require('fs').writeFileSync('ran.txt', '')"`;

  for (const argv of [['--test', command], ['--test'], ['now']]) {
    const said = mainSays(argv, { cwd: work, git: gitIn(work), host });
    assert.deepEqual(said, { code: 1, out: '', err: 'usage: pilot land\n' }, argv.join(' '));
  }
  assert.ok(!fs.existsSync(ran), 'the command never runs');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing caught up');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unmoved');
});
