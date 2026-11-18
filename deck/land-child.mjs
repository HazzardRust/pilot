/**
 * The deck's land child as the store records it (never-stuck spec 21, 22): its land dir, its pid on the running landing,
 * and the read-only probe of whether a recorded pid is still that child. Beside `deck/store-items.mjs`, at its size bar.
 */

import path from 'node:path';

import { processTable } from './procs.mjs';
import { readDeck, writeDeck } from './store-core.mjs';
import { storeDir } from './store-dir.mjs';

/** The directory a landing's child writes its output to: the deck's own, never the worktree land runs in. */
export const landDir = (gate2Id) => path.join(storeDir(), 'landings', gate2Id);

/** Whether `pid` is a live process: signal 0 sends nothing, and EPERM is a live process this one may not signal. */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

/** How far a process's start may stand from its landing's `startedAt` and still be that landing's child. */
const START_SLACK_MS = 60_000;

/**
 * Whether a landing's pid is still the deck's land child: live, node running an absolute `bin/pilot.mjs` with `land` as its
 * one argument, started when the landing did, so a reused pid is never taken for it. A table that cannot be read throws.
 */
export function landChildOf(landing, { table = processTable, now = Date.now(), alive = pidAlive } = {}) {
  if (!alive(landing?.pid)) return false;
  const row = table().find((p) => p.pid === landing.pid);
  if (!row || !/^node(\.exe)?$/i.test(row.name)) return false;
  const argv = [...String(row.command).matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
  const at = argv.findIndex((word, i) => i > 0 && !word.startsWith('-'));
  const script = String(argv[at] ?? '').replaceAll('\\', '/');
  if (!/^([A-Za-z]:)?\//.test(script) || !script.endsWith('/bin/pilot.mjs') || argv[at + 1] !== 'land' || argv.length !== at + 2) return false;
  return Math.abs(now - row.ageS * 1000 - Date.parse(landing.startedAt)) <= START_SLACK_MS;
}

/** The spawned child's pid on a landing `beginLanding` stored running a moment before, so a restarted deck finds it. */
export function holdLanding(gate2Id, pid) {
  if (!Number.isInteger(pid)) return;
  const deck = readDeck();
  const landing = deck.items.find((item) => item.id === gate2Id)?.landing;
  if (landing?.state !== 'running') return;
  landing.pid = pid;
  writeDeck(deck);
}
