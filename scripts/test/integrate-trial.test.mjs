/**
 * `pilot integrate --trial` (one-integration-line S5, spec 1; L5, A2): the feature's tip is
 * pushed (never forced) and tried against the run remote's pilot as fetched; nothing is merged
 * into the feature, origin/main is never read. Clean prints `on pilot: clean at <sha7>`; a
 * conflict prepares the landing's merge in the kept `<checkout>-land-<slug>`, mid-merge on
 * pilot's tip, for the lander, and exits 3; pilot itself never moves. A scratch bare "origin"
 * and a clone of it, with `gh` a function; nothing reaches a real remote or GitHub.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { trial, main } = await import('../integrate.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * main, a pilot that changed `pilotFile`, and feat/x (cut from main, pushed) that changed
 * shared.txt and holds one commit more than origin has; main moves on after the cut, so feat
 * is behind origin/main. With `pilotFile` shared.txt the feature conflicts with pilot. `tip` is
 * feat/x's local tip, `pilot` origin's pilot.
 */
function repos(t, pilotFile) {
  return gitFixture(t, `integrate-trial:${pilotFile}`, (dir) => {
    const work = path.join(dir, 'work');
    const { origin, sha } = seed(dir, [
      { branch: 'main', files: { 'shared.txt': 'base\n' }, message: 'base' },
      { branch: 'pilot', files: { [pilotFile]: 'pilot\n' }, message: 'pilot change' },
      { branch: 'feat/x', from: 'main', files: { 'shared.txt': 'feat\n' }, message: 'feat shared' },
      { branch: 'main', files: { 'main.txt': 'main\n' }, message: 'main moves on' },
    ]);
    git(dir, 'clone', '-q', origin, work);
    // Local pilot and feat/x with no upstream, as the build that pushed them from here had them.
    git(work, 'branch', '-q', '--no-track', 'pilot', 'origin/pilot');
    git(work, 'checkout', '-q', '--no-track', '-b', 'feat/x', 'origin/feat/x');
    fs.writeFileSync(path.join(work, 'feat.txt'), 'more\n');
    git(work, 'add', 'feat.txt');
    git(work, 'commit', '-q', '-m', 'feat, not yet pushed');
    return { origin, work, tip: git(work, 'rev-parse', 'HEAD'), pilot: sha.pilot };
  });
}

const merges = (work) => Number(git(work, 'rev-list', '--count', '--merges', 'HEAD'));

test('the trial pushes the tip and merges nothing', (t) => {
  const { origin, work, tip, pilot } = repos(t, 'pilot.txt');
  assert.throws(() => git(work, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD'), 'feat is behind origin/main');

  const result = trial({ cwd: work });

  assert.equal(result.ok, true, result.line);
  assert.equal(result.line, `on pilot: clean at ${tip.slice(0, 7)}`);
  assert.equal(git(work, 'rev-parse', 'HEAD'), tip, "feat's tip is unchanged");
  assert.equal(merges(work), 0, 'no merge commit made');
  const [pushed, pilotAfter] = git(origin, 'rev-parse', 'refs/heads/feat/x', 'refs/heads/pilot').split('\n');
  assert.equal(pushed, tip, 'the tip is pushed');
  assert.equal(pilotAfter, pilot, 'pilot is unmoved');
});

test("a conflicted trial prepares the lander's merge", (t) => {
  const { origin, work, tip, pilot } = repos(t, 'shared.txt');
  const dir = path.join(path.dirname(work), `${path.basename(work)}-land-x`);

  const result = trial({ cwd: work });

  assert.equal(result.code, 3, result.line);
  assert.equal(result.ok, false);
  assert.equal(result.line, `feat/x conflicts with pilot in shared.txt; the lander resolves in ${dir}`);
  const [keptHead, mergeHead] = git(dir, 'rev-parse', 'HEAD', 'MERGE_HEAD').split('\n');
  assert.equal(keptHead, pilot, "the kept dir is on pilot's tip");
  assert.equal(mergeHead, tip, 'mid-merge of the feature');
  assert.match(git(dir, 'status', '--porcelain'), /^UU shared\.txt/m);
  const [pilotAfter, pushed] = git(origin, 'rev-parse', 'refs/heads/pilot', 'refs/heads/feat/x').split('\n');
  assert.equal(pilotAfter, pilot, 'pilot is unmoved');
  assert.equal(pushed, tip, 'the tip is pushed');
  assert.equal(git(work, 'rev-parse', 'HEAD'), tip, 'the feature worktree is where it was');
  assert.equal(merges(work), 0, 'no merge commit made');
});

test('--default is a usage error', (t) => {
  const said = [];
  const write = process.stderr.write;
  process.stderr.write = (text) => said.push(String(text));
  t.after(() => { process.stderr.write = write; });
  const never = { get cwd() { return assert.fail('integrated on a usage error'); } };
  const usage = 'usage: pilot integrate [<slice-branch>] [--no-push] [--trailer "<line>"]... [--dir <worktree>] | pilot integrate --trial [--dir <worktree>]\n';
  for (const argv of [['--default'], ['--trial', 'feat/x'], ['--trial', '--no-push'], ['--trial', '--trailer', 'A: b'], ['--trial', '--force']]) {
    said.length = 0;
    assert.equal(main(argv, never), 1, argv.join(' '));
    assert.deepEqual(said, [usage], argv.join(' '));
  }
});
