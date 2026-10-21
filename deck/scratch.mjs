/**
 * A scratch deck (audit-f1-f7 L6): an agent's own deck on its own port, its store a fresh dir
 * under the temp directory, spawned detached the way `ensureDaemon` spawns the real one. Not
 * `ensureDaemon` itself, which would reuse the user's deck on 4321. The registry file lets a
 * later `--stop` kill only a deck this module started (L7), never one found by a sweep.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bearer } from '../hooks/lib/deck-secret.js';
import { openFile } from './launch.mjs';
import { sessionPid } from './leash.mjs';
import { recordFields, recordTicket } from './runs.mjs';
import { DECK_HOST, DECK_PORT } from './tools.mjs';

const DAEMON = fileURLToPath(new URL('./daemon.mjs', import.meta.url));
const START_TIMEOUT_MS = 10_000;
const START_INTERVAL_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const registryFile = (pid) => path.join(os.tmpdir(), `pilot-scratch-${pid}.json`);

/** Binds `port` (0 for any) and lets it go: the port, or a rejection naming why it is not free. */
function freePort(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (err) =>
      reject(new Error(err.code === 'EADDRINUSE' ? `port ${port} is already held` : `port ${port}: ${err.message}`)),
    );
    probe.listen(port, DECK_HOST, () => {
      const { port: bound } = probe.address();
      probe.close(() => resolve(bound));
    });
  });
}

/** The pid `/api/health` reports at `url`, or null while nothing answers there. */
async function healthPid(url) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok ? (await response.json()).pid : null;
  } catch {
    return null;
  }
}

