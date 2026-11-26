/**
 * The deck opens itself. "The deck is running" and "the deck is in front of you" are
 * different things, and only the second is any use when the pilot stops to ask a
 * question — so a session that registers a run while no page is watching gets a tab.
 *
 * ADR 0018 is why this lives in the daemon rather than in a `SessionStart` hook: a hook
 * fires for every Claude Code session on the machine, piloted or not, and has no way to
 * see whether a deck page is already open. The daemon can see it, so the daemon decides,
 * on `POST /api/runs` — the one request only a plugin-enabled session makes.
 *
 * Nothing here ever builds a shell string. The command is a per-platform constant, the
 * URL is the deck's own and arrives as one whole element of an argument array, and
 * `spawn` runs with no shell — so there is no command line for a URL to be parsed as.
 *
 * What it opens is the open file, never the URL (deck-token A2): the file forwards the browser
 * with the secret, so the key stays out of argv, which other users can read.
 */

import { spawn } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hostPlatform } from '../hooks/lib/platform.js';
import { openFile } from './launch.mjs';
import { findRune } from './rune-bin.mjs';
import { PLUGIN_VERSION } from './version.mjs';

// The release build's lookup is findRune's first step, so it lives beside it (prebuilt-rune).
export { runeBinary } from './rune-bin.mjs';

/** This package's root: the one place a Rune deck binary is looked for, never a path from the environment. */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A copy `launchCopy` made: the build's mtime in milliseconds, and `.exe` on Windows. */
const COPY_NAME = /^pilot-deck-(\d+)(\.exe)?$/;

/** What Windows says of a file a window still runs, or another open has just removed. */
const IN_USE = ['EBUSY', 'EPERM', 'EACCES', 'ENOENT'];

/**
 * The copy of `binary` the deck runs, made in `dir` once per build. Windows locks a running exe, so a
 * window started from `target/release` makes the next `cargo build --release` fail to replace it (A9);
 * a window started from a copy leaves the build free. Only making the copy can throw: older copies go
 * best effort, except one a window still runs, which Windows refuses to remove and a later open clears.
 */
export function launchCopy(binary, dir, fs = nodeFs) {
  const stamp = Math.trunc(fs.statSync(binary).mtimeMs);
  const copy = path.join(dir, `pilot-deck-${stamp}${path.extname(binary)}`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(copy)) {
    // Copied beside, then renamed, so an open racing a half-written copy never runs it.
    const part = `${copy}.${process.pid}.part`;
    try {
      fs.copyFileSync(binary, part);
      fs.renameSync(part, copy);
    } catch (err) {
      fs.rmSync(part, { force: true });
      // Another open renamed its copy of this build first, and may already run it.
      if (!fs.existsSync(copy)) throw err;
    }
  }
  try {
    for (const old of fs.readdirSync(dir)) {
      // Only older builds: a newer copy is another open's, made and not yet started.
      if (Number(COPY_NAME.exec(old)?.[1]) < stamp) removeCopy(path.join(dir, old), fs);
    }
  } catch (err) {
    console.error(`[deck] could not clear old copies in ${dir}:`, err.message);
  }
  return copy;
}

function removeCopy(file, fs) {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if (!IN_USE.includes(err.code)) console.error(`[deck] could not remove ${file}:`, err.message);
  }
}

/**
 * How long after trying to open a tab the deck refuses to try again. Two sessions
 * started back to back both register long before a cold browser has finished starting,
 * so "is a browser connected" on its own would give the second one a tab of its own —
 * which is the opposite of what "if it isn't already open" was asking for. Long enough
 * to cover a browser starting from nothing, short enough that a user who closes the tab
 * and starts another session a minute later gets it back.
 */
const REOPEN_GUARD_MS = 30_000;

/** When the opener was last started, or last refused to start. Zero until it has been. */
let lastTriedAt = 0;

/**
 * The command that opens a URL in whatever the platform calls the default browser, as a
 * command and an argument array. Separated from the starting of it because this is the
 * half worth pinning: it is provable for the two platforms this machine is not.
 *
 * On Windows the opener is `start`, which is not a program but a builtin of `cmd`, and
 * whose first argument is a window title — hence the empty string, so that a URL is
 * never taken for one.
 */
export function openerFor(platform, url, rune = null) {
  // The Rune deck finds its deck from the secret file and port itself, so it is started bare (rune-deck-ui A2).
  if (rune) return { command: rune, args: [] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

/**
 * The copy of `rune` under `<target>/run`, or `rune` itself when no copy can be made (a full disk): a
 * window that blocks the next build is still better than no window, and the line on stderr says why.
 */
export function runCopy(rune) {
  try {
    return launchCopy(rune, path.join(path.dirname(path.dirname(rune)), 'run'));
  } catch (err) {
    console.error(`[deck] could not copy ${rune}, opening it in place:`, err.message);
    return rune;
  }
}

/**
 * Open the deck: the Rune window where `rune` is built, the default browser otherwise; unless it has just been opened or
 * `PILOT_DECK_NO_OPEN` says not to. Returns whether the opener was started, which is not
 * the same as a tab appearing: the platform's opener answers to nobody once it is away.
 *
 * `spawnOpener` is a seam with exactly one purpose. The entire job of this function is
 * to start a process, and that must never happen while the suite is running — so the
 * tests hand it a recorder, and the daemon hands it nothing.
 */
export function openDeck(spawnOpener = spawn, platform = hostPlatform(), runeArg) {
  const off = process.env.PILOT_DECK_NO_OPEN;
  // Any value at all, not only `1`: the one reason to set this is to stop a browser
  // appearing, and `PILOT_DECK_NO_OPEN=0` is nobody's way of asking for one.
  if (off) return false;
  // A deck on a directory or port of its own is a scratch copy — a test, an agent's
  // preview, a second worktree — and never the one the user watches (one deck per
  // machine), so it opens nothing even when nobody set the flag above.
  if (process.env.PILOT_DECK_DIR || process.env.PILOT_DECK_PORT) return false;

  const now = Date.now();
  if (now - lastTriedAt < REOPEN_GUARD_MS) return false;
  lastTriedAt = now;

  // Looked up only when something will open: a built binary, else a fetched one that still matches its pin,
  // hashed here; never a download (prebuilt-rune A6). A test names its own, or null for none.
  const rune = runeArg === undefined ? findRune(PACKAGE_ROOT, { platform, arch: process.arch, version: PLUGIN_VERSION }).file : runeArg;
  const file = openFile();
  const { command, args } = openerFor(platform, file, rune && runCopy(rune));
  try {
    const child = spawnOpener(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    // A browser that will not start is worth one line on the daemon's stderr and nothing
    // more. The deck is serving either way, and the open file is a thing a human can open.
    child.on('error', (err) => console.error(`[deck] could not open ${file}:`, err.message));
    child.unref();
    return true;
  } catch (err) {
    console.error(`[deck] could not open ${file}:`, err.message);
    return false;
  }
}
