/**
 * Where the deck keeps its files, in a module of its own so a process that must never load the
 * item store (the stdio client, L3) can still find its logs and the logging switch (ADR 0094).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deckDir } from '../hooks/lib/deck-secret.js';

/** Where the deck keeps its state when nothing overrides it (L5). */
export function defaultStoreDir() {
  return path.join(os.homedir(), '.claude', 'pilot');
}

/**
 * The directory in use. `PILOT_DECK_DIR` overrides it, which is how the tests isolate. The rule
 * is the deck secret's `deckDir()`, so a CommonJS hook and the daemon find one dir (deck-token L6).
 */
export function storeDir() {
  return deckDir();
}

/** `file` resolved, lower-cased on Windows, whose paths ignore case. */
const comparable = (file) => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));

/**
 * `file`, unless the gate named it as the home store (home-store-guard spec 1; L1, L4): the gate's
 * `PILOT_GATE_HOME_STORE` carries the path, so the writer never guesses the home dir. A write to it is
 * logged to `PILOT_GATE_HOME_LOG` as `<pid>\t<argv>\t<file>` for the gate to name, then refused.
 */
export function refuseGateHomeWrite(file) {
  const guarded = process.env.PILOT_GATE_HOME_STORE;
  if (!guarded || comparable(file) !== comparable(guarded)) return file;
  const log = process.env.PILOT_GATE_HOME_LOG;
  // A log that cannot be written throws its own error: the write is still refused.
  // Line breaks and tabs in argv become spaces, so one write is one line with three fields.
  if (log) fs.appendFileSync(log, `${process.pid}\t${process.argv.join(' ').replace(/[\r\n\t]/g, ' ')}\t${file}\n`);
  throw new Error(`home store write refused under the gate: ${file}`);
}
