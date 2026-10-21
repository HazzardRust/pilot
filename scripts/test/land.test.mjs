/**
 * `pilot land` puts a finished feature on the pilot branch (pilot-branch spec 2, 4, 6;
 * red-lands-on-pilot spec 1, 3; L2): sync, push the feature, merge it into `pilot`, test,
 * push, retry once, then keep the one PR from pilot to main. Every case runs against a scratch bare
 * "origin" and clones of it, with `gh` faked; nothing here reaches a real remote.
 */

// A red run's log goes under a home of this process's own, never the real one.
import { git, isAncestor, commitFile, repos, passing, fakeGh, merges, mainSays, land } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('land merges the feature into pilot', (t) => {
  const { origin, gitIn, a: work } = repos(t, 'a');
  const { gh, calls } = fakeGh();
  const before = git(origin, 'rev-parse', 'pilot');

  const result = land({ cwd: work, git: gitIn(work), gh, test: passing });

  const tip = git(work, 'rev-parse', 'feat/a');
  assert.equal(merges(origin, 'pilot')[0], `Merge feat/a into pilot ${before} ${tip}`, 'a merge with the feature tip as second parent');
  assert.equal(git(origin, 'rev-parse', 'feat/a'), tip, 'the feature is pushed');
  assert.equal(result.sha, git(origin, 'rev-parse', 'pilot'));
  assert.equal(result.already, false);
  assert.equal(result.retried, false);
  assert.deepEqual(result.main, { number: 900, opened: true });
  assert.match(result.commentFailed, /no open or merged PR has head feat\/a/);
  assert.deepEqual(calls.filter((args) => args.includes('create')).map((args) => args[args.indexOf('--head') + 1]), ['pilot'], 'the one PR created is pilot to main');
  assert.ok(calls.every((args) => !args.includes('merge')), 'no PR is merged');
});

test('a pilot that moved while the merge was tested is merged again once and lands', (t) => {
  const { origin, mover, gitIn, a, b } = repos(t, 'a', 'b');
  const aTip = git(a, 'rev-parse', 'feat/a');

  // Feature a lands while b's merge is tested: b's first push to pilot is no longer a fast-forward.
  const result = land({ cwd: b, git: gitIn(b), gh: fakeGh().gh, test: mover(a, 'feat/a', 1) });

  const pilot = git(origin, 'rev-parse', 'pilot');
  assert.equal(result.retried, true);
  assert.equal(merges(origin, 'pilot')[0], `Merge feat/b into pilot ${aTip} ${git(b, 'rev-parse', 'feat/b')}`);
  assert.equal(result.sha, pilot);
  assert.ok(!isAncestor(b, aTip, 'feat/b'), 'feat/b never takes a');
});

