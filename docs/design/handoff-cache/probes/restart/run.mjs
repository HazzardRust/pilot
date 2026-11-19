/**
 * handoff-cache S4 probe runner (L3, A5). One scratch headless session per run, never the live session and never
 * the real config: a temp repository, a temp CLAUDE_CONFIG_DIR holding only a copy of the login (removed after
 * the run), no MCP servers, and this directory as the only plugin.
 *
 *   node run.mjs --mode <clear|compact|compact-keep-head|branch> [--model sonnet] [--runs 1] [--lines 1000]
 *
 * The driver sends two turns, a short opening and then a filler of --lines numbered lines, so the head a kept-head
 * compact keeps is the session's opening, as a hand-off's would be, not its bulk; the mod restarts after the
 * second and submits the pickup prompt. One JSON line per run on stdout:
 *   {mode, version, date, result, detail, contextAfter, firstTurn: {input, cacheRead, cacheWrite}, pickupRan, ...}
 * result: works (resolved, the PICKED turn's usage read, the context cut below the one before, and for the kept
 * head the hook fired), refused (threw), absent (no such call or command), unmeasured (anything short of works).
 *
 * The login copy is removed after each run and on SIGINT/SIGTERM. A run long enough for the CLI to refresh the
 * OAuth token would rotate it inside the copy; each run here lasts about 12 s, well inside a token's life.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** The scratch session's environment: this session's CLAUDE* variables dropped, the temp config dir set. */
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

async function once(opts, version) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restartprobe-'));
  const repo = path.join(tmp, 'repo');
  const config = path.join(tmp, 'config');
  const logFile = path.join(tmp, 'mod.log');
  fs.mkdirSync(repo);
  fs.mkdirSync(config);
  const login = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), '.credentials.json');
  const loginCopy = path.join(config, '.credentials.json');
  if (fs.existsSync(login)) fs.copyFileSync(login, loginCopy);
  const dropLogin = () => fs.rmSync(loginCopy, { force: true });
  const onSignal = () => { dropLogin(); process.exit(130); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const started = Date.now();
  const events = [];
  let spawnError = null;
  try {
    const child = spawn('claude', [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--model', opts.model, '--plugin-dir', PLUGIN, '--strict-mcp-config', '--debug-file', path.join(tmp, 'debug.log'),
    ], { cwd: repo, env: scratchEnv(config, opts.mode, logFile), stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {}); // EPIPE from an early exit: the close handler records it, the finally drops the login.
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const exited = new Promise((resolve) => {
      child.on('close', resolve);
      child.on('error', (err) => { spawnError = String(err.message); resolve(null); });
    });
    let buffer = '';
    let results = 0;
    const done = new Promise((resolve) => {
      const timer = setTimeout(resolve, WAIT_MS);
      // A submit that threw, or no mode, means no pickup turn is coming.
      const poll = setInterval(() => {
        if (readLog(logFile).some((r) => (r.ev === 'submit' && r.result === 'threw') || r.result === 'no mode')) finish();
      }, 2000);
      const finish = () => { clearTimeout(timer); clearInterval(poll); resolve(); };
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
    const killer = setTimeout(() => child.kill(), 30_000);
    const code = await exited;
    clearTimeout(killer);

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
      scratch: tmp,
    };
  } finally {
    dropLogin();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

const opts = args(process.argv.slice(2));
const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim();
for (let i = 0; i < opts.runs; i += 1) process.stdout.write(`${JSON.stringify(await once(opts, version))}\n`);
