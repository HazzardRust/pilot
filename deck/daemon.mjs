#!/usr/bin/env node
/**
 * The deck daemon: one process per machine (L3), serving the page and the JSON API
 * from `deck/server.mjs` over the one store.
 *
 * It is started either by hand (`node bin/pilot.mjs deck`) or, far more often, by the
 * first Claude session that needs it — `deck/client.mjs` spawns this file detached and
 * walks away (A2). Which means this process must assume it has no console, no stdin and
 * nobody reading its stderr: it never prompts, and it never depends on being able to
 * report anything to a human. What it reports failure with instead is the port. A deck
 * that is up answers `/api/health`; a deck that is not, does not.
 *
 * A4 is why a collision is fatal rather than clever. If something already holds the
 * port, this process says so and exits, because the alternative — quietly moving to
 * another port — produces two decks, two URLs and the pile-up the deck exists to end.
 * The session that spawned it then finds a deck answering on the port either way: if
 * the holder is another deck, that is the right answer; if it is not, the session says
 * so rather than serving half a feature.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { atomicWriteFileSync, privateDir } from '../hooks/lib/atomic-write.js';
import { ensureSecret } from '../hooks/lib/deck-secret.js';
import { writeOpenFile } from './launch.mjs';
import { createDeckHttpServer, DECK_HOST, deckPort, deckUrl } from './server.mjs';
import { holdIdle } from './idle.mjs';
import { closeLandedAtStart, landingsRunning, startQueued } from './landing.mjs';
import { oneLine } from './one-line.mjs';
import { holdLeash, leashFrom } from './leash.mjs';
import { probeDeck } from './probe.mjs';
import { processTable } from './procs.mjs';
import { archiveOld, interruptLandings, storeDir } from './store.mjs';
import { startMemoryLog } from './memory.mjs';
import { startUsageLog } from './telemetry.mjs';
import { readUsageSwitch } from './usage-switch.mjs';
import { storePid } from './store-restore.mjs';
import { searchPathOnly } from '../scripts/pilot-branch.mjs';

/** How often the archive pass runs after the start's (store-durability A3). */
const ARCHIVE_EVERY_MS = 24 * 60 * 60 * 1000;

/** Past this the log starts again: these are the last run's diagnostics, not every run's. */
const MAX_LOG_BYTES = 1024 * 1024;

/** How long a crashed deck's shutdown may take before the process is ended anyway (L1). */
const CRASH_EXIT_MS = 2000;

/**
 * Tee this process's stderr into `<storeDir()>/deck.log`.
 *
 * `deck/client.mjs` spawns this file with `stdio: 'ignore'`, which is exactly what lets
 * the daemon outlive the session that started it — and also means every diagnostic it
 * writes goes into a pipe nobody is holding. A deck that cannot say why it refused a
 * request is a deck nobody can debug, so it says it to a file as well. A tee rather than
 * a redirect, because `pilot deck --foreground` runs this with a human watching.
 *
 * Every failure in here is swallowed on purpose. Serving the deck without a log is worse
 * than serving it with one and far better than not serving it at all, so a read-only
 * store directory, or a log another process holds open, must not stop the daemon.
 */
function logToStore() {
  const file = path.join(storeDir(), 'deck.log');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.statSync(file, { throwIfNoEntry: false })?.size > MAX_LOG_BYTES) {
      fs.truncateSync(file, 0);
    }
    const log = fs.openSync(file, 'a');
    const toStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      try {
        // The encoding is `write`'s optional second argument, and honouring it is what
        // keeps the file byte-for-byte what stderr got. Nothing in the deck writes
        // anything but utf8 strings today; a log that quietly re-encodes them would be
        // a worse bug to find later than these two lines are to write now.
        const encoding = typeof rest[0] === 'string' ? rest[0] : 'utf8';
        fs.writeSync(log, typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk));
      } catch {
        /* a log that cannot be written must never take the deck down with it */
      }
      return toStderr(chunk, ...rest);
    };
  } catch {
    /* likewise */
  }
  return file;
}

/** Binds the deck, or rejects with the reason it could not. `exit` is what `POST /api/exit` runs (L3). */
export function startDaemon({ port = deckPort(), host = DECK_HOST, exit } = {}) {
  return new Promise((resolve, reject) => {
    const server = createDeckHttpServer({ exit });
    const failed = (err) => reject(err);
    server.once('error', failed);
    server.listen(port, host, () => {
      server.off('error', failed);
      resolve(server);
    });
  });
}

/**
 * The user's deck's idle rule (L2): every request stamps the clock, and `onIdle` runs once 10
 * minutes pass with no request, no landing and no `claude` process. Returns stop().
 */
export function holdUsersDeckIdle(server, onIdle, { now = Date.now, table = processTable, landings = landingsRunning, intervalMs } = {}) {
  let lastRequestAt = now();
  server.on('request', () => {
    lastRequestAt = now();
  });
  return holdIdle({ lastRequestAt: () => lastRequestAt, landings, table, onIdle, now, intervalMs });
}

/**
 * The held-port message (A1, spec 7): the holder by pid and version when it is a deck, and named as
 * not one when not. The version is whatever answered on the port, so it is kept to one line.
 */
async function whoHolds(url) {
  const holder = await probeDeck(url);
  if (holder.state === 'deck') {
    const version = oneLine(holder.version ?? 'unknown');
    return `[deck] a deck is already serving ${url} (pid ${holder.pid}, version ${version}); nothing to start`;
  }
  if (holder.state === 'none') return `[deck] ${url} was held a moment ago and nothing answers on it now; start again`;
  return `[deck] ${url} is held by another program, not a deck (${holder.why}); free the port and start again`;
}

