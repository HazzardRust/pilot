/**
 * `pilot gc` (process-gc spec 4; L5, L11, L14): stops each orphan `pilotProcesses` named, and
 * only those, so a row it could not read for sure (orphan null) is never touched. A daemon or a
 * wait gets `process.kill(pid)`; a test root its tree, `taskkill /T /F` on Windows and on POSIX
 * its descendants in the table, deepest first. A stop that fails is a line, never a throw, and a
 * process table that cannot be read stops nothing.
 */
import { execFileSync } from 'node:child_process';

import { killTree } from '../hooks/lib/platform.js';
import { pilotProcesses, processTable, userDeckPid } from './procs.mjs';

// taskkill's own reason ("Access is denied") is on stderr, under a "Command failed" message.
const firstLine = (err) => String(err?.stderr?.toString().trim() || err?.message || err).split('\n')[0];

/** The real kill for `gc`, reading a tree's descendants from the `table` the rows came from (L4). */
export const stopper = (table, { platform, exec = execFileSync, signal = process.kill } = {}) => (pid, tree) => {
  if (!tree) return void signal(pid);
  killTree(pid, { platform, table, exec, signal });
};

/**
 * Stops each row whose `orphan` names a reason, and answers one line per stop:
 * `stopped <pid> <kind> <worktree|-> (<why>)` or `could not stop <pid>: <reason>`;
 * `gc: nothing to stop` when no row is an orphan.
 */
export function gc(owned, { kill = stopper([]), spare = new Set() } = {}) {
  const lines = [];
  for (const row of owned) {
    if (typeof row.orphan !== 'string' || row.orphan === '') continue;
    try {
      if (spare.has(row.pid)) throw new Error('gc runs under it');
      kill(row.pid, row.kind === 'test');
      lines.push(`stopped ${row.pid} ${row.kind} ${row.worktree ?? '-'} (${row.orphan})`);
    } catch (err) {
      lines.push(`could not stop ${row.pid}: ${firstLine(err)}`);
    }
  }
  return lines.length ? lines : ['gc: nothing to stop'];
}

/** `self` and the pids above it in `table`, which gc must not stop; `seen` stops a ppid cycle. */
const lineage = (table, self) => {
  const seen = new Set([self]);
  for (let up = table.find((p) => p.pid === self); up && !seen.has(up.ppid); up = table.find((p) => p.pid === up.ppid)) seen.add(up.ppid);
  return seen;
};

/** One read of the process table, then `gc` over it; a reader failure is one line and stops nothing. */
export function sweep({ userDeckPid: deck, read = processTable, self = process.pid, kill, spareWaits = false } = {}) {
  let table, owned;
  try {
    table = read();
    owned = pilotProcesses(table, { userDeckPid: deck }).filter((row) => !(spareWaits && row.kind === 'wait'));
  } catch (err) {
    return [`gc: could not read the process table, nothing stopped: ${firstLine(err)}`];
  }
  return gc(owned, { kill: kill ?? stopper(table), spare: lineage(table, self) });
}

/**
 * The sweep `pilot land` runs: every wait spared, because a live session's `pilot wait` started under a tool
 * reads as an orphan (its chain is broken, no claude above it), and a landing must not stop the pilot's listener.
 */
export const landSweep = (options = {}) => sweep({ ...options, spareWaits: true });

const PROBE = `const { userDeckPid } = await import(${JSON.stringify(new URL('./procs.mjs', import.meta.url).href)});
const pid = await userDeckPid(); process.stdout.write(pid === null ? 'null' : String(pid ?? ''));`;

/**
 * `userDeckPid` read now, for a caller that cannot await: `pilot land` sweeps minutes after it
 * starts, and a deck restarted meanwhile has a new pid. Undefined whenever the probe fails.
 */
export function deckPidNow({ exec = execFileSync } = {}) {
  try {
    const out = exec(process.execPath, ['--input-type=module', '-e', PROBE], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return out === 'null' ? null : /^[1-9]\d*$/.test(out) ? Number(out) : undefined;
  } catch {
    return undefined;
  }
}

/** `pilot gc`: its lines on stdout, exit 0 always. */
export async function main() {
  for (const line of sweep({ userDeckPid: await userDeckPid() })) console.log(line);
  return 0;
}
