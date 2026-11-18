/**
 * `pilot live-root` — the one trusted folder live checks run in (never-stuck spec 12; A3).
 *
 *   pilot live-root              <root> trusted|untrusted
 *   pilot live-root --dir <name> <root> trusted|untrusted <root>/<name>
 *
 * The root is `~/.claude/pilot/live`. The user trusts it once by opening Claude Code there; Claude Code records that
 * as `projects[<path>].hasTrustDialogAccepted` in `~/.claude.json`, which this reads and never writes. A live check
 * runs in a plain subdirectory of the root: never a `git init` under it, since a nested repository prompts again.
 * Exit 1 on a bad name, with nothing made.
 */

import { lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { hostPlatform } from '../hooks/lib/platform.js';

/**
 * One path segment: no separator, no dot, so `--dir` can never leave the root; no leading `-`, read as a flag by a
 * later command; never a Windows device name, which makes a folder Explorer cannot delete.
 */
const DIR_NAME = /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$)[a-z0-9][a-z0-9-]{0,39}$/;

/** A project key as Claude Code may write it; on Windows either slash and any case name one folder. */
function keyOf(p, platform) {
  const trimmed = p.replace(/[\\/]+$/, '');
  return platform === 'win32' ? trimmed.replaceAll('\\', '/').toLowerCase() : trimmed;
}

/**
 * Whether `~/.claude.json` records the trust dialog accepted for exactly `root`; false when it cannot be read. Every
 * key naming the root must say `true`: one that does not reads untrusted, so a spelling never masks a refusal.
 */
function trustedIn(home, root, platform) {
  let projects;
  try {
    projects = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'))?.projects;
  } catch {
    return false;
  }
  if (!projects || typeof projects !== 'object') return false;
  const want = keyOf(root, platform);
  const named = Object.entries(projects).filter(([key]) => keyOf(key, platform) === want);
  return named.length > 0 && named.every(([, entry]) => entry?.hasTrustDialogAccepted === true);
}

/** The live root, its trust, and with `dir` a plain subdirectory made under it. Throws on a bad `dir`, having made nothing. */
export function liveRoot({ home = homedir(), dir, platform = hostPlatform() } = {}) {
  if (dir !== undefined && (typeof dir !== 'string' || !DIR_NAME.test(dir))) {
    throw new Error(`pilot live-root: --dir takes one name of a-z, 0-9 and -, at most 40 characters, not starting with - and not a device name, not ${JSON.stringify(dir)}`);
  }
  const root = path.join(home, '.claude', 'pilot', 'live');
  mkdirSync(root, { recursive: true });
  if (!lstatSync(root).isDirectory()) throw new Error(`pilot live-root: ${root} is not a plain directory`);
  const result = { root, trusted: trustedIn(home, root, platform) };
  if (dir === undefined) return result;
  const sub = path.join(root, dir);
  mkdirSync(sub, { recursive: true });
  // An existing link of that name would lead out of the root: refuse anything but a real directory.
  if (!lstatSync(sub).isDirectory()) throw new Error(`pilot live-root: ${sub} is not a plain directory`);
  return { ...result, path: sub };
}

/** `pilot live-root`'s entry point from `bin/pilot.mjs`. Answers the exit code. */
export function main(argv, { say = (text) => process.stdout.write(text), warn = (text) => process.stderr.write(text), home } = {}) {
  let dir;
  if (argv.length === 2 && argv[0] === '--dir') dir = argv[1];
  else if (argv.length) {
    warn('usage: pilot live-root [--dir <name>]\n');
    return 1;
  }
  try {
    const { root, trusted, path: sub } = liveRoot({ home, dir });
    say(`${root} ${trusted ? 'trusted' : 'untrusted'}${sub ? ` ${sub}` : ''}\n`);
    return 0;
  } catch (err) {
    warn(`${err.message}\n`);
    return 1;
  }
}
