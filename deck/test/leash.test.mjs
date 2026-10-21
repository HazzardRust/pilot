/**
 * The leash (process-gc S1, L1-L4): a daemon that is not the user's deck dies within 10 s of
 * the pid that started it, or of its file or `--leash-dir` vanishing. Every process a test here
 * starts is stopped in its teardown, by the pid it was given.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import './no-open.mjs';
import { holdLeash, leashFrom, sessionPid } from '../leash.mjs';

const DAEMON_FILE = path.join('deck', 'daemon.mjs');

test("the user's deck has no leash", () => {
  assert.equal(leashFrom([], {}, { ppid: 7, daemonFile: DAEMON_FILE }), null);
  assert.equal(leashFrom([], { PILOT_DECK_PORT: '4321' }, { ppid: 7, daemonFile: DAEMON_FILE }), null);
  assert.deepEqual(leashFrom([], { PILOT_DECK_PORT: '50123' }, { ppid: 7, daemonFile: DAEMON_FILE }), { pid: 7, paths: [DAEMON_FILE] });
});

test('--leash and --leash-dir are read', () => {
  const dir = path.join(os.tmpdir(), 'somewhere');
  assert.deepEqual(leashFrom(['--leash', '42', '--leash-dir', dir], {}, { ppid: 7, daemonFile: DAEMON_FILE }), {
    pid: 42,
    paths: [DAEMON_FILE, dir],
  });
  assert.throws(() => leashFrom(['--leash', 'x'], {}, { ppid: 7, daemonFile: DAEMON_FILE }), /--leash/);
  assert.throws(() => leashFrom(['--leash-dir'], {}, { ppid: 7, daemonFile: DAEMON_FILE }), /--leash-dir/);
});

test('a gone pid or path calls onGone once', async () => {
  const waitFor = (leash, opts) =>
    new Promise((resolve) => {
      const calls = [];
      holdLeash(leash, (why) => calls.push(why), { intervalMs: 5, ...opts });
      setTimeout(() => resolve(calls), 100);
    });
  const leash = { pid: 42, paths: ['a', 'b'] };
  assert.deepEqual(await waitFor(leash, { alive: () => false, exists: () => true }), ['pid 42 has exited']);
  assert.deepEqual(await waitFor(leash, { alive: () => true, exists: (p) => p !== 'b' }), ['b is gone']);
  assert.deepEqual(await waitFor(leash, { alive: () => true, exists: () => true }), []);

  const calls = [];
  const stop = holdLeash(leash, (why) => calls.push(why), { intervalMs: 5, alive: () => false, exists: () => true });
  stop();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(calls, []);
});

test('sessionPid reads CLAUDE_PID when it is a positive integer', () => {
  assert.equal(sessionPid({ CLAUDE_PID: '1234' }), 1234);
  for (const CLAUDE_PID of [undefined, '', '0', '-3', '1.5', 'abc']) assert.equal(sessionPid({ CLAUDE_PID }), null);
});

const DAEMON = path.resolve('deck', 'daemon.mjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Kills `pid` in teardown, whether or not it is still there. */
function killing(t, pid) {
  t.after(() => {
    try {
      process.kill(pid);
    } catch {
      /* gone */
    }
  });
}

/** A sleeper: the stand-in for a starter whose death the daemon must notice. */
function sleeper(t) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore', windowsHide: true });
  killing(t, child.pid);
  return child;
}

function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** A temp dir removed in teardown, once whatever held it has had time to let go. */
function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  return dir;
}

async function healthPid(url) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok ? (await response.json()).pid : null;
  } catch {
    return null;
  }
}

/** Polls until `pid` answers at `url` (true) or `ms` pass (false). */
async function answersWithin(url, pid, ms) {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(100)) {
    if ((await healthPid(url)) === pid) return true;
  }
  return false;
}

const gone = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return err.code === 'ESRCH';
  }
};

/** Polls until nothing answers at `url` and process `pid` has exited (true), or `ms` pass (false). */
async function deadWithin(url, pid, ms) {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(200)) {
    if ((await healthPid(url)) === null && gone(pid)) return true;
  }
  return false;
}

/** A real `daemon.mjs` on a free port with its own store, given `args`; stopped in teardown. */
async function daemon(t, args) {
  const port = await freePort();
  const store = tempDir(t, 'pilot-leash-store-');
  const child = spawn(process.execPath, [DAEMON, ...args], {
    cwd: os.tmpdir(),
    env: { ...process.env, PILOT_DECK_DIR: store, PILOT_DECK_PORT: String(port) },
    stdio: 'ignore',
    windowsHide: true,
  });
  killing(t, child.pid);
  const url = `http://127.0.0.1:${port}`;
  assert.ok(await answersWithin(url, child.pid, 10_000), `no daemon answered ${url}`);
  return { url, pid: child.pid };
}

test('a daemon leashed to a sleeper exits within 10 s of it', async (t) => {
  const starter = sleeper(t);
  const args = ['--leash', String(starter.pid)];
  assert.deepEqual(leashFrom(args, {}, { ppid: process.pid, daemonFile: DAEMON }), { pid: starter.pid, paths: [DAEMON] });
  const { url, pid } = await daemon(t, args);
  await sleep(2500);
  assert.equal(await healthPid(url), pid, 'the daemon answers through a poll while its leash pid lives');
  starter.kill();
  assert.ok(await deadWithin(url, pid, 10_000), 'the daemon still answers 10 s after its leash pid died');
});

test('a removed leash dir ends the daemon', async (t) => {
  const dir = tempDir(t, 'pilot-leash-dir-');
  const { url, pid } = await daemon(t, ['--leash', String(process.pid), '--leash-dir', dir]);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(await deadWithin(url, pid, 10_000), 'the daemon still answers 10 s after its leash dir went');
});

test('a scratch deck dies with its session', async (t) => {
  const session = sleeper(t);
  const saved = process.env.CLAUDE_PID;
  process.env.CLAUDE_PID = String(session.pid);
  t.after(() => (saved === undefined ? delete process.env.CLAUDE_PID : (process.env.CLAUDE_PID = saved)));
  assert.equal(sessionPid(process.env), session.pid);

  const { startScratch, stopScratch, registryFile } = await import('../scratch.mjs');
  const deck = await startScratch();
  killing(t, deck.pid);
  t.after(() => {
    fs.rmSync(deck.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    fs.rmSync(registryFile(deck.pid), { force: true });
  });

  session.kill();
  assert.ok(await deadWithin(deck.url, deck.pid, 10_000), 'the scratch deck still answers 10 s after its session died');
  await assert.rejects(stopScratch(deck.pid), new RegExp(`pid ${deck.pid} is not a scratch deck`));
});
