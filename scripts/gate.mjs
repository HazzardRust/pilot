/**
 * The pilot's own gate (process-gc spec 5, 7; L7, L8): `npm test`, `npm run test:quiet` and
 * `npm run coverage` run `node scripts/gate.mjs <flags>`. It takes a gate slot (a full run only; a `--since` selection takes none but names one), then runs
 * `node --test` no wider than `MAX_CONCURRENCY` files at once, each child's heap capped at
 * `CHILD_HEAP_MB`, with the caller's flags after the caps; it frees the slot red or green and
 * exits with the suite's status. The suite inherits `PILOT_GATE_SLOT`, so a test that starts
 * another gate takes no second slot. Around the suite it takes a census (spec 3; L9, L16): a
 * pilot-owned process from this checkout that the suite started and left running makes it red.
 * It counts every process the suite starts, grandchildren included (spec 6; L10, L16), prints
 * `spawns <total> (node <n>, git <g>, other <o>)`, and is red above `SPAWN_CEILING`. Before
 * all of that it rebuilds the ledgers (main-never-red spec 1) and is red, the suite unrun, on a stale one.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnCount } from './count-spawns.mjs';
import { hostPlatform } from '../hooks/lib/platform.js';
import { deckPidNow, stopper } from '../deck/gc.mjs';
import { isClaude, pilotProcesses, processTable } from '../deck/procs.mjs';
import { takeSlot } from './gate-slots.mjs';
import { rebuildLedgers } from './ledgers.mjs';
import { TEST_GLOB, scopeLine, selectTests } from './select-tests.mjs';

export const MAX_CONCURRENCY = 4;
export const CHILD_HEAP_MB = 512;
/** How long the census waits for a leftover to end by itself, and again after the gate stops it. */
const GRACE_MS = 10_000;
const POLL_MS = 1_000;
/**
 * The most processes a full suite may start: the measured total plus 10% (L16). A PR that
 * legitimately adds spawns raises it with a dated comment.
 * 2026-10-13, S9: 12315 spawns (node 228, git 11406, other 681) on Windows, Node 26.1.
 * 2026-10-13, fix round: 12317 (node 665, git 11477, other 175), async spawns now named; ceiling kept.
 * 2026-10-16, git-light-tests S6: 8959 (node 674, git 8113, other 172), the larger of two runs; builders run once per key.
 * 2026-10-18, lander S6: 9912 (node 715, git 9014, other 183) on Windows; the lander feature's fixture tests.
 * 2026-10-19, suite-at-landing S10: 10922 (node 732, git 9985, other 205) on Windows; the replay test's fixture merges.
 * 2026-10-19, suite-at-landing fix round: 10995 (node 732, git 10055, other 208) on Windows; about 10% headroom restored.
 */
export const SPAWN_CEILING = 12100;
/** The preload every node of the suite loads, so a grandchild's spawns count too. */
const COUNTER = pathToFileURL(fileURLToPath(new URL('./count-spawns.mjs', import.meta.url))).href;

/** The checkout this gate belongs to. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `text` with each glob metacharacter in a one-character class; `!` is special only before `(`, which is closed off. */
function escapeGlob(text) {
  return text.replace(/[[\]{}*?()]/g, '[$&]');
}

/**
 * The `node` argv: the caps first, then the caller's flags, then the files as absolute paths
 * under `root` (the caller's, or every test file). A flag's value goes in its `=` form.
 */
export function gateArgv(args, cores, root) {
  const width = Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(cores / 2)));
  const flags = args.filter((arg) => arg.startsWith('-'));
  const files = args.filter((arg) => !arg.startsWith('-')).map((file) => path.resolve(root, file));
  // `TEST_GLOB` made absolute, so the tree names its checkout (process-gc S3's seam).
  if (files.length === 0) files.push(path.join(escapeGlob(root), TEST_GLOB));
  return ['--test', '--test-timeout=60000', `--test-concurrency=${width}`, ...flags, ...files];
}

/**
 * `env` with every inherited heap cap in `NODE_OPTIONS` replaced by ours, and the slot held named
 * for the suite (none when `slot` is undefined); given `spawns`, the counter preloaded and writing there.
 */
export function gateEnv(env, slot, spawns) {
  const cap = `--max-old-space-size=${CHILD_HEAP_MB}`;
  const options = [];
  const inherited = (env.NODE_OPTIONS ?? '').split(/\s+/).filter(Boolean);
  for (let i = 0; i < inherited.length; i++) {
    if (inherited[i] === '--max-old-space-size') i++;
    else if (!inherited[i].startsWith('--max-old-space-size=')) options.push(inherited[i]);
  }
  options.push(cap);
  const named = slot === undefined ? {} : { PILOT_GATE_SLOT: String(slot) };
  if (spawns === undefined) return { ...env, NODE_OPTIONS: options.join(' '), ...named };
  options.push(`--import=${COUNTER}`);
  return { ...env, NODE_OPTIONS: options.join(' '), ...named, PILOT_GATE_SPAWNS: spawns };
}

