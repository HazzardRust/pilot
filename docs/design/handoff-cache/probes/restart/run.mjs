/**
 * handoff-cache S4 probe runner (L3, A5). One scratch headless session per run, never the live session and never
 * the real config: a temp repository, no MCP servers, and this directory as the only plugin. The login is an
 * input, never a file it reads or copies: PROBE_CONFIG_DIR, a scratch config dir the user has logged into, or else
 * ANTHROPIC_API_KEY with an empty temp config dir; with neither it stops before it spawns claude.
 *
 *   node run.mjs --mode <clear|compact|compact-keep-head|branch> [--model sonnet] [--runs 1] [--lines 1000]
 *
 * The driver sends two turns, a short opening and then a filler of --lines numbered lines, so the head a kept-head
 * compact keeps is the session's opening, as a hand-off's would be, not its bulk; the mod restarts after the
 * second and submits the pickup prompt. One JSON line per run on stdout:
 *   {mode, version, date, result, detail, contextAfter, firstTurn: {input, cacheRead, cacheWrite}, pickupRan, ...}
 * result: works (resolved, the PICKED turn's usage read, the context cut below the one before, and for the kept
 * head the hook fired), refused (threw), absent (no such call or command), unmeasured (anything short of works).
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// The platform seam: the one place a platform is read, and the one tree-kill (taskkill /T /F on win32).
const { isWindows, killTree } = createRequire(import.meta.url)('../../../../../hooks/lib/platform.js');

const PLUGIN = path.dirname(fileURLToPath(import.meta.url));
const MODES = ['clear', 'compact', 'compact-keep-head', 'branch'];
const WAIT_MS = 240_000;

function args(argv) {
  const out = { model: 'sonnet', runs: 1, lines: 1000 };
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  out.runs = Number(out.runs);
  out.lines = Number(out.lines);
  if (!MODES.includes(out.mode) || !(out.runs >= 1) || !(out.lines >= 1)) {
    throw new Error(`usage: node run.mjs --mode <${MODES.join('|')}> [--model sonnet] [--runs 1] [--lines 1000]`);
  }
  return out;
}

/** The login's config dir: PROBE_CONFIG_DIR if it exists, else null when no ANTHROPIC_API_KEY stands in for it. */
function loginConfig() {
  const dir = process.env.PROBE_CONFIG_DIR;
  // The real config dir is never a scratch one: the probe must not run on, or write into, the user's own home.
  if (dir && touchesRealHome(dir)) throw new Error(`PROBE_CONFIG_DIR ${dir} is, is inside, or contains the real ~/.claude: refusing to run on the real home`);
  if (dir) return fs.existsSync(dir) ? dir : null;
  return process.env.ANTHROPIC_API_KEY ? '' : null;
}

/** A path as the filesystem sees it: symlinks resolved when it exists, case folded on win32. */
function canon(p) {
  let r = path.resolve(p);
  try { r = fs.realpathSync.native(r); } catch { /* not there yet: the resolved spelling stands */ }
  return isWindows() ? r.toLowerCase() : r;
}

function within(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True when dir equals, lies inside, or contains ~/.claude, in any case or symlink spelling. */
export function touchesRealHome(dir, home = path.join(os.homedir(), '.claude')) {
  const d = canon(dir);
  const h = canon(home);
  return within(h, d) || within(d, h);
}

/** Ends the child, and on win32 its whole tree (the mod's `node io.mjs` children too). */
export function endChild(child) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  try { killTree(child.pid); } catch (err) { process.stderr.write(`run.mjs: could not end pid ${child.pid}: ${err.message}\n`); }
}

function filler(lines) {
  const rows = [];
  for (let i = 1; i <= lines; i += 1) {
    rows.push(`Line ${String(i).padStart(4, '0')}: ledger entry ${i * 7919 % 10007} filed under shelf ${i % 37}, box ${i % 11}, tagged amber-${i % 5}.`);
  }
  return rows.join('\n');
}

