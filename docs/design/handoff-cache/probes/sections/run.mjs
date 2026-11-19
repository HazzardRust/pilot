/**
 * handoff-cache S2 probe runner (L3, L8, A5). One scratch headless pilot session per run, never the live session
 * and never the real config: a temp repository, a temp home (so the pilot's own SessionStart repairs write there),
 * a temp config dir holding a copy of the login, and a scratch deck on a free port. The pilot plugin (this
 * checkout) and this probe are the only plugins, and the session is the `pilot:pilot` agent, as `pilot start` opens.
 *
 *   node run.mjs --start cold|after-clear [--trim <a,b>|*] [--model sonnet] [--runs 1] [--first-turn]
 *
 * cold: the first API call of a fresh session is the measured turn. after-clear: the mod seeds a hand-off item on
 * the scratch deck after the first turn, clears, and submits the pickup prompt; that prompt's first API call is
 * the measured turn. --first-turn waits for the measured turn to end (or to call deck_status) and lists the deck
 * tools it called; the only runs allowed off sonnet. After the measured turn `/context` gives Claude Code's own
 * per-category estimate (`contextTable`), which the accounting in `sections.md` sums against the measured call.
 * One JSON line per run on stdout: names, bytes and hashes, never a section's text. Never run two at once: each
 * run starts by sweeping every scratch dir, a running one's included.
 *
 * The login (L8, the user's choice on itm_41847d20a6a6): `~/.claude/.credentials.json` is copied into the run's
 * temp config dir and deleted when the run ends, on an exception or a signal too, and every run starts by
 * deleting any copy an earlier, killed runner left. It is never printed, logged or committed. A login that
 * expires within 45 minutes is refused, so no scratch session refreshes, and so rotates, the user's token.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { copyLogin, left, scratchEnv, scratchRoot, scrub, scrubAll, sweep } from '../lib.mjs';

// The platform seam: the one place a platform is read, and the one tree-kill (taskkill /T /F on win32).
const { killTree } = createRequire(import.meta.url)('../../../../../hooks/lib/platform.js');

const PROBE = path.dirname(fileURLToPath(import.meta.url));
const PILOT = path.resolve(PROBE, '..', '..', '..', '..', '..');
const PREFIX = 'sectionsprobe-';
const STARTS = ['cold', 'after-clear'];
const WAIT_MS = 300_000;
const DECK_TOOLS = ['deck_status', 'deck_read', 'deck_post', 'deck_reply', 'deck_resolve', 'deck_ticket']
  .map((name) => `mcp__plugin_pilot_deck__${name}`);
const USAGE = 'usage: node run.mjs --start cold|after-clear [--trim <a,b>|*] [--model sonnet] [--runs 1] [--first-turn]';

function args(argv) {
  const out = { model: 'sonnet', runs: 1, trim: '', firstTurn: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--first-turn') out.firstTurn = true;
    else if (/^--(start|trim|model|runs)$/.test(argv[i]) && argv[i + 1] !== undefined) out[argv[i].slice(2)] = argv[(i += 1)];
    else throw new Error(USAGE);
  }
  out.runs = Number(out.runs);
  if (!STARTS.includes(out.start) || !(out.runs >= 1)) throw new Error(USAGE);
  // Slice S2's bar: sonnet everywhere but the first-turn checks, which run on the pilot's own model.
  if (out.model !== 'sonnet' && !out.firstTurn) throw new Error('only --first-turn runs may leave sonnet');
  return out;
}

// --- the login copy and its removal (L8, ../lib.mjs) ---

const children = new Set();

/** Registers a spawned session so every exit path ends it: its memory holds the token the login copy carries (L8). */
export function track(child) {
  children.add(child);
  child.once('close', () => children.delete(child));
  return child;
}

/** Ends each live session, and on win32 its whole tree, before the login copy goes. */
function endChild(child) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  try { killTree(child.pid); } catch (err) { process.stderr.write(`run.mjs: could not end pid ${child.pid}: ${err.message}\n`); }
}

// Off win32 killTree reaches the root only (the session is not spawned detached); the probe is run on win32.
function endChildren() { for (const child of children) endChild(child); }

// Every exit path (the signals and uncaughtException below end in process.exit) runs this: the sessions first, then the copies.
process.on('exit', () => { endChildren(); scrubAll(); });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(130));
process.on('uncaughtException', (err) => {
  process.stderr.write(`run.mjs: ${err?.message ?? err}\n`);
  process.exit(1);
});

// --- the scratch session ---

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function git(cwd, ...argv) {
  spawnSync('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', ...argv], { cwd, stdio: 'ignore' });
}

/**
 * The scratch tree: repo (a git repo with one commit), home, config, deck. The home is for the pilot's Node hooks,
 * whose SessionStart repairs would otherwise write the user's settings and rules; Claude Code itself still reads
 * the real `~/.claude/rules` (read-only), as a pilot start does.
 */
