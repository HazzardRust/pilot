/**
 * The shared Rune build (cheap-suite S3; spec 7, L5, A3): every worktree's gate builds the Rune deck's
 * `cargo test` into one target directory, `%LOCALAPPDATA%\pilot\rune-target`, instead of 13 GB of
 * `deck/rune/target` per worktree. Never under `~/.claude/pilot`, the deck's own store (L5).
 * `boundTarget` keeps it bounded: past `RUNE_TARGET_MAX` fingerprint units it is removed whole, which
 * costs the next gate one cold build (A3), instead of a size walk on every gate.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hostPlatform } from '../hooks/lib/platform.js';

/** A3: about 50 worktree builds' worth of fingerprint units before the shared target is wiped. */
export const RUNE_TARGET_MAX = 400;

/**
 * The shared target directory: `<LOCALAPPDATA>\pilot\rune-target` on Windows, `<XDG_CACHE_HOME or
 * ~/.cache>/pilot/rune-target` elsewhere. A variable that is unset or relative falls back to the home
 * directory, so the target never resolves against the checkout cargo runs in.
 */
export function runeTargetDir(env, platform = hostPlatform()) {
  const flavour = platform === 'win32' ? path.win32 : path.posix;
  const named = platform === 'win32' ? env.LOCALAPPDATA : env.XDG_CACHE_HOME;
  const base = named && flavour.isAbsolute(named) ? named : flavour.join(os.homedir(), ...(platform === 'win32' ? ['AppData', 'Local'] : ['.cache']));
  return flavour.join(base, 'pilot', 'rune-target');
}

/**
 * Counts the entries of `<dir>/debug/.fingerprint`, one per compiled unit; over `max`, removes `dir`
 * whole first. A missing directory is 0 units. A removal that fails throws, for the caller to name.
 */
export function boundTarget(dir, { max = RUNE_TARGET_MAX } = {}) {
  let units;
  try {
    units = fs.readdirSync(path.join(dir, 'debug', '.fingerprint')).length;
  } catch (err) {
    if (err.code === 'ENOENT') return { wiped: false, units: 0 };
    throw err;
  }
  if (units <= max) return { wiped: false, units };
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  return { wiped: true, units };
}

/**
 * Dates the crate's own sources `now` (`build.rs` and every file under `src/` and `tests/`), so cargo rebuilds
 * the crate from this worktree. Cargo judges a path package fresh by mtime and keys it relative to its
 * workspace, so in the shared target another worktree's later build of it reads as fresh here and its test
 * binary, compiled from that worktree's sources, is what runs. Dependencies stay shared. The count dated; a
 * file that cannot be dated throws, for the caller to name.
 */
export function staleRoot(crate, now = new Date()) {
  const files = [path.join(crate, 'build.rs')];
  for (const dir of ['src', 'tests']) {
    for (const entry of fs.readdirSync(path.join(crate, dir), { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) files.push(path.join(entry.parentPath, entry.name));
    }
  }
  for (const file of files) fs.utimesSync(file, now, now);
  return files.length;
}
