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

import { githubHost } from '../../deck/host-github.mjs';
import { greenChecks } from './lib/land-repos.mjs';
import { seed } from './lib/seed.mjs';

const { land } = await import('../land.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const refs = (repo) => git(repo, 'for-each-ref', '--format=%(refname) %(objectname)');
const green = 'node -e "0"';

/**
 * origin.git holds `main`, `pilot` at it, and `feat/x`, one commit adding x.txt cut from pilot, or
 * with `merged` from `Merge feat/y into pilot` (feat/y: one commit adding y.txt), the pilot that
 * feat/y landed on in second only. second.git is empty; `work` is a clone on feat/x, with second
 * as a remote and `pilot.remote` set to `remote`. `xTip` and `pilotTip` are feat/x's and pilot's tips as seeded.
 */
function scratchRepos(t, { remote, merged = false }) {
  return gitFixture(t, `land-remote:scratchRepos:${remote}:${merged}`, (root) => buildScratchRepos(root, { remote, merged }));
}

function buildScratchRepos(root, { remote, merged }) {
  const history = [{ branch: 'main', files: {}, message: 'main' }];
  if (merged) {
    history.push(
      { branch: 'feat/y', files: { 'y.txt': 'y\n' }, message: 'feat y' },
      { branch: 'feat/x', from: 'main', merge: ['feat/y'], files: {}, message: 'Merge feat/y into pilot' },
    );
  }
  history.push({ branch: 'feat/x', files: { 'x.txt': 'x\n' }, message: 'feat x' });
  const { origin, sha } = seed(root, history, { pilot: 'main' });
  const second = path.join(root, 'second.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', second);
  // A clone sets origin/HEAD, as `remote set-head` did; `remote add` and `git config` are lines in its config.
  git(root, 'clone', '-q', '-b', 'feat/x', origin, work);
  fs.appendFileSync(path.join(work, '.git', 'config'), `[remote "second"]\n\turl = ${JSON.stringify(second)}\n\tfetch = +refs/heads/*:refs/remotes/second/*\n[pilot]\n\tremote = ${remote}\n`);
  const inWork = (args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { origin, second, work, inWork, xTip: sha['feat/x'], pilotTip: sha.pilot };
}

/**
 * `githubHost` over a fake `gh` answering `pr list --head` with `heads`, any other `pr list` with `prs`, `pr comment`
 * with '', and recording its argv, a `--body-file <f>` as `--body <text>`, read at the call.
 */
function fakeGh(prs = [], heads = []) {
  const calls = [];
  const gh = (given) => {
    const at = given.indexOf('--body-file');
    const args = at < 0 ? given : [...given.slice(0, at), '--body', fs.readFileSync(given[at + 1], 'utf8'), ...given.slice(at + 2)];
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(args.includes('--head') ? heads : prs);
    if (args[0] === 'pr' && args[1] === 'comment') return '';
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  return { host: githubHost(greenChecks(gh)), calls };
}

test("land pushes the landing to the second remote's pilot", (t) => {
  const { origin, second, work, inWork, xTip, pilotTip: pilotBefore } = scratchRepos(t, { remote: 'second', merged: true });
  // feat/y landed earlier on second's pilot only (feat/x's parent); feat/x is cut from that pilot.
  git(work, 'push', '-q', 'second', 'feat/x~1:refs/heads/pilot');
  git(work, 'fetch', '-q', 'second');
  const { host, calls } = fakeGh([], [{ number: 9, state: 'MERGED', baseRefName: 'pilot', isCrossRepository: false }]);

  const result = land({ cwd: work, git: inWork, host, test: green });

  const tip = git(second, 'rev-parse', 'refs/heads/pilot');
  assert.equal(git(second, 'log', '-1', '--format=%s', tip), 'Merge feat/x into pilot');
  assert.equal(git(second, 'rev-parse', `${tip}^2`), xTip, 'the feature tip is the second parent');
  assert.equal(result.sha, tip);
  assert.equal(result.already, false);
  const [originPilot, originFeat] = git(origin, 'rev-parse', 'refs/heads/pilot', 'refs/heads/feat/x').split('\n');
  assert.equal(originPilot, pilotBefore, "origin's pilot does not move");
  assert.equal(originFeat, xTip, 'the feature is on origin');
  assert.deepEqual(result.main, { number: null, opened: false, byHand: 'second/pilot' }, 'no main PR is opened from a second remote');
  assert.deepEqual(calls.find((args) => args[1] === 'comment'), ['pr', 'comment', '9', '--body', `landed on pilot at ${tip}`], "the comment goes on origin's feature PR");
  assert.ok(calls.every((args) => !args.includes('--repo')), 'no --repo on gh (L3)');
});

test('land under none lands on the local pilot', (t) => {
  const { origin, second, work, inWork, xTip, pilotTip } = scratchRepos(t, { remote: 'none' });
  git(work, 'branch', '-q', '--no-track', 'pilot', 'origin/pilot');
  const before = refs(origin);
  // The first test run moves the local pilot, as another session would; the second finds it moved and passes.
  const moved = git(work, 'commit-tree', `${pilotTip}^{tree}`, '-p', pilotTip, '-m', 'moved');
  const moving = `git update-ref refs/heads/pilot ${moved} ${pilotTip} || ${green}`;

  const result = land({ cwd: work, git: inWork, host: fakeGh().host, test: moving });

  const tip = git(work, 'rev-parse', 'refs/heads/pilot');
  assert.equal(git(work, 'log', '-1', '--format=%s', tip), 'Merge feat/x into pilot');
  const [first, secondParent] = git(work, 'rev-parse', `${tip}^1`, `${tip}^2`).split('\n');
  assert.equal(first, moved, 'merged again onto the moved pilot');
  assert.equal(secondParent, xTip, 'the feature tip is the second parent');
  assert.equal(result.sha, tip);
  assert.equal(result.already, false);
  assert.equal(result.retried, true);
  assert.equal(refs(origin), before, 'nothing but feat/x is pushed');
  assert.equal(refs(second), '', 'nothing pushed to second');
});

test("a second remote's pilot that moved meanwhile is fetched and merged again once", (t) => {
  const { origin, second, work, inWork, xTip, pilotTip } = scratchRepos(t, { remote: 'second' });
  git(work, 'push', '-q', 'second', 'origin/pilot:refs/heads/pilot');
  git(work, 'fetch', '-q', 'second');
  const pilotBefore = pilotTip;
  // The first test run pushes a newer pilot to second, as another session would; the second finds it there.
  const moved = git(work, 'commit-tree', `${pilotTip}^{tree}`, '-p', pilotTip, '-m', 'moved');
  const moving = `git push -q "${second}" ${moved}:refs/heads/pilot`;

  const result = land({ cwd: work, git: inWork, host: fakeGh().host, test: moving });

  const tip = git(second, 'rev-parse', 'refs/heads/pilot');
  assert.equal(git(second, 'log', '-1', '--format=%s', tip), 'Merge feat/x into pilot');
  const [first, secondParent] = git(second, 'rev-parse', `${tip}^1`, `${tip}^2`).split('\n');
  assert.equal(first, moved, 'merged again onto the moved pilot');
  assert.equal(secondParent, xTip, 'the feature tip is the second parent');
  assert.equal(result.retried, true);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), pilotBefore, "origin's pilot does not move");
});
