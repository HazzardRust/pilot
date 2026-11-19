#!/usr/bin/env node
/**
 * The crew probe's runner (handoff-cache S5): `node run.mjs --at before|during|after --runs <n> --model sonnet`.
 * Each run is one scratch headless session in a fresh temp repository, user settings and MCP servers skipped, with a
 * copy of this plugin as its only plugin (see ../crew.md), in a temp config dir holding a copy of the login (L8,
 * ../lib.mjs) that goes with the run's scratch root. Prints one JSON line per run, `{run, at, agentAlive,
 * agentId, sent, receivedByNewContext, endedBy, ...detail}`; `agentAlive` is listed after the clear and finished.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { copyLogin, left, scratchEnv, scratchRoot, scrub, scrubAll, sweep } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PREFIX = 'crew-probe-';
const SETTLE_MS = 25_000;
const TIMEOUT_MS = 480_000;
const POINTS = ['before', 'during', 'after'];

const slash = (p) => p.replaceAll('\\', '/');
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const live = new Set(); // the sessions still running
let handlersOn = false;

/**
 * Ends a spawned session for certain, and never throws: the whole tree on Windows (`child.kill()` ends no tree there),
 * SIGTERM then SIGKILL after `graceMs` elsewhere (the direct child only: this probe's host is Windows). A child that
 * already exited is left alone.
 */
export async function endChild(child, graceMs = 5_000) {
  const gone = () => child.exitCode !== null || child.signalCode !== null;
  if (gone() || child.pid === undefined) return;
  try {
    if (platform() === 'win32') {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
      return;
    }
    child.kill('SIGTERM');
    for (let waited = 0; waited < graceMs && !gone(); waited += 100) await sleep(100);
    if (!gone()) child.kill('SIGKILL');
  } catch { /* the child is already gone */ }
}

function onSignals() {
  if (handlersOn) return;
  handlersOn = true;
  // The sessions first, then the scratch roots and the login copies in them (L8).
  process.on('exit', scrubAll);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { Promise.all([...live].map((c) => endChild(c))).finally(() => process.exit(130)); });
  }
}

function agentPrompt(io, sig, token) {
  return [
    'You are a probe agent. Do exactly these steps, in order, and nothing else.',
    `1. Run the Bash command: node "${io}" wait "${sig}"`,
    '   It blocks until a signal and prints GO. If it prints NOT YET, run the same command again, until it prints GO.',
    `2. Send the main session a message with the SendMessage tool (load it with ToolSearch first if needed): to "main", message exactly: ${token}`,
    `3. Run the Bash command: node "${io}" sent "${sig}"`,
    `4. Run the Bash command: node "${io}" work "${sig}"`,
    `5. Run the Bash command: node "${io}" done "${sig}"`,
    '6. Reply DONE.',
  ].join('\n');
}

function mainPrompt(agent) {
  return [
    'This is a probe. Use the Agent tool exactly once, with run_in_background set to true and subagent_type',
    '"general-purpose", to start one background agent whose prompt is exactly the text between the markers.',
    'Then end your turn by replying with the single word SPAWNED. Do not wait for the agent.',
    'If a message from another agent reaches you later, reply only with `OLD-SAW <the message text>`. Use no other tools.',
    '<<<',
    agent,
    '>>>',
  ].join('\n');
}

/** The parsed lines of a JSON-lines text; a line still being written is skipped. */
const jsonLines = (text) => text.split('\n').filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});

function readLog(sig) {
  const file = join(sig, 'mod.jsonl');
  return existsSync(file) ? jsonLines(readFileSync(file, 'utf8')) : [];
}

/** The main session's text replies, a subagent's own events left out. */
function mainTexts(events) {
  return events
    .filter((ev) => ev.type === 'assistant' && !ev.parent_tool_use_id)
    .flatMap((ev) => ev.message?.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text);
}

/** `$.agent.list()`'s answer, whatever its shape, as ids; null for an error or an unknown shape. */
function listedIds(agents) {
  const list = Array.isArray(agents) ? agents : Array.isArray(agents?.agents) ? agents.agents : null;
  if (list === null) return null;
  return list.map((a) => (typeof a === 'string' ? a : a?.agentId ?? a?.id ?? JSON.stringify(a)));
}

function settled(sig, log) {
  const freshEnd = log.some((e) => e.ev === 'turn.complete' && e.agentId === null && e.phase === 'fresh');
  const last = log.at(-1)?.t ?? 0;
  return existsSync(join(sig, 'done')) && freshEnd && Date.now() - last > SETTLE_MS;
}