function userLine(text) {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`;
}

/** The scratch session's environment: this session's CLAUDE* variables dropped, the scratch config dir set. */
function scratchEnv(config, mode, logFile) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^CLAUDE/i.test(key)) env[key] = value;
  return { ...env, CLAUDE_CONFIG_DIR: config, PROBE_MODE: mode, PROBE_LOG: logFile };
}

function readLog(file) {
  if (!fs.existsSync(file)) return [];
  // A line io.mjs is still appending is skipped, not thrown out of the poll's timer.
  return fs.readFileSync(file, 'utf8').split('\n').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

function textOf(event) {
  const content = event?.message?.content;
  return Array.isArray(content) ? content.filter((c) => c.type === 'text').map((c) => c.text).join('') : '';
}

function usageRow(usage) {
  if (!usage) return null;
  return {
    input: usage.input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * works needs the pickup turn's own usage (the PICKED reply), a context cut below the one before the call, and
 * for the kept head the hook to have fired; a resolved call short of any of them is unmeasured.
 */
function classify(restart, firstTurn, cut, hook, mode) {
  if (!restart || restart.result === 'no mode') return 'unmeasured';
  if (restart.result === 'threw') {
    return /no command named|is not a function|undefined is not|cannot read prop/i.test(restart.error) ? 'absent' : 'refused';
  }
  if (!firstTurn || (mode !== 'branch' && !cut) || (mode === 'compact-keep-head' && hook === null)) return 'unmeasured';
  return 'works';
}

function total(usage) {
  return usage ? usage.input + usage.cacheRead + usage.cacheWrite : null;
}

export async function once(opts, version, login) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restartprobe-'));
  const repo = path.join(tmp, 'repo');
  const config = login || path.join(tmp, 'config');
  const logFile = path.join(tmp, 'mod.log');
  fs.mkdirSync(repo);
  if (!login) fs.mkdirSync(config);
  let child = null;
  const cleanup = () => {
    if (child) endChild(child);
    // win32 releases a killed child's log handles a beat late: retry, and never let a failed removal replace the run's row.
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (err) {
      process.stderr.write(`run.mjs: could not remove ${tmp}: ${err.message}\n`);
    }
  };
  const onSignal = () => { cleanup(); process.exit(130); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await run(opts, version, login, { tmp, repo, config, logFile }, (c) => { child = c; });
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    cleanup();
  }
}

async function run(opts, version, login, { tmp, repo, config, logFile }, hold) {
  const started = Date.now();
  const events = [];
  let spawnError = null;
  const child = spawn('claude', [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', opts.model, '--plugin-dir', PLUGIN, '--strict-mcp-config', '--debug-file', path.join(tmp, 'debug.log'),
  ], { cwd: repo, env: scratchEnv(config, opts.mode, logFile), stdio: ['pipe', 'pipe', 'pipe'] });
  hold(child);
  child.stdin.on('error', () => {}); // EPIPE from an early exit: the close handler records the exit.
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const exited = new Promise((resolve) => {
    child.on('close', resolve);
    child.on('error', (err) => { spawnError = String(err.message); resolve(null); });
  });
  let buffer = '';
  let results = 0;
  const done = new Promise((resolve) => {
    let timer = null;
    let poll = null;
    const finish = () => { clearTimeout(timer); clearInterval(poll); resolve(); };
    timer = setTimeout(finish, WAIT_MS);
    // A submit that threw, or no mode, means no pickup turn is coming.
    poll = setInterval(() => {
      if (readLog(logFile).some((r) => (r.ev === 'submit' && r.result === 'threw') || r.result === 'no mode')) finish();
    }, 2000);
    child.on('close', finish);
    child.on('error', finish);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        events.push(event);
        if (event.type === 'result') {
          results += 1;
          if (results === 1) child.stdin.write(userLine(`${filler(opts.lines)}\n\nRead the lines above. Reply with OK2 and nothing else.`));
        }
        // No driver turn asks for PICKED, so it marks the pickup whatever order the result events take.
        if (event.type === 'assistant' && /PICKED/.test(textOf(event))) finish();
      }
    });
  });
  child.stdin.write(userLine('This is the opening of a probe session. Reply with OK1 and nothing else.'));
  await done;
  // Let the mod's last log land, then end the session the way a closed stdin does.
  await new Promise((r) => setTimeout(r, 3000));
  child.stdin.end();
  // SIGTERM after 30 s, SIGKILL after 40 s, and stop waiting on close at 50 s: a held pipe cannot hang the run.
  const killer = setTimeout(() => child.kill(), 30_000);
  const hardKiller = setTimeout(() => child.kill('SIGKILL'), 40_000);
  let giveUp = null;
  const code = await Promise.race([exited, new Promise((r) => { giveUp = setTimeout(() => r('unclosed'), 50_000); })]);
  clearTimeout(killer);
  clearTimeout(hardKiller);
  clearTimeout(giveUp);

  const log = readLog(logFile);
  const restart = log.find((r) => r.ev === 'restart') ?? null;
  const submit = log.find((r) => r.ev === 'submit') ?? null;
  const hook = log.find((r) => r.ev === 'compact-hook') ?? null;
  const secondResult = events.findIndex((e, i) => e.type === 'result' && events.slice(0, i).some((p) => p.type === 'result'));
  const after = secondResult >= 0 ? events.slice(secondResult + 1) : [];
  const pickupEvent = events.find((e) => e.type === 'assistant' && /PICKED/.test(textOf(e))) ?? null;
  const firstTurn = usageRow(pickupEvent?.message?.usage);
  const driverTurns = log.filter((r) => r.ev === 'turn' && !r.restarted).map((r) => usageRow(r.usage) ?? r.usage);
  const contextBefore = total(driverTurns[1] ?? null);
  const contextAfter = total(firstTurn);
  const cut = contextAfter !== null && contextBefore !== null && contextAfter < contextBefore;
  const modTurnAfter = log.find((r) => r.ev === 'turn' && r.submitted) ?? null;
  return {
    mode: opts.mode,
    version,
    date: new Date(started).toISOString(),
    result: classify(restart, firstTurn, cut, hook, opts.mode),
    detail: restart,
    submit,
    compactHook: hook,
    contextBefore,
    contextAfter,
    cut,
    firstTurn,
    modUsageAfter: modTurnAfter?.usage ?? null,
    pickupRan: pickupEvent !== null,
    driverTurns,
    spawnError: spawnError ?? undefined,
    afterEvents: after.map((e) => (e.type === 'system' ? `system:${e.subtype}` : e.type)),
    exit: code,
    seconds: Math.round((Date.now() - started) / 1000),
    stderr: stderr.trim().slice(-400) || undefined,
    scratch: 'removed',
  };
}

if (process.argv[1] && canon(process.argv[1]) === canon(fileURLToPath(import.meta.url))) {
  const opts = args(process.argv.slice(2));
  let login;
  try { login = loginConfig(); } catch (err) {
    process.stderr.write(`run.mjs: ${err.message}\n`);
    process.exit(2);
  }
  if (login === null) {
    process.stderr.write('run.mjs: no login: set PROBE_CONFIG_DIR to an existing scratch config dir (not ~/.claude) you logged into, or ANTHROPIC_API_KEY\n');
    process.exit(2);
  }
  const version = (spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 15_000 }).stdout ?? '').trim() || 'unknown';
  for (let i = 0; i < opts.runs; i += 1) process.stdout.write(`${JSON.stringify(await once(opts, version, login))}\n`);
}
