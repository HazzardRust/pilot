/**
 * `bin/pilot.mjs` hands `land`, `sync` and `budget` to their own mains (pilot-branch FA,
 * F11): each is reached by its word, and a misspelt flag is a usage error, never a run.
 * Runs in a scratch clone of a local bare origin; the deck is never started.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PILOT = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A clone on `main` of a bare origin that has `main` and no `pilot`. */
function scratch(t) {
  return gitFixture(t, 'cli-wiring:scratch', buildScratch);
}

function buildScratch(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  return work;
}

const pilot = (cwd, ...args) => {
  const env = { ...process.env, PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };
  const run = spawnSync(process.execPath, [PILOT, ...args], { cwd, encoding: 'utf8', env });
  return { code: run.status, out: run.stdout, err: run.stderr };
};

test('pilot land and pilot sync reach their mains, and a misspelt flag is their usage line', (t) => {
  const work = scratch(t);
  assert.deepEqual(pilot(work, 'land'), { code: 1, out: 'NOT landed: main is not a feat/ branch; nothing pushed\n', err: '' });
  assert.deepEqual(pilot(work, 'sync'), { code: 1, out: 'NOT synced: no origin/pilot (run pilot base first); nothing pushed\n', err: '' });
  assert.deepEqual(pilot(work, 'land', '--tset', 'x'), { code: 1, out: '', err: 'usage: pilot land\n' });
  assert.deepEqual(pilot(work, 'sync', '--tset', 'x'), { code: 1, out: '', err: 'usage: pilot sync\n' });
  assert.deepEqual(pilot(work, 'sync', '--test'), { code: 1, out: '', err: 'usage: pilot sync\n' });
});

test('pilot --dir <path> runs the verb in that directory, so a sub-deck needs no cd (QA real run, F)', (t) => {
  const work = scratch(t);
  const elsewhere = path.dirname(work);
  // From a directory that is not the clone, the verb answers as it does inside it.
  assert.deepEqual(pilot(elsewhere, '--dir', work, 'land'), pilot(work, 'land'));
  git(work, 'config', 'pilot.test', 'exit 0');
  const integrated = pilot(elsewhere, '--dir', work, 'integrate');
  assert.deepEqual(integrated, pilot(work, 'integrate'));
  assert.notDeepEqual(integrated, pilot(elsewhere, 'integrate'), 'and not as it does where it was started');
});

test('pilot --dir refuses a missing path or a file in one line and runs nothing', (t) => {
  const work = scratch(t);
  const missing = path.join(work, 'no-such-dir');
  const file = path.join(work, 'a-file');
  fs.writeFileSync(file, '');
  assert.deepEqual(pilot(work, '--dir', missing, 'land'), { code: 1, out: '', err: `pilot: --dir ${missing} is not a directory\n` });
  assert.deepEqual(pilot(work, '--dir', file, 'land'), { code: 1, out: '', err: `pilot: --dir ${file} is not a directory\n` });
  assert.deepEqual(pilot(work, '--dir'), { code: 1, out: '', err: 'pilot: --dir needs a directory\n' });
});

test('pilot budget reaches its main: a misspelt flag exits 2 with its usage line', (t) => {
  const work = scratch(t);
  assert.deepEqual(pilot(work, 'budget', '--mian', '3'), { code: 2, out: '', err: 'pilot budget: usage: pilot budget [--main N] [--yellow N]\n' });
});

test('pilot --help names the budget by main and yellow, and no --sub anywhere (yellow-agent S7)', (t) => {
  const { out } = pilot(scratch(t), '--help');
  assert.match(out, /^ {2}pilot budget \[--main N\] \[--yellow N\]$/m);
  assert.match(out, /\(default main 5, yellow 8\)/, 'bigger-jobs S4 (A2)');
  assert.match(out, /warns above 13/, 'bigger-jobs S4: the ceiling');
  assert.doesNotMatch(out, /--sub\b/);
});

test('pilot --help lists prune --run <slug> (clean-landing K12)', (t) => {
  const { out } = pilot(scratch(t), '--help');
  assert.match(out, /^ {2}pilot worktrees \[prune\] \[--repo <dir>\] \[--base <ref>\] \[--dry-run\] \[--run <slug>\]$/m);
});
