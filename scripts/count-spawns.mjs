/**
 * The gate's spawn counter (process-gc spec 6; S9, L10). Loaded into every node of the suite by
 * `NODE_OPTIONS=--import=<this file>`, it appends `<parent pid> <file> <owner>\n` to the file named by
 * `PILOT_GATE_SPAWNS` for each process this node starts, and does nothing when that is unset.
 * `<owner>` (suite-at-landing S12) is the repo-relative test file whose process, or a node ancestor
 * of it, made the spawn: the first node whose argv[1] is a test file sets `PILOT_GATE_OWNER`, and
 * its children inherit it; `-` when none has.
 * Async spawns publish on the `child_process` diagnostics channel; sync spawns (spawnSync,
 * execFileSync, execSync) publish nothing, so they are counted at the native `spawn_sync`
 * binding they all pass through. Neither path patches the `child_process` module.
 */

import dc from 'node:diagnostics_channel';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Loaded guarded: this file preloads into every node of the suite, which a broken selector must not stop.
let TEST_GLOB;
try {
  ({ TEST_GLOB } = await import('./select-tests.mjs'));
} catch {
  // No glob, no owners: every line reads as `-`.
}
/** Whether `token` is an owner: `-`, or a repo-relative test file (one with no space in its path). */
const isOwner = (token) => token === '-' || (TEST_GLOB !== undefined && !token.startsWith('../') && path.posix.matchesGlob(token, TEST_GLOB));

/**
 * `{ total, node, git, other, owners }` from a spawn file's lines; `node` is any node binary, `git` any
 * git, and `owners` counts each owner's lines. A file may hold spaces, so the owner is the last field
 * only when it reads as one; a two-field line is `-`'s.
 */
export function spawnCount(file) {
  const count = { total: 0, node: 0, git: 0, other: 0, owners: new Map() };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const rest = line.slice(line.indexOf(' ') + 1);
    const cut = rest.lastIndexOf(' ');
    const owned = cut > 0 && isOwner(rest.slice(cut + 1));
    const owner = owned ? rest.slice(cut + 1) : '-';
    const name = path.win32.basename(owned ? rest.slice(0, cut) : rest).toLowerCase().replace(/\.exe$/, '');
    count.total++;
    count[name === 'node' || name === 'git' ? name : 'other']++;
    count.owners.set(owner, (count.owners.get(owner) ?? 0) + 1);
  }
  return count;
}

// Held now, so a test that mocks `fs.writeFileSync` (which `appendFileSync` calls) cannot reach the count.
const { openSync, writeSync, closeSync } = fs;
/**
 * Never throws: a counter must not change what it counts. A process that outlives its gate finds
 * the file gone, and its spawns belong to no gate.
 */
const record = (file) => {
  const spawns = process.env.PILOT_GATE_SPAWNS;
  if (!spawns) return;
  try {
    const fd = openSync(spawns, 'a');
    try {
      writeSync(fd, `${process.pid} ${file} ${process.env.PILOT_GATE_OWNER || '-'}\n`);
    } finally {
      closeSync(fd);
    }
  } catch {
    // The gate that set PILOT_GATE_SPAWNS has ended, or its file cannot be written.
  }
};

const INSTALLED = Symbol.for('pilot.countSpawns');
if (!globalThis[INSTALLED]) {
  globalThis[INSTALLED] = true;
  try {
    if (process.env.PILOT_GATE_SPAWNS && !process.env.PILOT_GATE_OWNER && process.argv[1]) {
      const rel = path.relative(ROOT, path.resolve(process.argv[1])).replaceAll('\\', '/');
      if (isOwner(rel)) process.env.PILOT_GATE_OWNER = rel;
    }
  } catch {
    // An owner is a label: without one this node's spawns read as `-`, and are counted all the same.
  }
  // The channel fires before `spawnfile` is set, so the name is read a microtask later.
  dc.subscribe('child_process', ({ process: child }) => queueMicrotask(() => record(child.spawnfile)));
  // DEP0111 is documentation-only; this binding is the one sync spawns go through.
  const binding = process.binding('spawn_sync');
  const spawn = binding.spawn;
  binding.spawn = function countedSpawn(options) {
    record(options.file);
    return spawn.apply(this, arguments);
  };
}
