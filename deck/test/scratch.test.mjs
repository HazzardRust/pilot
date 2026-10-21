/**
 * `pilot deck --scratch` (audit-f1-f7 S6): an agent's own deck, on its own port, with its
 * own store under the temp directory, that outlives the command that started it. Each
 * test stops what it starts, by the pid it was given; nothing here sweeps processes,
 * touches 4321 or writes under the user's home (L7).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import './no-open.mjs';
import { bearer } from '../../hooks/lib/deck-secret.js';
import { fromLeash, leashArgs, startScratch } from '../scratch.mjs';
import { DECK_PORT } from '../tools.mjs';

const CLI = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));

/** Stops the scratch deck by its own pid and removes what it left: its dir and its registry file. */
function stopping(t, { pid, dir }) {
  t.after(async () => {
    try {
      process.kill(pid);
      // Windows holds the deck's open log until the process is really gone.
      for (let tries = 0; tries < 50; tries += 1) {
        process.kill(pid, 0);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch {
      /* gone */
    }
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(path.join(os.tmpdir(), `pilot-scratch-${pid}.json`), { force: true });
  });
}

const health = async (url) => {
  const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
  return { status: response.status, body: await response.json() };
};

function cli(t, args, { session = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-scratch-cli-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { CLAUDE_PID, ...outside } = process.env;
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    // The test is the session: a scratch deck outlives its CLI but not its session (process-gc S1).
    env: { ...outside, PILOT_DECK_DIR: home, ...(session ? { CLAUDE_PID: String(process.pid) } : {}) },
    timeout: 20_000,
  });
}

/** The `key value` lines `pilot deck --scratch` prints, as an object. */
const parsed = (stdout) => Object.fromEntries(stdout.trim().split('\n').map((line) => line.trim().split(/ (.*)/s).slice(0, 2)));

test('a scratch deck answers on its own port', async (t) => {
  const deck = await startScratch();
  stopping(t, deck);
  const { status, body } = await health(deck.url);
  assert.equal(status, 200);
  assert.equal(body.pid, deck.pid);
  assert.notEqual(new URL(deck.url).port, '4321');
  const registry = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), `pilot-scratch-${deck.pid}.json`), 'utf8'));
  assert.deepEqual(registry, { pid: deck.pid, port: Number(new URL(deck.url).port), dir: deck.dir });
});

test('it outlives its starter', async (t) => {
  const run = cli(t, ['deck', '--scratch']);
  assert.equal(run.status, 0, run.stderr);
  const deck = parsed(run.stdout);
  stopping(t, { pid: Number(deck.pid), dir: deck.dir });
  const { status, body } = await health(deck.url);
  assert.equal(status, 200);
  assert.equal(body.pid, Number(deck.pid));
});

// Outside a session the leash is the launcher's parent (here, this test), not the CLI that has already exited.
test('outside a session it outlives its starter by more than one leash poll', async (t) => {
  const run = cli(t, ['deck', '--scratch'], { session: false });
  assert.equal(run.status, 0, run.stderr);
  const deck = parsed(run.stdout);
  stopping(t, { pid: Number(deck.pid), dir: deck.dir });
  await new Promise((resolve) => setTimeout(resolve, 4500));
  const { status, body } = await health(deck.url);
  assert.equal(status, 200);
  assert.equal(body.pid, Number(deck.pid));
});

test('the leash is the session, else a live parent; an orphan launcher holds no --leash', () => {
  assert.deepEqual(leashArgs({ CLAUDE_PID: '5' }, 1, 'w'), ['--leash', '5', '--leash-dir', 'w']);
  assert.deepEqual(leashArgs({}, 42, 'w'), ['--leash', '42', '--leash-dir', 'w']);
  for (const ppid of [0, 1]) assert.deepEqual(leashArgs({}, ppid, 'w'), ['--leash-dir', 'w'], `ppid ${ppid}`);
});

test('a --from deck off the deck port is leashed like a scratch deck, and on it is not', () => {
  assert.deepEqual(fromLeash(DECK_PORT + 1, { CLAUDE_PID: '5' }, 1, 'w'), ['--leash', '5', '--leash-dir', 'w']);
  assert.deepEqual(fromLeash(DECK_PORT, { CLAUDE_PID: '5' }, 1, 'w'), []);
});

test("the user's store is untouched", async (t) => {
  const deck = await startScratch();
  stopping(t, deck);
  assert.ok(path.resolve(deck.dir).startsWith(path.resolve(os.tmpdir())), deck.dir);
  const response = await fetch(`${deck.url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bearer(deck.dir) },
    body: JSON.stringify({ repo: deck.dir, pid: process.pid }),
  });
  assert.equal(response.status, 200, await response.text());
  assert.ok(fs.existsSync(path.join(deck.dir, 'deck.json')));
});

test('a taken port is refused', async (t) => {
  const held = net.createServer();
  await new Promise((resolve) => held.listen(0, '127.0.0.1', resolve));
  t.after(() => held.close());
  const { port } = held.address();
  const run = cli(t, ['deck', '--scratch', '--port', String(port)]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, new RegExp(`\\b${port}\\b`));
  assert.equal(run.stdout, '');
});