/** `text` with forward slashes and no trailing one, lower-cased on Windows, whose paths ignore case. */
function comparable(text, platform) {
  const slashed = text.replaceAll('\\', '/').replace(/\/+$/, '');
  return platform === 'win32' ? slashed.toLowerCase() : slashed;
}

/** Whether `command` names a path under `cwd`: the checkout's path starts a word and a separator follows it. */
function namesPathUnder(command, cwd, platform) {
  const text = comparable(command, platform);
  const root = `${comparable(cwd, platform)}/`;
  for (let at = text.indexOf(root); at !== -1; at = text.indexOf(root, at + 1)) {
    if (at === 0 || /[\s"'=]/.test(text[at - 1])) return true;
  }
  return false;
}

/** The pilot-owned processes under `cwd` in `after` and not in `before`, by pid and command, so a reused pid is new. */
export function leftovers(before, after, cwd, platform = hostPlatform()) {
  const was = new Set(before.map((p) => `${p.pid} ${p.command}`));
  return after.filter((p) => !was.has(`${p.pid} ${p.command}`) && namesPathUnder(p.command, cwd, platform));
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const firstLine = (err) => String(err?.message ?? err).split('\n')[0];
const named = (row) => `${row.pid} ${row.kind} ${row.command}`;

/**
 * Whether a live `claude` session above `row` reaches it other than through the gate (`self`): a
 * process that session started beside the suite, such as its `pilot wait` or a second gate here.
 * A suite process reaches the gate, or its chain breaks where a test that spawned it has exited.
 */
function besideGate(table, row, self) {
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const seen = new Set([row.pid]);
  for (let up = byPid.get(row.ppid); up && !seen.has(up.pid); up = byPid.get(up.ppid)) {
    if (up.pid === self) return false;
    if (isClaude(up)) return true;
    seen.add(up.pid);
  }
  return false;
}

/**
 * After the suite (L16): polls every second through the grace until no leftover is alive, stops
 * what still is with gc's kill (L11), a test root by its tree, and polls through a second grace;
 * red only for a survivor. The user's deck, and what a session started beside the gate, are
 * neither stopped nor named. The last line is
 * `left running: none`, or there is one `left running: <pid> <kind> <command>` per survivor.
 */
export function census(before, { cwd, read = processTable, kill = stopper, deckPid = deckPidNow, self = process.pid, graceMs = GRACE_MS, pollMs = POLL_MS, sleep = pause, now = Date.now }) {
  const watch = (base) => {
    for (const end = now() + graceMs; ; sleep(pollMs)) {
      const table = read();
      const left = leftovers(base, pilotProcesses(table, {}), cwd).filter((row) => !besideGate(table, row, self));
      if (left.length === 0 || now() >= end) return { table, left };
    }
  };
  const first = watch(before);
  const deck = first.left.length ? deckPid() : undefined;
  const lines = [];
  const stop = kill(first.table);
  for (const row of first.left.filter((r) => r.pid !== deck)) {
    try {
      // An unanswered probe cannot tell a leashless daemon from the user's deck: named, never stopped.
      if (deck === undefined && row.kind === 'daemon' && !/\s--leash\s/.test(` ${row.command} `)) {
        lines.push(`not stopped ${row.pid}: cannot tell it from the user's deck`);
        continue;
      }
      stop(row.pid, row.kind === 'test');
      lines.push(`stopped ${named(row)}`);
    } catch (err) {
      lines.push(`could not stop ${row.pid}: ${firstLine(err)}`);
    }
  }
  const survivors = lines.length ? watch([...before, ...first.left.filter((r) => r.pid === deck)]).left : [];
  lines.push(...(survivors.length ? survivors.map((row) => `left running: ${named(row)}`) : ['left running: none']));
  return { red: survivors.length > 0, lines };
}

/**
 * The spawn line, and `spawns over <ceiling>; most: <owner> <n>, …` when the count is above it,
 * naming the three test files that spent most (S12); the unowned `-` is the runner's, never named.
 */
function spawnLines(count, ceiling) {
  const lines = [`spawns ${count.total} (node ${count.node}, git ${count.git}, other ${count.other})`];
  if (count.total <= ceiling) return lines;
  const most = [...count.owners]
    .filter(([owner]) => owner !== '-')
    .sort(([a, n], [b, m]) => m - n || (a < b ? -1 : 1))
    .slice(0, 3)
    .map(([owner, n]) => `${owner} ${n}`);
  lines.push(`spawns over ${ceiling}${most.length ? `; most: ${most.join(', ')}` : ''}`);
  return lines;
}

/**
 * Whether the ledgers under `cwd` were current (main-never-red spec 1; L1, L2): `ledgers` rebuilds
 * them and names the stale ones, each printed with the instruction to commit it; a throw is red too.
 */
function ledgersCurrent(ledgers, cwd) {
  let stale;
  try {
    stale = ledgers(cwd);
  } catch (err) {
    process.stderr.write(`ledgers: ${firstLine(err)}\n`);
    return false;
  }
  if (stale.length === 0) process.stdout.write('ledgers current\n');
  for (const rel of stale) process.stderr.write(`ledger stale: ${rel}, rebuilt; commit it\n`);
  return stale.length === 0;
}

/**
 * Rebuilds the ledgers first, red without the suite when one was stale or could not build; then
 * runs the suite, a full run in a gate slot, between two censuses and returns its exit status: 1 when it was
 * killed, could not start, left a process running, or started more than `ceiling` processes; a
 * process table that cannot be read is red. The count goes to `spawns`, or a temporary file.
 * With `--since=<ref>` (suite-at-landing S1; L7) it prints the scope line first and runs only the
 * selection, the flag kept from `node`; an empty selection runs nothing and passes, a null one runs full.
 */
export function runGate(args, { ledgers = () => [], cwd = ROOT, spawn = spawnSync, slot = takeSlot, read = processTable, spawns, ceiling = SPAWN_CEILING, select = selectTests, ...rest } = {}) {
  const sinceArg = args.findLast((arg) => /^--since(=|$)/.test(arg));
  let selection;
  if (sinceArg === '--since') {
    process.stderr.write('gate: --since takes its ref as --since=<ref>\n');
    return 1;
  }
  if (sinceArg !== undefined) {
    selection = select({ cwd, since: sinceArg.slice('--since='.length) });
    process.stdout.write(`${scopeLine(selection)}\n`);
    args = args.filter((arg) => !/^--since(=|$)/.test(arg));
  }
  if (!ledgersCurrent(ledgers, cwd)) return 1;
  if (selection?.files?.length === 0) return 0;
  // `node --test` reads a file argument as a glob, so a metacharacter in the checkout's path is escaped.
  if (selection?.files) args = [...args, ...selection.files.map(escapeGlob)];
  // Only a full run takes a slot (suite-at-landing S4; L9): a selected run is cheap and starts at once,
  // and names `selected` for its suite (R9), so a gate its tests start takes no slot either.
  const held = selection?.files ? { slot: process.env.PILOT_GATE_SLOT || 'selected', release() {} } : slot({ cwd, env: process.env });
  let scratch;
  try {
    if (spawns === undefined) scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gate-spawns-'));
    const file = spawns ?? path.join(scratch, 'spawns.txt');
    fs.writeFileSync(file, '');
    let before;
    try {
      before = pilotProcesses(read(), {});
    } catch (err) {
      before = err;
    }
    const run = spawn(process.execPath, gateArgv(args, os.availableParallelism(), cwd), {
      cwd,
      env: gateEnv(process.env, held.slot, file),
      stdio: 'inherit',
      windowsHide: true,
    });
    if (run.error) process.stderr.write(`gate: node --test did not start: ${run.error.message}\n`);
    let after;
    try {
      if (before instanceof Error) throw before;
      after = census(before, { cwd, read, ...rest });
    } catch (err) {
      after = { red: true, lines: [`left running: cannot tell, the process table did not read (${firstLine(err)})`] };
    }
    const counted = spawnLines(spawnCount(file), ceiling);
    process.stdout.write(`${[...after.lines, ...counted].join('\n')}\n`);
    return after.red || counted.length > 1 ? 1 : (run.status ?? 1);
  } finally {
    held.release();
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Whether this module is the entry point: `{ run: true }`; `{ run: false }` when another file imported it;
 * `{ run: false, error }` when argv[1] is missing or does not resolve, so the gate never passes by not running.
 * Real paths on both sides: a junction or a short path must not skip the run and pass silently.
 */
export function mainGuard(argv1, selfUrl) {
  try {
    if (!argv1) throw new Error('no script path');
    return { run: fs.realpathSync(argv1) === fs.realpathSync(fileURLToPath(selfUrl)) };
  } catch {
    return { run: false, error: `gate: argv[1] (${argv1}) did not resolve, so the gate cannot tell it was run` };
  }
}

/**
 * The first `dependencies` name in `root`'s package.json with no `node_modules/<name>/package.json`
 * under `root`, or undefined when every one is installed (gate-script A1). `optionalDependencies` are
 * skipped, and a `node_modules` above `root` does not count.
 */
export function missingInstall(root) {
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return Object.keys(dependencies).find((name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));
}

const guard = mainGuard(process.argv[1], import.meta.url);
if (guard.error) {
  process.stderr.write(`${guard.error}\n`);
  process.exitCode = 1;
} else if (guard.run && missingInstall(ROOT)) {
  process.stderr.write('node_modules missing: run npm ci\n');
  process.exitCode = 1;
} else if (guard.run) {
  process.exitCode = runGate(process.argv.slice(2), { ledgers: rebuildLedgers });
}
