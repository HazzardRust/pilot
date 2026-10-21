/**
 * The reach (plain-session, L4, L5): how much of the pilot a plain `claude` session carries,
 * `nothing`, `rules` or `everything`. This module is the one reader of `reach.json` and the one
 * meaning of a level, for `pilot run`, the repair hooks, `pilot doctor` and `pilot reach`.
 *
 * Every path is under `os.homedir()` (or the `home` a test passes), never `storeDir()`, so a
 * scratch deck moves neither the stored reach nor the rules root.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The plugin `pilot run` enables for its own process (L1). */
export const PLUGIN_ID = 'pilot@pilot';

/**
 * L4: where the 113 shipped rules go at each level. `home` is `~/.claude/rules`, `root` the rules
 * root `pilot run` adds with `--add-dir`; `scoped` is the rules with `paths:`, `always` the two without.
 * `user` is whether user settings carry the plugin and the pilot's status lines.
 */
const PLANS = {
  nothing: { home: 'none', root: 'all', user: false },
  rules: { home: 'scoped', root: 'always', user: false },
  everything: { home: 'all', root: 'none', user: true },
};

/** What an install that never chose reads as (A2): nothing is taken away on upgrade. */
const NOT_CHOSEN = { level: 'everything', chosen: false };

const pilotDir = (home) => path.join(home, '.claude', 'pilot');

/** The stored reach. Absent, unreadable or not a level reads as `everything`, not chosen (A2). */
export function readReach({ home = os.homedir() } = {}) {
  try {
    const { level } = JSON.parse(fs.readFileSync(path.join(pilotDir(home), 'reach.json'), 'utf8'));
    return typeof level === 'string' && Object.hasOwn(PLANS, level) ? { level, chosen: true } : { ...NOT_CHOSEN };
  } catch {
    return { ...NOT_CHOSEN };
  }
}

/** The directory whose `.claude/rules` holds the rules `pilot run` loads below `everything`. */
export function rulesRoot({ home = os.homedir() } = {}) {
  return path.join(pilotDir(home), 'rules-root');
}

/** The rules directory inside the rules root, the second of the two places rules go. */
export function rootRules({ home = os.homedir() } = {}) {
  return path.join(rulesRoot({ home }), '.claude', 'rules');
}

/** L4's row for a level. An unknown level is a caller's bug, so it throws. */
export function rulesPlan(level) {
  if (typeof level !== 'string' || !Object.hasOwn(PLANS, level)) throw new TypeError(`unknown reach level: ${level}`);
  return { ...PLANS[level] };
}
