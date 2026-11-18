/**
 * A signed gate2 lands the feature (gate2-lands spec 1, 4, 5, 8; L1-L4, L9, L10; ADR 0111). The
 * third process the daemon starts, after the browser opener and Start's window (ADR 0050): on a
 * Sign off press of a gate2, `node <bin/pilot.mjs> land` in the ticket's run-record worktree.
 *
 * The shape is fixed. No shell, and nothing from the request or the store reaches argv: the
 * worktree reaches the child as `cwd` alone, after it is checked to be an absolute directory and
 * a checkout of the gate2's own repository. `land()` is never called in this process, because its
 * `spawnSync` would freeze every page for the length of the suite; the daemon waits on the child
 * asynchronously instead. Every outcome is a line on the gate2's thread, written by the store.
 */

import { execFileSync, spawn as spawnChild } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isWindows, killTree } from '../hooks/lib/platform.js';
import { closeLanded } from './closing-report.mjs';
import { KIND_GATE2, KIND_TICKET, isOpen, stateOf } from './items.mjs';
import { holdLanding, landChildOf, landDir, pidAlive } from './land-child.mjs';
import { processTable } from './procs.mjs';
import { neverGranted, planDrift } from './recut.mjs';
import { repoOf, sameRepo } from './runs.mjs';
import { sessionEnv } from './session.mjs';
import { DeckRefusal, beginLanding, findCredential, interruptLandings, listItems, noteLanding, recordForTicket, settleLanding } from './store.mjs';
import { noteDeck, queueLanding } from './store-items.mjs';
import { recutTicket } from './store-tickets.mjs';

const PILOT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'pilot.mjs');

/** The most of land's output a thread keeps: its last this many characters (L9). */
const MAX_LANDING_CHARS = 2000;

/** How long land may run before its own child tree is killed and the landing reads timed out (A3). */
export const LANDING_TIMEOUT_MS = 30 * 60_000;

/** The `land` children this daemon has live: the idle rule never closes the deck under one (process-gc L2). */
let running = 0;

/** How many `land` children this daemon has live. */
export const landingsRunning = () => running;

/** What a press on `gate` waits behind (spec 7, gate2-lands A4): another gate2 in its repository landing. */
const blockerOf = (gate, items) =>
  items.find((item) => item.kind === KIND_GATE2 && item.id !== gate.id && sameRepo(item.repo, gate.repo) && item.landing?.state === 'running');

/** A refusal before anything runs, read on the thread as land's own refusals are. */
const notRun = (why) => new DeckRefusal(`NOT landed: ${why}; nothing run`);

/** How long one git step of a recreate may hold the daemon, so a dead remote cannot hang it. */
const RECREATE_GIT_MS = 60_000;

/** One git step of recreating `worktree`, in `cwd`: an argument array, never a shell, never a prompt; its stdout, or a refusal. */
function gitIn(cwd, args, worktree) {
  try {
    const options = { cwd, encoding: 'utf8', shell: false, timeout: RECREATE_GIT_MS, stdio: ['ignore', 'pipe', 'pipe'] };
    return execFileSync('git', args, { ...options, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true }).trim();
  } catch (err) {
    const said = String(err.stderr ?? '').trim().split('\n').at(-1) || err.code || err.message;
    throw notRun(`the worktree ${worktree} is gone and git ${args[0]} could not recreate it (${findCredential(said) ? 'its output was withheld' : said})`);
  }
}

/**
 * A gone worktree added again at its own path from `origin/feat/<slug>` (three-lanes spec 16), and
 * only when that tip is the gate2's `sha`: the worktree is checked out at the tip it was checked
 * against, never at whatever the branch moved to since.
 */
