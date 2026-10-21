/**
 * Gate slots (process-gc spec 5; L8, L15): at most `GATE_SLOTS` gates per user run their
 * suites at once, machine-wide and across repositories. A slot is a lock file
 * `<dir>/slot-<n>.json`, created `wx` as `{ pid, dir, since }` and removed on release. A third
 * gate says once whose slots it waits on, sleeps between looks, and takes the first that
 * frees. A slot whose holder is dead is taken over. The holder passes `PILOT_GATE_SLOT` to its
 * suite, and a gate that sees it takes no second slot, so `runTests` → `npm test` → the gate
 * holds one.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isRunning } from '../deck/runs.mjs';

export const GATE_SLOTS = 2;

/** How long a third gate sleeps between looks at the slots. */
const POLL_MS = 1000;
/** How old an unreadable slot file or a takeover lock must be before it counts as abandoned. */
const STALE_MS = 10_000;

const noop = () => {};

const sleepFor = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sayOnStderr = (line) => process.stderr.write(`${line}\n`);

/** The holder in `file`: its parsed content, `null` when there is none, `'unreadable'` mid-write or corrupt. */
function holderOf(file) {
  try {
    const holder = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Number.isInteger(holder?.pid) ? holder : 'unreadable';
  } catch (err) {
    return err.code === 'ENOENT' ? null : 'unreadable';
  }
}

const ageOf = (file) => {
  try {
    return Date.now() - fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/**
 * Removes `file` when its holder is dead or it has been unreadable for `STALE_MS`. The check
 * and the removal happen under a `mkdir` lock, so two waiters that both saw the dead holder
 * cannot both remove it and the second remove a live holder's fresh file.
 */
function takeOver(file, alive) {
  const lock = `${file}.takeover`;
  try {
    fs.mkdirSync(lock);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    if (ageOf(lock) > STALE_MS) fs.rmSync(lock, { recursive: true, force: true });
    return;
  }
  try {
    const holder = holderOf(file);
    const gone = holder === 'unreadable' ? ageOf(file) > STALE_MS : holder !== null && !alive(holder.pid);
    if (gone) fs.rmSync(file, { force: true });
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

/**
 * Takes a gate slot, waiting for one if every slot is held. Synchronous. With
 * `env.PILOT_GATE_SLOT` set it takes nothing and returns at once (re-entry).
 */
export function takeSlot({
  dir = path.join(os.tmpdir(), 'pilot-gate-slots'),
  slots = GATE_SLOTS,
  cwd,
  env,
  alive = isRunning,
  sleep = sleepFor,
  say = sayOnStderr,
}) {
  if (env.PILOT_GATE_SLOT) return { release: noop, slot: Number(env.PILOT_GATE_SLOT), waited: false };
  fs.mkdirSync(dir, { recursive: true });
  const mine = { pid: process.pid, dir: cwd, since: new Date().toISOString() };
  let waited = false;
  for (;;) {
    const holders = [];
    for (let slot = 0; slot < slots; slot++) {
      const file = path.join(dir, `slot-${slot}.json`);
      try {
        fs.writeFileSync(file, JSON.stringify(mine), { flag: 'wx' });
        return { release: () => release(file, mine), slot, waited };
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      takeOver(file, alive);
      holders.push(holderOf(file));
    }
    if (holders.includes(null)) continue; // a slot freed or was taken over while we looked
    if (!waited) {
      const named = holders.map((h) => (h === 'unreadable' ? 'an unreadable holder' : `pid ${h.pid} in ${h.dir}`));
      say(`gate: waiting for a slot: ${named.join(', ')}`);
      waited = true;
    }
    sleep(POLL_MS);
  }
}

/** Frees the slot, but only while it is still this holder's: a slot taken over is not ours to remove. */
function release(file, mine) {
  const holder = holderOf(file);
  if (holder && holder !== 'unreadable' && holder.pid === mine.pid && holder.dir === mine.dir && holder.since === mine.since) fs.rmSync(file, { force: true });
}