test('a conflict merging into pilot exits 3 and leaves pilot unchanged', (t) => {
  const { origin, seed, gitIn, b } = repos(t, 'b');
  commitFile(b, 'shared.txt', 'b\n', 'b edits shared');
  git(seed, 'checkout', '-q', '-B', 'pilot', 'origin/pilot');
  commitFile(seed, 'shared.txt', 'pilot\n', 'pilot edits shared');
  git(seed, 'push', '-q', 'origin', 'pilot');
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  assert.throws(() => land({ cwd: b, git: gitIn(b), gh: fakeGh().gh, test: passing }), (err) => err.exitCode === 3);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('a failing gh still lands and leaves the main PR unknown', (t) => {
  const { origin, gitIn, a } = repos(t, 'a');
  const gh = () => {
    throw new Error('no GitHub host');
  };

  const result = land({ cwd: a, git: gitIn(a), gh, test: passing });

  assert.equal(git(origin, 'rev-parse', 'pilot'), result.sha);
  assert.equal(result.main.number, null);
  assert.match(result.main.why, /no GitHub host/);
});

test('still moving after one retry exits 1 and pushes nothing to pilot', (t) => {
  const { origin, seed, mover, gitIn, b } = repos(t, 'b');

  assert.throws(
    () => land({ cwd: b, git: gitIn(b), gh: fakeGh().gh, test: mover(seed, 'new', 2) }),
    (err) => err.exitCode === 1 && /after one retry/.test(err.message),
  );
  assert.ok(!isAncestor(origin, git(b, 'rev-parse', 'feat/b'), 'pilot'), 'feat/b is not on pilot');
});

test('a push to pilot refused while pilot stays put fails once, with no retry', (t) => {
  const { origin, gitIn, a } = repos(t, 'a');
  const log = path.join(origin, 'pilot-pushes.log');
  const hook = `#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = refs/heads/pilot ]; then echo x >> "${log.replace(/\\/g, '/')}"; echo "pilot is closed" >&2; exit 1; fi\ndone\n`;
  fs.writeFileSync(path.join(origin, 'hooks', 'pre-receive'), hook, { mode: 0o755 });
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  assert.throws(
    () => land({ cwd: a, git: gitIn(a), gh: fakeGh().gh, test: passing }),
    (err) => err.exitCode === 1 && /^NOT landed: the push failed \(.+\); pilot not pushed$/.test(err.message),
  );
  assert.equal(fs.readFileSync(log, 'utf8'), 'x\n', 'one push to pilot, no retry');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('land refuses outside a feat/ branch', (t) => {
  const { origin, seed, gitIn } = repos(t);
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const mainTip = git(origin, 'rev-parse', 'main');

  for (const branch of ['main', 'pilot']) {
    git(seed, 'checkout', '-q', '-B', branch, `origin/${branch}`);
    assert.throws(
      () => land({ cwd: seed, git: gitIn(seed), gh: fakeGh().gh, test: passing }),
      (err) => err.exitCode === 1 && err.message.includes(branch) && /feat\//.test(err.message),
    );
  }
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip, 'pilot unmoved');
  assert.equal(git(origin, 'rev-parse', 'main'), mainTip, 'main unmoved');
});

test('land takes nothing from main', (t) => {
  const { origin, seed, gitIn, a: work } = repos(t, 'a');
  commitFile(seed, 'm2.txt', 'm2\n', 'main moves');
  git(seed, 'push', '-q', 'origin', 'main');
  const mainTip = git(origin, 'rev-parse', 'main');
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  land({ cwd: work, git: gitIn(work), gh: fakeGh().gh, test: passing });

  assert.equal(git(origin, 'rev-list', '--first-parent', '--count', pilotTip + '..pilot'), '1', 'pilot gains one first-parent commit');
  assert.equal(git(origin, 'log', '-1', '--format=%s', 'pilot'), 'Merge feat/a into pilot');
  assert.ok(!git(origin, 'log', '--format=%s', pilotTip + '..pilot').includes('Merge main into pilot'));
  assert.ok(!isAncestor(origin, mainTip, 'pilot'), "main's new commit is not on pilot");
});

test('a red main does not stop the landing', (t) => {
  const { origin, seed, gitIn, a: work } = repos(t, 'a');
  commitFile(seed, 'm2.txt', 'm2\n', 'main moves');
  git(seed, 'push', '-q', 'origin', 'main');
  // Red only if main's file is present, as it would be had main been merged.
  const redIfMain = 'node -e "process.exit(require(\'fs\').existsSync(\'m2.txt\') ? 1 : 0)"';

  land({ cwd: work, git: gitIn(work), gh: fakeGh().gh, test: redIfMain });

  assert.equal(git(origin, 'rev-parse', 'pilot^2'), git(work, 'rev-parse', 'feat/a'));
});

test('an unusable pilot.remote stops land before anything is pushed', (t) => {
  const { origin, gitIn, a: work } = repos(t, 'a');
  commitFile(work, 'f2.txt', 'f2\n', 'feature moves');
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const featTip = git(origin, 'rev-parse', 'feat/a');
  git(work, 'config', 'pilot.remote', 'nowhere');

  assert.throws(() => land({ cwd: work, git: gitIn(work), gh: fakeGh().gh, test: passing }), (err) =>
    err.exitCode === 1 && /^NOT landed: .*; nothing pushed$/.test(err.message));
  assert.equal(git(origin, 'rev-parse', 'feat/a'), featTip, 'feat/a was not pushed');
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('a red run leaves pilot unmoved and says why', (t) => {
  const { origin, gitIn, a: work } = repos(t, 'a');
  const pilotTip = git(origin, 'rev-parse', 'pilot');
  const red = 'node -e "process.exit(1)"';

  const said = mainSays([], { cwd: work, git: gitIn(work), gh: fakeGh().gh, test: red });
  assert.equal(said.code, 1);
  assert.match(said.out, /^NOT landed: feat\/a merged red: exit 1; log .+\.log; pilot not pushed\n$/);
  // An empty command is not a green one: mergeIntoPilot runs the repository's own instead.
  git(work, 'config', 'pilot.test', red);
  assert.equal(mainSays([], { cwd: work, git: gitIn(work), gh: fakeGh().gh, test: '' }).code, 1);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('a feature already on pilot merges nothing', (t) => {
  const { origin, gitIn, a } = repos(t, 'a');
  land({ cwd: a, git: gitIn(a), gh: fakeGh().gh, test: passing });
  const pilotTip = git(origin, 'rev-parse', 'pilot');

  const seen = fakeGh([{ number: 11, headRefName: 'feat/a', headRefOid: git(a, 'rev-parse', 'HEAD') }]);
  const again = mainSays([], { cwd: a, git: gitIn(a), gh: seen.gh, test: passing });
  assert.equal(again.code, 0);
  assert.ok(!seen.calls.some((args) => args[1] === 'comment'), 'no second comment for a feature already on pilot');
  assert.equal(again.out, `feat/a already on pilot at ${pilotTip.slice(0, 7)}\nmain gets pilot: no open PR\n`);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotTip);
});

test('main prints the main line, and unknown with the reason when gh fails', (t) => {
  const { clone, gitIn, a } = repos(t, 'a');
  git(a, 'config', 'pilot.test', passing);
  const none = mainSays([], { cwd: a, git: gitIn(a), gh: fakeGh([{ number: 11, headRefName: 'feat/a', headRefOid: git(a, 'rev-parse', 'HEAD') }]).gh });
  assert.equal(none.code, 0);
  assert.match(none.out, /^landed feat\/a on pilot at [0-9a-f]{7}\nmain gets pilot: #900 \(opened\)\n$/);

  const b = clone('b');
  const failing = () => {
    throw new Error('no GitHub host');
  };
  git(b, 'config', 'pilot.test', passing);
  const unknown = mainSays([], { cwd: b, git: gitIn(b), gh: failing });
  assert.equal(unknown.code, 0);
  assert.match(unknown.out, /\npr comment failed: no GitHub host\nmain gets pilot: unknown \(gh pr list failed: no GitHub host\)\n$/);
});