async function scratch() {
  const tmp = scratchRoot(PREFIX);
  const dirs = Object.fromEntries(['repo', 'home', 'config', 'deck'].map((name) => [name, path.join(tmp, name)]));
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dirs.repo, 'README.md'), '# probe\n');
  git(dirs.repo, 'init', '-q');
  git(dirs.repo, 'add', 'README.md');
  git(dirs.repo, 'commit', '-q', '-m', 'probe');
  copyLogin(dirs.config);
  return { tmp, ...dirs, port: await freePort(), log: path.join(tmp, 'mod.log') };
}

/** The shared scratch env with the scratch home, config, deck and probe set. */
function sessionEnv(s, opts) {
  return scratchEnv({
    HOME: s.home, USERPROFILE: s.home, CLAUDE_CONFIG_DIR: s.config,
    PILOT_DECK_DIR: s.deck, PILOT_DECK_PORT: String(s.port), PILOT_DECK_NO_OPEN: '1',
    PROBE_LOG: s.log, PROBE_START: opts.start, PROBE_TRIM: opts.trim, PROBE_REPO: s.repo, PROBE_PILOT_ROOT: PILOT,
  });
}

function readLog(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

const userLine = (text) => `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`;

function usageRow(usage) {
  if (!usage) return null;
  const row = { input: usage.input_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0 };
  return { ...row, total: row.input + row.cacheRead + row.cacheWrite };
}

const CONTEXT = /^## Context Usage/;

const textOf = (event) => (Array.isArray(event?.message?.content) ? event.message.content : [])
  .filter((c) => c.type === 'text').map((c) => c.text).join('');

/** `14.6k` -> 14600, `894` -> 894. */
const tokens = (cell) => Math.round(Number.parseFloat(cell) * (/k\s*$/.test(cell) ? 1000 : 1));

const COUNT = /^[\d.]+k?$/;

/**
 * `/context`'s own estimate as {name: tokens}, to its rounding: category rows (`name | tokens | share%`) by name,
 * the tool, agent and memory rows (`name | source | tokens`) as `name (source)`.
 */
function contextOf(text) {
  const rows = {};
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length !== 3) continue;
    if (/%$/.test(cells[2]) && COUNT.test(cells[1])) rows[cells[0]] = tokens(cells[1]);
    else if (COUNT.test(cells[2])) rows[`${cells[0]} (${cells[1]})`] = tokens(cells[2]);
  }
  return rows;
}

const toolUses = (event) => (Array.isArray(event?.message?.content) ? event.message.content : [])
  .filter((c) => c.type === 'tool_use').map((c) => c.name);

/** The phase's sections, first firing per name, with how often each fired and whether its hash moved. */
function sectionsOf(log, phase) {
  const byName = new Map();
  for (const r of log.filter((x) => x.ev === 'section' && x.phase === phase)) {
    const seen = byName.get(r.name);
    if (seen) {
      seen.fired += 1;
      if (seen.sha256 !== r.sha256) seen.changed = true;
    } else {
      byName.set(r.name, { name: r.name, bytes: r.bytes, sha256: r.sha256, trimmed: r.trimmed, span: r.span, fired: 1, changed: false });
    }
  }
  return [...byName.values()];
}

