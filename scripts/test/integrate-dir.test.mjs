/**
 * `pilot integrate ... --dir <worktree>` (deck-writes-github spec 5, S4): the pilot or QA names the
 * worktree in the one command, so the existing `Bash(pilot integrate *)` rule matches it with no
 * `cd` in front. `--dir` stands anywhere in argv, beside a branch or `--trial`; a path that is not a
 * directory is a usage error before anything runs.
 *
 * Every case runs from this process's own cwd, never the fixture, against a scratch bare "origin"
 * and a clone of it; nothing here reaches a real remote.
 */

// A red run's log goes under a home of this process's own; the fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { main } = await import('../integrate.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * A bare origin, a clone on `feat/x` that pilot already holds, and a pushed `slice/a` adding one
 * file; `base` is feat/x's tip, where the clone and the `from` worktree start.
 */
function scratchRepos(t) {
  return gitFixture(t, 'integrate-dir:scratchRepos', (root) => {
    const work = path.join(root, 'work');
    // main and pilot at feat/x's one commit; the clone on feat/x, tracking it, origin/HEAD naming main.
    const { origin, sha } = seed(root, [
      { branch: 'feat/x', files: { 'base.txt': 'base\n' }, message: 'base' },
      { branch: 'slice/a', files: { 'a.txt': 'a\n' }, message: 'the slice' },
    ], { main: 'feat/x', pilot: 'feat/x' });
    git(root, 'clone', '-q', '-b', 'feat/x', origin, work);
    // A second worktree of the same repository, the one the command is run from.
    const from = path.join(root, 'from');
    git(work, 'worktree', 'add', '-q', '--detach', from);
    return { origin, work, from, base: sha['feat/x'] };
  });
}

const passing = `node -e "console.log('ℹ pass 3'); console.log('ℹ fail 0')"`;
const quiet = { test: passing, install: () => {}, host: githubHost((args) => (args[0] === 'pr' ? '[]' : 'me\n')) };

/**
 * `main(argv, inject)` with its stdout and stderr captured: `{ code, out, err }`. `from` is the
 * cwd it runs from, injected as `cwd`, which `--dir` replaces.
 */
function run(argv, from, inject = { ...quiet, cwd: from }) {
  const out = [];
  const err = [];
  const { write } = process.stdout;
  const { write: writeErr } = process.stderr;
  process.stdout.write = (text) => out.push(String(text));
  process.stderr.write = (text) => err.push(String(text));
  try {
    return { code: main(argv, inject), out: out.join(''), err: err.join('') };
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
  }
}

test('--dir runs the integration in that worktree', (t) => {
  const { work, from, base: here } = scratchRepos(t);
  const cwd = process.cwd();

  const { code, out } = run(['slice/a', '--no-push', '--dir', work], from);

  assert.equal(code, 0, out);
  assert.match(out, /^integrated slice\/a at /);
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'Merge slice/a', 'merged in the named worktree');
  assert.equal(git(from, 'rev-parse', 'HEAD'), here, 'the worktree it ran from is untouched');
  assert.equal(process.cwd(), cwd, 'no chdir');
});

test('--dir outside the repository it is run from is refused', (t) => {
  const { work, base: before } = scratchRepos(t);

  // From this process's own cwd, the pilot checkout: another repository than the fixture.
  const { code, out, err } = run(['slice/a', '--no-push', '--dir', work], undefined, quiet);

  assert.equal(code, 1);
  assert.equal(err, `pilot integrate: --dir ${work} is not a worktree of this repository\n`);
  assert.equal(out, '', 'nothing run');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing merged');
});

test('--dir with no directory is a usage error', (t) => {
  const { work, from, base: before } = scratchRepos(t);
  const missing = path.join(work, 'no-such-dir');
  const file = path.join(work, 'base.txt');

  for (const dir of [missing, file]) {
    const { code, out, err } = run(['slice/a', '--no-push', '--dir', dir], from);
    assert.equal(code, 1, dir);
    assert.equal(err, `pilot integrate: --dir ${dir} is not a directory\n`);
    assert.equal(out, '', 'nothing run');
  }
  const bare = run(['slice/a', '--no-push', '--dir'], from);
  assert.equal(bare.code, 1, '--dir with no path at all');
  assert.equal(bare.out, '');
  assert.equal(git(work, 'rev-parse', 'HEAD'), before, 'nothing merged');
});

test('--dir after the branch parses the same', (t) => {
  const trailer = 'Reviewed-in: S4';
  const first = scratchRepos(t);
  const before = run(['--dir', first.work, 'slice/a', '--trailer', trailer, '--no-push'], first.from);
  const second = scratchRepos(t);
  const after = run(['slice/a', '--trailer', trailer, '--no-push', '--dir', second.work], second.from);

  for (const [{ code, out }, { work, origin }] of [[before, first], [after, second]]) {
    assert.equal(code, 0, out);
    const [subject, body] = git(work, 'log', '-1', '--format=%s%x00%B').split('\0');
    assert.equal(subject, 'Merge slice/a');
    assert.match(body, new RegExp(`^${trailer}$`, 'm'), 'the trailer still reaches the merge');
    assert.notEqual(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'), '--no-push still holds');
  }
});

test('--trial takes --dir and nothing else', (t) => {
  const { work, from } = scratchRepos(t);

  const { code, out } = run(['--trial', '--dir', work], from);

  assert.equal(code, 0, out);
  assert.equal(out, `on pilot: clean at ${git(work, 'rev-parse', '--short=7', 'HEAD')}\n`);

  const mixed = run(['--trial', '--no-push', '--dir', work], from);
  assert.equal(mixed.code, 1);
  assert.match(mixed.err, /^usage: pilot integrate /);
  assert.equal(mixed.out, '');
});
