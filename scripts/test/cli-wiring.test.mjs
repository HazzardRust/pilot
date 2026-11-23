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

const DECK_OFF = { PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };

/** The command as a terminal runs it: a real `node bin/pilot.mjs` process. */
const spawnPilot = (cwd, ...args) => {
  const env = { ...process.env, ...DECK_OFF };
  const child = spawnSync(process.execPath, [PILOT, ...args], { cwd, encoding: 'utf8', env, windowsHide: true });
  return { code: child.status, out: child.stdout, err: child.stderr };
};

const { run } = await import('../../bin/pilot.mjs');

/**
 * The same `run(argv)` the CLI calls, in this process (S8 of cheap-suite): cwd, stdout, stderr,
 * the deck variables and the exit code are this call's own and put back after it.
 */
const pilot = async (cwd, ...args) => {
  const saved = { cwd: process.cwd(), code: process.exitCode, out: process.stdout.write, err: process.stderr.write, env: { ...process.env } };
  const said = { out: '', err: '' };
  process.stdout.write = (text) => ((said.out += String(text)), true);
  process.stderr.write = (text) => ((said.err += String(text)), true);
  Object.assign(process.env, DECK_OFF);
  process.exitCode = undefined;
  process.chdir(cwd);
  try {
    await run(args);
    return { code: process.exitCode ?? 0, ...said };
  } finally {
    process.chdir(saved.cwd);
    process.exitCode = saved.code;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
    for (const name of Object.keys(DECK_OFF)) if (saved.env[name] === undefined) delete process.env[name]; else process.env[name] = saved.env[name];
  }
};

test('pilot land and pilot sync reach their mains, and a misspelt flag is their usage line', async (t) => {
  const work = scratch(t);
  assert.deepEqual(spawnPilot(work, 'land'), { code: 1, out: 'NOT landed: main is not a feat/ branch; nothing pushed\n', err: '' });
  assert.deepEqual(await pilot(work, 'sync'), { code: 1, out: 'NOT synced: no origin/pilot (run pilot base first); nothing pushed\n', err: '' });
  assert.deepEqual(await pilot(work, 'land', '--tset', 'x'), { code: 1, out: '', err: 'usage: pilot land\n' });
  assert.deepEqual(await pilot(work, 'sync', '--tset', 'x'), { code: 1, out: '', err: 'usage: pilot sync\n' });
  assert.deepEqual(await pilot(work, 'sync', '--test'), { code: 1, out: '', err: 'usage: pilot sync\n' });
});

test('pilot --dir <path> runs the verb in that directory, so a sub-deck needs no cd (QA real run, F)', async (t) => {
  const work = scratch(t);
  const elsewhere = path.dirname(work);
  // From a directory that is not the clone, the verb answers as it does inside it.
  assert.deepEqual(await pilot(elsewhere, '--dir', work, 'land'), await pilot(work, 'land'));
  git(work, 'config', 'pilot.test', 'exit 0');
  const integrated = await pilot(elsewhere, '--dir', work, 'integrate');
  assert.deepEqual(integrated, await pilot(work, 'integrate'));
  assert.notDeepEqual(integrated, await pilot(elsewhere, 'integrate'), 'and not as it does where it was started');
});

test('pilot --dir refuses a missing path or a file in one line and runs nothing', async (t) => {
  const work = scratch(t);
  const missing = path.join(work, 'no-such-dir');
  const file = path.join(work, 'a-file');
  fs.writeFileSync(file, '');
  assert.deepEqual(await pilot(work, '--dir', missing, 'land'), { code: 1, out: '', err: `pilot: --dir ${missing} is not a directory\n` });
  assert.deepEqual(await pilot(work, '--dir', file, 'land'), { code: 1, out: '', err: `pilot: --dir ${file} is not a directory\n` });
  assert.deepEqual(await pilot(work, '--dir'), { code: 1, out: '', err: 'pilot: --dir needs a directory\n' });
});

test('pilot budget reaches its main: a misspelt flag exits 2 with its usage line', async (t) => {
  const work = scratch(t);
  assert.deepEqual(await pilot(work, 'budget', '--mian', '3'), { code: 2, out: '', err: 'pilot budget: usage: pilot budget [--main N] [--yellow N]\n' });
});

test('pilot --help lists the budget usage line, and no --sub anywhere (yellow-agent S7)', async (t) => {
  const { out } = await pilot(scratch(t), '--help');
  // lint: the budget's usage line is listed and no --sub flag is
  assert.match(out, /^ {2}pilot budget \[--main N\] \[--yellow N\]$/m);
  assert.doesNotMatch(out, /--sub\b/);
});

test('pilot --help lists prune --run <slug> (clean-landing K12)', async (t) => {
  const { out } = await pilot(scratch(t), '--help');
  assert.match(out, /^ {2}pilot worktrees \[prune\] \[--repo <dir>\] \[--base <ref>\] \[--dry-run\] \[--run <slug>\]$/m);
});
