/**
 * S4 of pilot-fork: `pilot land` lands onto the run remote's `pilot`, or the local `pilot`
 * under `none`, while `feat/<slug>` and the PR comment stay on origin (spec 4; L1, L3). Each
 * case runs against a scratch bare origin and a second bare remote, with `gh` faked; nothing
 * reaches GitHub or a deck.
 */

// A red run's log goes under a home of this process's own, never the real one.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { land } = await import('../land.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const refs = (repo) => git(repo, 'for-each-ref', '--format=%(refname) %(objectname)');
const green = 'node -e "0"';

/** origin.git holds `main` and `pilot` at it; second.git is empty; work clones origin, with second as a remote. */
function scratchRepos(t) {
  return gitFixture(t, 'land-remote:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const origin = path.join(root, 'origin.git');
  const second = path.join(root, 'second.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '--bare', '-b', 'main', second);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main', 'main:pilot');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'remote', 'add', 'second', second);
  const inWork = (args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { origin, second, work, inWork };
}

/** Checks out `feat/<name>` from `from` in `work` with one commit, pushed to origin; answers its tip. */
function feature(work, name, from) {
  git(work, 'checkout', '-q', '-b', `feat/${name}`, from);
  fs.writeFileSync(path.join(work, `${name}.txt`), `${name}\n`);
  git(work, 'add', `${name}.txt`);
  git(work, 'commit', '-q', '-m', `feat ${name}`);
  git(work, 'push', '-q', 'origin', `feat/${name}`);
  return git(work, 'rev-parse', 'HEAD');
}

/** A fake `gh` answering `pr list --head` with `heads`, any other `pr list` with `prs`, `pr comment` with '', and recording its argv. */
function fakeGh(prs = [], heads = []) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(args.includes('--head') ? heads : prs);
    if (args[0] === 'pr' && args[1] === 'comment') return '';
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { gh, calls };
}

test("land pushes the landing to the second remote's pilot", (t) => {
  const { origin, second, work, inWork } = scratchRepos(t);
  // feat/y landed earlier on second's pilot only; feat/x is cut from that pilot.
  const yTip = feature(work, 'y', 'origin/main');
  git(work, 'checkout', '-q', '--detach', 'origin/pilot');
  git(work, 'merge', '-q', '--no-ff', '-m', 'Merge feat/y into pilot', yTip);
  git(work, 'push', '-q', 'second', 'HEAD:refs/heads/pilot');
  git(work, 'fetch', '-q', 'second');
  const xTip = feature(work, 'x', 'second/pilot');
  git(work, 'config', 'pilot.remote', 'second');
  const pilotBefore = git(origin, 'rev-parse', 'refs/heads/pilot');
  const { gh, calls } = fakeGh([], [{ number: 9, state: 'MERGED', baseRefName: 'pilot', isCrossRepository: false }]);

  const result = land({ cwd: work, git: inWork, gh, test: green });

  const tip = git(second, 'rev-parse', 'refs/heads/pilot');
  assert.equal(git(second, 'log', '-1', '--format=%s', tip), 'Merge feat/x into pilot');
  assert.equal(git(second, 'rev-parse', `${tip}^2`), xTip, 'the feature tip is the second parent');
  assert.equal(result.sha, tip);
  assert.equal(result.already, false);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), pilotBefore, "origin's pilot does not move");
  assert.equal(git(origin, 'rev-parse', 'refs/heads/feat/x'), xTip, 'the feature is on origin');
  assert.deepEqual(result.main, { number: null, opened: false, byHand: 'second/pilot' }, 'no main PR is opened from a second remote');
  assert.deepEqual(calls.find((args) => args[1] === 'comment'), ['pr', 'comment', '9', '--body', `landed on pilot at ${tip}`], "the comment goes on origin's feature PR");
  assert.ok(calls.every((args) => !args.includes('--repo')), 'no --repo on gh (L3)');
});

test('land under none lands on the local pilot', (t) => {
  const { origin, second, work, inWork } = scratchRepos(t);
  git(work, 'branch', '-q', '--no-track', 'pilot', 'origin/pilot');
  const xTip = feature(work, 'x', 'pilot');
  git(work, 'config', 'pilot.remote', 'none');
  const before = refs(origin);
  // The first test run moves the local pilot, as another session would; the second finds it moved and passes.
  const pilotTip = git(work, 'rev-parse', 'refs/heads/pilot');
  const moved = git(work, 'commit-tree', `${pilotTip}^{tree}`, '-p', pilotTip, '-m', 'moved');
  const moving = `git update-ref refs/heads/pilot ${moved} ${pilotTip} || ${green}`;

  const result = land({ cwd: work, git: inWork, gh: fakeGh().gh, test: moving });

  const tip = git(work, 'rev-parse', 'refs/heads/pilot');
  assert.equal(git(work, 'log', '-1', '--format=%s', tip), 'Merge feat/x into pilot');
  assert.equal(git(work, 'rev-parse', `${tip}^1`), moved, 'merged again onto the moved pilot');
  assert.equal(git(work, 'rev-parse', `${tip}^2`), xTip, 'the feature tip is the second parent');
  assert.equal(result.sha, tip);
  assert.equal(result.already, false);
  assert.equal(result.retried, true);
  assert.equal(refs(origin), before, 'nothing but feat/x is pushed');
  assert.equal(refs(second), '', 'nothing pushed to second');
});

test("a second remote's pilot that moved meanwhile is fetched and merged again once", (t) => {
  const { origin, second, work, inWork } = scratchRepos(t);
  git(work, 'push', '-q', 'second', 'origin/pilot:refs/heads/pilot');
  git(work, 'fetch', '-q', 'second');
  const xTip = feature(work, 'x', 'second/pilot');
  git(work, 'config', 'pilot.remote', 'second');
  const pilotBefore = git(origin, 'rev-parse', 'refs/heads/pilot');
  // The first test run pushes a newer pilot to second, as another session would; the second finds it there.
  const pilotTip = git(work, 'rev-parse', 'second/pilot');
  const moved = git(work, 'commit-tree', `${pilotTip}^{tree}`, '-p', pilotTip, '-m', 'moved');
  const moving = `git push -q "${second}" ${moved}:refs/heads/pilot`;

  const result = land({ cwd: work, git: inWork, gh: fakeGh().gh, test: moving });

  const tip = git(second, 'rev-parse', 'refs/heads/pilot');
  assert.equal(git(second, 'log', '-1', '--format=%s', tip), 'Merge feat/x into pilot');
  assert.equal(git(second, 'rev-parse', `${tip}^1`), moved, 'merged again onto the moved pilot');
  assert.equal(git(second, 'rev-parse', `${tip}^2`), xTip, 'the feature tip is the second parent');
  assert.equal(result.retried, true);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), pilotBefore, "origin's pilot does not move");
});
