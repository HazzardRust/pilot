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
import { KIND_GATE2 } from './items.mjs';
import { repoOf, sameRepo } from './runs.mjs';
import { sessionEnv } from './session.mjs';
import { DeckRefusal, beginLanding, findCredential, listItems, noteLanding, recordForTicket, settleLanding } from './store.mjs';
import { queueLanding } from './store-items.mjs';

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
  const exited = code === null ? 'was killed' : `exited ${code}`;
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

/**
 * Watch a spawned child to its one settle: `done({ code, stdout, stderr })` on close, `done({ error })`
 * when it cannot run, `done({ timedOut: true })` past `timeoutMs`, its tree killed. Counted in
 * `running` while live, so the idle rule never closes the deck under it.
 */
function watch(child, { clock, kill, timeoutMs, done }) {
  let stdout = '';
  let stderr = '';
  // Only the tail is ever shown, so only a bounded tail is ever held.
  const keep = (held, chunk) => (held + chunk).slice(-4 * MAX_LANDING_CHARS);
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('error', (err) => console.error('[deck] a landing stream failed:', err.message));
  }
  child.stdout.on('data', (chunk) => (stdout = keep(stdout, chunk)));
  child.stderr.on('data', (chunk) => (stderr = keep(stderr, chunk)));
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
  child.on('close', (code) => settle({ code, stdout, stderr }));
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
export function startLanding(gate2Id, deps = {}) {
  const { spawn = spawnChild, env = process.env, announce = () => {}, clock = { setTimeout, clearTimeout }, kill = killHeld } = deps;
  try {
    const gate = listItems().find((item) => item.id === gate2Id);
    if (gate?.kind !== KIND_GATE2) return;
    // Every outcome is a line on the gate2's thread and the note on the ticket's feature row (clean-landing spec 12).
    // A recreated worktree opens every line after it (three-lanes spec 16).
    let opened = '';
    const write = (outcome) => {
      const said = { ...outcome, line: opened + outcome.line };
      logged(() => settleLanding(gate2Id, said));
      logged(() => noteLanding(gate.repo, gate.ticket, said));
      // A landed feature's gate2 is resolved, no session present (gate2-frees-lane spec 4, L3); the closing report
      // is the lander's (lander S15), its first human step land's main PR (one-integration-line spec 3).
      if (said.ok) logged(() => closeLanded(gate2Id));
      // The settle frees the repository: the oldest press queued there starts (spec 7).
      logged(() => startQueued(deps));
    };
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
    // Running is stored before anything runs: a write that fails throws to the catch below, and nothing is spawned.
    beginLanding(gate2Id, { worktree: cwd });
    logged(() => noteLanding(gate.repo, gate.ticket, { ok: null, line: `landing started in ${cwd}` }));
    let child;
    try {
      child = spawn(process.execPath, [PILOT_BIN, 'land'], { ...landingSpawnOptions(cwd, env), windowsHide: true });
    } catch (err) {
      return write(couldNotStart(err));
    }
    watch(child, {
      clock,
      kill,
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
