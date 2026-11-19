/**
 * `pilot update` (handoff-cache spec 11, 12; L6): update the plugin from a terminal, with no
 * Claude Code session open. It wraps the `claude plugin` CLI and has no downloader of its own:
 * `claude plugin marketplace update pilot`, then `claude plugin update pilot@pilot`, with the
 * installed version read from Claude Code's install record before and after. A live run (a deck
 * session with an open run record) refuses before any call, since its agents run from the cache
 * an update would replace.
 *
 * `claude` is started by its absolute path off PATH (`claudeBin`) with an argv and no shell, so no
 * word of a call is ever parsed by one.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { claudeBin } from '../hooks/lib/platform.js';

const PLUGIN_ID = 'pilot@pilot';
const CALLS = [
  ['plugin', 'marketplace', 'update', 'pilot'],
  ['plugin', 'update', PLUGIN_ID],
];
// A marketplace update is a git fetch: long enough for a slow one, short enough that a hung one says so.
const CLAUDE_TIMEOUT_MS = 120_000;

/** The installed version of pilot@pilot in `configDir`'s install record; throws naming what is missing. */
function installedVersion(configDir) {
  const file = path.join(configDir, 'plugins', 'installed_plugins.json');
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${PLUGIN_ID}'s install record ${file}: ${err.code ?? err.message}`);
  }
  const entries = record?.plugins?.[PLUGIN_ID];
  const list = Array.isArray(entries) ? entries : [];
  const entry = list.find((e) => e?.scope === 'user') ?? list[0];
  if (typeof entry?.version !== 'string' || !entry.version) {
    throw new Error(`${PLUGIN_ID} is not installed in ${file}. Install it with: claude plugin install ${PLUGIN_ID}`);
  }
  return entry.version;
}

/**
 * Read the version, refuse on a live run, run the two `claude plugin` calls, read the version again.
 * `run(argv)` answers `{ exitCode, stdout, stderr }`; a call that exits non-zero throws its stderr.
 */
export async function update({ run, home, deckLive, configDir = path.join(home, '.claude') }) {
  const before = installedVersion(configDir);
  if (deckLive) return { before, after: before, changed: false, refused: 'live run' };
  for (const argv of CALLS) {
    const { exitCode, stdout, stderr } = await run(argv);
    if (exitCode !== 0) {
      const said = (String(stderr).trim() || String(stdout).trim() || 'no output').split(/\r?\n/).slice(-3).join('\n');
      throw new Error(`claude ${argv.join(' ')} failed (exit ${exitCode}): ${said}`);
    }
  }
  const after = installedVersion(configDir);
  return { before, after, changed: after !== before };
}

/** The real runner: `claude` by absolute path, an argv, no shell, its output collected. */
export function runClaude(argv, { env = process.env } = {}) {
  const bin = claudeBin(env);
  if (!bin) return Promise.reject(new Error('claude is not on PATH'));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    // Our own timer, not spawn's `timeout`: a grandchild (git) holding the pipes would keep `close` from firing.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
      reject(new Error(`claude ${argv.join(' ')} gave no answer in ${CLAUDE_TIMEOUT_MS / 1000}s`));
    }, CLAUDE_TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`could not start ${bin}: ${err.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) reject(new Error(`claude ${argv.join(' ')} was stopped (${signal})`));
      else resolve({ exitCode: code, stdout, stderr });
    });
  });
}

/** Whether a deck session with an open run record is up: the store's pid-alive runs. */
async function anyLiveRun() {
  const { listLiveRuns } = await import('../deck/store-runs.mjs');
  return listLiveRuns().length > 0;
}

/**
 * `pilot update`: prints `pilot <before> -> <after>` or `pilot <v> is up to date`, exit 0; a live run
 * or a failed call is one stderr line, exit 1; any argument is the usage line, exit 2.
 */
export async function main(args = [], deps = {}) {
  const {
    stdout = (s) => process.stdout.write(s),
    stderr = (s) => process.stderr.write(s),
    env = process.env,
    run = (argv) => runClaude(argv, { env }),
    home = os.homedir(),
    configDir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'),
  } = deps;
  if (args.length) {
    stderr('usage: pilot update\n');
    return 2;
  }
  try {
    const deckLive = deps.deckLive ?? (await anyLiveRun());
    const result = await update({ run, home, deckLive, configDir });
    if (result.refused) {
      stderr(`pilot update: a live run is on the deck; pilot ${result.before} is left as it is. Update once the run has ended.\n`);
      return 1;
    }
    stdout(result.changed ? `pilot ${result.before} -> ${result.after}\n` : `pilot ${result.after} is up to date\n`);
    return 0;
  } catch (err) {
    stderr(`pilot update: ${err.message}\n`);
    return 1;
  }
}
