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
import { localDay } from './store-recovery.mjs';

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

export const emptyMachine = () => ({ roots: {}, sessions: {}, coPilots: {}, switches: {}, live: [], landingPids: {} });

/** `raw` as a machine, or null when it does not parse or breaks a field's rule. */
function parsed(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isMap(value) || Object.entries(FIELDS).some(([name, ok]) => Object.hasOwn(value, name) && !ok(value[name]))) return null;
  return { ...emptyMachine(), ...Object.fromEntries(Object.keys(FIELDS).filter((name) => Object.hasOwn(value, name)).map((name) => [name, value[name]])) };
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
 * An unreadable machine file linked to `machine.unreadable-<day>[-n].json` before it is replaced, never overwriting
 * one (as the store's version backups): its bytes may hold root overrides a hand can still recover. A file that
 * cannot be set aside throws, so it is never replaced.
 */
function setAside(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw new Error(`machine file ${file} cannot be read (${err.message}), so it was not replaced`);
  }
  if (parsed(raw)) return;
  const at = (n) => path.join(path.dirname(file), `machine.unreadable-${localDay()}${n > 1 ? `-${n}` : ''}.json`);
  for (let n = 1; ; n += 1) {
    try {
      fs.linkSync(file, at(n));
      console.error(`[deck] unreadable machine file ${file} set aside as ${at(n)}`);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw new Error(`machine file ${file} could not be set aside (${err.message}), so it was not replaced`);
      if (fs.readFileSync(at(n), 'utf8') === raw) return;
    }
  }
}

/** `machine` written atomically to the machine file in `dir`, under the gate's guard on the store beside it. */
export function writeMachine(dir, machine) {
  // The gate names the home store by its deck.json; the machine file beside it is that store's too.
  refuseGateHomeWrite(path.join(dir, 'deck.json'));
  const file = path.join(dir, FILE);
  setAside(file);
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
  writeMachine(dir, { roots: machine.roots, ...live });
  return stored;
}
