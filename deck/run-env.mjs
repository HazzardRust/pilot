/**
 * What `pilot run` starts the session with: its arguments and its environment.
 * Split from `run.mjs` to keep that file under the deck's 800-line bar
 * (`deck/test/facades.test.mjs`); `run.mjs` re-exports every name here.
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
 * What `pilot run` adds for its own process (L4's last column): the plugin enabled through
 * `--settings`, which never touches user settings; below `everything` also the status lines, the
 * rules root as an extra directory, and the variable that makes Claude Code read its rules (A3).
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

/**
 * What the pilot is started as, here and when the user types it by hand.
 *
 * `--agent` alone does not survive `/bg`: a backgrounded session keeps
 * `--settings` but not `--agent`, and runs as the `agent` setting or else the
 * built-in `claude`. It still shows the pilot, restored from the conversation it
 * resumed, but the `/clear` this wrapper types falls back to that default — a
 * plain session at 70K where the pilot starts at 36K (reproduced 2026-09-28).
 * The pilot as the session's own `agent` setting is what a `/clear` falls back
 * to, and it reaches no other session.
 */
export const RESUME_PROMPT = 'Resume the run on this deck if there is one; if there is nothing to resume, take the next red ticket and start it. Start listening to the deck now.';

/**
 * The prompt is the session's first turn, given on the command line rather than
 * typed: a pilot started with nothing to do waited for the user to say so while
 * a run sat open on its deck, an answered question unheard (2026-09-29). The
 * agent carries no `initialPrompt` of its own, so this is its whole first turn.
 *
 * With nothing to resume it names the next move too: a pilot told only to
 * resume listed the queue and asked which ticket to take (2026-10-04).
 *
 * The run settings enable the plugin for this process only, so a plugin installed disabled still
 * starts the whole crew here (plain-session L1). Below `everything` the rules root comes first:
 * `--add-dir` is variadic, and after the prompt it would take the prompt for a directory (A4).
 */
export function claudeArgs(reach, pluginRoot = PLUGIN_ROOT) {
  const { settings, addDirs } = runSettings(reach.level, pluginRoot);
  return [...addDirs.flatMap((dir) => ['--add-dir', dir]), '--agent', 'pilot:pilot', '--settings', JSON.stringify(settings), RESUME_PROMPT];
}

/** Where `startArgs` writes the run settings by default: one file, rewritten on every Start. */
export const startSettingsFile = (home = os.homedir()) => path.join(home, '.claude', 'pilot', 'start-settings.json');

/**
 * What the deck's Start (and `pilot start`) opens `claude` with: the same settings as `pilot run`,
 * but in a file, because `cmd`'s `start` line cannot carry a JSON string intact (A9), and with no
 * prompt, so the pilot waits for the user (L12). Writes the file and answers the argv.
 * The file is written whole and renamed into place, so a session reading it never sees half.
 */
export function startArgs(reach, { settingsFile, home } = {}) {
  const file = settingsFile ?? startSettingsFile(home);
  const { settings, addDirs } = runSettings(reach.level, PLUGIN_ROOT, { home });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(partial, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(partial, file);
  return [...addDirs.flatMap((dir) => ['--add-dir', dir]), '--agent', 'pilot:pilot', '--settings', file];
}

/**
 * What every session `pilot run` starts carries: Claude Code otherwise stops
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
