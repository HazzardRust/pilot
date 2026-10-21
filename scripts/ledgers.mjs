/**
 * The gate's ledger seam (main-never-red spec 1; L1, L2): rebuilds the two generated ledgers
 * under `root` from their sources and names the ones whose bytes changed, so a stale ledger
 * fails the gate naming the file it rewrote rather than a pin deep in the suite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { rulesLedgerText, RULES_LEDGER_FILE } from './build-rules-ledger.mjs';
import { buildLedger, LEDGER_FILE } from './build-vendor-ledger.mjs';

const BUILDERS = [
  [RULES_LEDGER_FILE, rulesLedgerText],
  [LEDGER_FILE, buildLedger],
];

/** Writes each ledger under `root` and returns the repo-relative paths whose bytes changed, [] when all were current. */
export function rebuildLedgers(root) {
  const wanted = BUILDERS.map(([rel, build]) => [rel, build(root)]);
  const stale = [];
  for (const [rel, text] of wanted) {
    const file = path.join(root, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
    if (current === text) continue;
    fs.writeFileSync(file, text);
    stale.push(rel);
  }
  return stale;
}
