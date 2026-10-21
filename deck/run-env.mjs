/**
 * What `pilot run` starts the session with: its arguments and its environment.
 * Split from `run.mjs` to keep that file under the deck's 800-line bar
 * (`deck/test/facades.test.mjs`); `run.mjs` re-exports every name here.
 */

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
function runSettings(level, pluginRoot) {
  const settings = { agent: 'pilot:pilot', enabledPlugins: { [PLUGIN_ID]: true } };
  if (rulesPlan(level).user) return { settings, addDirs: [], env: {} };
  return {
    settings: {
      ...settings,
      statusLine: statusLineSetting(pluginRoot),
      subagentStatusLine: subagentStatusLineSetting(pluginRoot),
    },
    addDirs: [rulesRoot()],
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

/**
 * What every session `pilot run` starts carries: Claude Code otherwise stops
 * background shells under memory pressure, the pilot's `pilot wait` among them,
 * and only the session's own environment can turn that off (Claude Code 2.1.284).
 */
const SESSION_ENV = { CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP: '1' };

/** The environment both spawn paths give the session: below `everything`, the rules root's rules are read (A3). */
export function runEnv(reach) {
  return { ...unstrippedEnv(), ...SESSION_ENV, ...runSettings(reach.level, PLUGIN_ROOT).env };
}