async function once(opts, version) {
  const s = await scratch();
  const started = Date.now();
  const measuredPhase = opts.start === 'cold' ? 'start' : 'after-clear';
  const events = [];
  let measured = null;
  let spawnError = null;
  const child = track(spawn('claude', [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', opts.model,
    '--plugin-dir', PILOT, '--plugin-dir', PROBE, '--agent', 'pilot:pilot', '--settings', JSON.stringify({ agent: 'pilot:pilot' }),
    '--allowedTools', DECK_TOOLS.join(','), '--debug-file', path.join(s.tmp, 'debug.log'),
  ], { cwd: s.repo, env: sessionEnv(s, opts), stdio: ['pipe', 'pipe', 'pipe'] }));
  child.stdin.on('error', () => {}); // EPIPE from an early exit: the close handler records the exit.
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const exited = new Promise((resolve) => {
    child.on('close', resolve);
    child.on('error', (err) => { spawnError = String(err.message); resolve(null); });
  });
  let results = 0;
  let contextTable = null;
  let contextRead = null;
  const tableRead = new Promise((resolve) => { contextRead = resolve; });
  child.on('close', () => contextRead());
  const done = new Promise((resolve) => {
    const timer = setTimeout(resolve, WAIT_MS);
    const finish = () => { clearTimeout(timer); resolve(); };
    child.on('close', finish);
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        events.push(event);
        // `/context` answers locally, with no API call: its table is kept and its events count as no turn.
        if (event.type === 'result' && CONTEXT.test(event.result ?? '')) {
          contextTable = contextOf(event.result);
          contextRead();
          continue;
        }
        if (event.type === 'assistant' && CONTEXT.test(textOf(event))) continue;
        if (event.type === 'result') results += 1;
        // The measured turn: cold, the session's first API call; after-clear, the first one after turn 1's result
        // (the queued `/clear` answers with a result of its own and no usage, so the count is not exact).
        const inMeasured = opts.start === 'cold' ? results === 0 : results >= 1;
        if (event.type === 'assistant' && inMeasured && usageRow(event.message?.usage)?.total > 0) {
          measured ??= { usage: usageRow(event.message.usage), tools: [], at: Date.now() };
          measured.tools.push(...toolUses(event));
          if (!opts.firstTurn || measured.tools.includes(DECK_TOOLS[0])) finish();
        }
        if (event.type === 'result' && measured && opts.firstTurn) finish();
      }
    });
  });
  child.stdin.write(userLine('Reply with OK and nothing else.'));
  await done;
  // `/context` only after the measured call, whose input it would otherwise join (about 2k tokens): it runs once
  // the measured turn ends, and its categories, all but Messages, are the ones that call was sent.
  child.stdin.write(userLine('/context'));
  await Promise.race([tableRead, new Promise((r) => setTimeout(r, 180_000))]);
  // Let the mod's last log land, then end the session the way a closed stdin does; SIGTERM, SIGKILL, give up.
  await new Promise((r) => setTimeout(r, 3000));
  child.stdin.end();
  // Both end the tree (the root's close would drop it from `children`, leaving its descendants to the run's end).
  const killer = setTimeout(() => endChild(child), 10_000);
  const hardKiller = setTimeout(() => endChild(child), 15_000);
  let giveUp = null;
  const code = await Promise.race([exited, new Promise((r) => { giveUp = setTimeout(() => r('unclosed'), 20_000); })]);
  clearTimeout(killer);
  clearTimeout(hardKiller);
  clearTimeout(giveUp);
  const log = readLog(s.log);
  const turn = log.find((r) => r.ev === 'turn' && r.phase === measuredPhase) ?? null;
  // The scratch deck's daemon leaves within one leash poll (2 s) of its client; the tree goes after it.
  await new Promise((r) => setTimeout(r, 4000));
  scrub(s.tmp);
  return {
    start: opts.start, trim: opts.trim || null, model: opts.model, version, date: new Date(started).toISOString(),
    firstTurn: measured?.usage ?? null,
    // The mod's `turn.complete` usage is the whole turn's, every API call of it summed; firstTurn is the first call.
    turnUsage: usageRow(turn?.usage) ?? null,
    deckTools: opts.firstTurn ? (measured?.tools ?? []).filter((t) => t.startsWith('mcp__plugin_pilot_deck__')) : undefined,
    deckStatus: opts.firstTurn ? (measured?.tools ?? []).includes(DECK_TOOLS[0]) : undefined,
    sections: sectionsOf(log, measuredPhase),
    context: log.filter((r) => r.ev === 'context' && r.phase === measuredPhase).map((r) => ({ blocks: r.blocks, instructionFiles: r.instructionFiles }))[0] ?? null,
    attachments: log.filter((r) => r.ev === 'attachment' && r.phase === measuredPhase).map(({ type, agentId, bytes, sha256, trimmed, span }) => ({ type, agentId, bytes, sha256, trimmed, span })),
    restart: log.filter((r) => ['seed', 'clear', 'submit', 'restart'].includes(r.ev)).map(({ at, ...r }) => r),
    contextTable,
    // after-clear: the same session's own start, the first column the clear is compared with.
    before: opts.start === 'cold' ? undefined : {
      sections: sectionsOf(log, 'start'),
      attachments: log.filter((r) => r.ev === 'attachment' && r.phase === 'start').map(({ type, bytes, sha256 }) => ({ type, bytes, sha256 })),
    },
    sectionKeys: log.find((r) => r.ev === 'section')?.keys ?? null,
    spawnError: spawnError ?? undefined,
    exit: code,
    seconds: Math.round((Date.now() - started) / 1000),
    stderr: stderr.trim().slice(-400) || undefined,
    scrubbed: !fs.existsSync(s.tmp),
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const opts = args(process.argv.slice(2));
  sweep(PREFIX);
  const version = (spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 15_000 }).stdout ?? '').trim() || 'unknown';
  for (let i = 0; i < opts.runs; i += 1) process.stdout.write(`${JSON.stringify(await once(opts, version))}\n`);
  // On stderr, so stdout stays one JSON line per run.
  const n = left(PREFIX);
  process.stderr.write(`left: ${n}\n`);
  if (n > 0) process.exitCode = 1;
}
