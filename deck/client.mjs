#!/usr/bin/env node
/**
 * The stdio MCP server Claude Code spawns, one per session. This is the half of the
 * deck that lives and dies with a session, and it deliberately owns no state: every
 * tool call is an HTTP request to the one daemon, which is the only process that
 * touches the store (L3). Nothing here imports `deck/store.mjs`, and a test asserts it,
 * because "the daemon is the only writer" is a property of what this file cannot do
 * rather than of what it chooses not to.
 *
 * A2 — who starts the deck. This file does, the first time it finds nobody answering
 * the port: it spawns `deck/daemon.mjs` detached, with no stdio and no console, and
 * then waits for the port to answer. The spawn is the fiddliest thing in the package on
 * Windows, and what makes it work is that the child is given nothing to be attached to:
 * `detached` puts it in its own process group, `stdio: 'ignore'` means the session's
 * pipes are not held open by it (a child inheriting them keeps the session's console
 * alive and dies with it), `windowsHide` keeps a console window from flashing up, and
 * `unref` takes it off this process's event loop so this process can exit while the
 * daemon carries on. Its cwd is the home directory, not the repository, so the daemon
 * cannot hold a directory handle that stops the repository being moved or deleted.
 *
 * Losing the race is not an error. Two sessions starting at once both spawn a daemon;
 * one binds the port and the other prints A4's message and exits. Both sessions then
 * find the same deck answering, which is the outcome either way.
 *
 * stdout belongs to the MCP protocol. Diagnostics go to stderr, never to stdout.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { bearer, secretFile } from '../hooks/lib/deck-secret.js';
import { handsTo, waiterKind } from './items.mjs';
import { startMemoryLog } from './memory.mjs';
import { oneLine } from './one-line.mjs';
import { probeDeck } from './probe.mjs';
import { isDeckDaemon, processTable } from './procs.mjs';
import { spawnRoot } from './spawn-root.mjs';
import { DEFAULT_WAIT_MS, MAX_POLL_MS, MAX_WAIT_MS, TOOLS, deckPort, deckUrl } from './tools.mjs';
import { PLUGIN_VERSION, isOlder } from './version.mjs';

/** The plugin root this module lives in; `spawnRoot` decides whether the deck spawns from it. */
const OWN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The default root lookup, run once per process: it can spend up to 30 s asking `claude`, and a join resolves up to three times. */
let ownSpawnRoot;
const resolveOnce = () => {
  ownSpawnRoot ??= (() => {
    try {
      return { root: spawnRoot({ ownRoot: OWN_ROOT, port: deckPort() }) };
    } catch (error) {
      return { error };
    }
  })();
  if (ownSpawnRoot.error) throw ownSpawnRoot.error;
  return ownSpawnRoot.root;
};

/** How long to give a daemon to come up before telling the session it did not. */
export const START_TIMEOUT_MS = 10_000;
const START_INTERVAL_MS = 100;

/**
 * Deadlines for the two fetches on the way to being on the deck. Neither is a long poll:
 * a health check asks a local process a trivial question, and a register follows a health
 * check that has just answered one. They had no deadline at all, and a socket that
 * accepts and then says nothing — a daemon whose event loop is wedged, some other
 * process holding the port — parks a `fetch` for ever. That used to be a session that
 * never started; now that a tool call is what waits on this work, it would be a tool
 * call that never answers, which is worse, because the agent has been handed a tool that
 * looks like it works.
 */
const HEALTH_TIMEOUT_MS = 1_000;
export const REGISTER_TIMEOUT_MS = 5_000;

/**
 * Where this session's cursors stand: the deck's sequence number when the session
 * registered, then the last reply each owner kind has been handed. They live in memory
 * on purpose — a cursor belongs to a session, and a session is exactly this process.
 *
 * One per owner kind (ADR 0041), because every agent of a session shares this process
 * and a wait hears only its kind's threads while its seq counts the whole deck: one
 * shared cursor would let QA's wait carry the pilot's past a reply it was never handed.
 */
let registeredAt = 0;
const cursors = new Map();
const cursorOf = (kind) => cursors.get(kind) ?? registeredAt;

