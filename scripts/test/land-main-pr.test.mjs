/**
 * S2 of one-integration-line: the landing keeps one PR from pilot to main (spec 3; A1, A5, A6).
 * `mainGetsPilot` reuses the one open PR head pilot, base the default branch, else opens it; a
 * run remote other than origin opens none. A feature PR GitHub left open is closed with the
 * landing comment, and the landing's last line is `mainLine`'s. `gh` is always faked.
 */

import { repos, passing, fakeGh, mainSays, land } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { mainGetsPilot, mainLine } = await import('../land.mjs');

/** A git with `pilot.remote` set to `remote` (unset when undefined), remotes origin and fork, and main as origin's HEAD. */
function stubGit(remote) {
  return (args) => {
    const key = args.join(' ');
    if (key === 'config --get pilot.remote') {
      if (remote === undefined) throw Object.assign(new Error('unset'), { status: 1 });
      return remote;
    }
    if (key === 'remote') return 'origin\nfork';
    if (key === 'ls-remote --symref origin HEAD') return 'ref: refs/heads/main\tHEAD\n';
    throw new Error(`unexpected git ${key}`);
  };
}

const creates = (calls) => calls.filter((args) => args[0] === 'pr' && args[1] === 'create');

test('the first landing opens the main PR', () => {
  const { gh, calls } = fakeGh([], undefined, { created: 901 });

  const main = mainGetsPilot({ git: stubGit(), gh });

  assert.equal(creates(calls).length, 1);
  assert.deepEqual(creates(calls)[0], ['pr', 'create', '--base', 'main', '--head', 'pilot', '--title', 'main gets pilot', '--body', '']);
  assert.deepEqual(main, { number: 901, opened: true });
  assert.equal(mainLine(main), 'main gets pilot: #901 (opened)');
});

test('a later landing reuses it', () => {
  const { gh, calls } = fakeGh([
    { number: 901, headRefName: 'pilot', state: 'OPEN' },
    // A fork's branch named pilot is never the main PR.
    { number: 950, headRefName: 'pilot', state: 'OPEN', isCrossRepository: true },
  ]);

  const main = mainGetsPilot({ git: stubGit('origin'), gh });

  assert.equal(creates(calls).length, 0);
  assert.deepEqual(main, { number: 901, opened: false });
  assert.equal(mainLine(main), 'main gets pilot: #901');
});

test('a fork run remote opens none', () => {
  const { gh, calls } = fakeGh();

  const main = mainGetsPilot({ git: stubGit('fork'), gh });

  assert.equal(main.number, null);
  assert.equal(calls.length, 0);
  assert.equal(mainLine(main), 'main gets pilot: open a PR from fork/pilot to main by hand');
  assert.equal(mainLine(mainGetsPilot({ git: stubGit('none'), gh })), 'main gets pilot: open a PR from pilot to main by hand');
  assert.equal(calls.length, 0);
});

test('a gh that fails reads unknown, with why', () => {
  const gh = () => {
    throw new Error('no GitHub host');
  };

  const main = mainGetsPilot({ git: stubGit(), gh });

  assert.equal(main.number, null);
  assert.equal(mainLine(main), 'main gets pilot: unknown (gh pr list failed: no GitHub host)');
});

test('an open feature PR is closed with the landing comment', (t) => {
  const { gitIn, a } = repos(t, 'a');
  // The feature PR targets pilot; GitHub left it open.
  const { gh, calls } = fakeGh([{ number: 7, headRefName: 'feat/a', baseRefName: 'pilot', state: 'OPEN' }]);

  const result = land({ cwd: a, git: gitIn(a), gh, test: passing });

  const closes = calls.filter((args) => args[0] === 'pr' && args[1] === 'close');
  assert.equal(closes.length, 1);
  assert.deepEqual(closes[0].slice(0, 4), ['pr', 'close', '7', '--comment']);
  assert.match(closes[0][4], new RegExp(`^landed on pilot at ${result.sha}`));
  assert.ok(!calls.some((args) => args[1] === 'comment'), 'the comment rides on the close');
  assert.ok(!calls.some((args) => args[1] === 'merge'), 'no PR is merged');
});

test('a re-landing closes the feature PR left open', (t) => {
  const { gitIn, a } = repos(t, 'a');
  const first = land({ cwd: a, git: gitIn(a), gh: fakeGh().gh, test: passing });
  const called = (calls, verb) => calls.filter((args) => args[0] === 'pr' && args[1] === verb);

  // Already on pilot, its PR still open against pilot: closed with the landing comment.
  const open = fakeGh([{ number: 7, headRefName: 'feat/a', baseRefName: 'pilot', state: 'OPEN' }]);
  const again = land({ cwd: a, git: gitIn(a), gh: open.gh, test: passing });
  assert.equal(again.already, true);
  assert.equal(called(open.calls, 'close').length, 1);
  assert.deepEqual(called(open.calls, 'close')[0], ['pr', 'close', '7', '--comment', `landed on pilot at ${first.sha}`]);
  assert.equal(called(open.calls, 'comment').length, 0);
  // With no open main PR, an already-landed feature opens none and reads no unknown (F3).
  assert.equal(called(open.calls, 'create').length, 0);
  assert.deepEqual(again.main, { number: null, opened: false, none: true });
  assert.equal(mainLine(again.main), 'main gets pilot: no open PR');

  // Closed, or against main: no new comment.
  const closed = fakeGh([
    { number: 7, headRefName: 'feat/a', baseRefName: 'pilot', state: 'CLOSED' },
    { number: 8, headRefName: 'feat/a', baseRefName: 'main', state: 'OPEN' },
  ]);
  land({ cwd: a, git: gitIn(a), gh: closed.gh, test: passing });
  assert.equal(called(closed.calls, 'close').length, 0);
  assert.equal(called(closed.calls, 'comment').length, 0);
});

test("the landing's last line is the main line", (t) => {
  const { gitIn, a } = repos(t, 'a');
  const { gh } = fakeGh([{ number: 7, headRefName: 'feat/a' }, { number: 901, headRefName: 'pilot', state: 'OPEN' }]);

  const said = mainSays([], { cwd: a, git: gitIn(a), gh, test: passing });

  assert.equal(said.code, 0, said.out);
  assert.match(said.out, /\nmain gets pilot: #901\n$/);
  assert.doesNotMatch(said.out, /^(?:merge first|ready|pr ready failed)/m);
  assert.equal(mainSays(['--ready'], {}).code, 1, '--ready is gone: usage');
});
