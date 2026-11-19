/**
 * The probes' shared L8 terms (S13): a scratch root per run in `os.tmpdir()`, a login copy in it that never leaves
 * it, the root's removal on every exit path, and a scan that counts what was left. The login is never printed,
 * logged or committed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REAL_CLAUDE = path.join(os.homedir(), '.claude');

/** The scratch roots of this process not yet removed. */
const live = new Set();

/** A new scratch root under `prefix`, removed by `scrubAll` on exit if the run does not remove it first. */
export function scratchRoot(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  live.add(tmp);
  return tmp;
}

/** Removes a scratch root, its login copy with it; never throws, so an exit loop over roots reaches every one. */
export function scrub(tmp) {
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
  } catch (err) {
    process.stderr.write(`probe: could not remove ${tmp}: ${err.code ?? err.message}\n`);
  }
  if (!fs.existsSync(tmp)) live.delete(tmp);
}

/** Every root this process still holds; an exit handler calls it once its sessions are ended. */
export function scrubAll() { for (const tmp of live) scrub(tmp); }

const mine = (prefix) => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(prefix));

/** Every scratch root an earlier runner left, a killed one included. */
export function sweep(prefix) { for (const name of mine(prefix)) scrub(path.join(os.tmpdir(), name)); }

/** The scratch roots under `prefix` still in `os.tmpdir()`, each a possible login copy. */
export function left(prefix) { return mine(prefix).length; }

/** Copies the login into `config`; refuses one close to expiry. Nothing of it is printed. */
export function copyLogin(config) {
  const copy = path.join(config, '.credentials.json');
  fs.copyFileSync(path.join(REAL_CLAUDE, '.credentials.json'), copy);
  let expires = null;
  try {
    expires = Number(JSON.parse(fs.readFileSync(copy, 'utf8'))?.claudeAiOauth?.expiresAt);
  } catch {
    // Unreadable: refused below like an expiring one.
  }
  if (!(expires > Date.now() + 45 * 60_000)) {
    fs.rmSync(copy, { force: true });
    throw new Error('the login expires within 45 minutes or has no expiry; refresh it in a live session first');
  }
}

/** This session's CLAUDE*, PILOT_* and ANTHROPIC* variables dropped, `vars` (the scratch config dir among them) set. */
export function scratchEnv(vars) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^(CLAUDE|PILOT_|ANTHROPIC)/i.test(key)) env[key] = value;
  return { ...env, ...vars };
}
