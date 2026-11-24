/**
 * stay-awake S1, S2 (spec 2, 3, 8; L1, A4): the real holders. On win32 a SystemRequired request that says
 * `held`; on darwin `caffeinate -i -w`; on linux a `systemd-inhibit` sleep:idle block around `tail --pid`.
 * Each appears in its OS's own list while held and exits within 5 s of the pid it watches. A real holder
 * runs on its own OS only, and is skipped elsewhere naming why. Every process a test starts is stopped by
 * it, so the gate's census finds none left (spec 7). `powercfg /requests` needs an elevated shell;
 * unelevated the test says so and rests on the holder's own `held` line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import path from 'node:path';

import { hostPlatform } from '../../hooks/lib/platform.js';
import { REASON, awakeState, holdAwake, holderFor, holderUnavailable } from '../awake.mjs';

const POWERCFG = path.win32.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'powercfg.exe');

/** The OS request list, or null when this shell is not elevated. */
function requests() {
  try {
    return execFileSync(POWERCFG, ['/requests'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

/** A child's first stdout line, or the reason it never wrote one. */
const firstLine = (child) =>
  new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('\n')) resolve(out.split(/\r?\n/)[0]);
    });
    child.once('exit', (code) => reject(new Error(`the holder exited ${code} before a line: ${JSON.stringify(out)}`)));
  });

/** Resolves with `fn()` once `ok(fn())` holds, polling every 200 ms; rejects after `ms`. */
async function within(ms, fn, ok, what) {
  const until = Date.now() + ms;
  for (;;) {
    const value = fn();
    if (ok(value)) return value;
    if (Date.now() > until) throw new Error(`${what} not within ${ms} ms: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** A process that runs until killed, for a holder to watch. */
function aWatched(t) {
  const watched = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => watched.kill());
  return watched;
}

/** A POSIX holder started as the deck starts it, in its own process group; the group is killed after. */
function aPosixHolder(t, platform, pid) {
  const { cmd, args } = holderFor(platform, pid);
  assert.equal(path.posix.isAbsolute(cmd), true, 'by absolute path');
  const holder = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  holder.err = '';
  holder.stderr.on('data', (chunk) => (holder.err += chunk));
  t.after(() => {
    try {
      process.kill(-holder.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  });
  return holder;
}

/** Waits for `child` to exit, failing past 5 s. */
const exitWithin5s = (child, what) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : Promise.race([once(child, 'exit'), new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} outlived its stop by 5 s`)), 5000).unref())]);

/** The process table's command lines (`ps -eo args`). */
const commandLines = () => execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).split('\n');

const notOn = (platform) => hostPlatform() !== platform && `the ${platform} holder runs on ${platform} only`;

/** Why the linux holder cannot run here, for a skip: another OS, or no logind. Never null: node:test runs a `skip: null` test and counts its failure as a skip. */
const linuxSkip = () => notOn('linux') || holderUnavailable('linux') || false;

/**
 * Half a second for a holder to take hold. A holder logind refuses (polkit grants an inhibitor to a
 * process in no login session, such as a CI runner's, only with admin auth) skips naming its stderr;
 * any other early exit fails.
 */
async function settled(t, holder) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (holder.exitCode === null && holder.signalCode === null) return true;
  const why = holder.err.trim();
  if (/access denied|not authorized|authentication/i.test(why)) {
    t.skip(`logind refused the inhibitor here: ${why}`);
    return false;
  }
  assert.fail(`the holder exited ${holder.exitCode ?? holder.signalCode} at start: ${JSON.stringify(why)}`);
}

test('the Windows holder appears and dies with its pid', { skip: notOn('win32') }, async (t) => {
  const watched = aWatched(t);
  const { cmd, args } = holderFor('win32', watched.pid);
  assert.equal(path.win32.isAbsolute(cmd), true, 'by absolute path');
  const holder = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => holder.kill());

  assert.equal(await firstLine(holder), 'held');
  const listed = requests();
  if (listed === null) t.diagnostic('powercfg /requests needs an elevated shell; resting on the holder\'s held line');
  else assert.ok(listed.includes(REASON), `powercfg /requests lists ${REASON}`);

  const exited = once(holder, 'exit');
  watched.kill();
  const killedAt = Date.now();
  const [code] = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('the holder outlived its pid by 5 s')), 5000).unref())]);
  assert.equal(code, 0);
  assert.ok(Date.now() - killedAt < 5000);
  if (listed !== null) assert.ok(!requests().includes(REASON), 'the request is gone with the holder');
});

test('a holder watching a pid that is gone holds nothing', { skip: notOn('win32') }, async () => {
  const gone = spawn(process.execPath, ['-e', ''], { stdio: 'ignore', windowsHide: true });
  await once(gone, 'exit');
  const { cmd, args } = holderFor('win32', gone.pid);
  const holder = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  holder.stdout.on('data', (chunk) => (out += chunk));
  const [code] = await once(holder, 'exit');
  assert.equal(code, 2);
  assert.equal(out, '', 'never said held');
});

test('no lid lock is taken', () => {
  const { args } = holderFor('linux', 4242);
  const what = args.filter((arg) => arg.startsWith('--what='));
  assert.deepEqual(what, ['--what=sleep:idle']);
  assert.ok(!args.some((arg) => arg.includes('handle-lid-switch')), 'no handle-lid-switch anywhere');
  assert.ok(!args.includes('sleep'), 'no sleep infinity child');
});