async function oneRun(run, at, model) {
  onSignals();
  const root = scratchRoot(PREFIX);
  const repo = join(root, 'repo');
  const sig = slash(join(root, 'sig'));
  const plugin = join(root, 'plugin');
  const config = join(root, 'config');
  for (const dir of [repo, sig, config]) mkdirSync(dir);
  copyLogin(config);
  spawnSync('git', ['init', '-q'], { cwd: repo });
  cpSync(HERE, plugin, { recursive: true, filter: (src) => !src.endsWith('run.mjs') });
  writeFileSync(join(plugin, 'hooks', 'config.mjs'),
    `export const config = ${JSON.stringify({ dir: sig, at })};\n`);
  const token = `CREW-${run}-${at}-${randomBytes(4).toString('hex')}`;
  const io = slash(join(plugin, 'hooks', 'probe-io.mjs'));

  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', model, '--plugin-dir', plugin, '--setting-sources', 'project', '--strict-mcp-config',
    // Only the probe's own io script, spelled as agentPrompt has the agent run it.
    '--allowedTools', `Bash(node "${io}" *)`, 'Agent', 'SendMessage', 'ToolSearch',
    '--max-budget-usd', '2', '--debug-file', join(root, 'debug.log'),
  ];
  const child = spawn('claude', args, { cwd: repo, env: scratchEnv({ CLAUDE_CONFIG_DIR: config }), stdio: ['pipe', 'pipe', 'pipe'] });
  live.add(child);
  let stdout = '';
  let exited = null;
  let failed = null;
  const start = Date.now();
  let endedBy = 'timeout';
  try {
    child.on('error', (err) => { failed = err; });
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { writeFileSync(join(root, 'stderr.log'), chunk, { flag: 'a' }); });
    child.on('exit', (code) => { exited = code; });
    child.stdin.write(`${JSON.stringify({
      type: 'user', message: { role: 'user', content: [{ type: 'text', text: mainPrompt(agentPrompt(io, sig, token)) }] },
    })}\n`);

    while (Date.now() - start < TIMEOUT_MS) {
      await sleep(1_000);
      if (failed !== null) { endedBy = `error ${failed.code ?? failed.message}`; break; }
      if (exited !== null) { endedBy = `exit ${exited}`; break; }
      if (settled(sig, readLog(sig))) { endedBy = 'settled'; break; }
    }
    child.stdin.end();
    for (let i = 0; i < 30 && exited === null && failed === null; i += 1) await sleep(1_000);
  } finally {
    await endChild(child);
    live.delete(child);
    await sleep(500); // taskkill returns before the handles are released
  }

  const events = jsonLines(stdout);
  const log = readLog(sig);
  const texts = mainTexts(events);
  const afterClear = log.find((e) => e.ev === 'agents-after-clear');
  const ids = listedIds(afterClear?.agents);
  const finished = existsSync(join(sig, 'done'));
  const sent = existsSync(join(sig, 'sent'));
  const listedAfterClear = ids === null ? null : ids.length > 0;
  scrub(root); // the row is read: the scratch root and the login copy in it go
  return {
    run,
    at,
    agentAlive: listedAfterClear === true && finished,
    agentId: ids?.[0] ?? null,
    sent,
    receivedByNewContext: texts.some((t) => t.includes('RECEIVED') && t.includes(token)),
    endedBy,
    listedAfterClear,
    finished,
    receivedByOldContext: texts.some((t) => t.includes('OLD-SAW') && t.includes(token)),
    cleared: log.some((e) => e.ev === 'clear-end'),
    tokenInStream: stdout.includes(token),
    costUsd: events.filter((ev) => ev.type === 'result').reduce((most, ev) => Math.max(most, ev.total_cost_usd ?? 0), 0),
    seconds: Math.round((Date.now() - start) / 1000),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: { at: { type: 'string' }, runs: { type: 'string', default: '1' }, model: { type: 'string', default: 'sonnet' } },
  });
  if (!POINTS.includes(values.at) || !(Number(values.runs) > 0)) {
    process.stderr.write('usage: node run.mjs --at before|during|after --runs <n> --model sonnet\n');
    process.exit(2);
  }
  sweep(PREFIX);
  for (let run = 1; run <= Number(values.runs); run += 1) {
    process.stdout.write(`${JSON.stringify(await oneRun(run, values.at, values.model))}\n`);
  }
  // On stderr, so stdout stays one JSON line per run.
  const n = left(PREFIX);
  process.stderr.write(`left: ${n}\n`);
  if (n > 0) process.exitCode = 1;
}
