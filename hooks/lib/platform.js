/**
 * The platform seam (mac-linux L1): the one place the package reads
 * `process.platform`, CommonJS so the hooks and the ESM deck both load it.
 *
 * `hostPlatform` reads `process.platform` on every call rather than once at load
 * (L2), so a test that stubs it, or passes `platform`, is answered as asked.
 *
 * `pathKey` is the one spelling of "the same directory" (L3): the canonical
 * path `fs.realpathSync.native` gives when the path exists, so `/tmp/x` and
 * `/private/tmp/x` on macOS, or a junction and its target on Windows, are one
 * key; `path.resolve` when it does not, or cannot be read. Case folds on win32
 * only: APFS is case-insensitive by default but not always, and a fold that is
 * wrong merges two repositories, which is worse than splitting one.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** The host's platform, read on each call (L2). */
function hostPlatform() {
  return process.platform;
}

/** Whether `platform`, the host's by default, is Windows. */
function isWindows(platform = hostPlatform()) {
  return platform === 'win32';
}

/** Two leading separators: a UNC or device path on Windows, never touched (see `addDeck`). */
const NETWORK = /^[\\/]{2}/;

/** Successful realpaths, so a filter over a large deck pays the ~190 us syscall once per path. A link retargeted mid-process keeps its old key; repository paths are not expected to change that way. */
const REAL = new Map();
const REAL_MAX = 1024;

/** `fs.realpathSync.native`, remembered on success only; a missing path is asked again. */
function cachedRealpath(resolved) {
  if (REAL.has(resolved)) return REAL.get(resolved);
  const real = fs.realpathSync.native(resolved);
  if (REAL.size >= REAL_MAX) REAL.clear();
  REAL.set(resolved, real);
  return real;
}

/** The key two paths share exactly when they name one directory (L3). */
function pathKey(p, opts = {}) {
  const platform = opts.platform || hostPlatform();
  const realpath = opts.realpath || cachedRealpath;
  const resolved = path.resolve(p);
  let key = resolved;
  // Opening a UNC path makes Windows reach the host over SMB, which can send NTLM
  // credentials to it and stall the caller, so it keys by its spelling. A mapped
  // drive letter is spelled locally and is still opened, as addDeck's stat opens it.
  if (!(isWindows(platform) && NETWORK.test(p))) {
    try {
      key = realpath(resolved);
    } catch {
      // Missing, or unreadable: a key is never refused, so it falls back to the spelling.
    }
  }
  return isWindows(platform) ? key.toLowerCase() : key;
}

/** The pids under `pid` in `table`, deepest first; `seen` stops a ppid cycle. */
const descendants = (table, pid, seen = new Set([pid])) =>
  table.filter((p) => p.ppid === pid && !seen.has(p.pid) && seen.add(p.pid)).flatMap((child) => [...descendants(table, child.pid, seen), child.pid]);

/**
 * Kill `pid` and everything it started (L4): `taskkill /T /F` on win32; off it, SIGKILL to the
 * process group `pid` leads when `group`, else to its descendants in `table` deepest first and
 * then `pid`. A pid already gone (ESRCH, or a taskkill failure after which `pid` is gone) is not
 * an error; any other error, EPERM among them, is thrown once the rest of the tree has been tried.
 */
function killTree(pid, opts = {}) {
  // 0 would signal the caller's own group, 1 is init, and -1 is every process it may signal.
  if (!Number.isInteger(pid) || pid < 2) throw new RangeError(`killTree: not a pid: ${pid}`);
  const platform = opts.platform || hostPlatform();
  if (isWindows(platform)) {
    const exec = opts.exec || execFileSync;
    try {
      return void exec('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'pipe', windowsHide: true, timeout: 10000 });
    } catch (err) {
      // taskkill exits 128 both for a pid that is gone and for one it was denied, so ask the pid.
      try {
        (opts.signal || process.kill)(pid, 0);
      } catch (probe) {
        if (probe?.code === 'ESRCH') return;
      }
      throw err;
    }
  }
  const signal = opts.signal || process.kill;
  let failure;
  // A table row that is not a pid to kill (not an integer, or init and below) is skipped, never signalled.
  const tree = descendants(opts.table || [], pid).filter((p) => Number.isInteger(p) && p >= 2);
  for (const target of opts.group ? [-pid] : [...tree, pid]) {
    try {
      signal(target, 'SIGKILL');
    } catch (err) {
      if (err?.code !== 'ESRCH') failure ??= err;
    }
  }
  if (failure) throw failure;
}

/** Whether `file` is a regular file (through a symlink) and, off win32, one this process may execute. */
function runnable(file, win) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (!win) fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false; // missing, a PATH entry that is a file, unreadable, or not executable: not this entry
  }
}

/**
 * `name` as an absolute path off an absolute entry of `env`'s PATH, null when none has it (spec 9).
 * A relative entry (`.`, `bin`, an empty one) resolves against the repository a session starts
 * in, so it is never walked, and the bare name is never the answer. On win32 an entry may be
 * quoted and the PATH key spelled in any case; off it the hit must also be executable, as the
 * shell's own lookup requires. `searchPathOnly` strips this process's PATH on Windows only.
 */
function onSearchPath(name, env = process.env, platform = hostPlatform()) {
  const win = isWindows(platform);
  const flavour = win ? path.win32 : path.posix;
  const key = (win && Object.keys(env).find((k) => k.toLowerCase() === 'path')) || 'PATH';
  for (const dir of String(env[key] ?? '').split(flavour.delimiter)) {
    const bare = win ? dir.replace(/^"(.*)"$/, '$1') : dir;
    if (!flavour.isAbsolute(bare)) continue;
    const file = win ? path.join(bare, name) : path.posix.join(bare, name);
    if (runnable(file, win)) return file;
  }
  return null;
}

/**
 * The `claude` a session starts, absolute or null (spec 9): `claude.exe` on win32, because ConPTY
 * resolves a name only with its extension, `claude` elsewhere. A caller never falls back to the
 * bare name, which the unstripped environment could find in the repository.
 */
function claudeBin(env = process.env, platform = hostPlatform()) {
  return onSearchPath(isWindows(platform) ? 'claude.exe' : 'claude', env, platform);
}

module.exports = { claudeBin, hostPlatform, isWindows, killTree, onSearchPath, pathKey };
