/**
 * The process table and the orphan rules (process-gc S3, L5-L6). Every rule is pinned over an
 * injected table; only the last test reads the real one, and it stops what it starts.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import './no-open.mjs';
import { elapsedSeconds, isDeckDaemon, main, pilotProcesses, processTable } from '../procs.mjs';

const DAEMON = fileURLToPath(new URL('../daemon.mjs', import.meta.url));

const proc = (pid, ppid, command, name = 'node.exe', ageS = 60) => ({ pid, ppid, name, command, ageS });
const all = () => true;
const byPid = (rows, pid) => rows.find((row) => row.pid === pid);

test("the user's deck is listed live, never orphan", () => {
  const table = [
    proc(10, 999, 'node /plugin/deck/daemon.mjs'),
    proc(11, 999, 'bun /plugin/deck/daemon.mjs', 'bun.exe'),
    proc(12, 999, 'node /elsewhere/server.js'),
  ];
  const rows = pilotProcesses(table, { userDeckPid: 10, exists: all });
  assert.deepEqual(rows.map((row) => row.pid), [10], 'only node processes running pilot code are listed');
  assert.equal(rows[0].kind, 'daemon');
  assert.equal(rows[0].owner, null);
  assert.equal(rows[0].orphan, null);
});

test('a daemon whose --leash pid is gone is an orphan', () => {
  const table = [
    proc(20, 1, 'node /w/s3/deck/daemon.mjs --leash 30'),
    proc(21, 1, 'node /w/s3/deck/daemon.mjs --leash 31'),
    proc(31, 1, 'claude', 'claude.exe'),
    proc(22, 40, 'node /w/s3/deck/daemon.mjs'),
  ];
  // The user's deck answered with another pid, so 22 is a pre-feature daemon whose parent is gone.
  const rows = pilotProcesses(table, { userDeckPid: 10, exists: all });
  assert.deepEqual(
    [20, 21, 22].map((pid) => [byPid(rows, pid).owner, byPid(rows, pid).orphan]),
    [
      [30, 'leash 30 gone'],
      [31, null],
      [40, 'leash 40 gone'],
    ],
  );
});

test('a leashless daemon is unsure until the user deck answers another pid', () => {
  // Refused (the deck has not bound 4321 yet) or no answer: the leashless daemon may be the user's deck.
  const table = [proc(22, 40, 'node /plugin/deck/daemon.mjs'), proc(23, 1, 'node /w/s3/deck/daemon.mjs --leash 30')];
  for (const userDeckPid of [null, undefined, 0, -1]) {
    const rows = pilotProcesses(table, { userDeckPid, exists: all });
    assert.equal(byPid(rows, 22).orphan, null, `probe ${userDeckPid}`);
    assert.equal(byPid(rows, 23).orphan, 'leash 30 gone', 'a leashed daemon does not wait on the probe');
  }
});

test('a daemon whose worktree is gone is an orphan', () => {
  const table = [
    proc(31, 1, 'claude', 'claude.exe'),
    proc(20, 31, 'node "C:\\w\\s 3\\deck\\daemon.mjs" --leash 31 --leash-dir "C:\\w\\s 3"'),
    proc(21, 31, 'node /w/live/deck/daemon.mjs --leash 31 --leash-dir /w/live'),
  ];
  const gone = new Set(['C:\\w\\s 3']);
  const rows = pilotProcesses(table, { userDeckPid: null, exists: (p) => !gone.has(p) });
  assert.equal(byPid(rows, 20).worktree, 'C:\\w\\s 3');
  assert.equal(byPid(rows, 20).orphan, 'worktree gone');
  assert.equal(byPid(rows, 21).orphan, null);
  const noFile = pilotProcesses(table, { userDeckPid: null, exists: (p) => !p.endsWith('daemon.mjs') });
  assert.equal(byPid(noFile, 21).orphan, 'worktree gone', 'its own daemon.mjs gone is the worktree gone');
});

test('a wait with no claude ancestor is an orphan', () => {
  const table = [
    proc(31, 1, 'claude', 'claude.exe'),
    proc(32, 31, 'bash -c pilot wait', 'bash.exe'),
    proc(33, 32, 'node /p/bin/pilot.mjs wait --as qa'),
    proc(34, 31, 'node /home/u/.local/launcher.mjs --dir /w/s3 wait'),
    proc(35, 77, 'bash', 'bash.exe'),
    proc(36, 35, 'node /p/bin/pilot.mjs wait'),
    proc(37, 31, 'node /p/bin/pilot.mjs tickets'),
  ];
  const rows = pilotProcesses(table, { userDeckPid: null, exists: all });
  assert.deepEqual(rows.map((row) => row.pid), [33, 34, 36], 'only `wait` is a pilot-owned verb');
  assert.deepEqual(
    rows.map((row) => [row.kind, row.owner, row.worktree, row.orphan]),
    [
      ['wait', 31, null, null],
      ['wait', 31, '/w/s3', null],
      ['wait', null, null, 'no claude ancestor'],
    ],
  );
});

test('a wait whose chain reaches a live root with no claude is unsure', () => {
  const table = [
    proc(0, 0, '', 'System Idle Process'),
    proc(4, 0, '', 'System'),
    proc(31, 4, 'claude', 'claude.exe'),
    proc(40, 4, 'node /npm/cli.js', 'node.exe'),
    proc(41, 40, 'node /p/bin/pilot.mjs wait'),
    proc(1, 0, 'init', 'init'),
    proc(42, 1, 'node /p/bin/pilot.mjs wait'),
    proc(43, 88, 'node /p/bin/pilot.mjs wait'),
  ];
  const rows = pilotProcesses(table, { userDeckPid: null, exists: all });
  assert.deepEqual(
    rows.map((row) => [row.pid, row.orphan]),
    [
      [41, null],
      [42, null],
      [43, 'no claude ancestor'],
    ],
    'only a chain that ends at a missing ppid is broken; ppid 0 is the root',
  );
});

test('a test root whose parent is gone is an orphan', () => {
  // A test root is pilot's only when it names an absolute path under a checkout holding bin/pilot.mjs.
  const table = [
    proc(50, 77, 'node --test --test-timeout=60000 /w/s3/deck/test/a.test.mjs'),
    proc(51, 50, 'node --test-timeout=60000 deck/test/a.test.mjs'),
    proc(52, 51, 'node --test /w/s3/scripts/test/b.test.mjs'),
    proc(53, 51, 'node /w/s3/deck/daemon.mjs --leash 51'),
    proc(60, 1, 'npm', 'npm.exe'),
    proc(61, 60, 'node --test "C:\\w\\s 4\\deck\\test\\c.test.mjs"'),
    proc(62, 1, 'deno --test', 'deno.exe'),
    proc(70, 77, 'node --test /other/project/x.test.mjs'),
    proc(71, 77, 'node --test'),
    proc(72, 77, 'node --test deck/test/a.test.mjs'),
  ];
  const pilotCheckouts = new Set(['/w/s3/bin/pilot.mjs', 'C:/w/s 4/bin/pilot.mjs']);
  const rows = pilotProcesses(table, { userDeckPid: null, exists: (p) => pilotCheckouts.has(p) || p.includes('daemon') });
  assert.deepEqual(
    rows.map((row) => [row.pid, row.kind, row.owner, row.orphan]),
    [
      [50, 'test', null, 'parent 77 gone'],
      [53, 'daemon', 51, null],
      [61, 'test', 60, null],
    ],
  );
});

test('an unsure reading is never an orphan', () => {
  const table = [
    proc(20, 40, 'node /plugin/deck/daemon.mjs'),
    proc(21, 1, 'node /w/deck/daemon.mjs --leash abc'),
    proc(22, 1, 'node relative/deck/daemon.mjs --leash 1'),
    proc(23, 1, 'node /Users/me/My Projects/x/deck/daemon.mjs --leash 1 --leash-dir /Users/me/My Projects/x'),
    proc(24, 1, 'node /p/bin/pilot.mjs wait'),
    proc(25, 77, 'node app.js --test'),
    proc(1, 0, 'init', 'init'),
  ];
  const real = new Set(['/Users/me/My Projects/x', '/Users/me/My Projects/x/deck/daemon.mjs']);
  const rows = pilotProcesses(table, { userDeckPid: undefined, exists: (p) => real.has(p) });
  assert.deepEqual(
    rows.map((row) => [row.pid, row.orphan]),
    [
      [20, null],
      [21, null],
      [22, null],
      [23, null],
      [24, null],
    ],
    'no deck answer, a bad leash, a relative path, a spaced path, a wait under a live root, a --test after the script',
  );
  assert.equal(byPid(rows, 23).worktree, '/Users/me/My Projects/x');
});

test('a daemon path the ps parse cannot read exactly is unsure', () => {
  const table = [
    proc(31, 1, 'claude', 'claude.exe'),
    proc(20, 31, 'node --require /a/b.js ./deck/daemon.mjs --leash 31'),
    proc(21, 31, 'node /w/a  b/deck/daemon.mjs --leash 31'),
    proc(22, 31, 'node /w/s3/deck/daemon.mjs --leash 31 --leash-dir /w/x  y'),
    proc(23, 31, 'node /w/gone/deck/daemon.mjs --leash 31'),
  ];
  const rows = pilotProcesses(table, { userDeckPid: null, exists: (p) => p === '/w/s3/deck/daemon.mjs' });
  assert.deepEqual(
    rows.map((row) => [row.pid, row.orphan]),
    [
      [20, null],
      [21, null],
      [22, null],
      [23, 'worktree gone'],
    ],
    'a path glued from several words that does not exist may be a misreading, never worktree gone',
  );
});

const WINDOWS_OUTPUT ='﻿' + JSON.stringify([
  { ProcessId: 4, ParentProcessId: 0, Name: 'System', CommandLine: null, AgeS: 9000 },
  { ProcessId: 31, ParentProcessId: 4, Name: 'claude.exe', CommandLine: 'claude.exe', AgeS: 7200 },
  { ProcessId: 20, ParentProcessId: 31, Name: 'node.exe', CommandLine: 'node.exe C:\\w\\deck\\daemon.mjs --leash 31', AgeS: 65 },
]);
// `ps` names a row by the program its args start with, so the args here start with the image name.
const PS_OUTPUT = [
  '    4     0  9000 System          ',
  '   31     4  7200 claude.exe      claude.exe',
  '   20    31    65 node.exe        node.exe C:\\w\\deck\\daemon.mjs --leash 31',
  '',
].join('\n');

test('the Windows and ps readers parse to the same table', () => {
  const calls = [];
  const reader = (output) => (cmd, args) => {
    calls.push([cmd, args]);
    return output;
  };
  const win = processTable({ platform: 'win32', run: reader(WINDOWS_OUTPUT) });
  const posix = processTable({ platform: 'linux', run: reader(PS_OUTPUT) });
  assert.deepEqual(win, posix);
  assert.deepEqual(win[2], { pid: 20, ppid: 31, name: 'node.exe', command: 'node.exe C:\\w\\deck\\daemon.mjs --leash 31', ageS: 65 });
  assert.equal(calls.length, 2, 'one reader per call');
  assert.equal(calls[1][0], 'ps');
  assert.ok(path.win32.isAbsolute(calls[0][0]), `${calls[0][0]} is found by search, which tries the current directory first`);
  assert.match(calls[0][0], /\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i);
  assert.deepEqual(calls[1][1], ['-eo', 'pid=,ppid=,etimes=,comm=,args=']);
  // An argument with a newline in it prints a second line; a row repeating a pid is dropped.
  const forged = processTable({ platform: 'linux', run: () => `${PS_OUTPUT}   20     1    65 node.exe        node /w/deck/daemon.mjs\n` });
  assert.deepEqual(forged, posix);
  // One object, not an array, is what ConvertTo-Json prints for a single process.
  assert.equal(processTable({ platform: 'win32', run: () => JSON.stringify(JSON.parse(WINDOWS_OUTPUT.slice(1))[1]) }).length, 1);
});

test('macOS rows parse from etime', () => {
  const calls = [];
  const output = [
    '    1     0     01:05 /sbin/launchd  /sbin/launchd',
    '  500     1 1-01:01:01 /usr/local/bin/node node /w/deck/daemon.mjs --leash 1',
    '',
  ].join('\n');
  const rows = processTable({ platform: 'darwin', run: (cmd, args) => (calls.push([cmd, args]), output) });
  assert.deepEqual(calls, [['ps', ['-axo', 'pid=,ppid=,etime=,comm=,args=']]]);
  assert.deepEqual(rows.map((row) => [row.pid, row.ageS, row.name]), [[1, 65, 'launchd'], [500, 90061, 'node']]);
  assert.equal(rows[1].command, 'node /w/deck/daemon.mjs --leash 1');
  // A continuation line of an argument with a newline in it is skipped, not an unreadable etime.
  assert.deepEqual(processTable({ platform: 'darwin', run: () => `${output}   12 34 word more
` }), rows);
  assert.throws(() => elapsedSeconds('1:2:3:4'), /unreadable etime/);
});

test('linux keeps etimes', () => {
  const calls = [];
  processTable({ platform: 'linux', run: (cmd, args) => (calls.push([cmd, args]), '') });
  assert.deepEqual(calls, [['ps', ['-eo', 'pid=,ppid=,etimes=,comm=,args=']]]);
});

// Run 39103298463: on Linux node 26 names its main thread, so `comm` reads `MainThread`; a macOS
// `comm` that is not the last column is cut to 16 characters. The name is the first word of `args`.
test('a real POSIX node row is node whatever comm says', () => {
  const linux = '  4051  4044    12 MainThread      /opt/hostedtoolcache/node/26.12.0/x64/bin/node /tmp/w/deck/daemon.mjs --leash 4044';
  const darwin = ' 8185  8184     00:12 /Users/runner/h /Users/runner/hostedtoolcache/node/26.12.0/arm64/bin/node /tmp/w/deck/daemon.mjs --leash 8184';
  const exists = () => true;
  for (const [platform, output, pid, leash] of [['linux', linux, 4051, 4044], ['darwin', darwin, 8185, 8184]]) {
    const rows = processTable({ platform, run: () => `${output}\n` });
    assert.equal(rows[0].name, 'node', platform);
    assert.ok(isDeckDaemon(rows[0], exists), `${platform}: the daemon is a deck`);
    assert.deepEqual(pilotProcesses(rows, { userDeckPid: null, exists }).map((row) => [row.pid, row.orphan]), [[pid, `leash ${leash} gone`]]);
  }
  // A row with empty args (a zombie, the Windows System row) keeps its comm.
  assert.equal(processTable({ platform: 'linux', run: () => '    2     0  9000 kthreadd        \n' })[0].name, 'kthreadd');
});

test('elapsed forms parse', () => {
  assert.equal(elapsedSeconds('00:07'), 7);
  assert.equal(elapsedSeconds('02:00:00'), 7200);
  assert.equal(elapsedSeconds('3-00:00:00'), 259200);
});

test('the real table reads on this host', () => {
  assert.ok(processTable().some((row) => row.pid === process.pid));
});

test('ps reads node as node when node has named its main thread (Linux)', () => {
  const [row] = processTable({ platform: 'linux', run: () => '   20    31    65 node-MainThread node /w/deck/daemon.mjs --leash 31\n' });
  assert.equal(row.name, 'node');
});

test('pilot ps prints owner, age, worktree and orphan (spec 4)', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  const table = [proc(20, 1, 'node /w/s3/deck/daemon.mjs --leash 30 --leash-dir /w/s3', 'node.exe', 3720)];
  assert.equal(await main({ read: () => table, probe: async () => 10 }), 0);
  assert.deepEqual(lines, ['20 daemon owner 30 age 1:02 /w/s3 orphan: leash 30 gone']);
});

test('a reader failure prints one line and names no orphan', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  t.mock.method(console, 'error', (line) => lines.push(line));
  const failures = [
    () => processTable({ platform: 'darwin', run: () => { throw new Error('ps: etimes: keyword not found\nusage: ps'); } }),
    () => processTable({ platform: 'win32', run: () => '[{"ProcessId": 4,' }),
    () => { throw new RangeError('stdout maxBuffer length exceeded'); },
  ];
  for (const read of failures) {
    lines.length = 0;
    assert.equal(await main({ read, probe: async () => null }), 1);
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.match(lines[0], /^pilot ps: cannot read the process table/);
    assert.doesNotMatch(lines[0], /orphan:/);
  }
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function killing(t, pid) {
  t.after(() => {
    try {
      process.kill(pid);
    } catch {
      // already gone
    }
  });
}

test('pilot ps lists a real leashed daemon', async (t) => {
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore', windowsHide: true });
  killing(t, sleeper.pid);
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-procs-'));
  t.after(() => fs.rmSync(store, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const daemon = spawn(process.execPath, [DAEMON, '--leash', String(sleeper.pid)], {
    cwd: os.tmpdir(),
    env: { ...process.env, PILOT_DECK_DIR: store, PILOT_DECK_PORT: String(await freePort()), PILOT_DECK_NO_OPEN: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  killing(t, daemon.pid);

  const rows = pilotProcesses(processTable(), { userDeckPid: null });
  const row = byPid(rows, daemon.pid);
  assert.ok(row, `daemon ${daemon.pid} is not in pilot ps`);
  assert.deepEqual([row.kind, row.owner, row.orphan], ['daemon', sleeper.pid, null]);
  assert.equal(byPid(rows, sleeper.pid), undefined, 'a plain node sleeper is not pilot-owned');
});

test('a wait whose --dir holds a space reads the whole path', () => {
  const table = [proc(51, 1, 'claude', 'claude.exe'), proc(52, 51, 'node /p/bin/pilot.mjs --dir /home/me/my tree wait')];
  const rows = pilotProcesses(table, { userDeckPid: null, exists: all });
  assert.equal(byPid(rows, 52)?.kind, 'wait');
  assert.equal(byPid(rows, 52)?.worktree, '/home/me/my tree');
});
