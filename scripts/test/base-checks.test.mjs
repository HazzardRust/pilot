/**
 * ci-gate S6: `pilot base` says when the tip it prints is red or pending (spec 6; L4, L7, L8). Runs `base` against a
 * scratch bare origin and a fake host; nothing reaches GitHub. Base reports, so the exit code stays 0.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { base } = await import('../base.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A bare origin holding `main` and `pilot` at one commit, and a clone of it. */
function scratch(t) {
  return gitFixture(t, 'base-checks:scratch', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(work, 'push', '-q', 'origin', 'main', 'main:pilot');
    git(work, 'remote', 'set-head', 'origin', 'main');
    return { work };
  });
}

/** The line `base` prints at `work` with `host`, and the shas the host was asked about. */
async function printed(work, checks) {
  const asked = [];
  const host = checks === undefined ? undefined : { checks: (sha) => { asked.push(sha); return checks; } };
  const said = [];
  const code = await base({ cwd: work, say: (text) => said.push(text), warn: () => {}, ...(host ? { host } : {}) });
  return { code, out: said.join(''), asked };
}

test('a red base says so, naming each failed check', async (t) => {
  const { work } = scratch(t);
  const sha = git(work, 'rev-parse', 'origin/pilot');
  const { code, out, asked } = await printed(work, [
    { name: 'gate (ubuntu)', outcome: 'fail' }, { name: 'gate (windows)', outcome: 'fail' }, { name: 'lint', outcome: 'pass' },
  ]);
  assert.equal(code, 0);
  assert.equal(out, `base pilot ${sha.slice(0, 7)} (CI red at ${sha.slice(0, 7)}: gate (ubuntu), gate (windows))\n`);
  assert.deepEqual(asked, [sha]);
});

test('a pending base says so, once', async (t) => {
  const { work } = scratch(t);
  const sha7 = git(work, 'rev-parse', '--short', 'origin/pilot');
  const { out } = await printed(work, [{ name: 'gate', outcome: 'pending' }, { name: 'gate 2', outcome: 'pending' }]);
  assert.equal(out, `base pilot ${sha7} (CI pending at ${sha7})\n`);
});

test('green, none, unread and no host print today\'s line', async (t) => {
  const { work } = scratch(t);
  const today = `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')}\n`;
  assert.equal((await printed(work)).out, today, 'no host');
  assert.deepEqual((await printed(work)).asked, [], 'no host, no read');
  assert.equal((await printed(work, [{ name: 'gate', outcome: 'pass' }])).out, today, 'green');
  assert.equal((await printed(work, [])).out, today, 'none');
  assert.equal((await printed(work, 'not checks')).out, today, 'unread');
});
