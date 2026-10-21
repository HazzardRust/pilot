/**
 * S2 of pilot-fork: `pilot sync` merges origin's default into the run remote's `pilot`, or
 * the local `pilot` under `none`, never forced (spec 4; L1, L3). Each case runs against a
 * scratch bare origin whose `pilot` is ahead of `main`, plus a second bare remote; nothing
 * reaches GitHub or a deck.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { mergeIntoPilot, sync } = await import('../sync.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const refs = (repo) => git(repo, 'for-each-ref', '--format=%(refname) %(objectname)');
const green = 'node -e "0"';

/** origin.git holds `main` and a `pilot` one commit ahead, then a newer `main`; second.git is empty; work clones origin. */
function scratchRepos(t) {
  return gitFixture(t, 'sync-remote:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const origin = path.join(root, 'origin.git');
  const second = path.join(root, 'second.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '--bare', '-b', 'main', second);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'landed on pilot');
  git(work, 'push', '-q', 'origin', 'HEAD:pilot');
  git(work, 'reset', '-q', '--hard', 'origin/main');
  // A file, not an empty commit: a main that changes nothing is synced as a no-op (one-integration-line S6).
  fs.writeFileSync(path.join(work, 'new.txt'), 'new\n');
  git(work, 'add', 'new.txt');
  git(work, 'commit', '-q', '-m', 'new on main');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'remote', 'add', 'second', second);
  const pilotTip = git(origin, 'rev-parse', 'refs/heads/pilot');
  const mainTip = git(origin, 'rev-parse', 'refs/heads/main');
  const inWork = (args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { origin, second, work, pilotTip, mainTip, inWork };
}

/** `tip` is a merge whose first parent is `pilot` and whose second is `main`. */
function assertMerge(repo, tip, pilotTip, mainTip) {
  assert.equal(git(repo, 'rev-parse', `${tip}^1`), pilotTip, 'the first parent is pilot');
  assert.equal(git(repo, 'rev-parse', `${tip}^2`), mainTip, 'the second parent is main');
}

test('sync pushes the merge to the second remote\'s pilot', (t) => {
  const { origin, second, work, pilotTip, mainTip, inWork } = scratchRepos(t);
  git(work, 'push', '-q', 'second', `${pilotTip}:refs/heads/pilot`);
  git(work, 'config', 'pilot.remote', 'second');
  const before = refs(origin);

  const result = sync({ cwd: work, git: inWork, test: green });

  assert.equal(result.merged, true, result.line);
  const tip = git(second, 'rev-parse', 'refs/heads/pilot');
  assert.equal(result.sha, tip, 'pushed to second');
  assertMerge(second, tip, pilotTip, mainTip);
  assert.equal(refs(origin), before, "origin's pilot does not move");
});

test('sync under none moves the local pilot only', (t) => {
  const { origin, second, work, pilotTip, mainTip, inWork } = scratchRepos(t);
  git(work, 'branch', '-q', '--no-track', 'pilot', pilotTip);
  git(work, 'config', 'pilot.remote', 'none');
  const before = refs(origin);

  const result = sync({ cwd: work, git: inWork, test: green });

  assert.equal(result.merged, true, result.line);
  const tip = git(work, 'rev-parse', 'refs/heads/pilot');
  assert.equal(result.sha, tip, 'the local pilot moved');
  assertMerge(work, tip, pilotTip, mainTip);
  assert.equal(refs(origin), before, 'nothing pushed to origin');
  assert.equal(refs(second), '', 'nothing pushed to second');
});

test('a local pilot that moved meanwhile is not overwritten', (t) => {
  const { origin, work, pilotTip, mainTip, inWork } = scratchRepos(t);
  git(work, 'branch', '-q', '--no-track', 'pilot', pilotTip);
  git(work, 'config', 'pilot.remote', 'none');
  const before = refs(origin);
  // The suite run moves the shared local pilot, as another session would while it ran.
  const moving = `git update-ref refs/heads/pilot ${mainTip}`;

  assert.throws(
    () => mergeIntoPilot({ cwd: work, git: inWork, source: mainTip, message: 'Merge main into pilot', label: 'main', test: moving }),
    (err) => err.exitCode === 1 && err.pushRejected === true && /^NOT synced: .+; nothing pushed$/.test(err.message),
  );
  assert.equal(git(work, 'rev-parse', 'refs/heads/pilot'), mainTip, 'pilot is where the other writer left it');
  assert.equal(refs(origin), before, 'nothing pushed to origin');
});

test("sync names the run remote's missing pilot, and pushes nothing", (t) => {
  const { origin, second, work, inWork } = scratchRepos(t);
  const before = refs(origin);
  for (const [mode, ref] of [['second', 'second/pilot'], ['none', 'pilot']]) {
    git(work, 'config', 'pilot.remote', mode);
    assert.throws(() => sync({ cwd: work, git: inWork, test: green }), (err) =>
      err.exitCode === 1 && err.message === `NOT synced: no ${ref} (run pilot base first); nothing pushed`);
  }
  assert.equal(refs(origin), before, 'nothing pushed to origin');
  assert.equal(refs(second), '', 'nothing pushed to second');
});

test('under none a pilot checked out in a worktree is not moved, and the worktree is named', (t) => {
  const { work, pilotTip, inWork } = scratchRepos(t);
  git(work, 'branch', '-q', '--no-track', 'pilot', pilotTip);
  git(work, 'config', 'pilot.remote', 'none');
  git(work, 'worktree', 'add', '-q', path.join(path.dirname(work), 'held'), 'pilot');

  assert.throws(() => sync({ cwd: work, git: inWork, test: green }), (err) =>
    err.exitCode === 1 && /^NOT synced: pilot is checked out in \S*held; nothing pushed$/.test(err.message));
  assert.equal(git(work, 'rev-parse', 'refs/heads/pilot'), pilotTip, 'the local pilot did not move');
});