/**
 * L1: an uncaught exception or an unhandled rejection writes `[deck] crashed:` and the stack
 * through the stderr tee, so it lands in deck.log before the process goes, then runs the
 * same `shutdown` a signal does and exits 1. Not serving on: Node documents a process past
 * an uncaught exception as in an undefined state. `shutdown` ends in `process.exit(0)`, so
 * the 1 is set from the `exit` event, which runs after that call and before the process
 * ends; the unref'd timer is the bound when `server.close` never calls back.
 */
function exitOnCrash(shutdown) {
  let crashed = false;
  const crash = (err) => {
    console.error('[deck] crashed:', err?.stack ?? err);
    if (crashed) return;
    crashed = true;
    process.on('exit', () => {
      process.exitCode = 1;
    });
    setTimeout(() => process.exit(1), CRASH_EXIT_MS).unref();
    try {
      shutdown();
    } catch (closeErr) {
      console.error('[deck] the crash shutdown failed:', closeErr?.stack ?? closeErr);
      process.exit(1);
    }
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
}

export async function main() {
  // Before any git runs: no git the daemon spawns in a repository is one planted there (spec 7).
  searchPathOnly();
  // Before the log or anything else lands in it: another user on the box cannot list or read the store (L6).
  privateDir(storeDir(), {
    onKept: (err) => console.error(`[deck] store dir ${storeDir()} keeps the mode its owner set: ${err.message}`),
  });
  logToStore();
  // Read before the port is bound: a bad --leash must not leave a deck nobody holds.
  const leash = leashFrom(process.argv.slice(2), process.env, { ppid: process.ppid, daemonFile: fileURLToPath(import.meta.url) });

  let server;
  try {
    // The exit route closes the deck through the same shutdown a signal runs, declared below.
    server = await startDaemon({ exit: () => shutdown() });
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(await whoHolds(deckUrl()));
    process.exitCode = 1;
    return;
  }

  console.error(`[deck] serving ${deckUrl()} (pid ${process.pid})`);

  // Names this deck and its port in its store dir, so `pilot store restore` asks that port (store-durability
  // spec 9). Here and not in `startDaemon`, whose in-process test servers serve no store dir of their own.
  // Before anything below writes the store; and never over a line whose port answers another live deck.
  const pidFile = path.join(storeDir(), 'deck.pid');
  const pidLine = `${process.pid} ${server.address().port}`;
  try {
    const other = await storePid({ dir: storeDir() });
    if (Number.isInteger(other) && other !== process.pid) {
      console.error(`[deck] ${pidFile} names deck ${other}, which answers on its port; left as it is`);
    } else {
      atomicWriteFileSync(pidFile, pidLine);
      // Beside it, the open file for this port: the only way a browser gets in (deck-token A2).
      try {
        writeOpenFile(storeDir(), `http://${DECK_HOST}:${server.address().port}`, ensureSecret(storeDir()));
      } catch (err) {
        console.error('[deck] no open file for this deck; `pilot deck --rotate` writes one:', err.message);
      }
    }
  } catch (err) {
    console.error(`[deck] ${pidFile} could not be written; restore sees this deck only on its port:`, err.message);
  }
  const dropPidFile = () => {
    try {
      if (fs.readFileSync(pidFile, 'utf8') === pidLine) fs.rmSync(pidFile);
    } catch {
      /* gone, or unreadable: a deck.pid whose port no longer answers its pid is ignored by restore */
    }
  };

  // Here and not in `startDaemon`, which the suite calls: a test daemon must never tick (L1).
  startUsageLog();
  startMemoryLog('daemon');
  // Before any press is read: a landing left running had its child die with the last daemon (spec 7).
  try {
    interruptLandings();
  } catch (err) {
    console.error('[deck] the landings a restart interrupted could not be settled:', err.message);
  }
  // Old closed items move to the month archive here and daily, never from writeDeck or startDaemon (store-durability L4).
  const archive = () => {
    try {
      const { moved } = archiveOld();
      if (moved.length) console.error(`[deck] archived ${moved.length} closed item${moved.length === 1 ? '' : 's'} over a month old`);
    } catch (err) {
      console.error('[deck] the old closed items could not be archived:', err.message);
    }
  };
  archive();
  setInterval(archive, ARCHIVE_EVERY_MS).unref();
  // A gate2 that landed under the last daemon and was left open is resolved; never a report (lander S15).
  try {
    closeLandedAtStart();
  } catch (err) {
    console.error('[deck] the landed gate2s a restart left open could not be resolved:', err.message);
  }
  // A press the last daemon queued starts (gate2-frees-lane spec 7).
  try {
    startQueued();
  } catch (err) {
    console.error('[deck] the landings a restart left queued could not start:', err.message);
  }
  console.error(readUsageSwitch().enabled ? `[deck] logging on, ${storeDir()}` : '[deck] logging off (pilot logging on)');

  // Parked `deck_wait` requests hold their connections open, so a plain close would sit here
  // until every one of them timed out. They are all long polls with nothing to lose: cut them and go.
  const shutdown = () => {
    server.closeAllConnections();
    server.close(() => {
      dropPidFile();
      process.exit(0);
    });
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
  // Every deck but the user's dies with its starter (L1, L2).
  if (leash) {
    console.error(`[deck] leashed to pid ${leash.pid} and ${leash.paths.join(', ')}`);
    holdLeash(leash, (why) => {
      console.error(`[deck] leash broke: ${why}; closing`);
      shutdown();
    });
  } else {
    holdUsersDeckIdle(server, () => {
      console.error('[deck] idle for 10 minutes: no session, no landing, no request; closing');
      shutdown();
    });
  }
  // Last, once `shutdown` exists: a crash closes the deck the way a signal does, and exits 1 (L1).
  exitOnCrash(shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[deck] failed to start:', err);
    process.exit(1);
  });
}
