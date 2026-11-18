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
 * What the Start adds for the session it opens (L4's last column): the plugin enabled through
 * `--settings`, which never touches user settings; below `everything` also the status lines, the
 * rules root as an extra directory, and the variable that makes Claude Code read its rules (A3).
 * The pilot is also the session's own `agent` setting because `--agent` alone does not survive `/bg`: a
 * backgrounded session keeps `--settings` only, and a `/clear` there falls back to the setting (2026-09-28).
 */
export function runSettings(level, pluginRoot = PLUGIN_ROOT, { home } = {}) {
  const settings = { agent: 'pilot:pilot', enabledPlugins: { [PLUGIN_ID]: true } };
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
export function startArgs(reach, { settingsFile, home } = {}) {
  const file = settingsFile ?? startSettingsFile(home);
  const { settings, addDirs } = runSettings(reach.level, PLUGIN_ROOT, { home });
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
