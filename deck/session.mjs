/**
 * The deck starts a session (start-end-session spec 2, L2–L4, L7; ADR 0050; handoff-mod spec 11).
 * The one process the daemon starts besides the browser opener: a visible terminal window
 * running `claude` as the pilot in a tab's own directory, only when the Start route asks.
 *
 * The shape is fixed. `cmd.exe /d /c start "pilot" "<claude>" [--add-dir "<rules root>"]
 * --agent pilot:pilot --settings "<settings file>"`, with no shell and the arguments passed
 * verbatim, so the command line is exactly those words, with no prompt and no JSON on it (A9).
 * The directory is never on it: it reaches the child as `cwd` alone, so `&`, `^` or `%` in a
 * path has no command line to be parsed on. The paths that are on it are `claude` and two under
 * the user's home, quoted here; one holding `"` (which would end the quote) or `%` (which `cmd`
 * expands even inside one) is refused rather than escaped.
 */

import { spawn as spawnChild } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { claudeBin, hostPlatform } from '../hooks/lib/platform.js';
import { sameRepo } from './items.mjs';
import { runEnv, startArgs } from './run-env.mjs';
import { DeckRefusal } from './store.mjs';
import { unstrippedEnv } from '../scripts/pilot-branch.mjs';
import { readReach } from '../scripts/reach.mjs';

/**
 * The markers a Claude Code session leaves in its environment, which the daemon
 * inherits from whichever session started it (F7, L4). Each describes that session:
 * an inherited `CLAUDE_PROJECT_DIR` makes the new one claim its parent's repository,
 * and an inherited `CLAUDE_CODE_CHILD_SESSION` turns its transcript saving off (seen on
 * the live gate). Any other `CLAUDE_CODE_*` name is the user's configuration and stays.
 */
export const PARENT_MARKERS = Object.freeze([
  'CLAUDECODE',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_AGENT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP',
]);
const DROPPED = new Set(PARENT_MARKERS);

/**
 * The environment a started session gets: the daemon's own less the parent session's
 * markers (L4). Matched without regard to case, because Windows names are. Everything
 * else is kept, `PILOT_DECK_PORT` and `PILOT_DECK_DIR` above all, so a scratch deck's
 * session talks to that same deck.
 */
export function sessionEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !DROPPED.has(name.toUpperCase())));
}

/**
 * How long a Start holds its repository against a second press (spec 3, L3): until the
 * session registers, its spawn fails, or this much time has passed, whichever is first.
 * Compared against the clock at the next press, never cleared by a timer.
 */
export const STARTING_MS = 60_000;

/** The repositories a Start is opening a window in, each with when it was pressed. In memory only. */
const starting = new Map();
/** Release the Start latch of a session that has registered (`POST /api/runs`), in any spelling of `repo`. */
export function clearStarting(repo) {
  for (const key of starting.keys()) {
    if (sameRepo(key, repo)) starting.delete(key);
  }
}

/** Whether a Start in `repo` is still in flight at `now`. */
function isStarting(repo, now) {
  for (const [key, pressedAt] of starting) {
    if (sameRepo(key, repo) && now - pressedAt < STARTING_MS) return true;
  }
  return false;
}

/**
 * The directory must still be one at press time (spec 4, L3): a tab outlives the folder
 * it names, and a window opened on a missing `cwd` fails where nobody can see it.
 */
function requireDirectory(repo) {
  let stat;
  try {
    stat = fs.statSync(repo);
  } catch (err) {
    const missing = err.code === 'ENOENT' || err.code === 'ENOTDIR';
    throw new DeckRefusal(missing ? `${repo} no longer exists` : `${repo} could not be checked (${err.code})`, 400);
  }
  if (!stat.isDirectory()) throw new DeckRefusal(`${repo} is not a directory`, 400);
}

/**
 * A word `cmd` would end a quote on (`"`) or expand inside one (`%`, and `!` where the
 * registry turns delayed expansion on) is refused, never escaped.
 */
