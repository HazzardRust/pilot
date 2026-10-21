#!/usr/bin/env node
/**
 * Removes what an older version of this package left outside the plugin, so an
 * install over it leaves none behind (ADR 0078).
 *
 * Today that is one thing: the gateguard's state, `state-*.json` files directly
 * under `<home>/.gateguard`. Only those plain files go, then the directory if that
 * left it empty. Anything else there is kept and named, a link is never followed,
 * and nothing is deleted recursively: the directory name is generic enough that
 * something else may have put a file in it.
 *
 * Usage:
 *   node install-leftovers.mjs [--home <dir>]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STATE_FILE = /^state-.*\.json$/;

export function removeLeftovers({ home = os.homedir() } = {}) {
  const dir = path.join(home, '.gateguard');
  const removed = [];
  const kept = [];
  const notes = [];
  let failed = 0;

  let stat;
  try {
    stat = fs.lstatSync(dir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    notes.push(`nothing to remove: ${dir} does not exist`);
    return { removed, kept, notes, failed };
  }
  if (!stat.isDirectory()) {
    kept.push(dir);
    notes.push(`kept ${dir}: a link or a file, not followed`);
    return { removed, kept, notes, failed };
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (!entry.isFile() || !STATE_FILE.test(entry.name)) {
      kept.push(file);
      notes.push(`kept ${file}: not gateguard state`);
      continue;
    }
    try {
      fs.unlinkSync(file);
      removed.push(file);
      notes.push(`removed ${file}`);
    } catch (err) {
      kept.push(file);
      failed++;
      notes.push(`kept ${file}: could not delete it (${err.code ?? err.message})`);
    }
  }

  if (kept.length === 0) {
    try {
      fs.rmdirSync(dir);
      removed.push(dir);
      notes.push(`removed ${dir}`);
    } catch (err) {
      kept.push(dir);
      failed++;
      notes.push(`kept ${dir}: could not delete it (${err.code ?? err.message})`);
    }
  }
  return { removed, kept, notes, failed };
}

const USAGE = 'Usage: node install-leftovers.mjs [--home <dir>]';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--home' && argv[i + 1] !== undefined) options.home = argv[++i];
    else throw new Error(`Unknown or incomplete argument ${flag}.\n${USAGE}`);
  }
  return options;
}

function main(argv) {
  let report;
  try {
    report = removeLeftovers(parseArgs(argv));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  for (const note of report.notes) console.log(note);
  // A file kept because it is not ours exits 0; one we failed to delete does not.
  if (report.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2));
}
