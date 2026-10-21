'use strict';

/**
 * S4 of mac-linux (spec 2, 3; L4): a landing's and gc's trees die by the seam's one `killTree`.
 * Tests 1 and 2 kill a real `sh` and its two `sleep`s, so they run on POSIX only and rest on the
 * all-os CI job; 3 and 4 pass `platform` and fakes, so they rest on this test on any host.
 */

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');

const { isWindows, killTree } = require('../lib/platform.js');

const POSIX_ONLY = isWindows() && 'a real process tree is killed by signal on POSIX only';

/** Whether `pid` answers ESRCH to `kill(pid, 0)`. */
function gone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return err.code === 'ESRCH';
  }
}

/** Polls `check` until it holds or `ms` pass; never a fixed wait. */
async function until(check, ms = 10000) {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) return false;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

/** A detached `sh` running two `sleep`s, with the pids of all three once the table shows them. */
async function aTree(t) {
  const { processTable } = await import('../../deck/procs.mjs');
  const sh = spawn('sh', ['-c', 'sleep 60 & sleep 60 & wait'], { detached: true, stdio: 'ignore' });
  t.after(() => {
    try {
      process.kill(-sh.pid, 'SIGKILL');
    } catch {
      // Already gone: the test killed it.
    }
  });
  let table = [];
  const sleeps = () => table.filter((row) => row.ppid === sh.pid).map((row) => row.pid);
  assert.ok(await until(() => (table = processTable()) && sleeps().length === 2), 'the two sleeps started');
  return { table, pids: [sh.pid, ...sleeps()] };
}

test('a detached tree is gone after a group kill', { skip: POSIX_ONLY }, async (t) => {
  const { pids } = await aTree(t);
  killTree(pids[0], { group: true });
  assert.ok(await until(() => pids.every(gone)), `every pid of ${pids} answers ESRCH`);
});

test('a tree is gone by its descendants without a group', { skip: POSIX_ONLY }, async (t) => {
  const { table, pids } = await aTree(t);
  killTree(pids[0], { table });
  assert.ok(await until(() => pids.every(gone)), `every pid of ${pids} answers ESRCH`);
});

test('a gone pid is not an error', () => {
  const failing = (code) => () => {
    throw Object.assign(new Error(`kill ${code}`), { code });
  };
  const table = [{ pid: 51, ppid: 50 }];
  assert.doesNotThrow(() => killTree(50, { platform: 'linux', group: true, signal: failing('ESRCH') }));
  assert.doesNotThrow(() => killTree(50, { platform: 'darwin', table, signal: failing('ESRCH') }));
  // Not ours to stop is not gone: EPERM reaches the caller, after the rest of the tree was tried.
  const tried = [];
  const denied = (pid) => {
    tried.push(pid);
    failing('EPERM')();
  };
  assert.throws(() => killTree(50, { platform: 'linux', table, signal: denied }), { code: 'EPERM' });
  assert.deepEqual(tried, [51, 50]);
  assert.throws(() => killTree(50, { platform: 'linux', group: true, signal: failing('EPERM') }), { code: 'EPERM' });
  // A table row that is not a pid to kill is skipped, so a stale table can never signal init.
  const signalled = [];
  killTree(50, { platform: 'linux', table: [{ pid: 1, ppid: 50 }, { pid: 52, ppid: 50 }], signal: (pid) => signalled.push(pid) });
  assert.deepEqual(signalled, [52, 50]);
  // Not a pid to kill is refused before any signal: -0 is the caller's own group, -1 every process.
  for (const bad of [0, 1, -1, undefined, 1.5]) {
    assert.throws(() => killTree(bad, { platform: 'linux', group: true, signal: () => assert.fail('signalled') }), RangeError);
  }
});

test('windows runs taskkill over the tree', () => {
  const ran = [];
  killTree(50, { platform: 'win32', group: true, exec: (cmd, args) => ran.push([cmd, ...args]), signal: () => assert.fail('no signal on win32') });
  assert.deepEqual(ran, [['taskkill', '/PID', '50', '/T', '/F']]);
});

test('windows: a gone pid is not an error, a denied one is', () => {
  // taskkill exits 128 for a pid that is gone and for one it was denied alike; the pid's absence decides.
  const exec = () => {
    throw Object.assign(new Error('Command failed: taskkill'), { status: 128 });
  };
  const gone = () => {
    throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
  };
  assert.doesNotThrow(() => killTree(50, { platform: 'win32', exec, signal: gone }));
  assert.throws(() => killTree(50, { platform: 'win32', exec, signal: () => true }), /Command failed/);
  const denied = () => {
    throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
  };
  assert.throws(() => killTree(50, { platform: 'win32', exec, signal: denied }), /Command failed/);
});
