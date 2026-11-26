#!/usr/bin/env node
/**
 * Times `GET /api/view?screen=archive` three times against a store directory (archive-page spec 9).
 *
 *   node scripts/archive-timing.mjs <store dir>
 *
 * Prints `archive <bytes> B in <ms> ms` three times; exits 1 when any run takes 2000 ms or more. The directory must
 * be a copy: the view's chrome reads through `readDeck`, which may upgrade or recover the store (L10), so this
 * refuses the live `~/.claude/pilot` (ADR 0194's home-store guard).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LIMIT_MS = 2000;
const RUNS = 3;

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/archive-timing.mjs <copy of the store dir>');
  process.exit(2);
}
const dir = path.resolve(arg);
if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`archive-timing: ${dir} is not a directory`);
  process.exit(2);
}
const home = path.resolve(os.homedir(), '.claude', 'pilot');
if (fs.existsSync(home) && fs.realpathSync(dir).toLowerCase() === fs.realpathSync(home).toLowerCase()) {
  console.error('archive-timing: refusing the live store; time a copy of it');
  process.exit(2);
}

// The store reads its directory once, at first use, so it is set before the deck is loaded.
process.env.PILOT_DECK_DIR = dir;
const { createDeckHttpServer } = await import('../deck/server.mjs');

const server = createDeckHttpServer({ secret: null });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let slow = false;
try {
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    const response = await fetch(`${base}/api/view?screen=archive`);
    const body = await response.arrayBuffer();
    const ms = Math.round(performance.now() - started);
    if (!response.ok) throw new Error(`GET /api/view?screen=archive answered ${response.status}`);
    console.log(`archive ${body.byteLength} B in ${ms} ms`);
    if (ms >= LIMIT_MS) slow = true;
  }
} finally {
  server.closeAllConnections();
  server.close();
}
process.exit(slow ? 1 : 0);