/**
 * The replies past a kind's cursor that its `deck_read` has already handed over
 * (independence spec 22.3), by seq, so its `deck_wait` does not hand them over again. A
 * set rather than a cursor move, because a read is windowed and moving the cursor
 * would step over a reply outside the window; pruned as the cursor passes them.
 */
const handed = new Map();

function handedTo(kind) {
  if (!handed.has(kind)) handed.set(kind, new Set());
  return handed.get(kind);
}

function noteHanded(readText, kind) {
  for (const item of JSON.parse(readText)?.items ?? []) {
    // A read shows every thread but hands over only the reader's own (ADR 0041), and a short landing's
    // `deck` line to the pilot whoever owns the gate2 (three-lanes L7), as the wait does (`handsTo`).
    // A brief line's `replies` is a count, not the text (spec 2), so it hands nothing over.
    if (!Array.isArray(item?.replies)) continue;
    for (const reply of item.replies) {
      const ours = item.owner === kind || reply?.from === 'deck';
      if (ours && handsTo(reply, kind) && Number.isInteger(reply.seq) && reply.seq > cursorOf(kind)) {
        handedTo(kind).add(reply.seq);
      }
    }
  }
}

/**
 * Which run this session is, as the deck named it at registration. In memory for the
 * same reason the cursor is: it belongs to the session, not to the agent, which never
 * sees a run id and so could only invent one.
 */
let runId = null;

/**
 * And which repository it is open in, as the deck recorded it. Taken from the run
 * rather than read a second time from `process.cwd()`, so an item and the run whose
 * table it is joined against carry the very same string.
 */
let repo = null;

/**
 * Which session this process is, minted once at load and sent at every registration
 * (session-row A1), so a register retried after a client timeout is the run the first
 * one made rather than a fresh row.
 */
const SESSION_KEY = crypto.randomUUID();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The secret is read on every request (deck-token L6): the daemon may write it after this
// session starts, and a replaced file is a rotation. A missing one throws naming its path.
async function get(pathname, init = {}) {
  const response = await fetch(`${deckUrl()}${pathname}`, { ...init, headers: { ...init.headers, ...bearer() } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? `the deck answered ${response.status}`);
  return payload;
}

const post = (pathname, body, init = {}) =>
  get(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });

const probe = () => probeDeck(deckUrl(), { timeoutMs: HEALTH_TIMEOUT_MS });

/** Whether a deck is answering on the port right now. */
export async function isDeckUp() {
  return (await probe()).state === 'deck';
}

/**
 * Asks the deck to exit for a deck of `version`, the root's: the status and the deck's refusal, if any.
 * A deck from before the secret has no file to read and no guard to pass, so a missing file sends none.
 */
