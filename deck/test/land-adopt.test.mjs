/**
 * never-stuck S16 (spec 21, 22): a restarted deck re-adopts a live land child by its recorded pid, a dead or foreign pid
 * reads interrupted untouched, and `Land again` is refused while the child lives. The child is a stub `bin/pilot.mjs land`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn as spawnChild, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, SIGN_OFF } from '../items.mjs';
import { adoptLandings, startLanding } from '../landing.mjs';
import { processTable } from '../procs.mjs';
import { callTool } from '../server-tools.mjs';
import { LANDING_INTERRUPTED, addReply, beginLanding, interruptLandings, listItems, postItem, registerRun, setSlices } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const LANDED = 'landed feat/x on pilot at 1a2b3c4';
const itemOf = (id) => listItems().find((item) => item.id === id);
const interruptedLines = (id) => itemOf(id).replies.filter((reply) => reply.text === LANDING_INTERRUPTED);

function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-adopt-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A signed gate2 whose ticket's run record names a worktree of `repo`. */
function aGate2(t) {
  const repo = scratch(t, 'repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = scratch(t, 'wt');
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  const evidence = withTicket({ pr: '#16', sha: '0305827' }, repo, 'yellow');
  setSlices(registerRun({ repo, pid: process.pid }).id, [], undefined, { slug: 'x', ticket: evidence.ticket, worktree });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, author: 'qa', ...evidence });
  addReply(gate.id, SIGN_OFF);
  return { gate, worktree };
}

/** A stub `<dir>/bin/pilot.mjs`, a land by its command line, that prints 100 kB, then `LANDED`, and exits 0 once `release` is called. */
function aStubLand(t) {
  const bin = path.join(scratch(t, 'pilot'), 'bin');
  fs.mkdirSync(bin);
  const file = path.join(bin, 'pilot.mjs');
  const go = path.join(bin, 'go');
  const print = `console.log('x'.repeat(100000)), console.log(${JSON.stringify(LANDED)})`;
  const wait = `const tick = () => require('fs').existsSync(${JSON.stringify(go)}) ? (${print}) : setTimeout(tick, 50); tick();`;
  fs.writeFileSync(file, `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n${wait}\n`);
  return { file, release: () => fs.writeFileSync(go, '') };
}

/** The last daemon's spawn: the real stub runs with the deck's options behind a handle that never closes, as a dead daemon's. */
function aDeadDaemonSpawn(t, stub) {
  const held = {};
  held.exited = new Promise((resolve) => {
    held.spawn = (command, _args, options) => {
      const real = spawnChild(command, [stub, 'land'], options);
      real.on('exit', resolve);
      t.after(() => real.exitCode === null && real.kill());
      held.pid = real.pid;
      return Object.assign(new EventEmitter(), { pid: real.pid, stdout: null, stderr: null });
    };
  });
  return held;
}

const never = { setTimeout: () => undefined, clearTimeout: () => undefined };
const { PILOT_DECK_NO_LAND: _off, ...landing } = process.env;

test('a restart re-adopts a live child and reads its line', async (t) => {
  tempDeck(t);
  const { gate } = aGate2(t);
  const stub = aStubLand(t);
  const old = aDeadDaemonSpawn(t, stub.file);
  startLanding(gate.id, { spawn: old.spawn, env: landing, clock: never });
  const { pid, dir } = itemOf(gate.id).landing;
  assert.equal(pid, old.pid, 'the pid is on the landing');

  const adopted = adoptLandings({ pollMs: 50 });
  interruptLandings();
  stub.release();
  await adopted;

  assert.equal(itemOf(gate.id).landing.state, 'landed');
  assert.equal(itemOf(gate.id).landing.sha, '1a2b3c4', "the line is the child's own, read from the tail of 100 kB");
  assert.equal(interruptedLines(gate.id).length, 0);
  assert.equal(fs.existsSync(dir), false, "land's raw output is not left on disk");
});

/** A real stub land the test spawned, recorded on the gate2's landing as its child; killed by its handle in teardown. */
function aLiveLand(t, gate, worktree) {
  const child = spawnChild(process.execPath, [aStubLand(t).file, 'land'], { stdio: 'ignore' });
  t.after(() => child.kill());
  beginLanding(gate.id, { worktree, pid: child.pid });
  return child;
}