/** Kills `pid`, waits until it is gone (Windows holds its open log until then), and removes `dir`. */
async function end(pid, dir) {
  try {
    process.kill(pid);
    for (let tries = 0; tries < 50; tries += 1) {
      await sleep(START_INTERVAL_MS);
      process.kill(pid, 0);
    }
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Starts a scratch deck on `port` (any free one when unset) and, given `seedRun`, a run.json
 * path, shows that run on it. The record is read and checked before any deck starts, so a bad
 * one leaves nothing running (S8); a deck that started but could not be seeded is ended by L7's
 * own stop, or its pid is named in the error.
 */
export async function startScratch({ port, seedRun: file } = {}) {
  const record = file === undefined ? null : readRunRecord(file);
  const deck = await launch(port);
  if (record) {
    try {
      await seedRun(deck, record);
    } catch (err) {
      const left = await stopScratch(deck.pid).then(() => '', (stop) => `; pid ${deck.pid} still runs: ${stop.message}`);
      throw new Error(`${err.message}${left}`);
    }
  }
  return deck;
}

/**
 * The daemon's leash (spec 1): the session and the directory it was run in; outside a session,
 * the launcher's parent, such as the shell, because the launcher exits once the deck is up. A
 * parent of 0 or 1 means the launcher is already orphaned, so no `--leash`: the daemon then
 * holds its own parent, the launcher, and fails closed rather than leashing to init.
 */
export function leashArgs(env, ppid, cwd) {
  const owner = sessionPid(env) ?? (ppid > 1 ? ppid : null);
  return [...(owner === null ? [] : ['--leash', String(owner)]), '--leash-dir', cwd];
}

/** A `pilot deck --from` daemon's leash: none on DECK_PORT, the user's deck; elsewhere a scratch deck's, since it would hold the exited CLI. */
export const fromLeash = (port, env, ppid, cwd) => (port === DECK_PORT ? [] : leashArgs(env, ppid, cwd));

async function launch(port) {
  if (port === DECK_PORT) throw new Error(`port ${port} is the user's deck; a scratch deck never takes it`);
  const chosen = await freePort(port ?? 0);
  const url = `http://${DECK_HOST}:${chosen}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-scratch-'));

  const daemon = spawn(process.execPath, [DAEMON, ...leashArgs(process.env, process.ppid, process.cwd())], {
    cwd: os.tmpdir(),
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(chosen), PILOT_DECK_NO_OPEN: '1' },
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  let exited = null;
  daemon.on('error', (err) => (exited = err.message));
  daemon.on('exit', (code) => (exited = `it exited with code ${code}`));
  daemon.unref();

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (exited === null && Date.now() < deadline) {
    await sleep(START_INTERVAL_MS);
    // Up once it answers as our pid and has written its open file, which it does just after (deck-token A2).
    if ((await healthPid(url)) === daemon.pid && fs.existsSync(openFile(dir))) {
      const file = registryFile(daemon.pid);
      try {
        // Our daemon holds this pid now, so a file already there is a dead deck's: remove the path
        // itself (never a link's target), then write once with `wx` and 0o600, never through a
        // file another local user planted on a shared temp dir in between.
        fs.rmSync(file, { force: true });
        fs.writeFileSync(file, JSON.stringify({ pid: daemon.pid, port: chosen, dir }), { flag: 'wx', mode: 0o600 });
      } catch (err) {
        // Unregistered, `--stop` could never end it (L7): end it here instead.
        await end(daemon.pid, dir).catch(() => {});
        throw err;
      }
      return { url, pid: daemon.pid, dir, open: openFile(dir) };
    }
  }

  if (exited === null) daemon.kill();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  throw new Error(`no scratch deck answered ${url}: ${exited ?? `none after ${START_TIMEOUT_MS}ms`}`);
}

/**
 * Ends the scratch deck `pid` (L7): only when the registry names it and its health still reports
 * it, so a reused pid or the user's deck is refused and left alive. Then its dir and registry go.
 */
export async function stopScratch(pid) {
  const refused = new Error(`pid ${pid} is not a scratch deck`);
  let entry;
  try {
    // A regular file this user owns: a symlink or another user's file is a planted registry.
    const stat = fs.lstatSync(registryFile(pid));
    if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid())) throw refused;
    entry = JSON.parse(fs.readFileSync(registryFile(pid), 'utf8'));
  } catch {
    throw refused;
  }
  // Only a dir startScratch would have made: a planted registry must not aim the rm elsewhere.
  const ours =
    typeof entry?.dir === 'string' &&
    path.dirname(path.resolve(entry.dir)) === path.resolve(os.tmpdir()) &&
    path.basename(entry.dir).startsWith('pilot-scratch-');
  if (entry?.pid !== pid || !ours || Number(entry.port) === DECK_PORT) throw refused;
  if ((await healthPid(`http://${DECK_HOST}:${entry.port}`)) !== pid) throw refused;
  await end(pid, entry.dir);
  fs.rmSync(registryFile(pid), { force: true });
}

/** The run.json at `file`, held to `deck_status`'s own rule before any deck starts (S8). */
function readRunRecord(file) {
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new Error(`${file}: a run record is a JSON object`);
  if (recordFields(record) === null) throw new Error('slug: a run record names its slug');
  if (typeof record.worktree !== 'string') throw new Error('worktree: a run record names its worktree');
  return record;
}

/** A POST to the scratch deck at `url`, with the secret from its own `dir` (deck-token spec 4). */
async function post({ url, dir }, route, body) {
  const response = await fetch(`${url}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bearer(dir) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} answered ${response.status}: ${text}`);
  return JSON.parse(text);
}

/**
 * Shows `record` on the scratch deck at `url` through its HTTP API, never deck.json: the run
 * registers in the record's worktree under `pid` (the deck's own, so it stays live), then the
 * record goes in by `deck_status`. Every field but `worktree`, which would aim the deck's
 * run.json mirror at that checkout.
 */
async function seedRun(deck, record) {
  const { run } = await post(deck, '/api/runs', { repo: record.worktree, pid: deck.pid });
  const { worktree, ...fields } = record;
  await post(deck, '/api/tool', { name: 'deck_status', arguments: { ...fields, ticket: recordTicket(record), run: run.id } });
}
