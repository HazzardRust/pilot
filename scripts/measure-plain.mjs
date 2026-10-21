#!/usr/bin/env node
/**
 * Measures what of the pilot a plain `claude` session carries (plain-session S7, spec 6).
 * It starts `claude -p hi --output-format stream-json --verbose` under a given HOME and reads
 * what Claude Code says it loaded, not what the files on disk weigh (L8): the init event and
 * the hook_started events are printed before authentication, so no login is needed.
 *
 *   tools       init `tools` naming pilot (the plugin's MCP tools)
 *   agents      init `agents` naming pilot
 *   skills      init `skills` naming pilot
 *   mcp         init `mcp_servers` naming pilot
 *   hooks       hook_started events, when init `plugins` holds the pilot (0 otherwise)
 *   rules       shipped copies in <home>/.claude/rules with no `paths:`, the ones loaded at start
 *   statusLine  1 when <home>/.claude/settings.json's statusLine is the pilot's
 *   excerpt     1 when <home>/.claude/CLAUDE.md carries the excerpt's `## Pilot` heading
 *
 *   node scripts/measure-plain.mjs --home <dir> [--cwd <dir>] [--json]
 *
 * USERPROFILE, HOME and CLAUDE_CONFIG_DIR are all pointed at <dir> (L10), and inherited
 * credentials are dropped. A home, cwd or config dir under the real home, or holding it, is
 * refused with exit 2 before anything starts: the real home is read from the account, not the
 * environment, so a moved USERPROFILE cannot hide it. Exit 0 when every row is 0, 1 when any
 * is not or no init event came back.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_LEDGER, filesUnder } from './build-rules-ledger.mjs';
import { isScoped, isShippedCopy } from './install-rules.mjs';
import { STATUSLINE_SCRIPT, ownCommandPath } from './install-settings.mjs';
import { claudeBin, isWindows, pathKey } from '../hooks/lib/platform.js';

export const ROWS = ['tools', 'agents', 'skills', 'mcp', 'hooks', 'rules', 'statusLine', 'excerpt'];
// `pilot:<agent|skill>`, `plugin:pilot:<server>`, `mcp__plugin_pilot_<server>__<tool>`.
const NAMES_PILOT = /^(pilot:|plugin:pilot:|mcp__plugin_pilot_)/;
const EXCERPT_MARKER = /^## Pilot\s*$/m;
// An inherited credential or cloud provider would turn the probe into a billable session.
// A deny-list, not an allow-list, so the binary keeps what it needs to run.
const AUTH_ENV = /^(ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN$|CLAUDE_CODE_USE_|AWS_|GOOGLE_|AZURE_)/i;

const naming = (list) =>
  (Array.isArray(list) ? list : []).filter((entry) => NAMES_PILOT.test(typeof entry === 'string' ? entry : entry?.name ?? '')).length;

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function parseFile(file, text) {
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    throw new Error(`${file} is not JSON: ${error.message}`);
  }
}

// Only a shipped copy with no `paths:` costs a session at start; a scoped one loads on a match.
function alwaysOnRules(rulesDir) {
  if (!fs.existsSync(rulesDir)) return 0;
  const ledger = parseFile(RULES_LEDGER, fs.readFileSync(RULES_LEDGER, 'utf8'));
  return filesUnder(rulesDir).filter((file) => {
    const at = path.join(rulesDir, file);
    return isShippedCopy(ledger, at, file) && !isScoped(at);
  }).length;
}

function pilotStatusLine(settingsFile) {
  const text = readOrNull(settingsFile);
  if (text === null) return 0;
  return ownCommandPath(parseFile(settingsFile, text)?.statusLine?.command, STATUSLINE_SCRIPT, '') ? 1 : 0;
}

// A hook event does not name its plugin, so hooks count only when the pilot plugin loaded
// (`pilot@pilot`, or `pilot@inline` from --plugin-dir); beside it, another plugin's hook counts too.
const pilotLoaded = (init) => (Array.isArray(init.plugins) ? init.plugins : []).some((plugin) => plugin?.name === 'pilot' || /^pilot@/.test(plugin?.source ?? ''));

/** Counts the pilot entries in a session's stream-json events and in its HOME. */
export function pilotFootprint({ events, home }) {
  const init = events.find((event) => event?.type === 'system' && event.subtype === 'init');
  if (!init) throw new Error('no init event: Claude Code did not report what it loaded');
  const claudeDir = path.join(home, '.claude');
  return {
    tools: naming(init.tools),
    agents: naming(init.agents),
    skills: naming(init.skills),
    mcp: naming(init.mcp_servers),
    hooks: pilotLoaded(init) ? events.filter((event) => event?.type === 'system' && event.subtype === 'hook_started').length : 0,
    rules: alwaysOnRules(path.join(claudeDir, 'rules')),
    statusLine: pilotStatusLine(path.join(claudeDir, 'settings.json')),
    excerpt: EXCERPT_MARKER.test(readOrNull(path.join(claudeDir, 'CLAUDE.md')) ?? '') ? 1 : 0,
  };
}

