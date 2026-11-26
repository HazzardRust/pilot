/**
 * user-pilot-branch S5: the deck's reads and the tip script follow `<login>-pilot` (spec 1, 4; L5, L6, L8).
 * Real git in scratch repositories; no host, no deck. `PILOT_BRANCH` is deleted from this process (the gate
 * pins it to `pilot`), so the name is the repository's `pilot.branch`.
 */

import { GIT_SLOW_MS } from '../../scripts/test/lib/git-fixture.mjs';
import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { assertOnPilotTip } from '../lineage.mjs';
import { DeckRefusal } from '../store.mjs';
import { deleteMerged } from '../../scripts/branches.mjs';
import { pilotTip } from '../../scripts/pilot-tip.mjs';

const NAME = 'hazzardrust-pilot';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repo named `NAME` by config, `origin/pilot` at A and `origin/<NAME>` at B, one commit past A; HEAD at A. */
function scratch(t) {
  const saved = process.env.PILOT_BRANCH;
  delete process.env.PILOT_BRANCH;
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'deck-user-branch-')));
  t.after(() => {
    if (saved === undefined) delete process.env.PILOT_BRANCH;
    else process.env.PILOT_BRANCH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'pilot.branch', NAME);
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'A');
  const a = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'update-ref', 'refs/remotes/origin/pilot', a);
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'B');
  const b = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'update-ref', `refs/remotes/origin/${NAME}`, b);
  git(dir, 'checkout', '-q', '--detach', a);
  return { dir, a, b };
}

test('the tip read names the branch', (t) => {
  const { dir, b } = scratch(t);
  assert.deepEqual(pilotTip({ cwd: dir }), { ref: `origin/${NAME}`, sha: b, behind: 1 });
});

test('plan drift reads the user\'s branch', (t) => {
  const { dir, a, b } = scratch(t);
  git(dir, 'branch', 'design/on-user', b);
  git(dir, 'branch', 'design/on-legacy', a);
  assert.doesNotThrow(() => assertOnPilotTip(dir, 'design/on-user', { timeout: GIT_SLOW_MS }));
  assert.throws(
    () => assertOnPilotTip(dir, 'design/on-legacy', { timeout: GIT_SLOW_MS }),
    (err) => err instanceof DeckRefusal && err.message.includes(`is not on ${NAME}'s tip`),
  );
});

test('the legacy pilot is never pruned', (t) => {
  const { dir, a } = scratch(t);
  const run = (args) => git(dir, ...args);
  const origin = path.join(path.dirname(dir), `${path.basename(dir)}-origin.git`);
  git(path.dirname(dir), 'init', '-q', '--bare', '-b', 'main', origin);
  t.after(() => fs.rmSync(origin, { recursive: true, force: true }));
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-q', 'origin', `${a}:refs/heads/main`, `${a}:refs/heads/pilot`, `${a}:refs/heads/${NAME}`);
  git(dir, 'fetch', '-q', 'origin');
  git(dir, 'remote', 'set-head', 'origin', 'main');
  const { kept } = deleteMerged({ git: run, host: null, select: () => true, dryRun: true });
  const why = Object.fromEntries(kept.map(({ branch, why: reason }) => [branch, reason]));
  assert.match(why.pilot, /^refused: /);
  assert.match(why[NAME], /^refused: /);
});

test('plan drift with no pilot branch name is refused, and a legacy base still reads', (t) => {
  const { dir, a } = scratch(t);
  git(dir, 'branch', 'design/on-legacy', a);
  assert.doesNotThrow(() => assertOnPilotTip(dir, 'design/on-legacy', { base: 'pilot', timeout: GIT_SLOW_MS }));
  git(dir, 'config', '--unset', 'pilot.branch');
  assert.throws(
    () => assertOnPilotTip(dir, 'design/on-legacy', { timeout: GIT_SLOW_MS }),
    (err) => err instanceof DeckRefusal && /could not be named/.test(err.message),
  );
});
