/**
 * What a pilot session starts with: its settings, its arguments and its environment.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { unstrippedEnv } from '../scripts/pilot-branch.mjs';
import { PLUGIN_ID, rulesPlan, rulesRoot } from '../scripts/reach.mjs';
import { statusLineSetting, subagentStatusLineSetting } from '../scripts/install-settings.mjs';

/** The plugin this file ships in, whose status line the run settings name. */
const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * The pilot lines: what the auto-mode classifier is told about the pilot's environment, appended
 * after `"$defaults"` (classifier-env L2). Constant prose naming no path, repo or branch, so nothing
 * read from disk or a repository reaches the classifier (L3, L4, A1); context only, no rule (A2).
 */
export const CLASSIFIER_ENVIRONMENT = Object.freeze([
  '**Trusted repo (pilot)**: This session runs the pilot, which works on one repository across several git worktrees of it. ' +
    'Besides the repository the session started in and its remotes, the trusted repo includes each git worktree of that same repository, ' +
    'which the pilot creates beside it as directories named `<repo>-*`, for example `<repo>-feat-<slug>` and `<repo>-design-<slug>`, ' +
    'where `<repo>` is the name of the directory the session started in. ' +
    'A `<repo>-*` directory is trusted only once the transcript shows it is a worktree of that repository: ' +
    'a `git worktree add` run from the trusted repo that created it, or a `git worktree list` run in the trusted repo that names it; ' +
    'a directory that matches the name alone, such as a separate clone, is not trusted, and trusting a worktree never declassifies a credential or secret inside it.',
  '**Build output (pilot)**: In a pilot worktree confirmed as above, the directories `node_modules`, `dist`, `build`, `target` and `coverage` directly at the worktree root ' +
    'are git-ignored build output, which a build or install regenerates, where the repository ignores them rather than tracks them; ' +
    'deleting one of them by its literal path, with any shell\'s recursive delete, loses no work. ' +
    'This covers nothing else: not a tracked or unconfirmed directory, not nested copies, not a path built from a variable, a glob or `..`, ' +
    'not other ignored files (`.env` files, secrets, local databases and local configuration stay protected even when git ignores them), ' +
    'and not uncommitted changes or anything outside such a worktree, all of which keep the default rules.',
]);

/** The off switch (A3): this variable set to `off` in the Start's environment omits the block. */
export const CLASSIFIER_SWITCH = 'PILOT_CLASSIFIER_ENV';

/**
 * What the Start adds for the session it opens (L4's last column): the plugin enabled through
 * `--settings`, which never touches user settings; below `everything` also the status lines, the
 * rules root as an extra directory, and the variable that makes Claude Code read its rules (A3).
 * The pilot is also the session's own `agent` setting because `--agent` alone does not survive `/bg`: a
 * backgrounded session keeps `--settings` only, and a `/clear` there falls back to the setting (2026-09-28).
 * Unless `env` switches it off, also the classifier's `autoMode.environment`: the defaults, then the
 * pilot lines (classifier-env L1, L2).
 */
export function runSettings(level, pluginRoot = PLUGIN_ROOT, { home, env = process.env } = {}) {
  const settings = { agent: 'pilot:pilot', enabledPlugins: { [PLUGIN_ID]: true } };
  if (env[CLASSIFIER_SWITCH] !== 'off') settings.autoMode = { environment: ['$defaults', ...CLASSIFIER_ENVIRONMENT] };
  if (rulesPlan(level).user) return { settings, addDirs: [], env: {} };
  return {
    settings: {
      ...settings,
      statusLine: statusLineSetting(pluginRoot),
      subagentStatusLine: subagentStatusLineSetting(pluginRoot),
    },
    addDirs: [rulesRoot({ home })],
    env: { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' },
  };
}

/** Where `startArgs` writes the run settings by default: one file, rewritten on every Start. */
export const startSettingsFile = (home = os.homedir()) => path.join(home, '.claude', 'pilot', 'start-settings.json');

/**
 * What the deck's Start (and `pilot start`) opens `claude` with: the run settings,
 * but in a file, because `cmd`'s `start` line cannot carry a JSON string intact (A9), and with no
 * prompt, so the pilot waits for the user (L12). Writes the file and answers the argv.
 * The file is written whole and renamed into place, so a session reading it never sees half.
 */
export function startArgs(reach, { settingsFile, home, env = process.env } = {}) {
  const file = settingsFile ?? startSettingsFile(home);
  const { settings, addDirs } = runSettings(reach.level, PLUGIN_ROOT, { home, env });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(partial, `${JSON.stringify(settings, null, 2)}\n`);
    fs.renameSync(partial, file);
  } finally {
    fs.rmSync(partial, { force: true });
  }
  return [...addDirs.flatMap((dir) => ['--add-dir', dir]), '--agent', 'pilot:pilot', '--settings', file];
}

/**
 * What every session the Start opens carries: Claude Code otherwise stops
 * background shells under memory pressure, the pilot's `pilot wait` among them,
 * and only the session's own environment can turn that off (Claude Code 2.1.284).
 */
const SESSION_ENV = { CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP: '1' };

/**
 * The environment every spawn path gives the session: `base` (the daemon's own, unstripped,
 * by default) and, below `everything`, the variable that has the rules root's rules read (A3).
 */
export function runEnv(reach, base = unstrippedEnv()) {
  return { ...base, ...SESSION_ENV, ...runSettings(reach.level, PLUGIN_ROOT).env };
}
