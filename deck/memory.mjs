/**
 * Each deck process's own memory, one JSON line a reading in `<store>/memory.jsonl` (ADR 0094):
 * the listener (`pilot wait`), the daemon and the tool client each call `startMemoryLog` once from
 * their `main`, never from `wait()` or `startDaemon()`, so no test process writes a reading (L10).
 * A reading is the process's own `rss` and the machine's free memory, in bytes. The file is not
 * `usage.jsonl`, whose resume would take a reading for a torn window (A5), and the one logging
 * switch governs it, re-read before every reading so `pilot logging off` reaches a running process (L12).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { privateDir } from '../hooks/lib/atomic-write.js';
import { storeDir } from './store-dir.mjs';
import { readUsageSwitch } from './usage-switch.mjs';

export const memoryLogFile = () => path.join(storeDir(), 'memory.jsonl');

const TICK_MS = 10 * 60 * 1000;

/** The names a reading may carry; anything else in the file is not one of ours and is never echoed. */
export const PROCESSES = ['wait', 'daemon', 'client'];

export function readingOf(name, event, { now = Date.now, memoryUsage = process.memoryUsage, freemem = os.freemem } = {}) {
  return { at: new Date(now()).toISOString(), process: name, pid: process.pid, event, rss: memoryUsage().rss, free: freemem() };
}

function appendLine(line) {
  const file = memoryLogFile();
  privateDir(path.dirname(file));
  fs.appendFileSync(file, line);
}

/**
 * Writes `start` now, a `tick` every 10 minutes on an unref'd timer that never holds the process
 * open, and one `exit` on whichever of `stop()`, the `exit` event, SIGINT or SIGTERM comes first.
 * A hard kill runs none of them, so its last line is its last tick (A6). A failed write is said once
 * on stderr and never costs the process it measures.
 */
export function startMemoryLog(name, { schedule = setInterval, append = appendLine, on = process.on.bind(process) } = {}) {
  let warned = false;
  const write = (event) => {
    if (!readUsageSwitch().enabled) return;
    try {
      append(`${JSON.stringify(readingOf(name, event))}\n`);
    } catch (err) {
      if (!warned) process.stderr.write(`[deck] memory log: ${err.message}\n`);
      warned = true;
    }
  };

  let done = false;
  const exit = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    write('exit');
  };

  write('start');
  const timer = schedule(() => {
    if (!done) write('tick');
  }, TICK_MS);
  timer.unref();

  on('exit', exit);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const onSignal = () => {
      exit();
      // A listener of ours replaces Node's own ending of the process; where no other listener
      // (the daemon's close) will end it, end it as Node would have.
      const listeners = process.listeners(signal);
      if (listeners.includes(onSignal) && listeners.length === 1) process.exit(128 + os.constants.signals[signal]);
    };
    on(signal, onSignal);
  }
  return { stop: exit };
}

/**
 * The peak `rss` per process among the readings whose `at` falls inside `span`, with the number of
 * them; lines that are not readings, and process names that are not ours, are skipped. No file is no readings.
 */
export function readMemory(file, span) {
  const peaks = new Map();
  if (!span || !fs.existsSync(file)) return peaks;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Date.parse(r?.at);
    if (!PROCESSES.includes(r?.process) || !(at >= span.from && at <= span.to)) continue;
    const peak = peaks.get(r.process);
    peaks.set(r.process, {
      ...(peak && peak.rss >= r.rss ? peak : r),
      readings: (peak?.readings ?? 0) + 1,
    });
  }
  return peaks;
}