function requireOnTheLine(word) {
  if (/["%!]/.test(word)) throw new DeckRefusal(`${word} cannot be put on a command line`, 400);
}

/**
 * Open a terminal window running the pilot in `repo`, idle until the user types (L12): the one
 * window builder behind the deck's Start and `pilot start`. Refuses before any spawn off Windows
 * (A7), with no absolute `claude` on the PATH, and for a `claude` or a home whose path `cmd`
 * cannot carry; the settings are written only once every word has passed. Answers the child,
 * detached and unref'd, for the caller's `error` handler.
 */
export function openPilot(
  repo,
  { spawn = spawnChild, platform = hostPlatform(), env = process.env, claude = claudeBin(env, platform), home = os.homedir(), reach = readReach({ home }) } = {},
) {
  if (platform !== 'win32') throw new DeckRefusal('Start opens a terminal window on Windows only', 400);
  // Never the bare name: `cwd` is the repo, and a `claude.exe` checked into it would be what runs.
  if (!claude) throw new DeckRefusal('claude was not found on the PATH; install Claude Code or add it to the PATH', 500);
  if (!path.win32.isAbsolute(claude)) throw new DeckRefusal(`${claude} is not an absolute path to claude`, 400);
  // Every path on the line is `claude` or under `home` (the rules root, the settings file).
  requireOnTheLine(claude);
  requireOnTheLine(home);
  let args;
  try {
    args = startArgs(reach, { home, env });
  } catch (err) {
    throw new DeckRefusal(`could not write the session settings: ${err.message}`, 500);
  }
  // Every path quoted, since any may hold a space; the flags and `pilot:pilot` are constants.
  const quoted = (word) => (path.win32.isAbsolute(word) ? `"${word}"` : word);
  const words = ['"pilot"', `"${claude}"`, ...args.map(quoted)];

  // Absolute, because a bare `cmd.exe` is looked up in `cwd` first, and `cwd` is the repo:
  // a `cmd.exe` checked into it would be what runs.
  const cmd = path.win32.join(env.SystemRoot ?? 'C:/Windows', 'System32', 'cmd.exe');
  const child = spawn(cmd, ['/d', '/c', 'start', ...words], {
    cwd: repo,
    shell: false,
    detached: true,
    // Hides `cmd`'s own window only; `start` gives `claude` a console of its own.
    windowsHide: true,
    // The words above are the command line, unquoted a second time by Node.
    windowsVerbatimArguments: true,
    stdio: 'ignore',
    // As before the daemon's strip (spec 7 is git's), less the parent's markers, plus the run's own.
    env: runEnv(reach, sessionEnv(unstrippedEnv(env))),
  });
  child.unref();
  return child;
}

/**
 * Start (spec 11): open the pilot's window in `repo`, which the caller has already resolved to a
 * tab's own spelling (L3). Refuses before any spawn under the suite (`PILOT_DECK_NO_START`, L7),
 * for a directory that is gone, and while an earlier Start in the same repo is in flight; then
 * `openPilot`'s own refusals. It starts nothing else: the sub-deck's `--sub` launch is gone (ADR 0088).
 */
export function startSession(repo, { now = Date.now, ...deps } = {}) {
  const env = deps.env ?? process.env;
  // Any value at all, `0` included: the one reason to set it is to stop a window opening.
  if (env.PILOT_DECK_NO_START) throw new DeckRefusal('starting a session is turned off on this deck', 403);
  requireDirectory(repo);
  const pressedAt = now();
  if (isStarting(repo, pressedAt)) throw new DeckRefusal('a session is already starting in this deck', 409);

  const child = openPilot(repo, deps);
  // Latched once the spawn has returned, so one that throws here leaves nothing behind;
  // its `error` event comes later, after the handler below is attached.
  starting.set(repo, pressedAt);
  // A window that will not open is one line on the daemon's stderr; the page has
  // already been answered, and the latch is released so the user can press Start again.
  child.on('error', (err) => {
    if (starting.get(repo) === pressedAt) starting.delete(repo);
    console.error(`[deck] could not start a session in ${repo}:`, err.message);
  });
}
