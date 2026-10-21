/**
 * process-gc S12 (spec 9, L2, ADR 0136): the user's deck exits after 10 minutes with no `claude`
 * session, no landing and no HTTP request, and reads the process table only when the other two
 * already hold. Every clock, table and landing count is injected; nothing here touches port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { holdUsersDeckIdle, startDaemon } from '../daemon.mjs';
import { IDLE_MS, holdIdle, isIdle } from '../idle.mjs';
import { KIND_GATE2 } from '../items.mjs';
import { landingsRunning, startLanding } from '../landing.mjs';
import { postItem, registerRun, setSlices } from '../store.mjs';
import { freePort, tempDeck, withTicket } from '../testUtils.mjs';

const SESSION = { pid: 7, ppid: 1, name: 'claude.exe', command: 'claude', ageS: 60 };
const NODE = { pid: 8, ppid: 1, name: 'node.exe', command: 'node x.mjs', ageS: 60 };
const until = async (check, ms = 2000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 10))) if (check()) return true;
  return check();
};

test('idle when all three hold', () => {
  assert.equal(IDLE_MS, 10 * 60_000);
  assert.equal(isIdle({ now: IDLE_MS, lastRequestAt: 0, landings: 0, sessions: () => 0 }), true);
});

test('any one live keeps the deck', () => {
  const quiet = { now: IDLE_MS, lastRequestAt: 0, landings: 0, sessions: () => 0 };
  assert.equal(isIdle({ ...quiet, sessions: () => 1 }), false, 'a session');
  assert.equal(isIdle({ ...quiet, landings: 1 }), false, 'a landing');
  assert.equal(isIdle({ ...quiet, lastRequestAt: 1000 }), false, 'a request at 9:59');
});

test('the table is read only when the other two hold', async () => {
  let reads = 0;
  const table = () => (reads++, [SESSION]);
  let clock = IDLE_MS;
  const idled = [];
  const busy = holdIdle({ lastRequestAt: () => 0, landings: () => 1, table, onIdle: () => idled.push('landing'), now: () => clock, intervalMs: 5 });
  const recent = holdIdle({ lastRequestAt: () => clock - 1000, landings: () => 0, table, onIdle: () => idled.push('request'), now: () => clock, intervalMs: 5 });
  await new Promise((r) => setTimeout(r, 60));
  busy();
  recent();
  assert.equal(reads, 0, 'no reader while a landing runs or a request is recent');
  assert.deepEqual(idled, []);

  let rows = [SESSION, NODE];
  let calls = 0;
  const stop = holdIdle({ lastRequestAt: () => 0, landings: () => 0, table: () => (reads++, rows), onIdle: () => calls++, now: () => clock, intervalMs: 5 });
  assert.ok(await until(() => reads >= 2), 'read once both hold');
  assert.equal(calls, 0, 'a session in the table keeps the deck');
  rows = [NODE];
  assert.ok(await until(() => calls === 1));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, 1, 'onIdle once');
  stop();
});

test('a table that throws keeps the deck', async (t) => {
  t.mock.method(console, 'error', () => {});
  let reads = 0;
  let calls = 0;
  const stop = holdIdle({ lastRequestAt: () => 0, landings: () => 0, table: () => (reads++, assert.fail('no table')), onIdle: () => calls++, now: () => IDLE_MS, intervalMs: 5 });
  assert.ok(await until(() => reads >= 3));
  stop();
  assert.equal(calls, 0);
});

test('a running land counts', (t) => {
  tempDeck(t);
  const dir = (name) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-idle-${name}-`));
    t.after(() => fs.rmSync(d, { recursive: true, force: true }));
    return d;
  };
  const repo = dir('repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = dir('wt');
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.split(path.sep).join('/')}/.git/worktrees/feat-x\n`);
  const evidence = withTicket({ pr: '#1', sha: '0305827' }, repo, 'yellow');
  setSlices(registerRun({ repo, pid: 4242 }).id, [], undefined, { slug: 'x', ticket: evidence.ticket, worktree });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });

  let child;
  const spawn = () => {
    child = new EventEmitter();
    child.pid = 9001;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    return child;
  };
  assert.equal(landingsRunning(), 0);
  startLanding(gate.id, { spawn, env: {} });
  assert.equal(landingsRunning(), 1, 'while land runs');
  child.emit('close', 0);
  assert.equal(landingsRunning(), 0, 'after it exits');

  // An error and then a close for one child uncount it once, never below zero.
  startLanding(gate.id, { spawn, env: {} });
  assert.equal(landingsRunning(), 1);
  child.emit('error', new Error('spawn failed'));
  child.emit('close', null);
  assert.equal(landingsRunning(), 0, 'error then close');
});

test('a real daemon closes on the fake idle', async (t) => {
  tempDeck(t);
  const port = await freePort();
  const server = await startDaemon({ port, host: '127.0.0.1' });
  let closed = false;
  t.after(() => {
    stop();
    server.closeAllConnections();
    server.close();
  });
  const health = async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/api/health`)).status;
    } catch {
      return 'refused';
    }
  };
  let clock = 0;
  let rows = [SESSION];
  const stop = holdUsersDeckIdle(
    server,
    () => {
      closed = true;
      server.closeAllConnections();
      server.close();
    },
    { now: () => clock, table: () => rows, landings: () => 0, intervalMs: 10 },
  );

  clock += IDLE_MS + 1;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(closed, false, 'a session in the table keeps it');
  assert.equal(await health(), 200);

  rows = [NODE];
  clock += IDLE_MS - 1000;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(closed, false, 'the health read 9:59 ago keeps it');

  clock += 1001;
  assert.ok(await until(() => closed), 'closes once idle');
  assert.equal(await health(), 'refused');
});
