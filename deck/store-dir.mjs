/**
 * Where the deck keeps its files, in a module of its own so a process that must never load the
 * item store (the stdio client, L3) can still find its logs and the logging switch (ADR 0094).
 */

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
