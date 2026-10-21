/**
 * The leash (process-gc L1-L4): what ends a daemon nobody needs any more. A daemon that is not
 * the user's deck holds one: a pid, its own `daemon.mjs`, and any `--leash-dir`. Within one poll
 * of the pid exiting or a path vanishing, the holder is told, and closes and exits. It lives in
 * the process it holds (L1), so it needs no supervisor running. It is read from the command line
 * and never from env (L4), so another process can read it from the process table.
 */
import fs from 'node:fs';

import { isRunning } from './runs.mjs';
import { DECK_PORT } from './tools.mjs';

const DEFAULT_INTERVAL_MS = 2000;

const positiveInt = (value) => (/^[1-9]\d*$/.test(String(value ?? '')) ? Number(value) : null);

/** The value after `flag` in `argv`, undefined when the flag is absent; throws when it has none. */
function flagValue(argv, flag) {
  const at = argv.indexOf(flag);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

/**
 * The leash this daemon holds: null for the user's deck (`DECK_PORT` and no `--leash`, L2), else
 * the `--leash` pid or the parent's, its own file, and the `--leash-dir` when given.
 */
export function leashFrom(argv, env, { ppid, daemonFile }) {
  const raw = flagValue(argv, '--leash');
  const dir = flagValue(argv, '--leash-dir');
  const port = env.PILOT_DECK_PORT?.trim() ? Number(env.PILOT_DECK_PORT) : DECK_PORT;
  if (raw === undefined && port === DECK_PORT) return null;
  const pid = raw === undefined ? ppid : positiveInt(raw);
  if (pid === null) throw new Error(`--leash ${raw} is not a pid`);
  return { pid, paths: [daemonFile, ...(dir === undefined ? [] : [dir])] };
}

/** Polls `leash` every `intervalMs`; calls `onGone` once with the reason it broke. Returns stop(). */
export function holdLeash(leash, onGone, { intervalMs = DEFAULT_INTERVAL_MS, alive = isRunning, exists = fs.existsSync } = {}) {
  const timer = setInterval(() => {
    const why = !alive(leash.pid) ? `pid ${leash.pid} has exited` : leash.paths.filter((p) => !exists(p)).map((p) => `${p} is gone`)[0];
    if (why === undefined) return;
    clearInterval(timer);
    onGone(why);
  }, intervalMs);
  // The server keeps the daemon alive; the leash alone never should.
  timer.unref();
  return () => clearInterval(timer);
}

/** The session's pid from `CLAUDE_PID` (L3), or null when it is not a positive integer. */
export function sessionPid(env) {
  return positiveInt(env.CLAUDE_PID);
}