function recreate(gate, slug, worktree) {
  const gone = `the worktree ${worktree} is gone and`;
  if (typeof slug !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) throw notRun(`${gone} its run record names no slug to recreate it from`);
  if (typeof gate.sha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(gate.sha)) throw notRun(`${gone} the gate2 names no sha to recreate it at`);
  const repo = repoOf(gate.repo);
  if (repo === null) throw notRun(`${gone} ${gate.repo} is not a checkout to recreate it from`);
  const branch = `feat/${slug}`;
  const git = (...args) => gitIn(repo, args, worktree);
  git('fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
  const tip = git('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}^{commit}`);
  if (!tip.toLowerCase().startsWith(gate.sha.toLowerCase())) throw notRun(`origin/${branch} is at ${tip.slice(0, 7)}, the gate2 signed ${gate.sha}`);
  // `-B` would reset a local branch past the tip, leaving its commits to the reflog alone.
  const local = git('for-each-ref', '--format=%(objectname)', `refs/heads/${branch}`);
  const ahead = local ? Number(git('rev-list', '--count', `${tip}..${local}`)) : 0;
  if (ahead > 0) throw notRun(`the local ${branch} holds ${ahead} commits origin/${branch} does not, at ${local.slice(0, 7)}`);
  // The deleted directory is still registered, and holds the branch, until it is pruned.
  git('worktree', 'prune');
  git('worktree', 'add', '--quiet', '-B', branch, worktree, tip);
}

/** The record's worktree, checked at press time (L3) and recreated when it is gone, or a refusal naming what is wrong. */
export function worktreeFor(gate) {
  let record;
  try {
    ({ record } = recordForTicket(gate.repo, gate.ticket));
  } catch (err) {
    if (err instanceof DeckRefusal) throw notRun(err.message);
    throw err;
  }
  if (!record) throw notRun(`no run record names ticket ${gate.ticket}`);
  const { worktree } = record;
  if (typeof worktree !== 'string' || worktree === '') throw notRun(`the run record for ticket ${gate.ticket} names no worktree`);
  if (!path.isAbsolute(worktree)) throw notRun(`the worktree ${worktree} is not an absolute path`);
  let stat;
  try {
    stat = fs.statSync(worktree);
  } catch (err) {
    if (err.code === 'ENOENT') {
      recreate(gate, record.slug, worktree);
      return { worktree, recreated: true };
    }
    if (err.code === 'ENOTDIR') throw notRun(`the worktree ${worktree} is gone`);
    throw notRun(`the worktree ${worktree} could not be checked (${err.code})`);
  }
  if (!stat.isDirectory()) throw notRun(`the worktree ${worktree} is not a directory`);
  const repo = repoOf(gate.repo) ?? gate.repo;
  if (!sameRepo(repoOf(worktree), repo)) throw notRun(`${worktree} is not a checkout of ${repo}`);
  return { worktree, recreated: false };
}

/** What the thread says land said: stdout, stderr only when stdout is empty, its tail, and never a credential (L9). */
function landingLine(code, stdout, stderr) {
  const held = stdout.trim() || stderr.trim();
  const exited = code === null ? 'was killed' : code === undefined ? 'exited under the last deck' : `exited ${code}`;
  if (held === '') return `${code === 0 ? 'landed' : 'NOT landed'}: pilot land ${exited} and printed nothing`;
  // Read over all that is held, not the tail alone, so a secret cut in half at the tail's edge is still found.
  const credential = findCredential(held);
  if (credential) return `${code === 0 ? 'landed' : 'NOT landed'}: pilot land ${exited} and its output was withheld: it looks like ${credential}`;
  return held.slice(-MAX_LANDING_CHARS);
}

/** `landed <branch> on <pilot> at <sha7>`: the SHA land printed, or undefined. */
const shaOf = (line) => /^landed \S+ on \S+ at ([0-9a-f]{7,40})\b/m.exec(line)?.[1];

/**
 * Run `step`, logging what it throws: after the press is answered the daemon has nobody else
 * to tell, and a throw in a child's event handler would take the daemon down.
 */
const logged = (step) => {
  try {
    step();
  } catch (err) {
    console.error('[deck] a landing step failed:', err?.message ?? err);
  }
};

/**
 * Kill the held child and everything it started, by the handle this daemon holds (L6): the seam's
 * `killTree` over the handle's pid, which is this daemon's own live child, never a stored one, by
 * its process group off Windows, where it was spawned detached to lead one. A throw is logged.
 */
const killHeld = (child) => killTree(child.pid, { group: true });

/**
 * The options `pilot land` is spawned with: no shell, no window, stdin ignored, its own process
 * group off Windows, and the daemon's environment less the parent session's markers. The parity
 * test spawns the suite through these, so it runs the tests the way a landing does (spec 6).
 */
export function landingSpawnOptions(cwd, env, platform) {
  return {
    cwd,
    shell: false,
    windowsHide: true,
    detached: !isWindows(platform),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: sessionEnv(env),
  };
}

/** Only the tail is ever shown, so only a bounded tail is ever held. */
const keep = (held, chunk) => (held + chunk).slice(-4 * MAX_LANDING_CHARS);

/** What a child wrote to its land dir (never-stuck spec 21): `out` and `err`, each its tail, empty when unreadable. */
function outputIn(dir) {
  // Only the tail's bytes are read, so a land that printed without end cannot fill this daemon.
  const tail = (name) => {
    let fd;
    try {
      fd = fs.openSync(path.join(dir, name), 'r');
      const length = Math.min(fs.fstatSync(fd).size, 16 * MAX_LANDING_CHARS);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, fs.fstatSync(fd).size - length);
      return keep('', buffer.toString('utf8'));
    } catch {
      return '';
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  };
  return { stdout: tail('out'), stderr: tail('err') };
}

/**
 * Watch a spawned child to its one settle: `done({ code, stdout, stderr })` on close, `done({ error })`
 * when it cannot run, `done({ timedOut: true })` past `timeoutMs`, its tree killed. Counted in
 * `running` while live, so the idle rule never closes the deck under it; a pipeless child's `dir` is read on close.
 */
export function watch(child, { clock, kill, timeoutMs, done, dir }) {
  let stdout = '';
  let stderr = '';
  const piped = child.stdout != null;
  for (const stream of piped ? [child.stdout, child.stderr] : []) {
    stream.setEncoding('utf8');
    stream.on('error', (err) => console.error('[deck] a landing stream failed:', err.message));
  }
  child.stdout?.on('data', (chunk) => (stdout = keep(stdout, chunk)));
  child.stderr?.on('data', (chunk) => (stderr = keep(stderr, chunk)));
  // `error` and `close` can both arrive for one child; the first settles, once.
  let settled = false;
  let timer;
  const settle = (outcome) => {
    if (settled) return;
    settled = true;
    running -= 1;
    clock.clearTimeout(timer);
    logged(() => done(outcome));
  };
  // Counted only once every settle path is attached, so each child counted is uncounted exactly once.
  running += 1;
  child.on('error', (error) => settle({ error }));
  child.on('close', (code) => settle({ code, ...(piped ? { stdout, stderr } : outputIn(dir)) }));
  // Settled at once, not on the killed child's close, so a kill that fails still frees it.
  timer = clock.setTimeout(() => {
    logged(() => kill(child));
    settle({ timedOut: true });
  }, timeoutMs);
  timer?.unref?.();
}

/**
 * Land the feature a gate2 signs. Never throws: a refusal, a spawn that fails and land's exit
 * are each a line on the gate2's thread, and a land past LANDING_TIMEOUT_MS is killed and settles timed out
 * (A3). `spawn`, `env`, `clock` and `kill` are seams for the tests; `announce` repaints the pages once it settles.
 */
// Every outcome is a line on the gate2's thread and the note on the ticket's feature row (clean-landing spec 12).
// A recreated worktree opens every line after it (three-lanes spec 16).
function writerFor(gate, deps, opened = () => '') {
  const { announce = () => {} } = deps;
  return (outcome) => {
    const said = { ...outcome, line: opened() + outcome.line };
    logged(() => settleLanding(gate.id, said));
    // Land's raw output is on the thread, withheld where it holds a credential, and never left on disk (never-stuck spec 21).
    logged(() => fs.rmSync(landDir(gate.id), { recursive: true, force: true }));
    logged(() => noteLanding(gate.repo, gate.ticket, said));
    // A landed feature's gate2 is resolved, no session present (gate2-frees-lane spec 4, L3); the closing report
    // is the lander's (lander S15), its first human step land's main PR (one-integration-line spec 3).
    if (said.ok) logged(() => closeLanded(gate.id));
    // The codebase moved: every unbuilt plan it touched goes back to planning (never-stuck spec 14), after the landed line, never awaited.
    if (said.ok) void driftAfterLanding(gate.id, deps).then((ids) => ids.length > 0 && logged(announce));
    // The settle frees the repository: the oldest press queued there starts (spec 7).
    logged(() => startQueued(deps));
  };
}

export function startLanding(gate2Id, deps = {}) {
  const { spawn = spawnChild, env = process.env, announce = () => {}, clock = { setTimeout, clearTimeout }, kill = killHeld } = deps;
  try {
    const gate = listItems().find((item) => item.id === gate2Id);
    if (gate?.kind !== KIND_GATE2) return;
    let opened = '';
    const write = writerFor(gate, deps, () => opened);
    // Any value at all: the one reason to set it is to stop a push (L10).
    if (env.PILOT_DECK_NO_LAND) return write({ ok: false, line: 'landing is turned off on this deck' });
    // One land per repository at a time (A4): a press while another runs there is queued, once, and spawns nothing.
    const behind = blockerOf(gate, listItems());
    if (behind) return gate.landing?.state === 'queued' ? undefined : void queueLanding(gate2Id, behind.id);
    let cwd;
    try {
      const found = worktreeFor(gate);
      cwd = found.worktree;
      if (found.recreated) opened = `recreated ${cwd} at ${gate.sha.slice(0, 7)}; `;
    } catch (err) {
      if (!(err instanceof DeckRefusal)) throw err;
      return write({ ok: false, line: err.message });
    }

    const couldNotStart = (err) => ({ ok: false, line: `NOT landed: pilot land could not start (${err?.message ?? err})` });
    // Land writes to its land dir, not to a pipe of this daemon, so it outlives a restart and its line is still read (never-stuck spec 21).
    const dir = landDir(gate2Id);
    const fds = [];
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      for (const name of ['out', 'err']) fds.push(fs.openSync(path.join(dir, name), 'w', 0o600));
    } catch (err) {
      for (const fd of fds) fs.closeSync(fd);
      return write(couldNotStart(err));
    }
    let child;
    try {
      // Running is stored before anything runs: a write that fails throws to the catch below, and nothing is spawned.
      beginLanding(gate2Id, { worktree: cwd });
      logged(() => noteLanding(gate.repo, gate.ticket, { ok: null, line: `landing started in ${cwd}` }));
      try {
        child = spawn(process.execPath, [PILOT_BIN, 'land'], { ...landingSpawnOptions(cwd, env), stdio: ['ignore', ...fds], windowsHide: true });
      } catch (err) {
        return write(couldNotStart(err));
      }
    } finally {
      for (const fd of fds) fs.closeSync(fd);
    }
    // Its pid on the landing, so a restarted deck finds it; a write that fails leaves the landing to read interrupted then.
    logged(() => holdLanding(gate2Id, child.pid));
    watch(child, {
      clock,
      kill,
      dir,
      timeoutMs: LANDING_TIMEOUT_MS,
      done: ({ code, stdout, stderr, error, timedOut }) => {
        if (error) write(couldNotStart(error));
        else if (timedOut) write({ ok: false, line: `NOT landed: timed out after ${LANDING_TIMEOUT_MS / 60_000} min` });
        else {
          const line = landingLine(code, stdout, stderr);
          write({ ok: code === 0, sha: shaOf(line), line, code });
        }
        logged(announce);
      },
    });
  } catch (err) {
    console.error('[deck] a landing could not start:', err.message);
  }
}

/** How long from its start an adopted land may run before the deck stops it: past a live one's 30, so its own wait ran out first. */
export const ADOPTED_LIMIT_MS = 40 * 60_000;

/**
 * Follow one adopted child, counted in `running`, to one settle of a landing still running on its pid: on its exit, the line
 * in its land dir; past ADOPTED_LIMIT_MS from its start, timed out, its tree stopped only while its pid is still the deck's land.
 */
function follow(gate, deps, { table, clock, pollMs, now, stop }) {
  const { pid, startedAt } = gate.landing;
  const dir = landDir(gate.id);
  running += 1;
  return new Promise((resolve) => {
    let poll;
    let limit;
    let done = false;
    const finish = (outcome) => {
      if (done) return;
      done = true;
      running -= 1;
      clock.clearInterval(poll);
      clock.clearTimeout(limit);
      try {
        const current = listItems().find((item) => item.id === gate.id)?.landing;
        if (current?.state === 'running' && current.pid === pid) writerFor(gate, deps)(outcome);
        if (deps.announce) logged(deps.announce);
      } catch (err) {
        console.error(`[deck] the adopted landing ${gate.id} could not be settled:`, err?.message ?? err);
      } finally {
        resolve();
      }
    };
    poll = clock.setInterval(() => {
      if (pidAlive(pid)) return;
      const { stdout, stderr } = outputIn(dir);
      const line = landingLine(undefined, stdout, stderr);
      const sha = shaOf(line);
      finish({ ok: sha !== undefined, sha, line });
    }, pollMs);
    limit = clock.setTimeout(() => {
      let stopped = 'its pid is no longer the land, so nothing was stopped';
      try {
        if (landChildOf(gate.landing, { table, now: now() })) stopped = (stop(pid), `the deck stopped land ${pid}`);
      } catch (err) {
        stopped = `land ${pid} could not be stopped (${err?.message ?? err})`;
      }
      finish({ ok: false, line: `NOT landed: timed out after ${ADOPTED_LIMIT_MS / 60_000} min; ${stopped}` });
    }, Math.max(0, Date.parse(startedAt) + ADOPTED_LIMIT_MS - now()));
  });
}

/**
 * The daemon's re-adoption at start (never-stuck spec 21): each running landing whose pid is still the deck's land child
 * (`landChildOf`) is followed to its exit; every other reads interrupted, its process left as it is (ADR 0035), and so does
 * every one when the process table cannot be read. Resolves once every adopted child has settled; never rejects.
 */
export function adoptLandings(deps = {}) {
  const { table = processTable, clock = { setInterval, clearInterval, setTimeout, clearTimeout }, pollMs = 2_000, now = Date.now } = deps;
  const stop = deps.stop ?? ((pid) => killTree(pid, { group: !isWindows() }));
  let adopted = [];
  try {
    let rows;
    const once = () => (rows ??= table());
    const live = listItems().filter((item) => item.kind === KIND_GATE2 && item.landing?.state === 'running');
    adopted = live.filter((item) => item.landing.pid !== undefined && landChildOf(item.landing, { table: once, now: now() }));
  } catch (err) {
    console.error('[deck] the land children a restart left could not be read; their landings read interrupted:', err?.message ?? err);
  }
  const ids = new Set(adopted.map((item) => item.id));
  try {
    interruptLandings((item) => ids.has(item.id));
  } catch (err) {
    console.error('[deck] the landings a restart interrupted could not be settled:', err?.message ?? err);
  }
  return Promise.all(adopted.map((gate) => follow(gate, deps, { table, clock, pollMs, now, stop }))).then(() => undefined);
}

/**
 * The post-landing sweep (never-stuck spec 14; L2, L4, L7): each open, signed, never-granted yellow ticket of a landed
 * gate2's repository is checked with `planDrift`, one at a time; each drifted one goes red through `recutTicket` with
 * why `landing <sha7>`, and one deck line on the gate2 names them all, with any the store refused and why. An unchecked
 * drift moves nothing (L10), and a ticket granted while its check ran is left. Resolves the re-cut ids; never rejects,
 * since nobody awaits it.
 */
export async function driftAfterLanding(gate2Id, deps = {}) {
  const { planDrift: check = planDrift } = deps;
  const recut = [];
  const named = [];
  try {
    const items = listItems();
    const gate = items.find((item) => item.id === gate2Id && item.kind === KIND_GATE2);
    if (gate?.landing?.state !== 'landed') return [];
    const why = `landing ${String(gate.landing.sha ?? 'unknown').slice(0, 7)}`;
    const queued = items.filter((item) => item.kind === KIND_TICKET && item.id !== gate.ticket && typeof item.repo === 'string' &&
      sameRepo(item.repo, gate.repo) && isOpen(item) && stateOf(item) === 'yellow' && neverGranted(item));
    for (const { id, repo, plan } of queued) {
      let what;
      try {
        const drift = await check(repo, plan);
        if (drift.state !== 'moved' && drift.state !== 'gone') continue;
        // Read again after the await: a grant in the meantime stamped the plan, and a granted plan is never re-cut (L4).
        const now = listItems().find((item) => item.id === id);
        if (!neverGranted(now) || !isOpen(now) || stateOf(now) !== 'yellow') continue;
        what = drift.state === 'gone' ? `plan ${drift.sha.slice(0, 8)} gone` : `${drift.files.length} file${drift.files.length === 1 ? '' : 's'}`;
        recutTicket(id, why, drift.state === 'moved' ? drift.files : undefined);
        recut.push(id);
        named.push(`${id} (${what})`);
      } catch (err) {
        // A switch pending or a co-pilot taken since the read: the drift is still said, so the user sees the plan stayed.
        if (err instanceof DeckRefusal) named.push(`${id} (${what}; not re-cut: ${err.message})`);
        else console.error(`[deck] the landing ${gate2Id} could not re-cut ${id}:`, err?.message ?? err);
      }
    }
    if (named.length > 0) noteDeck(gate2Id, `Re-cut by this landing: ${named.join('; ')}`);
  } catch (err) {
    console.error(`[deck] the re-cut sweep after landing ${gate2Id} failed:`, err?.message ?? err);
  }
  return recut;
}

/**
 * Start each queued landing whose repository is free (spec 7): the oldest press first, so a repository's
 * second queued gate2 finds the first running and stays queued. Run at each settle and at the daemon's start.
 */
export function startQueued(deps = {}) {
  const queuedNow = (id) => listItems().find((item) => item.id === id)?.landing?.state === 'queued';
  const queued = listItems().filter((item) => item.kind === KIND_GATE2 && item.landing?.state === 'queued');
  queued.sort((a, b) => String(a.landing.pressedAt).localeCompare(String(b.landing.pressedAt)));
  for (const { id } of queued) if (queuedNow(id)) startLanding(id, deps);
}

/**
 * The daemon's start-up sweep (lander S15): every ticket's newest gate2 that landed and was left open is
 * resolved. It writes no report: the closing report is the lander's, and there is no orphan fallback (L12).
 * A gate2 that cannot be settled is logged and left.
 */
export function closeLandedAtStart() {
  const newest = new Map();
  for (const item of listItems()) if (item.kind === KIND_GATE2 && item.ticket !== undefined) newest.set(item.ticket, item);
  for (const gate of newest.values()) {
    if (gate.landing?.state !== 'landed') continue;
    try {
      closeLanded(gate.id);
    } catch (err) {
      console.error(`[deck] the landed gate2 ${gate.id} could not be settled at start-up:`, err?.message ?? err);
    }
  }
}
