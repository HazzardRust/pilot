/**
 * `pilot deck --stop <pid>` (audit-f1-f7 S7, L7): it ends a scratch deck this module started and
 * nothing else. A pid is stopped only when the scratch registry names it and that deck's health
 * still reports it; every other pid is refused and left alive. Nothing here touches 4321.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import './no-open.mjs';
import { registryFile, startScratch, stopScratch } from '../scratch.mjs';

const CLI = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A node process that does nothing for a minute, killed by its own pid after the test. */
function sleeper(t) {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => child.kill());
  return child.pid;
}

/** A server whose /api/health reports `pid`, standing in for a deck that is not the one registered. */
async function impostor(t, pid) {
  const server = http.createServer((req, res) => res.end(JSON.stringify({ pid })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return server.address().port;
}

test('stop ends it and its store', async (t) => {
  const deck = await startScratch();
  t.after(() => {
    if (alive(deck.pid)) process.kill(deck.pid);
  });
  await stopScratch(deck.pid);
  await assert.rejects(fetch(`${deck.url}/api/health`, { signal: AbortSignal.timeout(2000) }));
  assert.equal(fs.existsSync(deck.dir), false);
  assert.equal(fs.existsSync(registryFile(deck.pid)), false);
});

test('an unregistered pid is refused', async (t) => {
  const pid = sleeper(t);
  await assert.rejects(stopScratch(pid), { message: `pid ${pid} is not a scratch deck` });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-scratch-stop-cli-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [CLI, 'deck', '--stop', String(pid)], {
    encoding: 'utf8',
    env: { ...process.env, PILOT_DECK_DIR: home },
    timeout: 20_000,
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, new RegExp(`pid ${pid} is not a scratch deck`));
  assert.equal(alive(pid), true);
});

test('a reused pid is refused', async (t) => {
  const pid = sleeper(t);
  const port = await impostor(t, pid + 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-scratch-reused-'));
  fs.writeFileSync(registryFile(pid), JSON.stringify({ pid, port, dir }));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(registryFile(pid), { force: true });
  });
  await assert.rejects(stopScratch(pid), { message: `pid ${pid} is not a scratch deck` });
  assert.equal(alive(pid), true);
  assert.equal(fs.existsSync(dir), true);
});

test('a deck it cannot register is not left running', async (t) => {
  let entry;
  mock.method(fs, 'writeFileSync', (file, data) => {
    entry = JSON.parse(data);
    throw new Error('disk full');
  });
  t.after(() => mock.restoreAll());
  await assert.rejects(startScratch(), /disk full/);
  mock.restoreAll();
  assert.equal(alive(entry.pid), false);
  assert.equal(fs.existsSync(entry.dir), false);
});

test('a registry naming a dir outside the scratch dirs is refused', async (t) => {
  const pid = sleeper(t);
  const port = await impostor(t, pid);
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-scratch-outer-'));
  const dir = fs.mkdtempSync(path.join(outer, 'kept-'));
  fs.writeFileSync(registryFile(pid), JSON.stringify({ pid, port, dir }));
  t.after(() => {
    fs.rmSync(outer, { recursive: true, force: true });
    fs.rmSync(registryFile(pid), { force: true });
  });
  await assert.rejects(stopScratch(pid), { message: `pid ${pid} is not a scratch deck` });
  assert.equal(alive(pid), true);
  assert.equal(fs.existsSync(dir), true);
});

test('a planted registry that is a symlink is refused (S1)', async (t) => {
  const pid = sleeper(t);
  const port = await impostor(t, pid);
  // This run's own temp dir: a reused pid's registry file left in the shared one is never in the way.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-scratch-registry-'));
  t.mock.method(os, 'tmpdir', () => tmp);
  const dir = fs.mkdtempSync(path.join(tmp, 'pilot-scratch-planted-'));
  const target = path.join(dir, 'entry.json');
  fs.writeFileSync(target, JSON.stringify({ pid, port, dir }));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  try {
    fs.symlinkSync(target, registryFile(pid), 'file');
  } catch (err) {
    if (err.code === 'EPERM') return t.skip('this account may not make symlinks');
    throw err;
  }
  await assert.rejects(stopScratch(pid), { message: `pid ${pid} is not a scratch deck` });
  assert.equal(alive(pid), true);
  assert.equal(fs.existsSync(dir), true);
});

test('a deck that exits at once is refused and leaves no scratch dir (F5)', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-exit-tmp-'));
  const saved = { NODE_OPTIONS: process.env.NODE_OPTIONS, TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  // The spawned daemon inherits these; the missing --require makes it exit before it listens.
  Object.assign(process.env, { NODE_OPTIONS: `--require ${path.join(tmp, 'missing.cjs')}`, TEMP: tmp, TMP: tmp, TMPDIR: tmp });
  await assert.rejects(startScratch(), /exited with code/);
  assert.deepEqual(fs.readdirSync(tmp).filter((name) => name.startsWith('pilot-scratch-')), []);
});