// The deepest existing ancestor keyed through its links, with the missing tail put back:
// a not-yet-made leaf under a junction into the real home is still under the real home.
function canonical(dir) {
  let head = path.resolve(dir);
  const tail = [];
  while (!fs.existsSync(head) && path.dirname(head) !== head) {
    tail.unshift(path.basename(head));
    head = path.dirname(head);
  }
  const key = path.join(pathKey(head), ...tail);
  return isWindows() ? key.toLowerCase() : key;
}

/** True when `dir` is `root` or sits inside it. */
export function isUnder(dir, root) {
  const rel = path.relative(canonical(root), canonical(dir));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

export function parseArgs(argv) {
  const options = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--home' || arg === '--cwd') {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} needs a directory`);
      options[arg.slice(2)] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.home) throw new Error('--home <dir> is required');
  return options;
}

/** The child's environment: `env` less its credentials, with every home moved to `home` (L10). */
export function childEnv(env, home) {
  const kept = Object.fromEntries(Object.entries(env).filter(([key]) => !AUTH_ENV.test(key)));
  return { ...kept, USERPROFILE: home, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') };
}

function runClaude(home, cwd) {
  const env = childEnv(process.env, home);
  // An absolute path from PATH: a bare name would let Windows run a claude.exe sitting in cwd.
  const bin = claudeBin(env);
  if (!bin) throw new Error('no claude on PATH');
  const run = spawnSync(bin, ['-p', 'hi', '--output-format', 'stream-json', '--verbose'], {
    cwd, env, input: '', encoding: 'utf8', timeout: 180_000, maxBuffer: 1 << 26, windowsHide: true,
  });
  if (run.error) throw new Error(`could not run claude: ${run.error.message}`);
  if (run.signal) throw new Error(`claude was stopped by ${run.signal} before it finished`);
  // No login exits non-zero after the init event; the events, not the status, are the answer.
  return run.stdout.split(/\r?\n/).filter((line) => line.trim().startsWith('{')).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`claude printed a line that is not JSON: ${line.slice(0, 80)}`);
    }
  });
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`measure-plain: ${error.message}`);
    return 2;
  }
  const home = path.resolve(options.home);
  const cwd = path.resolve(options.cwd ?? options.home);
  const realHome = os.userInfo().homedir;
  for (const [name, dir] of [['home', home], ['cwd', cwd], ['config dir', path.join(home, '.claude')]]) {
    // A UNC path is refused unopened: opening one can send NTLM credentials to its host.
    if (/^[\\/]{2}/.test(dir) || isUnder(dir, realHome) || isUnder(realHome, dir)) {
      console.error(`measure-plain: refusing a ${name} on the network, under or holding the real home (${realHome}): ${dir}`);
      return 2;
    }
  }
  fs.mkdirSync(cwd, { recursive: true });
  let footprint;
  try {
    footprint = pilotFootprint({ events: runClaude(home, cwd), home });
  } catch (error) {
    console.error(`measure-plain: ${error.message}`);
    return 1;
  }
  if (options.json) console.log(JSON.stringify(footprint));
  else for (const row of ROWS) console.log(`${row.padEnd(11)} ${footprint[row]}`);
  return ROWS.every((row) => footprint[row] === 0) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