test('an unreadable process table adopts nothing and stops nothing', async (t) => {
  tempDeck(t);
  const { gate, worktree } = aGate2(t);
  const child = aLiveLand(t, gate, worktree);

  await adoptLandings({ table: () => { throw new Error('no table'); } });

  assert.equal(interruptedLines(gate.id).length, 1);
  assert.ok(processTable().some((row) => row.pid === child.pid), 'the child still runs');
});

test('an adopted land past 40 minutes is stopped and reads timed out', async (t) => {
  tempDeck(t);
  const { gate, worktree } = aGate2(t);
  const child = aLiveLand(t, gate, worktree);
  let fire;
  const clock = { setInterval: () => undefined, clearInterval: () => undefined, setTimeout: (fn) => (fire = fn), clearTimeout: () => undefined };
  const stopped = [];

  const adopted = adoptLandings({ clock, stop: (pid) => stopped.push(pid) });
  fire();
  await adopted;

  assert.deepEqual(stopped, [child.pid]);
  assert.equal(itemOf(gate.id).landing.line, `NOT landed: timed out after 40 min; the deck stopped land ${child.pid}`);
});

test('a pid reused when 40 minutes are up stops nothing and settles from the land dir', async (t) => {
  tempDeck(t);
  const { gate, worktree } = aGate2(t);
  const rows = [...processTable()];
  aLiveLand(t, gate, worktree);
  let fire;
  const clock = { setInterval: () => undefined, clearInterval: () => undefined, setTimeout: (fn) => (fire = fn), clearTimeout: () => undefined };
  const stopped = [];
  const adopted = adoptLandings({ table: () => (fire ? rows : processTable()), clock, stop: (pid) => stopped.push(pid) });
  fire();
  await adopted;
  assert.deepEqual(stopped, []);
  assert.doesNotMatch(itemOf(gate.id).landing.line, /timed out/);
});

test('a dead pid is interrupted as today', async (t) => {
  tempDeck(t);
  const { gate, worktree } = aGate2(t);
  const { pid } = spawnSync(process.execPath, ['-e', '']);
  beginLanding(gate.id, { worktree, pid });

  await adoptLandings({ pollMs: 50 });

  assert.equal(itemOf(gate.id).landing.state, 'refused');
  assert.equal(interruptedLines(gate.id).length, 1);
});

test('a reused pid that is not a land is never adopted or stopped', async (t) => {
  tempDeck(t);
  const { gate, worktree } = aGate2(t);
  const other = spawnChild(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  t.after(() => other.kill());
  beginLanding(gate.id, { worktree, pid: other.pid });

  await adoptLandings({ pollMs: 50 });

  assert.equal(itemOf(gate.id).landing.state, 'refused');
  assert.equal(interruptedLines(gate.id).length, 1);
  assert.ok(processTable().some((row) => row.pid === other.pid), 'the process is untouched: it is still in the table');
});

test('Land again is refused while the child lives', async (t) => {
  tempDeck(t);
  const { gate } = aGate2(t);
  const stub = aStubLand(t);
  const old = aDeadDaemonSpawn(t, stub.file);
  startLanding(gate.id, { spawn: old.spawn, env: landing, clock: never });
  const { dir } = itemOf(gate.id).landing;
  // The child outlived a restart that could not adopt it.
  interruptLandings(() => false);

  const calls = [];
  const spawn = (command, args) => {
    calls.push(args);
    return Object.assign(new EventEmitter(), { pid: undefined, stdout: null, stderr: null });
  };
  const landAgain = () => callTool('deck_reply', { id: gate.id, text: 'Land again', author: 'pilot:pilot-lander' }, { spawn, env: {}, clock: never });
  assert.throws(landAgain, { name: 'DeckRefusal', message: `landing ${old.pid} still holds ${dir}; nothing run` });
  assert.equal(calls.length, 0, 'nothing run');

  stub.release();
  await old.exited;
  landAgain();
  assert.equal(calls.length, 1, 'it lands once the child is gone');
});
