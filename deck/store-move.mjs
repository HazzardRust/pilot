/**
 * `pilot store export` (portable-store S4; spec 4, 9, 12; L4, L7, A2): one bundle of the portable part of this
 * machine's store, read from the files as they are on disk with no daemon, and a list of the work it cannot carry:
 * an open run's worktree here with uncommitted changes or commits on no remote, and a landing in flight. The list
 * never refuses the export (A2). The exported mark is `exported.json`, machine-only, so this never writes
 * `deck.json` (L7).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { atomicWriteFileSync } from '../hooks/lib/atomic-write.js';
import { hostPlatform, pathKey } from '../hooks/lib/platform.js';
import { emptyMachine, readMachine, rootsOf, writeMachine } from './machine.mjs';
import { ROOT_NAME, packBundle, storeEntries, unpackBundle } from './store-bundle.mjs';
import { defaultRoots, fromStored } from './store-codec.mjs';
import { refuseGateHomeWrite, storeDir } from './store-dir.mjs';
import { IN_FLIGHT, markGone, openWorktrees, printable, rebuildLines } from './store-gone.mjs';
import { localDay, setAside } from './store-recovery.mjs';

const USAGE = 'usage: pilot store export [<file>] [--logs]';

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

/** One line per open worktree here, once each by `pathKey`, holding work no remote has (spec 9), or saying git could not tell. */
function unpushedLines(deck, git) {
  const here = new Map();
  for (const { worktree } of openWorktrees(deck)) if (!here.has(pathKey(worktree)) && fs.existsSync(worktree)) here.set(pathKey(worktree), worktree);
  const lines = [];
  for (const worktree of here.values()) {
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

const IMPORT_USAGE = 'usage: pilot store import <bundle> [--root <name>=<path>]... [--replace] [--dry-run]';

/** The most a bundle may weigh or open to (L4): far above a real store (its deck.json is about 6 MB), far below a string's limit. */
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;

const flavour = (platform) => (platform === 'win32' ? path.win32 : path.posix);

/** The flags of `argv`: the bundle, each `--root <name>=<path>` (absolute here, resolved), `--replace`, `--dry-run`. Throws the usage. */
function parseImportArgs(argv, P) {
  const parsed = { file: undefined, given: {}, replace: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--replace') parsed.replace = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--root' || arg.startsWith('--root=')) {
      const spec = arg === '--root' ? argv[(i += 1)] : arg.slice('--root='.length);
      const [, name, dir] = /^([^=]*)=(.+)$/s.exec(spec ?? '') ?? [];
      if (!ROOT_NAME.test(name ?? '') || !P.isAbsolute(dir)) throw new Error(`--root takes <name>=<absolute path>, not ${JSON.stringify(spec)}; ${IMPORT_USAGE}`);
      if (Object.hasOwn(parsed.given, name)) throw new Error(`--root ${name} is given twice; ${IMPORT_USAGE}`);
      parsed.given[name] = P.resolve(dir);
    } else if (arg.startsWith('-') || parsed.file !== undefined) throw new Error(IMPORT_USAGE);
    else parsed.file = arg;
  }
  if (parsed.file === undefined) throw new Error(IMPORT_USAGE);
  return parsed;
}

/**
 * Each root the bundle uses mapped to a directory here (spec 5, L3): a given `--root` first, then `home` to this
 * home, `/` to itself, a drive to the same drive when this machine has it. Throws naming every root left to give.
 */
function mappedRoots(used, given, { home, platform, hasDrive }) {
  const roots = { ...defaultRoots(home, platform), ...given };
  const missing = [];
  for (const name of used) {
    const drive = /^drive-([a-z])$/.exec(name);
    if (Object.hasOwn(roots, name)) continue;
    if (platform === 'win32' && drive && hasDrive(drive[1])) roots[name] = `${drive[1].toUpperCase()}:\\`;
    else missing.push(name);
  }
  if (missing.length > 0) throw new Error(`this machine has no root ${missing.join(', ')}; name each with ${missing.map((name) => `--root ${name}=<path>`).join(' ')}`);
  return roots;
}

/**
 * `deck.json` and each month archive read as the deck will read them against `roots`, so one the deck could not load
 * (a stored path off its root, two map keys that read as one path) is refused before the store it would replace is
 * set aside (L5).
 */
function checkDecoded(entries, roots) {
  for (const [name, bytes] of entries) {
    if (name !== 'deck.json' && !name.startsWith('deck.archive-')) continue;
    try {
      fromStored(JSON.parse(bytes.toString('utf8')), emptyMachine(), roots);
    } catch (error) {
      throw new Error(`load: ${name} would not load here (${error.message})`);
    }
  }
}

/** A new `replaced-<day>[-n]/` in `dir`, never one that exists, and the store's portable files moved into it (L5). */
function setStoreAside(dir, names, at) {
  let aside;
  for (let n = 1; aside === undefined; n += 1) {
    const candidate = path.join(dir, `replaced-${localDay(at)}${n === 1 ? '' : `-${n}`}`);
    try {
      fs.mkdirSync(candidate);
      aside = candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  for (const name of names) {
    const to = path.join(aside, ...name.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(path.join(dir, ...name.split('/')), to);
  }
  return aside;
}

/** Everything an import decides before it writes (L5): every check run, nothing written. Throws naming the one that failed. */
function importPlan(argv, { storePid, home, platform, hasDrive, maxBytes }) {
  const P = flavour(platform);
  const parsed = parseImportArgs(argv, P);
  let pid;
  try {
    pid = storePid();
  } catch (error) {
    throw new Error(`cannot tell whether a deck daemon serves this store (${error.message})`);
  }
  if (pid === undefined) throw new Error('cannot tell whether a deck daemon serves this store');
  if (pid !== null) throw new Error(`deck daemon ${pid} serves this store; stop it first, then import`);
  const file = path.resolve(parsed.file);
  const size = fs.statSync(file).size;
  if (size > maxBytes) throw new Error(`size: ${file} is ${size} bytes, over the bound of ${maxBytes}`);
  const bundle = unpackBundle(fs.readFileSync(file), { maxBytes });
  const roots = mappedRoots(bundle.roots, parsed.given, { home, platform, hasDrive });
  checkDecoded(bundle.entries, roots);
  const dir = storeDir();
  const existing = fs.existsSync(dir) ? storeEntries(dir) : [];
  if (existing.length > 0 && !parsed.replace) {
    throw new Error(`${dir} already holds a store (${existing.length} files); import over it with --replace, which sets them aside under replaced-<date>/`);
  }
  refuseGateHomeWrite(path.join(dir, 'deck.json'));
  return { ...parsed, file, dir, bundle, roots, existing };
}

/**
 * `pilot store import <bundle> [--root <name>=<path>]... [--replace] [--dry-run]` (spec 5, 12; L3, L5): the bundle's
 * entries into this machine's store and a fresh `machine.json` holding the given roots. Every check runs before the
 * first write (`importPlan`); the entries are staged in a directory of this process's own inside the store dir, then
 * renamed into place, `deck.json` last. Refused while a deck serves (`storePid()`, which the caller resolves first:
 * null for none) and over a store with portable files unless `--replace` moves them under `replaced-<date>/`.
 * `--dry-run` prints the entries and roots and writes nothing. Exit 0 imported (or dry run), 1 refused or failed.
 */
export function importStore(argv, deps = {}) {
  const { storePid = () => undefined, home = os.homedir(), platform = hostPlatform(), now = () => new Date(), out = console.log, err = console.error } = deps;
  const { hasDrive = (letter) => fs.existsSync(`${letter.toUpperCase()}:\\`), maxBytes = MAX_BUNDLE_BYTES } = deps;
  let plan;
  try {
    plan = importPlan(argv, { storePid, home, platform, hasDrive, maxBytes });
  } catch (error) {
    // A parse error quotes the bundle's own bytes: none of its control characters reach the terminal.
    err(`pilot store import: ${printable(error.message)}; nothing written`);
    return 1;
  }
  const { file, dir, bundle, roots, existing, given } = plan;
  const rootLines = bundle.roots.map((name) => `root ${name} = ${roots[name]}`);
  if (plan.dryRun) {
    out(`dry run: pilot store import ${file} would write into ${dir}`);
    for (const [name, bytes] of bundle.entries) out(`entry ${name} ${bytes.length} bytes`);
    for (const line of rootLines) out(line);
    if (existing.length > 0) out(`would set aside ${existing.length} files under replaced-${localDay(now())}/`);
    out('dry run: 0 files written');
    return 0;
  }

  // Nothing of the old machine is waited on here (S6, spec 8): its landings in flight read interrupted.
  const gone = markGone(JSON.parse(bundle.entries.get('deck.json').toString('utf8')), bundle.manifest.host ?? 'the old machine', now().toISOString());
  bundle.entries.set('deck.json', Buffer.from(`${JSON.stringify(gone, null, 2)}\n`, 'utf8'));
  const staging = path.join(dir, `.import-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(staging);
    for (const [name, bytes] of bundle.entries) {
      const to = path.join(staging, ...name.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, bytes, { flag: 'wx' });
    }
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    err(`pilot store import: the bundle could not be staged (${error.message}); nothing imported`);
    return 1;
  }

  let aside;
  try {
    const machineFile = path.join(dir, 'machine.json');
    const hasMachine = fs.existsSync(machineFile);
    if (existing.length > 0) aside = setStoreAside(dir, [...existing, ...(hasMachine ? ['machine.json'] : [])], now());
    else if (hasMachine) setAside(machineFile, 'replaced');
    const names = [...bundle.entries.keys()].sort((a, b) => (a === 'deck.json') - (b === 'deck.json'));
    for (const name of names) {
      if (name === 'deck.json') writeMachine(dir, { ...emptyMachine(), roots: given });
      const to = path.join(dir, ...name.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(path.join(staging, ...name.split('/')), to);
    }
    fs.rmSync(staging, { recursive: true, force: true });
  } catch (error) {
    err(`pilot store import: failed part way (${error.message}); the bundle is staged in ${staging}${aside ? `, the store it replaced kept in ${aside}` : ''}`);
    return 1;
  }

  const deck = JSON.parse(bundle.entries.get('deck.json').toString('utf8'));
  const archives = [...bundle.entries.keys()].filter((name) => name.startsWith('deck.archive-')).length;
  out(`imported ${file} into ${dir}: ${deck.items.length} items, ${Array.isArray(deck.records) ? deck.records.length : 0} records, ${archives} month archives`);
  for (const line of rootLines) out(line);
  if (aside) out(`the store it replaced is kept in ${aside}`);
  // Printed, never run (spec 11): each open run's worktree this machine lacks.
  for (const line of rebuildLines(fromStored(deck, emptyMachine(), roots), fs.existsSync)) out(`rebuild: ${line}`);
  return 0;
}
