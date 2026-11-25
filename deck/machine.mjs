/**
 * The machine file (portable-store spec 2, F4, L3, A4): `machine.json` beside `deck.json` holds what is bound to this
 * machine — runs' pid, session and lastSeenAt by run id, co-pilot leases, switches, live tickets, landing pids — and
 * the root overrides. `deck.secret` and `deck.pid` stay their own files (A4). A missing or unreadable file reads as
 * an empty machine, so losing it costs live sessions only; an unreadable one is set aside before it is replaced.
 */

import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFileSync } from '../hooks/lib/atomic-write.js';
import { defaultRoots, toStored } from './store-codec.mjs';
import { refuseGateHomeWrite } from './store-dir.mjs';
import { setAside } from './store-recovery.mjs';

const FILE = 'machine.json';

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const mapOf = (value, ok) => isMap(value) && Object.values(value).every(ok);

/** Each field's rule; a file breaking any of them is unreadable as a whole, never half read. */
const FIELDS = {
  roots: (value) => mapOf(value, (dir) => typeof dir === 'string'),
  sessions: (value) => mapOf(value, isMap),
  coPilots: isMap,
  switches: isMap,
  live: (value) => Array.isArray(value) && value.every((id) => typeof id === 'string'),
  landingPids: (value) => mapOf(value, Number.isInteger),
};

/** No machine state; `coPilots` and `switches` are absent, not empty, as a deck without them has none (F4). */
export const emptyMachine = () => ({ roots: {}, sessions: {}, live: [], landingPids: {} });

/**
 * `raw` as a machine, or null when it does not parse or breaks a field's rule. A key this build does not know is
 * kept, so a later build's field survives this one's write.
 */
function parsed(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isMap(value) || Object.entries(FIELDS).some(([name, ok]) => Object.hasOwn(value, name) && !ok(value[name]))) return null;
  return { ...emptyMachine(), ...value };
}

/** The machine file in `dir`; a missing or unreadable one reads as an empty machine (the latter said on stderr). */
export function readMachine(dir) {
  const file = path.join(dir, FILE);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[deck] machine file ${file} reads as empty: ${err.message}`);
    return emptyMachine();
  }
  const machine = parsed(raw);
  if (!machine) console.error(`[deck] machine file ${file} is unreadable, so it reads as empty and is set aside at the next write`);
  return machine ?? emptyMachine();
}

/**
 * An unreadable machine file set aside as `machine.json.unreadable-<day>[-n]` before it is replaced, by the store's own
 * `setAside` (linked, or copied where links fail, never overwriting one): its bytes may hold root overrides a hand can
 * still recover. A file that cannot be read or set aside throws, so it is never replaced.
 */
function keepUnreadable(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw new Error(`machine file ${file} cannot be read (${err.message}), so it was not replaced`);
  }
  if (parsed(raw)) return;
  try {
    console.error(`[deck] unreadable machine file ${file} set aside as ${setAside(file, 'unreadable')}`);
  } catch (err) {
    throw new Error(`machine file ${file} could not be set aside (${err.message}), so it was not replaced`);
  }
}

/** `machine` written atomically to the machine file in `dir`, under the gate's guard on the store beside it. */
export function writeMachine(dir, machine) {
  // The gate names the home store by its deck.json; the machine file beside it is that store's too.
  refuseGateHomeWrite(path.join(dir, 'deck.json'));
  const file = path.join(dir, FILE);
  keepUnreadable(file);
  atomicWriteFileSync(file, `${JSON.stringify(machine, null, 2)}\n`);
}

/** This machine's roots: the derived ones (L3) with the stored overrides over them. */
export function rootsOf(machine, home, platform) {
  return { ...defaultRoots(home, platform), ...machine.roots };
}

/**
 * `deck` split for `writeDeck` (spec 2): its machine state written to the machine file in `dir`, keeping the root
 * overrides, and its stored form returned for `deck.json`. The machine file goes first, so a write that dies before
 * `deck.json` loses no live state: the older `deck.json` reads with the newer machine file winning.
 */
export function storeMachine(dir, deck, home, platform) {
  const machine = readMachine(dir);
  const { stored, machine: live } = toStored(deck, rootsOf(machine, home, platform));
  writeMachine(dir, { ...machine, ...live });
  return stored;
}