test('the POSIX holders watch the pid they are given', () => {
  assert.deepEqual(holderFor('darwin', 4242), { cmd: '/usr/bin/caffeinate', args: ['-i', '-w', '4242'] });
  const { cmd, args } = holderFor('linux', 4242);
  assert.equal(path.posix.basename(cmd), 'systemd-inhibit');
  // The Interface's argv, as S2.md states it: the census recognises the holders by it.
  assert.deepEqual(args, ['--what=sleep:idle', '--who=pilot', '--why=pilot: work in flight', '--mode=block', 'tail', '--pid=4242', '-f', '/dev/null']);
  assert.throws(() => holderFor('linux', 0), RangeError, 'a pid of 0 would watch the process group');
});

test('holderUnavailable names why a platform cannot hold', () => {
  assert.equal(holderUnavailable('win32'), null);
  assert.match(holderUnavailable('sunos'), /sunos/);
});

/** A spawn that records each call and hands back a child with a pid; nothing starts. */
function fakeSpawn() {
  const children = [];
  const spawn = (cmd, args, options) => {
    const child = new EventEmitter();
    child.pid = 90_000 + children.length;
    child.call = { cmd, args, options };
    child.kills = 0;
    child.kill = () => {
      child.kills += 1;
      return true;
    };
    children.push(child);
    return child;
  };
  return { spawn, children };
}

/** A linux hold on the mock clock with a fake spawn, its group kills and log lines kept. */
function aPosixHold(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2026-11-25T10:00:00Z') });
  const { spawn, children } = fakeSpawn();
  const groups = [];
  const logs = [];
  const hold = holdAwake({ facts: () => ({ lastHeardAt: null, landings: 1, armedDefaults: 0 }), spawn, platform: 'linux', pid: 4242, log: (line) => logs.push(line), killGroup: (pid) => groups.push(pid) });
  t.after(() => hold.stop());
  return { hold, children, groups, logs, advance: (ms) => t.mock.timers.tick(ms) };
}

test('on POSIX the deck holds from the spawn and stops the holder by its group', (t) => {
  assert.equal(awakeState().held, false, 'no hold left by an earlier test');
  const { hold, children, groups, logs, advance } = aPosixHold(t);

  advance(60_000);
  assert.equal(children.length, 1);
  assert.equal(children[0].call.options.detached, true, 'its own process group');
  assert.equal(awakeState().held, false, 'not before the OS has started it');
  children[0].emit('spawn');
  assert.equal(awakeState().held, true, 'caffeinate and systemd-inhibit say nothing, so the spawn is the hold');

  hold.stop();
  assert.deepEqual(groups, [children[0].pid], 'the group is killed, so no tail is left');
  assert.equal(awakeState().held, false);
  assert.deepEqual(logs, []);
});

test('a POSIX holder that dies as it starts is logged once', (t) => {
  const { children, logs, advance } = aPosixHold(t);
  for (let minute = 0; minute < 3; minute += 1) {
    advance(60_000);
    children[minute].emit('spawn'); // e.g. logind refuses the inhibitor: started, then gone
    children[minute].emit('exit', 1, null);
  }
  assert.equal(children.length, 3, 'retried each minute');
  assert.equal(logs.length, 1, 'one log line, not one a minute');

  advance(60_000);
  children[3].emit('spawn');
  advance(60_000); // it outlives a tick: a real hold
  children[3].emit('exit', null, 'SIGKILL');
  assert.equal(logs.length, 2, 'a holder that held and then died is logged again');
});

test('macOS lists the assertion while held', { skip: notOn('darwin') }, async (t) => {
  const watched = aWatched(t);
  const holder = aPosixHolder(t, 'darwin', watched.pid);
  const mine = (out) => out.split('\n').filter((line) => line.includes(`pid ${holder.pid}(caffeinate)`) && line.includes('PreventUserIdleSystemSleep')).length;
  const assertions = () => execFileSync('pmset', ['-g', 'assertions'], { encoding: 'utf8' });

  assert.equal(await within(5000, () => mine(assertions()), (n) => n > 0, 'the assertion'), 1);
  process.kill(-holder.pid, 'SIGTERM');
  await exitWithin5s(holder, 'caffeinate');
  assert.equal(await within(5000, () => mine(assertions()), (n) => n === 0, 'the assertion gone'), 0);
});

test('Linux lists the inhibitor while held', { skip: linuxSkip() }, async (t) => {
  const watched = aWatched(t);
  const holder = aPosixHolder(t, 'linux', watched.pid);
  const mine = (out) =>
    out.split('\n').filter((line) => /^\s*pilot\s/.test(line) && new RegExp(`\\s${holder.pid}\\s`).test(line) && /\ssleep:idle\s/.test(line) && /\sblock\s*$/.test(line)).length;
  const inhibitors = () => execFileSync(holderFor('linux', 1).cmd, ['--list', '--no-pager', '--no-legend'], { encoding: 'utf8' });

  if (!(await settled(t, holder))) return;
  assert.equal(await within(5000, () => mine(inhibitors()), (n) => n > 0, 'the inhibitor'), 1);
  process.kill(-holder.pid, 'SIGTERM');
  await exitWithin5s(holder, 'systemd-inhibit');
  assert.equal(await within(5000, () => mine(inhibitors()), (n) => n === 0, 'the inhibitor gone'), 0);
});

for (const platform of ['darwin', 'linux']) {
  const skip = platform === 'linux' ? linuxSkip() : notOn('darwin');
  test(`the ${platform} holder dies with its pid`, { skip }, async (t) => {
    const watched = aWatched(t);
    const holder = aPosixHolder(t, platform, watched.pid);
    if (!(await settled(t, holder))) return; // it holds while its pid lives

    watched.kill();
    await exitWithin5s(holder, 'the holder');
    if (platform !== 'linux') return; // only the linux holder has a tail
    const tails = await within(5000, () => commandLines().filter((line) => line.includes(`tail --pid=${watched.pid}`)), (left) => left.length === 0, 'no tail left');
    assert.deepEqual(tails, []);
  });
}
