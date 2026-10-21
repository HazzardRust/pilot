/**
 * The idle rule (process-gc L2, ADR 0136): the user's deck exits once 10 minutes pass with no
 * `claude` process in the process table, no landing running and no HTTP request. The table is
 * read last and only when the other two already hold, so an active deck never spawns a reader.
 * Every other daemon holds a leash instead (`leash.mjs`) and never runs this.
 */

import { isClaude } from './procs.mjs';

export const IDLE_MS = 10 * 60_000;

const DEFAULT_INTERVAL_MS = 60_000;

/** True only when all three hold; `sessions` is read lazily, never when either of the others is live. */
export function isIdle({ now, lastRequestAt, landings, sessions }) {
  return now - lastRequestAt >= IDLE_MS && landings === 0 && sessions() === 0;
}

/** Ticks every `intervalMs`; calls `onIdle` once when `isIdle` holds. Returns stop(). */
export function holdIdle({ lastRequestAt, landings, table, onIdle, now = Date.now, intervalMs = DEFAULT_INTERVAL_MS }) {
  const sessions = () => {
    try {
      return table().filter(isClaude).length;
    } catch (err) {
      // A table that cannot be read proves nothing is idle: stay, and try again next tick.
      console.error(`[deck] idle check: cannot read the process table (${String(err?.message ?? err).split('\n')[0]}); staying up`);
      return Infinity;
    }
  };
  const timer = setInterval(() => {
    if (!isIdle({ now: now(), lastRequestAt: lastRequestAt(), landings: landings(), sessions })) return;
    clearInterval(timer);
    onIdle();
  }, intervalMs);
  // The server keeps the daemon alive; the idle tick alone never should.
  timer.unref();
  return () => clearInterval(timer);
}
