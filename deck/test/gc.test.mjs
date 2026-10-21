/**
 * `pilot gc` (process-gc S4, spec 4; L5, L11): it stops each orphan `pilotProcesses` named and
 * nothing else, a test root as a tree, and a stop that fails is a line. The first three run over
 * injected rows and a fake kill; the last plants a real sleeper and stops only that.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import './no-open.mjs';
import { deckPidNow, gc, landSweep, stopper, sweep } from '../gc.mjs';
import { pilotProcesses, processTable } from '../procs.mjs';

const proc = (pid, ppid, command, name = 'node.exe') => ({ pid, ppid, name, command, ageS: 60 });
const killsInto = (calls) => (pid, tree) => calls.push([pid, tree]);

test('only orphans are stopped', () => {
  const table = [
    proc(10, 1, 'node /plugin/deck/daemon.mjs'),
    proc(20, 1, 'node /w/s4/deck/daemon.mjs --leash 30'),
    proc(30, 1, 'claude', 'claude.exe'),
    proc(40, 1, 'node /w/gone/deck/daemon.mjs --leash 41'),
  ];
  const owned = pilotProcesses(table, { userDeckPid: 10, exists: () => true });
  const calls = [];

  const lines = gc(owned, { kill: killsInto(calls) });

  assert.deepEqual(calls, [[40, false]], "the user's deck and the live-leashed daemon are left");
  assert.deepEqual(lines, ['stopped 40 daemon /w/gone (leash 41 gone)']);
});

test('a test root is stopped as a tree', () => {
  const calls = [];

  const lines = gc([{ pid: 50, kind: 'test', worktree: null, orphan: 'parent 9 gone' }], { kill: killsInto(calls) });

  assert.deepEqual(calls, [[50, true]]);
  assert.deepEqual(lines, ['stopped 50 test - (parent 9 gone)']);

  const ran = [];
  stopper([], { platform: 'win32', exec: (cmd, args) => ran.push([cmd, ...args]) })(50, true);
  assert.deepEqual(ran, [['taskkill', '/PID', '50', '/T', '/F']], 'Windows stops the tree with taskkill');
  const signalled = [];
  const table = [proc(51, 50, 'node a'), proc(52, 51, 'node b'), proc(53, 1, 'node c')];
  stopper(table, { platform: 'linux', signal: (pid) => signalled.push(pid) })(50, true);
  assert.deepEqual(signalled, [52, 51, 50], 'POSIX stops its descendants deepest first, then the root');
});

test('a failed stop is a line, not a throw', () => {
  const kill = () => {
    throw Object.assign(new Error('kill ESRCH\nstack'), { code: 'ESRCH' });
  };
  const rows = [
    { pid: 60, kind: 'wait', worktree: null, orphan: 'no claude ancestor' },
    { pid: 61, kind: 'daemon', worktree: '/w', orphan: null },
  ];

  assert.deepEqual(gc(rows, { kill }), ['could not stop 60: kill ESRCH']);
  assert.deepEqual(gc(rows.slice(1), { kill }), ['gc: nothing to stop'], 'a live row is never stopped');
});

test('pilot gc stops a real planted orphan', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gc-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  fs.mkdirSync(path.join(root, 'deck'));
  const daemon = path.join(root, 'deck', 'daemon.mjs');
  fs.writeFileSync(daemon, 'setInterval(() => {}, 1000);\n');
  const gone = spawn(process.execPath, ['-e', '0']);
  await once(gone, 'exit');
  const sleeper = spawn(process.execPath, [daemon, '--leash', String(gone.pid)], { stdio: 'ignore', windowsHide: true });
  const exited = once(sleeper, 'exit');
  t.after(() => sleeper.exitCode === null && sleeper.signalCode === null && sleeper.kill());
  let table = processTable();
  for (let i = 0; i < 50 && !table.some((p) => p.pid === sleeper.pid); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    table = processTable();
  }
  assert.ok(!table.some((p) => p.pid === gone.pid), 'the leash pid is not reused');
  const planted = pilotProcesses(table, { userDeckPid: undefined }).filter((row) => row.pid === sleeper.pid);
  const lines = gc(planted, { kill: stopper(table) });

  assert.deepEqual(lines, [`stopped ${sleeper.pid} daemon ${root} (leash ${gone.pid} gone)`]);
  await exited;
});

test("the deck's pid is read at the sweep, and a failed read stops nothing", () => {
  assert.equal(deckPidNow({ exec: () => '4321' }), 4321);
  assert.equal(deckPidNow({ exec: () => 'null' }), null, 'nothing listens');
  assert.equal(deckPidNow({ exec: () => '' }), undefined, 'something may but did not answer');
  assert.equal(deckPidNow({ exec: () => { throw new Error('timeout'); } }), undefined);
  const unreadable = () => { throw new Error('powershell gone\nstack'); };
  assert.deepEqual(sweep({ read: unreadable }), ['gc: could not read the process table, nothing stopped: powershell gone']);
});

test('gc never stops itself or an ancestor it runs under', () => {
  const root = path.resolve(import.meta.dirname, '..', '..').split(path.sep).join('/');
  const table = [
    proc(900100, 9, `node --test ${root}/deck/test/a.test.mjs`),
    proc(900101, 900100, 'node gc-runner.mjs'),
    proc(900200, 8, `node --test ${root}/deck/test/b.test.mjs`),
  ];
  const calls = [];

  const lines = sweep({ read: () => table, self: 900101, kill: killsInto(calls) });

  assert.deepEqual(calls, [[900200, true]], 'the sibling orphan is stopped, the ancestor is not');
  assert.deepEqual(lines, ['could not stop 900100: gc runs under it', `stopped 900200 test - (parent 8 gone)`]);
});

test("land's sweep never stops a wait, even one read as an orphan", () => {
  // A `pilot wait` under the Bash tool: its chain is broken and no claude is above it.
  const table = [
    proc(31, 999, 'bash -c pilot wait', 'bash.exe'),
    proc(33, 31, 'node /p/bin/pilot.mjs wait'),
    proc(40, 1, 'node /w/gone/deck/daemon.mjs --leash 41'),
  ];
  assert.equal(pilotProcesses(table, { userDeckPid: 10 }).find((row) => row.pid === 33).orphan, 'no claude ancestor');
  const calls = [];

  const lines = landSweep({ userDeckPid: 10, read: () => table, kill: killsInto(calls) });

  assert.deepEqual(calls, [[40, false]], 'the orphan daemon is stopped, the wait is not');
  assert.deepEqual(lines, ['stopped 40 daemon /w/gone (leash 41 gone)']);
  calls.length = 0;
  sweep({ userDeckPid: 10, read: () => table, kill: killsInto(calls) });
  assert.deepEqual(calls.map(([pid]) => pid).sort(), [33, 40], '`pilot gc` still stops both');
});