async function postExit(version) {
  const response = await fetch(`${deckUrl()}/api/exit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(fs.existsSync(secretFile()) ? bearer() : {}) },
    body: JSON.stringify({ version }),
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  const { error } = await response.json().catch(() => ({}));
  return { status: response.status, error };
}

/** Whether the table shows `pid` running a deck daemon: the one proof L4 takes before a kill. */
const runsTheDeck = (table, pid) => table().some((p) => p.pid === pid && isDeckDaemon(p));

/**
 * Replace a deck older than this plugin (daemon-lifecycle spec 4, 5; L3, L4, L11), and say
 * whether the port is now free for a deck of this version. A versioned deck is asked
 * through its own `POST /api/exit` and decides itself, so it is never killed: a refusal
 * (a landing running) is one stderr line and 'kept', and the next join asks again. A deck
 * from before that route reports no version and is stopped by pid, but only when the
 * process table shows that pid running `deck/daemon.mjs`; anything else is left alone.
 */
export async function replaceOlder(found, { version = PLUGIN_VERSION, post = postExit, table = processTable, kill = (pid) => process.kill(pid) } = {}) {
  const keep = (why) => {
    console.error(`[deck] the ${oneLine(found.version ?? 'unversioned', 120)} deck at ${deckUrl()} (pid ${found.pid}) is kept: ${oneLine(why, 120)}`);
    return 'kept';
  };
  if (found.version !== undefined) {
    let answer;
    try {
      answer = await post(version);
    } catch (err) {
      return keep(`the exit request failed (${err?.cause?.code ?? err?.message ?? err})`);
    }
    if (answer.status !== 202) return keep(answer.error ?? `the exit request was answered ${answer.status}`);
  } else {
    try {
      if (!runsTheDeck(table, found.pid)) return keep('the process table does not show that pid running deck/daemon.mjs');
      kill(found.pid);
    } catch (err) {
      return keep(`it could not be stopped (${err?.message ?? err})`);
    }
  }
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await probe()).state === 'none') return 'replaced';
    await sleep(START_INTERVAL_MS);
  }
  return keep(`it still held the port after ${START_TIMEOUT_MS}ms`);
}

/**
 * A deck, one way or another. Returns true if one is answering by the time it gives up
 * waiting. Never throws: a session whose deck could not be started is still a working
 * session, and each tool call says so in a way the agent can act on. A deck older than
 * this plugin is replaced first (L11); one that stays is used.
 *
 * The daemon spawned is `<root>/deck/daemon.mjs`, where `resolve` (`spawnRoot`) names the
 * root, and "older" is measured against that root's version (ADR 0165). `resolve` runs
 * only when no deck answers or the deck is older than this client, so a join to a current
 * deck never asks `claude`. A `resolve` that throws starts no deck (L3): one stderr line,
 * and the answer is whether a deck is answering anyway.
 */
export async function ensureDaemon({ resolve = resolveOnce, spawnProcess = spawn } = {}) {
  const found = await probe();
  if (found.state === 'deck' && !isOlder(found.version, PLUGIN_VERSION)) return true;

  let target;
  try {
    target = resolve();
  } catch (err) {
    console.error(`[deck] no deck started: ${oneLine(err?.message ?? String(err), 400)}`);
    return found.state === 'deck';
  }
  if (found.state === 'deck' && (!isOlder(found.version, target.version) || (await replaceOlder(found, { version: target.version })) === 'kept')) return true;

  const daemon = spawnProcess(process.execPath, [path.join(target.root, 'deck', 'daemon.mjs'), ...(target.args ?? [])], {
    cwd: os.homedir(),
    env: process.env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  // A spawn that fails asynchronously — no Node on the path any more, a permission the
  // session does not have — arrives as an `error` event, and an unhandled one of those
  // is an uncaught exception that takes the whole session's MCP server down with it.
  // The deck failing to start is not worth that: say so, and let the wait below run out
  // and report it the same way every other kind of not-starting is reported.
  daemon.on('error', (err) => console.error(`[deck] could not start the deck: ${oneLine(err.message, 400)}`));
  daemon.unref();

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(START_INTERVAL_MS);
    if (await isDeckUp()) return true;
  }

  console.error(`[deck] no deck answered ${deckUrl()} after ${START_TIMEOUT_MS}ms`);
  return false;
}

/**
 * Put this session on the deck as a run, and take the cursor it is given.
 *
 * The repository is this process's working directory, because Claude Code starts an
 * MCP server in the directory the session was opened in. `CLAUDE_PROJECT_DIR` looks
 * like the better answer and is not: the harness sets it for hooks, and where it is
 * set it is inherited by everything downstream, so a session launched from inside
 * another one would claim its parent's repository and two runs would collapse into one.
 *
 * `timeoutMs` is the deadline, an argument only so a test can watch this give up without
 * sitting out the real one.
 */
export async function registerSession(timeoutMs = REGISTER_TIMEOUT_MS) {
  const { run, seq } = await post(
    '/api/runs',
    { repo: process.cwd(), pid: process.pid, session: SESSION_KEY },
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  registeredAt = seq;
  cursors.clear();
  runId = run.id;
  repo = run.repo;
  return run;
}

/**
 * What the session knows and the agent does not: which run it is, and which repository
 * it is open in. Both are added on the way out rather than asked of the model. The third
 * of them — how far this session's cursor has moved — belongs to `waitForReply` below,
 * which is the only caller that may move it.
 */
function withSessionIdentity(name, args) {
  if (name === 'deck_status') return { ...args, run: runId };
  // Spread last, so an agent that invented a repository of its own is overruled
  // rather than believed. That holds for the tool surface the agent is given, and
  // it is worth being exact about where it stops: the daemon's HTTP port trusts
  // any loopback caller and takes `repo` as it is sent, so a process on this
  // machine posting to `/api/tool` by hand still chooses its own. That is the
  // same trust `deck_status` already places in `run`, and closing it would mean a
  // session token on every API call — a change to the boundary rather than to
  // this line.
  //
  // A session that never registered has none to add and the item is posted
  // without one: it is then in the queue but in nobody's `Yours`, which is the
  // safe direction to be wrong in.
  //
  // `run` is overruled like `repo`: the daemon stamps nothing from a run, so none is sent.
  if (name === 'deck_post') return { ...args, repo: repo === null ? undefined : repo, run: undefined };
  // Reading and waiting are the other way round: `repo` is a filter the agent may set,
  // and the session only says which run is asking when the agent did not. Being told
  // is what lets the deck record the hand-off against this run rather than against
  // whoever else is on the machine, and an agent that named a repository asked about
  // another run on purpose.
  if (name === 'deck_read' || name === 'deck_wait') {
    // A wait on its own run also names the run, which is what lets the daemon tell it
    // to stop listening (independence spec 20); a wait aimed elsewhere is never stopped.
    if (args?.repo !== undefined || repo === null) return args;
    return name === 'deck_wait' && runId !== null ? { ...args, repo, run: runId } : { ...args, repo };
  }
  return args;
}

/**
 * One wait, however long the agent asked to wait for.
 *
 * The daemon parks a single request for at most `MAX_POLL_MS`, because a socket held
 * open past `fetch`'s ceiling dies quietly in the middle. A human is not on that clock:
 * on 2026-09-16 a reply landed fourteen minutes after the question, four waits after the
 * session had given up and gone silent. So the cap belongs to the request and the
 * deadline belongs to the caller, and this is the loop between them — poll after poll
 * under the cap until a reply lands or the agent's own deadline passes. The agent makes
 * one call and never polls; that is the whole point, and the tool's description says so.
 *
 * `pollMs` is the per-request cap, an argument only so a test can watch the loop go
 * round without sitting out two real minutes to do it.
 *
 * `waitWindowMs` is the ceiling, and it has to be enforced here because there is nowhere
 * else left. It used to be the daemon's: `waitTimeout` refused anything above the cap,
 * and the cap was the whole wait. Now the daemon only ever sees one poll's worth, and a
 * tool's `inputSchema` is advice to the model rather than a guard between it and this
 * function — so a `timeout` of `Number.MAX_SAFE_INTEGER` would poll for a geological age
 * with nothing in its way.
 */
export function waitWindowMs(asked) {
  return Number.isInteger(asked) ? Math.min(asked, MAX_WAIT_MS) : DEFAULT_WAIT_MS;
}

export async function waitForReply(args, pollMs = MAX_POLL_MS, onEmptyPoll) {
  const deadline = Date.now() + waitWindowMs(args?.timeout);
  let polls = 0;
  // Whose answers this wait is about. The cursor belongs to this session, and the seq a
  // wait hands back counts the whole deck however narrow the question was — so a wait
  // the agent aimed at another run may not move it, or it would step over this
  // session's own replies, which were neither returned nor handed over. A repository
  // spelled differently from the one this session registered is treated as somebody
  // else's, which is the safe way round: a cursor that did not move costs a reply
  // being offered twice, and one that moved too far costs it altogether.
  const ours = args?.repo === undefined || args.repo === repo;
  // And whose cursor it moves: the kind the hook stamped. A kind that owns no thread is
  // refused by the daemon before any cursor is read back.
  const kind = waiterKind(args?.author);

  for (;;) {
    const left = deadline - Date.now();
    const result = await post('/api/tool', {
      name: 'deck_wait',
      arguments: withSessionIdentity('deck_wait', {
        ...args,
        since: cursorOf(kind),
        timeout: Math.max(1, Math.min(pollMs, left)),
      }),
    });
    // The daemon's "stop listening: <reason>" is the whole answer, not a page to poll past.
    if (result.content[0].text.startsWith('stop listening:')) return result;
    const payload = JSON.parse(result.content[0].text);

    // Only a wait may move the cursor. `deck_read` reports the deck's own seq, counted
    // over every item it holds, while the payload it returns is windowed to the newest
    // few — so a cursor taken from a read steps straight past any reply on an item
    // outside that window, and `deck_wait` then skips that reply for ever. A wait's seq
    // is the only one that means "everything up to here has actually been handed over".
    if (ours && Number.isInteger(payload?.seq)) cursors.set(kind, Math.max(cursorOf(kind), payload.seq));
    const mine = handedTo(kind);
    const replies = (payload?.replies ?? []).filter((reply) => !mine.has(reply.seq));
    for (const seq of mine) if (seq <= cursorOf(kind)) mine.delete(seq);

    // A page with nothing on it keeps the loop going, and that is the wanted behaviour
    // now that the daemon only hands back this run's replies: another run being answered
    // is not this session's wait ending, it is one poll that found nothing — with the
    // cursor already past it, so the next poll does not trip over it again.
    if (replies.length || Date.now() >= deadline) {
      if (replies.length === (payload?.replies?.length ?? 0)) return result;
      return { ...result, content: [{ type: 'text', text: JSON.stringify({ ...payload, replies }, null, 2) }] };
    }

    // Still here, and about to park for another `pollMs`. Say so: a harness that hears
    // nothing at all from a tool call takes it for a hung one and kills it. Deliberately
    // not awaited — the report is how this wait stays alive, so it may never be the
    // thing that holds it up, and nothing here depends on the delivery having landed.
    polls += 1;
    onEmptyPoll?.(polls);
  }
}

/**
 * This session's place on the deck: a daemon to talk to, and a run registered with it.
 *
 * It is one promise, made once, and every tool call awaits the same one. That is what
 * lets it be off the startup path, which is the point of it. `initialize` and the tool
 * table are answered out of this process — `TOOLS` is static — so nothing but a tool
 * call needs a daemon, and a bridge that would not answer the handshake until a daemon
 * had been polled for ten seconds is a bridge the harness has already given up on and
 * closed the pipe to. So the work happens beside the protocol rather than in front of
 * it, and a tool call is where the two meet.
 *
 * Memoised rather than guarded, because the second caller wants the first caller's
 * answer: two calls that each registered would put one session on the deck as two runs,
 * and the second would reset the cursor the first had already taken. It never rejects —
 * a session that could not be put on the deck is still a session that can post and read,
 * and all it loses is its row on the page — but it never does so quietly either. Only a
 * join is memoised: a failure is forgotten, so the next call tries again, and only the
 * first `JOIN_ATTEMPTS` tries may start a daemon (ADR 0120).
 */
export const JOIN_ATTEMPTS = 3;

let onTheDeck = null;
let starts = 0;

export function ensureOnTheDeck() {
  onTheDeck ??= (async () => {
    try {
      const mayStart = starts++ < JOIN_ATTEMPTS;
      if (await (mayStart ? ensureDaemon() : isDeckUp())) {
        await registerSession();
        return true;
      }
      if (!mayStart) console.error(`[deck] this session is not on the deck: no deck answered ${deckUrl()}`);
    } catch (err) {
      console.error('[deck] this session is not on the deck:', err.message);
    }
    onTheDeck = null;
    return false;
  })();
  return onTheDeck;
}

/** Nobody holds the port: the one failure a rejoin can mend. Any answer the deck gave is not this. */
const deckIsGone = (err) => err?.cause?.code === 'ECONNREFUSED';

/**
 * Forward one tool call to the deck. The daemon answers in the shape the agent expects,
 * so all this adds is what belongs to the session rather than to the agent: the deck
 * itself, waited for above, and the run `deck_status` names, on the way out. A wait is
 * the exception and goes to the loop above, which owns the cursor as well as the
 * deadline.
 *
 * `pollMs` and `onEmptyPoll` belong to that wait and are ignored by every other tool:
 * the first is the same per-request cap `waitForReply` documents as a test seam, and
 * the second is how a long wait tells the harness it is still alive. They are in the
 * same order as `waitForReply`'s, so the two signatures can be read against each other.
 *
 * A call nobody answered at the socket rejoins once and is tried once more; a second
 * failure is the tool error it always was, and an answer the deck gave is never retried.
 */
export async function callDeckTool(name, args, pollMs = MAX_POLL_MS, onEmptyPoll) {
  const joined = ensureOnTheDeck();
  await joined;
  try {
    return await forward(name, args, pollMs, onEmptyPoll);
  } catch (err) {
    if (!deckIsGone(err)) throw err;
    // Only the join this call saw fail is forgotten: calls refused together rejoin as one (spec 6).
    // `ensureOnTheDeck` then starts a deck under ADR 0120's cap and registers this session on it.
    if (onTheDeck === joined) onTheDeck = null;
    await ensureOnTheDeck();
    return forward(name, args, pollMs, onEmptyPoll);
  }
}

async function forward(name, args, pollMs, onEmptyPoll) {
  if (name === 'deck_wait') return waitForReply(args, pollMs, onEmptyPoll);
  const result = await post('/api/tool', { name, arguments: withSessionIdentity(name, args) ?? {} });
  const reader = name === 'deck_read' ? waiterKind(args?.author) : null;
  if (reader !== null && (args?.repo === undefined || args.repo === repo)) noteHanded(result.content[0].text, reader);
  return result;
}

/**
 * How this session says "still waiting" to whatever is driving it, and only when asked.
 *
 * A harness kills a tool call it has heard nothing from: Claude Code aborts after
 * `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, thirty minutes on a stdio server, saying the
 * tool "sent no response or progress". A wait measured in hours is exactly the tool
 * that trips it, and it did — a four-hour `deck_wait` died at 1800s — so the one call
 * the tool's own description promises was not possible as shipped.
 *
 * The progress token in a request's `_meta` is the caller asking for these; the MCP
 * spec forbids sending them unasked, so no token means no notification and a harness
 * that wants none is not written to. Claude Code 2.1.277 sends one on every tool call.
 */
function progressReporterFor(request, extra) {
  const progressToken = request?.params?._meta?.progressToken;
  if (progressToken === undefined || typeof extra?.sendNotification !== 'function') return undefined;
  return (progress) =>
    extra
      .sendNotification({ method: 'notifications/progress', params: { progressToken, progress } })
      // A harness that will not take progress is no reason to abandon the wait — but it
      // is worth saying once, because the symptom otherwise is a wait that dies at the
      // idle timeout with nothing anywhere explaining why it went unheard.
      .catch((err) => console.error('[deck] progress notification failed:', err.message));
}

export async function deckToolHandler(request, extra, pollMs = MAX_POLL_MS) {
  try {
    return await callDeckTool(
      request.params.name,
      request.params.arguments,
      pollMs,
      progressReporterFor(request, extra),
    );
  } catch (err) {
    // A refusal from the deck and a deck that is not there both come back as a tool
    // error the agent can read and act on, never as a transport failure that would
    // take the session's MCP connection down with it.
    console.error('[deck] tool call failed:', err.message);
    return { content: [{ type: 'text', text: err.message }], isError: true };
  }
}

export function createDeckClient() {
  const server = new Server({ name: 'deck', version: PLUGIN_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, deckToolHandler);

  return server;
}

async function main() {
  // The transport first, and nothing before it: every frame the harness sends, starting
  // with `initialize`, is answered out of this process. Then the deck, started beside the
  // protocol rather than in front of it — not awaited here, because nothing the harness
  // can ask for yet depends on it, and awaited by the first tool call, which does.
  await createDeckClient().connect(new StdioServerTransport());
  startMemoryLog('client');
  void (async () => {
    for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt += 1) if (await ensureOnTheDeck()) return;
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[deck] failed to start:', err);
    process.exit(1);
  });
}
