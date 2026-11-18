/**
 * S2 of one-integration-line: the landing keeps one PR from pilot to main (spec 3; A1, A5, A6).
 * `releasePr` reuses the one open PR head pilot, base the default branch, else opens it. A feature PR GitHub left open takes the
 * landing comment and is never closed (pilot-develop-line S2), and the landing's last line is `mainLine`'s. `gh` is always faked.
 */

import { repos, passing, fakeGh, mainSays, land } from './lib/land-repos.mjs';

import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { mainLine } = await import('../land.mjs');
const { releasePr } = await import('../release.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');

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
    // main..pilot holds one landing, feat/a's.
    if (args[0] === 'log') return `${'a'.repeat(40)}\t${'b'.repeat(40)} ${'c'.repeat(40)}\tMerge feat/a into pilot`;
    throw new Error(`unexpected git ${key}`);
  };
}

const creates = (calls) => calls.filter((args) => args[0] === 'pr' && args[1] === 'create');

test('the first landing opens the main PR', () => {
  const { gh, calls } = fakeGh([], undefined, { created: 901 });
  const bodies = [];
  const host = githubHost((args) => {
    const at = args.indexOf('--body-file');
    if (at >= 0) bodies.push(fs.readFileSync(args[at + 1], 'utf8'));
    return gh(args);
  });

  const main = releasePr({ git: stubGit(), host });

  assert.equal(creates(calls).length, 1);
  assert.deepEqual(creates(calls)[0].filter((arg, i, all) => all[i - 1] !== '--body-file'), ['pr', 'create', '--base', 'main', '--head', 'pilot', '--title', 'Release: a', '--label', 'release', '--body-file']);
  assert.deepEqual(bodies, [`| Feature | PR | Landing |\n| --- | --- | --- |\n| a | – | ${'a'.repeat(40)} |`]);
  assert.deepEqual(main, { number: 901, opened: true });
  assert.equal(mainLine(main), 'main gets pilot: #901 (opened)');
});

test('a later landing reuses it', () => {
  const { gh, calls } = fakeGh([
    // A fork's branch named pilot is never the main PR, even listed first.
    { number: 950, headRefName: 'pilot', state: 'OPEN', isCrossRepository: true },
    { number: 901, headRefName: 'pilot', state: 'OPEN' },
  ]);

  const main = releasePr({ git: stubGit('origin'), host: githubHost(gh) });

  assert.equal(creates(calls).length, 0);
  assert.deepEqual(main, { number: 901, opened: false });
  assert.equal(mainLine(main), 'main gets pilot: #901');
});

test('a gh that fails reads unknown, with why', () => {
  const gh = () => {
    throw new Error('no GitHub host');
  };

  const main = releasePr({ git: stubGit(), host: githubHost(gh) });

  assert.equal(main.number, null);
  assert.equal(mainLine(main), 'main gets pilot: unknown (gh pr list failed: no GitHub host)');
});

/** `fakeGh`'s answer, but a throw on `pr <verb>`, or `said` printed in its place. */
function failing(verb, open, said) {
  const { gh } = fakeGh(open, undefined, { created: 905 });
  return (args) => {
    if (args[0] !== 'pr' || args[1] !== verb) return gh(args);
    if (said !== undefined) return said;
    throw new Error('HTTP 502');
  };
}

test('a host write that fails reads unknown, with why', () => {
  const open = [{ number: 901, headRefName: 'pilot', state: 'OPEN' }];
  const cases = [
    [failing('edit', open), /^gh pr edit failed: .*HTTP 502/],
    [failing('create', []), /^gh pr create failed: .*HTTP 502/],
    [failing('create', [], 'created\n'), /^gh pr create failed: /],
  ];
  for (const [gh, why] of cases) {
    const main = releasePr({ git: stubGit(), host: githubHost(gh) });

    assert.equal(main.number, null);
    assert.equal(main.opened, false);
    assert.match(main.why, why);
  }
});

test('an unreadable merged list reads unknown, with why', () => {
  const { gh: answer } = fakeGh([]);
  const gh = (args) => (args.includes('merged') ? 'not json' : answer(args));

  const main = releasePr({ git: stubGit(), host: githubHost(gh) });

  assert.equal(main.number, null);
  assert.match(main.why, /^release notes failed: /);
});

test('no host under a fork run remote hands the fork branch over', () => {
  assert.deepEqual(releasePr({ git: stubGit('fork'), host: null }), { number: null, opened: false, byHand: 'fork/pilot' });
});

test('an open feature PR takes the landing comment, never a close', (t) => {
  const { gitIn, a } = repos(t, 'a');
  // The feature PR targets pilot; GitHub left it open.
  const { gh, calls } = fakeGh([{ number: 7, headRefName: 'feat/a', baseRefName: 'pilot', state: 'OPEN' }]);

  const result = land({ cwd: a, git: gitIn(a), gh, test: passing, wait: 0 });

  const comments = calls.filter((args) => args[0] === 'pr' && args[1] === 'comment');
  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0].slice(0, 4), ['pr', 'comment', '7', '--body']);
  assert.match(comments[0][4], new RegExp(`^landed on pilot at ${result.sha}`));
  assert.ok(!calls.some((args) => args[1] === 'close'), 'no PR is closed');
  assert.ok(!calls.some((args) => args[1] === 'merge'), 'no PR is merged');
});

test('a re-landing comments on nothing', (t) => {
  const { gitIn, a } = repos(t, 'a');
  land({ cwd: a, git: gitIn(a), gh: fakeGh().gh, test: passing });
  const called = (calls, verb) => calls.filter((args) => args[0] === 'pr' && args[1] === verb);

  // Already on pilot, its PR still open against pilot: neither closed nor commented.
  const open = fakeGh([{ number: 7, headRefName: 'feat/a', baseRefName: 'pilot', state: 'OPEN' }]);
  const again = land({ cwd: a, git: gitIn(a), gh: open.gh, test: passing, wait: 0 });
  assert.equal(again.already, true);
  assert.equal(called(open.calls, 'close').length, 0);
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
