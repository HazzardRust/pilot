#!/usr/bin/env node
/**
 * The global `pilot` command.
 *
 * The harness keeps each version of the plugin in its own directory, so a command
 * linked to one of them keeps running that version after `claude plugin update`. This
 * file is the one thing the install copies out of the plugin, into a directory that no
 * update moves, and all it does is ask Claude Code where the plugin is now and hand
 * over to that version's `bin/pilot.mjs`. Keep it that small: a copy is only as current
 * as the install that wrote it, so everything that changes belongs in `bin/pilot.mjs`.
 *
 * `PILOT_PLUGIN_ROOT` names the plugin directory outright, for tests and for running a
 * clone by hand.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PLUGIN_ID = 'pilot@pilot';
// Long enough for a cold start of `claude`, short enough that a hung one says so.
const CLAUDE_TIMEOUT_MS = 30_000;

/** The JSON array in what `claude` printed, past any notice it printed around it. */
function pluginsIn(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end < start) throw new Error('claude plugin list --json did not print a list of plugins');
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    throw new Error(`claude plugin list --json did not print JSON: ${stdout.trim().slice(0, 200)}`);
  }
}

/** Where the installed plugin is, asked of `claude plugin list --json` each time. */
export function pluginRoot(env = process.env) {
  if (env.PILOT_PLUGIN_ROOT) return env.PILOT_PLUGIN_ROOT;

  // A shell, because `claude` is an .exe on some machines and an npm .cmd on others.
  const listed = spawnSync('claude plugin list --json', {
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
    env,
    timeout: CLAUDE_TIMEOUT_MS,
  });
  if (listed.error?.code === 'ETIMEDOUT') {
    throw new Error(`claude plugin list --json gave no answer in ${CLAUDE_TIMEOUT_MS / 1000}s`);
  }
  if (listed.error || listed.status !== 0) {
    const said = (listed.stderr || listed.error?.message || '').trim();
    throw new Error(`could not ask Claude Code where the plugin is (claude plugin list --json): ${said}`);
  }
  const plugins = pluginsIn(listed.stdout);
  const entry = Array.isArray(plugins) ? plugins.find((plugin) => plugin.id === PLUGIN_ID) : undefined;
  if (!entry?.installPath) {
    throw new Error(`the pilot plugin is not installed. Install it with: claude plugin install ${PLUGIN_ID}`);
  }
  return entry.installPath;
}

async function main() {
  const root = pluginRoot();
  const { run } = await import(pathToFileURL(path.join(root, 'bin', 'pilot.mjs')).href);
  await run(process.argv.slice(2));
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  // `exitCode`, not `exit()`: an exit straight after the write can drop the message on
  // Windows when stderr is a pipe, and the message is the whole point here.
  main().catch((err) => {
    console.error('pilot:', err.message);
    process.exitCode = 1;
  });
}
