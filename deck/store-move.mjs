/**
 * `pilot store export` (portable-store S4; spec 4, 9, 12; L4, L7, A2): one bundle of the portable part of this
 * machine's store, read from the files as they are on disk with no daemon, and a list of the work it cannot carry:
 * an open run's worktree here with uncommitted changes or commits on no remote, and a landing in flight. The list
 * never refuses the export (A2). The exported mark is `exported.json`, machine-only, so this never writes
 * `deck.json` (L7).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { atomicWriteFileSync } from '../hooks/lib/atomic-write.js';
import { hostPlatform, pathKey } from '../hooks/lib/platform.js';
import { readMachine, rootsOf } from './machine.mjs';
import { packBundle } from './store-bundle.mjs';
import { fromStored } from './store-codec.mjs';
import { refuseGateHomeWrite, storeDir } from './store-dir.mjs';
import { localDay } from './store-recovery.mjs';

const USAGE = 'usage: pilot store export [<file>] [--logs]';
const IN_FLIGHT = new Set(['running', 'queued']);

/** The flags of `argv`: the bundle file (or undefined for the default name) and `--logs`. Throws the usage. */
function parseArgs(argv) {
  let file;
  let logs = false;
  for (const arg of argv) {
    if (arg === '--logs') logs = true;
    else if (arg.startsWith('-') || file !== undefined) throw new Error(USAGE);
    else file = arg;
  }
  return { file, logs };
}

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const worktreesOf = (row) => [row?.worktree, row?.qa?.worktree, ...(Array.isArray(row?.slices) ? row.slices.map((slice) => slice?.worktree) : [])];

/**
 * Every worktree an open run names (spec 9): a run row's, and an unfinished record's, its feature worktree, QA's and
 * each slice's, absolute and existing here, once each by `pathKey`.
 */
function openWorktrees(deck) {
  const rows = [...(Array.isArray(deck.runs) ? deck.runs : []), ...(Array.isArray(deck.records) ? deck.records.map((entry) => entry?.record) : [])];
  const seen = new Map();
  for (const row of rows) {
    if (!isMap(row) || row.finished !== undefined) continue;
    for (const worktree of worktreesOf(row)) {
      if (typeof worktree !== 'string' || !path.isAbsolute(worktree) || !fs.existsSync(worktree)) continue;
      if (!seen.has(pathKey(worktree))) seen.set(pathKey(worktree), worktree);
    }
  }
  return [...seen.values()];
}

/** One line per open worktree holding work no remote has (spec 9), or saying git could not tell. */
function unpushedLines(deck, git) {
  const lines = [];
  for (const worktree of openWorktrees(deck)) {
    const status = git(['status', '--porcelain'], worktree);
    const ahead = git(['rev-list', '--count', 'HEAD', '--not', '--remotes'], worktree);
    if (status.status !== 0 || ahead.status !== 0) {
      lines.push(`${worktree}: cannot tell (${(status.status !== 0 ? status : ahead).stderr.trim().split('\n')[0]})`);
      continue;
    }
    const changed = status.stdout.split('\n').filter(Boolean).length;
    const commits = Number(ahead.stdout.trim());
    const parts = [...(commits > 0 ? [`${commits} commit(s) on no remote`] : []), ...(changed > 0 ? [`${changed} uncommitted change(s)`] : [])];
    if (parts.length > 0) lines.push(`${worktree}: ${parts.join(', ')}`);
  }
  for (const item of Array.isArray(deck.items) ? deck.items : []) {
    if (IN_FLIGHT.has(item?.landing?.state)) lines.push(`landing ${item.landing.state}: ${item.id} in ${item.repo}`);
  }
  return lines;
}

/** The store's `deck.json` as memory holds it, stored paths decoded against this machine's roots. */
function decodedDeck(dir) {
  const machine = readMachine(dir);
  return fromStored(JSON.parse(fs.readFileSync(path.join(dir, 'deck.json'), 'utf8')), machine, rootsOf(machine, os.homedir(), hostPlatform()));
}

/**
 * `pilot store export [<file>] [--logs]`: the bundle written to `<file>`, by default
 * `pilot-store-<host>-<yyyy-mm-dd>.pilotstore` in the cwd, then `exported.json` beside the store; then each piece of
 * work not on a remote and their count. Exit 0 once the bundle is written, whatever the list says (A2); 1 on bad
 * arguments or a store that cannot be bundled, writing nothing. `git(args, cwd)` is the caller's runner, returning
 * `{ status, stdout, stderr }`: a store module starts no process itself (deck/test/create.test.mjs, ADR 0039).
 */
export function exportStore(argv, { git, now = () => new Date(), host = os.hostname(), out = console.log, err = console.error } = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    err(`pilot store export: ${error.message}`);
    return 1;
  }
  const dir = storeDir();
  const at = now();
  const file = path.resolve(parsed.file ?? `pilot-store-${host.replace(/[^A-Za-z0-9.-]/g, '-')}-${localDay(at)}.pilotstore`);
  let bundle;
  try {
    // A bundle written into the store dir could land on a store file (`deck.json`, `machine.json`).
    // Keyed by the parent, which exists for any file that can be written, so its realpath (macOS /private/var) is read.
    const parent = pathKey(path.dirname(file));
    if (parent === pathKey(dir) || parent.startsWith(pathKey(dir) + path.sep)) throw new Error(`${file} is inside the store directory ${dir}; write the bundle elsewhere`);
    // The gate names the home store by its deck.json; the mark beside it is that store's too (as the machine file).
    refuseGateHomeWrite(path.join(dir, 'deck.json'));
    bundle = packBundle(dir, { logs: parsed.logs, host, now: at });
    atomicWriteFileSync(file, bundle.bytes);
  } catch (error) {
    err(`pilot store export: ${error.message}; nothing written`);
    return 1;
  }
  try {
    atomicWriteFileSync(path.join(dir, 'exported.json'), `${JSON.stringify({ at: at.toISOString(), file }, null, 2)}\n`);
  } catch (error) {
    err(`pilot store export: ${file} is written, but the exported mark is not (${error.message})`);
    return 1;
  }

  const { counts } = bundle.manifest;
  out(`exported ${file}: ${bundle.bytes.length} bytes, ${counts.items} items, ${counts.records} records, ${counts.archives} month archives`);
  let lines;
  try {
    lines = unpushedLines(decodedDeck(dir), git);
  } catch (error) {
    out(`work not on a remote: cannot tell (${error.message})`);
    return 0;
  }
  for (const line of lines) out(`not on a remote: ${line}`);
  out(`work not on a remote: ${lines.length}`);
  return 0;
}
