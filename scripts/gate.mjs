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
 * Given `homeStore` (home-store-guard; the CLI entry passes it), it stats that file before the suite
 * and after the census, and is red naming it when it changed with no live deck up.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syntaxErrors } from './check-syntax.mjs';
import { spawnCount } from './count-spawns.mjs';
import { hostPlatform, onSearchPath } from '../hooks/lib/platform.js';
import { deckPidNow, stopper } from '../deck/gc.mjs';
import { isClaude, pilotProcesses, processTable } from '../deck/procs.mjs';
import { takeSlot } from './gate-slots.mjs';
import { LEGACY_PILOT } from './pilot-branch.mjs';
import { rebuildLedgers } from './ledgers.mjs';
import { RUNE_TARGET_MAX, boundTarget, runeTargetDir, staleRoot } from './rune-target.mjs';
import { FULL_TRIGGERS, TEST_GLOB, scopeLine, selectTests } from './select-tests.mjs';
import { costTable } from './test-cost.mjs';

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
 * 2026-11-19, coverage-cell S1: 12107 (node 788, git 11060, other 259) on Windows; diff-coverage's fixture repo and CLI runs, 19 spawns; base was at 12088.
 * 2026-11-19, audit-f14 S2: 12224 (node 775, git 11188, other 261) on Windows; the base-main and lineage-base fixture repos.
 * 2026-11-20, recut-decision S2: 12141 (node 781, git 11101, other 259) on Windows; the replan fixture's plan commits.
 * 2026-11-20, audit-f14 principles round: 13813 (node 788, git 12749, other 276) on Windows; the whole feature's fixture
 *   tests, this round's landing retry, stacked and unlanded restack fixtures among them.
 * 2026-11-24, cheap-suite S10: 13571 (node 831, git 12472, other 268) on Windows, Node 26, under two other
 *   full suites; the acceptance run in docs/design/cheap-suite/cost-after.txt, ceiling 13571 + 10%.
 * 2026-11-26, land-batching S7: 12815 (node 848, git 11676, other 291) on Windows, Node 26, product cut only (S1-S5, S8, S9);
 *   it missed the 11,000 / 10,000 bars, so both ceilings are this run's own numbers (docs/design/land-batching/cost-after.txt);
 *   S6 was to lower them to the signed ones.
 * 2026-11-25: CI windows-latest on ef9ee6c, the highest runner (local 12815 / 11676): 12823 (node 848, git 11682, other 293).
 * 2026-11-26, land-batching S6: the fixture helpers it owns fold 2 git per seeded origin and its own test adds 32, while
 *   the rest of the fixture git is in test bodies, so the bars are still missed. Its local run, the same machine as S7's,
 *   read 12807 (node 848, git 11668, other 291) (docs/design/land-batching/cost-after.txt), 8 under S7's 12815 / 11676.
 *   CI's windows-latest read S7's tip ef9ee6c at 12823 (node 848, git 11682, other 293), the highest of the runners
 *   (ubuntu and macOS passed under 12815 / 11676); less the same 8 that is 12815 / 11674, and the ceilings are that
 *   highest count (A5: the CI count, itm_470ec6f7a434).
 * 2026-11-26, land-batching S6 on the base 6e1806b (user-pilot-branch, pr-overview landed): their added tests read
 *   13589 (node 850, git 12447, other 292) locally (docs/design/land-batching/cost-after.txt); the ceilings are that
 *   plus the Windows-CI delta above (8 spawns / 6 git), 13597 / 12453: the measured bars (itm_9ac7a84014e9).
 * 2026-11-27, test-body-git S13 (itm_fa71edea84e2): the fixture git folded out of the test bodies. SPAWN_CEILING is the
 *   measured 11083 on the highest runner (CI windows-latest, Gate run 45907856887 on cd15ab4: `spawns 11083 (node 843, git
 *   9947, other 293)`; local 11074 + Windows delta 9; later local runs on S13's tip read 11074, 11074 and 11079, so the count moves by a few between runs);
 *   GIT_CEILING 10000 is the signed bar. No headroom. L7 and spec line 1 of test-body-git moved on that decision (docs/design/test-body-git/cost-after.txt).
 * 2026-11-27, prebuilt-rune: CI windows-latest, Gate run 45953779329 on f5713db: `spawns 11084 (node 845, git 9947, other 292)`;
 *   SPAWN_CEILING re-pinned to that 11084, exact (assumed by the deck's default, itm_8b82a8c0fff2). GIT_CEILING unchanged.
 * 2026-11-27, prebuilt-rune: CI windows-latest, Gate run 45959300810 on c2cb913: `spawns 11085 (node 845, git 9947, other 293)`;
 *   "other" read 292 then 293 on the same code. SPAWN_CEILING re-pinned to 11085, exact (the user's decision, itm_abcdde7d29e5).
 * 2026-11-27, prune-worktrees drift merge on 5c326bd: 14110 (node 853, git 12962, other 295) locally; S1-S4 fixture
 *   tests (worktree-remove, worktrees-tagged, worktrees-landed, integrate-prune); plus the Windows-CI delta 8/6, 14118 / 12968.
 * 2026-11-27, prune-worktrees S5: 14189 (node 853, git 13041, other 295) locally + Windows-CI delta 9/6; temporary,
 *   folded back by the fixture slice. 14198 / 13047.
 * 2026-11-27, prune-worktrees S7 on S5: 14292 (node 853, git 13144, other 295) locally + Windows-CI delta 9/6; temporary, folded back by the fixture slice
 * 2026-11-27, prune-worktrees S8 on S7: spawns 14580 (node 853, git 13432, other 295) locally + Windows-CI delta 9/6; temporary, folded back by the fixture slice
 * 2026-11-27, prune-worktrees S10 on S6 (0061fc1): spawns 14166 (node 853, git 13018, other 295) locally + Windows-CI delta 9/6,
 *   14175 / 13024; temporary, still over the base bars 13597 / 12453, which the user decides.
 * 2026-11-27, prune-worktrees fix round: 14252 (node 853, git 13103, other 296) on the integrate merge with feat 8c4a18d; the four defect tests' fixture git; temporary until S11 (itm_1b18772998c1).
 * 2026-11-27, prune-worktrees drift merge on 71991cb: 11753 (node 843, git 10616, other 294) locally + Windows-CI delta 9/6; temporary until S11 and the final exact pins; worktrees.test.mjs MERGED gains raced and gone (gone last, for its HEAD~1) and the gone test drops --unset-upstream, the fix round's two tests on test-body-git's fixture.
 * 2026-11-27, prune-worktrees S11 (one porcelain parser, one path-equality export): 11753 (node 843, git 10616, other 294) locally, unchanged by the removal; final exact pins, the Windows-CI delta 9/6 and no other headroom: 11762 / 10622 (itm_cc4171bdb60c).
 * 2026-11-27, prune-worktrees drift merge on 74b3604: 11749 (node 845, git 10610, other 294) locally + Windows-CI delta 9/6; the final exact pins (itm_abcdde7d29e5); deck/doctor.mjs takes norm and parseWorktrees from worktree-remove.mjs (QA B2), which keeps it under facades' 800 bar after prebuilt-rune's +17.
 * 2026-11-27, tested-once drift merge on 5336235: CI windows-latest, Gate run 45992689173: spawns 11769 (node 845, git 10627, other 297); S3's select-scope fixture tests on prune-worktrees' exact pins; temporary until tested-once's last slice re-pins.
 */
export const SPAWN_CEILING = 11769;
/** The most git processes a full suite may start (land-batching S7, S6, test-body-git S13, prune-worktrees); see the dated lines above. */
export const GIT_CEILING = 10627;
/** The preload every node of the suite loads, so a grandchild's spawns count too. */
const COUNTER = pathToFileURL(fileURLToPath(new URL('./count-spawns.mjs', import.meta.url))).href;

/** The checkout this gate belongs to. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// URLs, since `node --test` reads a Windows path's drive as a URL scheme.
const QUIET_REPORTER = new URL('./quiet-reporter.mjs', import.meta.url).href;
const COST_REPORTER = new URL('./test-cost.mjs', import.meta.url).href;

/**
 * `args` with the cost reporter writing to `file` (cheap-suite S1; L4): the caller's reporters keep
 * stdout, or the quiet one shows the run when the caller named none, so the cost lines never reach the screen.
 */
function costArgs(args, file) {
  const reporters = args.filter((arg) => arg.startsWith('--test-reporter=')).length || 1;
  const shown = args.some((arg) => arg.startsWith('--test-reporter=')) ? [] : [`--test-reporter=${QUIET_REPORTER}`];
  const destinations = args.filter((arg) => arg.startsWith('--test-reporter-destination=')).length;
  const unrouted = Array(Math.max(0, reporters - destinations)).fill('--test-reporter-destination=stdout');
  return [...args, ...shown, ...unrouted, `--test-reporter=${COST_REPORTER}`, `--test-reporter-destination=${file}`];
}

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
 * for the suite (none when `slot` is undefined); given `spawns`, the counter preloaded and writing there;
 * given `guard`, the home store the deck store refuses to write and the log it names each writer in (home-store-guard L4).
 */
export function gateEnv(env, slot, spawns, guard) {
  const cap = `--max-old-space-size=${CHILD_HEAP_MB}`;
  const options = [];
  const inherited = (env.NODE_OPTIONS ?? '').split(/\s+/).filter(Boolean);
  for (let i = 0; i < inherited.length; i++) {
    if (inherited[i] === '--max-old-space-size') i++;
    else if (!inherited[i].startsWith('--max-old-space-size=')) options.push(inherited[i]);
  }
  options.push(cap);
  const named = {
    // The suite's ~67 fixtures seed the legacy `pilot`; a test of the derivation unsets it (user-pilot-branch L7).
    PILOT_BRANCH: env.PILOT_BRANCH || LEGACY_PILOT,
    ...(slot === undefined ? {} : { PILOT_GATE_SLOT: String(slot) }),
    ...(guard === undefined ? {} : { PILOT_GATE_HOME_STORE: guard.store, PILOT_GATE_HOME_LOG: guard.log }),
  };
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

/**
 * The pilot-owned processes under `cwd` in `after` and not in `before`, by pid and command, so a reused pid is new.
 * A keep-awake holder names no path: it is the suite's when the deck it watches is, or that deck is gone.
 */
export function leftovers(before, after, cwd, platform = hostPlatform()) {
  const was = new Set(before.map((p) => `${p.pid} ${p.command}`));
  const fresh = after.filter((p) => !was.has(`${p.pid} ${p.command}`));
  const left = fresh.filter((p) => namesPathUnder(p.command, cwd, platform));
  const decks = new Set(left.map((p) => p.pid));
  const holders = fresh.filter((p) => p.kind === 'holder' && !left.includes(p) && (decks.has(p.owner) || p.orphan === `deck ${p.owner} gone`));
  return [...left, ...holders];
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
  // The user's deck and the holder it watches are neither stopped nor named.
  const users = (r) => r.pid === deck || (r.kind === 'holder' && r.owner === deck);
  const lines = [];
  // An unanswered probe cannot tell a leashless daemon, or its holder, from the user's deck: named, never stopped.
  // The set is taken before the loop, so a holder listed ahead of its deck is spared too.
  const leashless = (r) => r.kind === 'daemon' && !/\s--leash\s/.test(` ${r.command} `);
  const unsure = new Set(deck === undefined ? first.left.filter(leashless).map((r) => r.pid) : []);
  const stop = kill(first.table);
  for (const row of first.left.filter((r) => !users(r))) {
    try {
      if (unsure.has(row.pid) || (row.kind === 'holder' && unsure.has(row.owner))) {
        lines.push(`not stopped ${row.pid}: cannot tell it from the user's deck`);
        continue;
      }
      stop(row.pid, row.kind === 'test');
      lines.push(`stopped ${named(row)}`);
    } catch (err) {
      lines.push(`could not stop ${row.pid}: ${firstLine(err)}`);
    }
  }
  const survivors = lines.length ? watch([...before, ...first.left.filter(users)]).left : [];
  lines.push(...(survivors.length ? survivors.map((row) => `left running: ${named(row)}`) : ['left running: none']));
  return { red: survivors.length > 0, lines };
}

/**
 * The spawn line, and `spawns over <ceiling>; most: <owner> <n>, …` when the count is above it,
 * naming the three test files that spent most (S12); the unowned `-` is the runner's, never named.
 */
function spawnLines(count, ceiling, gitCeiling) {
  const lines = [`spawns ${count.total} (node ${count.node}, git ${count.git}, other ${count.other})`];
  if (count.total > ceiling) {
    const most = [...count.owners]
      .filter(([owner]) => owner !== '-')
      .sort(([a, n], [b, m]) => m.total - n.total || (a < b ? -1 : 1))
      .slice(0, 3)
      .map(([owner, n]) => `${owner} ${n.total}`);
    lines.push(`spawns over ${ceiling}${most.length ? `; most: ${most.join(', ')}` : ''}`);
  }
  if (count.git > gitCeiling) lines.push(`git over ${gitCeiling}`);
  return lines;
}

/**
 * The cost table from the reporter's `file` and the spawn owners (cheap-suite S1), or nothing beside a
 * `cost:` line on stderr when it cannot be read: the table is a report, so the run's status stays the suite's.
 */
function costLines(file, owners) {
  try {
    return costTable(fs.readFileSync(file, 'utf8').split('\n'), owners);
  } catch (err) {
    process.stderr.write(`cost: no table (${firstLine(err)})\n`);
    return '';
  }
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
 * Whether every checked file under `cwd` parsed (audit-f6 spec 1-3; L1, L4): `syntax` returns the
 * faults, each printed on its own `syntax:` line; a throw is red too, so the check never passes by not running.
 */
function syntaxClean(syntax, cwd) {
  let result;
  try {
    result = syntax(cwd);
  } catch (err) {
    process.stderr.write(`syntax: could not check (${firstLine(err)})\n`);
    return false;
  }
  if (result === undefined) return true;
  for (const fault of result.errors) process.stderr.write(`syntax: ${fault.file}:${fault.line} ${fault.message}\n`);
  if (result.errors.length === 0) process.stdout.write(`syntax ok ${result.files} files in ${result.ms} ms\n`);
  return result.errors.length === 0;
}

/** The home store's stat (home-store-guard L2): absent is a state; a stat that fails otherwise throws, so the gate is never green by not looking. */
function storeStat(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat ? { exists: true, mtimeMs: stat.mtimeMs, size: stat.size } : { exists: false };
}

/**
 * The home store's line after the suite (home-store-guard spec 2, 3; L3, A1), or undefined when its
 * stat is unchanged, the deck then unprobed. Changed with no live deck is red; with a deck up, or one
 * the probe cannot tell, the line names it and the status is the suite's.
 */
function homeStoreLine(file, before, deckPid) {
  const now = storeStat(file);
  if (now.exists === before.exists && now.mtimeMs === before.mtimeMs && now.size === before.size) return undefined;
  const deck = deckPid();
  if (deck === null) return { red: true, line: `home store changed: ${file}` };
  return { red: false, line: `home store changed: ${file}; live deck ${deck ?? 'unknown'} up` };
}

/** The skip line of a slice-scope gate's cargo step: integrate's wide gate runs it (tested-once spec 3). */
const CARGO_DEFERRED = 'rune deck: deferred to integrate';

/**
 * The Rune deck's `cargo fmt --check` then `cargo test` (rune-deck-ui S19; A3; ui-design-workflow S7) when
 * `which('cargo')` finds it on Windows, else the one line the gate prints instead: off Windows the deck's tests
 * run in CI's Windows job, not in every gate, and a gate a test starts (its env carries the outer gate's guard)
 * leaves them to the outer one. `--check` only reports: the gate never rewrites a source file.
 * The command is the path `which` found: a bare `cargo` is looked up in the checkout first on Windows.
 * Its `env` is what the spawn adds: `CARGO_TARGET_DIR`, the shared Rune build (cheap-suite S3; L5).
 * A `selection` with files (a `--since` gate, never a full run) whose `changed` names nothing under `deck/`
 * and no `FULL_TRIGGERS` file skips it (spec 8). At slice scope, `env.PILOT_TEST_SCOPE` `slice`, it is deferred to
 * integrate's wide gate (tested-once spec 3).
 */
export function cargoStep(env, which = (cmd) => onSearchPath(`${cmd}.exe`, env, platform), platform = hostPlatform(), selection) {
  if (platform !== 'win32') return { skip: 'rune deck: cargo test runs on Windows only, skipped' };
  if (env.PILOT_GATE_HOME_STORE) return { skip: 'rune deck: a gate inside the gate, skipped' };
  if (selection?.files && !selection.changed.some((rel) => rel.startsWith('deck/') || FULL_TRIGGERS.includes(rel))) {
    return { skip: `rune deck: nothing under deck/ changed since ${selection.since.slice(0, 7)}, skipped` };
  }
  if (env.PILOT_TEST_SCOPE === 'slice') return { skip: CARGO_DEFERRED };
  const cargo = which('cargo');
  if (cargo === null) return { skip: 'rune deck: cargo not on PATH, skipped' };
  const manifest = ['--manifest-path', 'deck/rune/Cargo.toml'];
  return {
    steps: [{ command: cargo, args: ['fmt', '--check', ...manifest] }, { command: cargo, args: ['test', ...manifest] }],
    env: { CARGO_TARGET_DIR: runeTargetDir(env, platform) },
  };
}

/**
 * Runs `rune`'s steps in order, or prints its skip line; the first non-zero exit status, 1 when a step could
 * not start or was killed, and no step after it starts. Before them `bound` keeps the shared target bounded
 * (A3), one line when it wiped it; a wipe that fails is named and the steps run on what is left. Then `stale`
 * dates `deck/rune`'s own sources, so the build is this worktree's and never another's from the shared target;
 * one that fails is named and red.
 */
function runeDeck(rune, { spawn, cwd, env, bound, stale }) {
  if (rune.skip) {
    process.stdout.write(`${rune.skip}\n`);
    return 0;
  }
  const dir = rune.env.CARGO_TARGET_DIR;
  try {
    const { wiped, units } = bound(dir);
    if (wiped) process.stdout.write(`rune deck: shared build held ${units} units, over ${RUNE_TARGET_MAX}, wiped ${dir}\n`);
  } catch (err) {
    process.stderr.write(`gate: rune deck: could not bound ${dir}: ${firstLine(err)}\n`);
  }
  const crate = path.join(cwd, 'deck', 'rune');
  try {
    stale(crate);
  } catch (err) {
    process.stderr.write(`gate: rune deck: could not date ${crate}: ${firstLine(err)}\n`);
    return 1;
  }
  for (const step of rune.steps) {
    // A clean `fmt --check` prints nothing, so each step names itself and the log shows it ran.
    process.stdout.write(`rune deck: cargo ${step.args.join(' ')}\n`);
    const run = spawn(step.command, step.args, { cwd, env: { ...env, ...rune.env }, stdio: 'inherit', windowsHide: true });
    if (run.error) process.stderr.write(`gate: rune deck: ${step.command} ${step.args[0]} did not start: ${run.error.message}\n`);
    const status = run.status ?? 1;
    if (status !== 0) return status;
  }
  return 0;
}

/**
 * One `home store written: <file> by <pid> <argv>` line per write the deck store refused under the
 * gate (home-store-guard spec 1; L4), from the log `refuseGateHomeWrite` appends `<pid>\t<argv>\t<file>` to.
 */
function writerLines(log) {
  return fs
    .readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const pid = line.slice(0, line.indexOf('\t'));
      const argv = line.slice(line.indexOf('\t') + 1, line.lastIndexOf('\t'));
      return `home store written: ${line.slice(line.lastIndexOf('\t') + 1)} by ${pid} ${argv}`;
    });
}

/**
 * Checks every file's syntax first (audit-f6 L1), red without the ledgers or the suite on a fault.
 * Rebuilds the ledgers next, red without the suite when one was stale or could not build; then
 * runs the suite, a full run in a gate slot, between two censuses and returns its exit status: 1 when it was
 * killed, could not start, left a process running, or started more than `ceiling` processes; a
 * process table that cannot be read is red. The count goes to `spawns`, or a temporary file.
 * With `--since=<ref>` (suite-at-landing S1; L7) it prints the scope line first and runs only the
 * selection, the flag kept from `node`; an empty selection runs nothing and passes, a null one runs full.
 * With `homeStore` it is red too when that file's stat changed and `deckPid()` names no deck.
 * With `homeStore` and `which` it runs `cargoStep`'s steps after the suite, in that window, red when one fails,
 * given the selection and bounding the shared target with `bound` first.
 * With `--cost` (cheap-suite S1; L4) it adds the cost reporter and prints the cost table last, its status unchanged.
 */
export function runGate(args, { syntax = () => undefined, ledgers = () => [], cwd = ROOT, spawn = spawnSync, slot = takeSlot, read = processTable, spawns, ceiling = SPAWN_CEILING, gitCeiling = GIT_CEILING, select = selectTests, homeStore, deckPid = deckPidNow, which, platform = hostPlatform(), bound = boundTarget, stale = staleRoot, ...rest } = {}) {
  if (!syntaxClean(syntax, cwd)) return 1;
  const cost = args.includes('--cost');
  args = args.filter((arg) => arg !== '--cost');
  const sinceArg = args.findLast((arg) => /^--since(=|$)/.test(arg));
  let selection;
  if (sinceArg === '--since') {
    process.stderr.write('gate: --since takes its ref as --since=<ref>\n');
    return 1;
  }
  // tested-once A2: `pilot test --scope slice` sets it; anything else is wide.
  const scope = process.env.PILOT_TEST_SCOPE === 'slice' ? 'slice' : 'wide';
  // The wide call is unchanged: `selectTests`'s default scope is wide.
  if (sinceArg !== undefined) selection = select({ cwd, since: sinceArg.slice('--since='.length), ...(scope === 'slice' ? { scope } : {}) });
  const cargo = homeStore !== undefined && which ? cargoStep({ ...process.env, PILOT_TEST_SCOPE: scope }, which, platform, selection) : undefined;
  // The standing cargo deferral is not named in the scope line: a slice-scope run that left nothing else out is
  // complete, so `pilot test` reuses it; cargo runs at land's full suite (tested-once spec 3a, A6).
  if (sinceArg !== undefined) {
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
    if (spawns === undefined || homeStore !== undefined || cost) scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gate-spawns-'));
    const file = spawns ?? path.join(scratch, 'spawns.txt');
    fs.writeFileSync(file, '');
    const costFile = cost ? path.join(scratch, 'cost.jsonl') : undefined;
    if (costFile) args = costArgs(args, costFile);
    const guard = homeStore === undefined ? undefined : { store: homeStore, log: path.join(scratch, 'home-writes.txt') };
    if (guard) fs.writeFileSync(guard.log, '');
    let before;
    try {
      before = pilotProcesses(read(), {});
    } catch (err) {
      before = err;
    }
    const storeBefore = homeStore === undefined ? undefined : storeStat(homeStore);
    const run = spawn(process.execPath, gateArgv(args, os.availableParallelism(), cwd), {
      cwd,
      env: gateEnv(process.env, held.slot, file, guard),
      stdio: 'inherit',
      windowsHide: true,
    });
    if (run.error) process.stderr.write(`gate: node --test did not start: ${run.error.message}\n`);
    // rune-deck-ui S19: inside the home-store window and under its guard env, so a Rust test's scratch daemon
    // that writes the home store is caught, and before the census, so one left running is too.
    const rune = guard && cargo ? runeDeck(cargo, { spawn, cwd, env: gateEnv(process.env, held.slot, file, guard), bound, stale }) : 0;
    let after;
    try {
      if (before instanceof Error) throw before;
      after = census(before, { cwd, read, deckPid, ...rest });
    } catch (err) {
      after = { red: true, lines: [`left running: cannot tell, the process table did not read (${firstLine(err)})`] };
    }
    const count = spawnCount(file);
    const counted = spawnLines(count, ceiling, gitCeiling);
    const home = homeStore === undefined ? undefined : homeStoreLine(homeStore, storeBefore, deckPid);
    const written = guard ? writerLines(guard.log) : [];
    process.stdout.write(`${[...after.lines, ...counted, ...(home ? [home.line] : []), ...written].join('\n')}\n`);
    if (costFile) process.stdout.write(costLines(costFile, count.owners));
    return after.red || counted.length > 1 || home?.red || written.length > 0 || rune !== 0 ? 1 : (run.status ?? 1);
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
  // home-store-guard L1: only this entry arms the home store check, so the gate's own tests never stat the real store.
  const homeStore = path.join(os.homedir(), '.claude', 'pilot', 'deck.json');
  // rune-deck-ui S19: only this entry arms the Rune deck's cargo step too, under the home-store guard.
  const which = (cmd) => onSearchPath(`${cmd}.exe`);
  process.exitCode = runGate(process.argv.slice(2), { syntax: syntaxErrors, ledgers: rebuildLedgers, homeStore, which });
}
