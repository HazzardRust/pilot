/**
 * Slice 2: one deck daemon per machine, many runs, `deck_wait`.
 *
 * Three things are being proved here, and each has a shape of test to match.
 * The pure rules — what a run is, whether its session is still alive, how a
 * reply gets a sequence number — are unit tests against `runs.mjs` and
 * `store.mjs`. The daemon's surface — the page, the JSON API the stdio client
 * calls, the long poll — runs against a real HTTP server on an ephemeral port.
 * The claims that only exist between processes — a detached deck that outlives
 * the session that spawned it, two sessions putting two runs on one deck,
 * `pilot deck` — spawn real processes, because that is the only place those
 * claims are true or false.
 *
 * Every test takes its own store directory and its own port. Nothing here may
 * touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, freePort, tempDeck } from '../testUtils.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAEMON = path.join(ROOT, 'deck', 'daemon.mjs');
const CLIENT = path.join(ROOT, 'deck', 'client.mjs');
/** A repository on this host (L8): on POSIX `D:\work\alpha` is one relative name, so its run is not called `alpha`. */
const work = (name) => path.join(os.tmpdir(), 'work', name);
const CLI = path.join(ROOT, 'bin', 'pilot.mjs');

const { MAX_RUNS, isRunning, liveRuns, newRun } = await import('../runs.mjs');
const { START_TIMEOUT_MS, REGISTER_TIMEOUT_MS } = await import('../client.mjs');
const {
  DeckRefusal,
  MAX_TEXT_BYTES,
  addReply,
  currentSeq,
  listItems,
  listRuns,
  listStoredRuns,
  postItem,
  registerRun,
  repliesSince,
  resolveItem,
  setSlices,
  storeFile,
} = await import('../store.mjs');
const {
  DECK_HOST,
  DECK_PORT,
  DEFAULT_WAIT_MS,
  MAX_POLL_MS,
  MAX_READ_ITEMS,
  MAX_WAIT_MS,
  TOOLS,
  createDeckHttpServer,
  deckPort,
  deckUrl,
} = await import('../server.mjs');

// --- harness ---------------------------------------------------------------

const callApi = (base, name, args = {}, init = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body ?? JSON.stringify({ name, arguments: args }),
  });

const textOf = async (response) => {
  const result = await response.json();
  assert.equal(
    result.content?.[0]?.type,
    'text',
    `expected MCP text content, got ${JSON.stringify(result)}`,
  );
  return result.content[0].text;
};

const replyInBrowser = (base, id, text) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id, text }),
    redirect: 'manual',
  });

/** `fetch` refuses to set `Host`; `node:http` does not, which is what rebinding needs. */
const requestWithHost = (base, hostHeader, { path: urlPath = '/', method = 'GET', body = null } = {}) =>
  new Promise((resolve, reject) => {
    const headers = { host: hostHeader };
    if (body !== null) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
    }
    const request = http.request(
      { hostname: '127.0.0.1', port: new URL(base).port, path: urlPath, method, headers, setHost: false },
      (response) => {
        let text = '';
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, text }));
      },
    );
    request.on('error', reject);
    if (body !== null) request.write(body);
    request.end();
  });

/**
 * A process the test owns, killed and waited for when the test ends however it ends.
 * Both halves matter on Windows: a child that is merely signalled still holds its pipes
 * and its working directory for a moment afterwards, which is long enough to keep the
 * test runner's process alive and to make removing its directory fail with EPERM. Any
 * stdio nobody is reading is drained for the same reason — an unread pipe never closes.
 * Its stderr is kept as well as drained, so a failure can say what the child said.
 */
const stderrOf = new WeakMap();
function tracked(t, child) {
  for (const stream of [child.stdout, child.stderr]) stream?.resume();
  child.stderr?.on('data', (chunk) => stderrOf.set(child, heard(child) + chunk));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    if (child.exitCode === null && child.signalCode === null) await exited(child);
  });
  return child;
}

/** What a tracked child has written to stderr so far. */
const heard = (child) => stderrOf.get(child) ?? '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A session's join: the client's start and register deadlines, plus its own Node start. */
const SESSION_JOIN_MS = START_TIMEOUT_MS + REGISTER_TIMEOUT_MS + 5_000;

/** Retries a probe until it answers or the deadline passes, naming its last answer. Start-up, not polling. */
async function until(probe, { timeoutMs = SESSION_JOIN_MS, what = 'the thing' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
      last = String(value);
    } catch (err) {
      last = err?.message ?? String(err);
    }
    await sleep(50);
  }
  throw new Error(`${what} never happened within ${timeoutMs}ms: ${last}`);
}

const healthAt = async (port) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  return response.ok ? response.json() : null;
};

async function killDeckAt(port) {
  try {
    const health = await healthAt(port);
    if (health) process.kill(health.pid);
  } catch {
    /* it is already gone, which is what we wanted */
  }
}

/** A live process whose only job is to be a pid a run can point at. */
const sleeper = (t) =>
  tracked(t, spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }));

const exited = (child) => new Promise((resolve) => child.on('exit', resolve));

test("until names the probe's last answer, not a stale error", async () => {
  let calls = 0;
  const probe = async () => {
    if (calls++ === 0) throw new Error('fetch failed');
    return null;
  };
  await assert.rejects(until(probe, { timeoutMs: 300, what: 'the answer' }), /^Error: the answer never happened within 300ms: null$/);
});

test("a tracked child's stderr is kept for the failure message", async (t) => {
  const child = tracked(t, spawn(process.execPath, ['-e', "console.error('x')"], { stdio: ['ignore', 'pipe', 'pipe'] }));
  await new Promise((resolve) => child.on('close', resolve));
  assert.equal(heard(child).trim(), 'x');
});

// --- what a run is ---------------------------------------------------------

test('a run records the repository it is in, its short name and its session pid', () => {
  const run = newRun({ repo: path.join('D:', 'work', 'electrical-sales'), pid: 4242 });

  assert.match(run.id, /^run_[0-9a-f]{12}$/);
  assert.equal(run.name, 'electrical-sales', 'the page shows the short name, the title the whole path');
  assert.equal(run.pid, 4242);
  assert.match(run.startedAt, /^\d{4}-\d\d-\d\dT/);
});

test('a run is named for its folder, however the path ends', () => {
  const name = (repo) => newRun({ repo, pid: 1 }).name;

  assert.equal(name(path.join('D:', 'work', 'pilot') + path.sep), 'pilot', 'a trailing separator is not part of the name');
  assert.equal(name('/'), '/', 'a root has no folder name, so the whole path is the best name there is');
  assert.equal(name(os.homedir()), path.basename(os.homedir()), 'and an ordinary path is just its last segment');
});

test('a run needs a repository and a real pid', () => {
  assert.throws(() => newRun({ repo: '  ', pid: 1 }), /repo/);
  assert.throws(() => newRun({ repo: 'D:\\x', pid: 0 }), /pid/);
  assert.throws(() => newRun({ repo: 'D:\\x', pid: -1 }), /pid/);
  assert.throws(() => newRun({ repo: 'D:\\x', pid: 1.5 }), /pid/);
  assert.throws(() => newRun({ repo: 'D:\\x', pid: 'me' }), /pid/);
});

test('a session that has exited is not running, and this one is', async (t) => {
  assert.equal(isRunning(process.pid), true);

  const child = sleeper(t);
  await until(() => isRunning(child.pid), { what: 'the child becoming visible' });
  child.kill();
  await exited(child);

  assert.equal(isRunning(child.pid), false, 'a pid that has exited is not a live run');
});

test('liveRuns keeps the runs whose sessions are still up', async (t) => {
  const child = sleeper(t);
  const gone = newRun({ repo: 'D:\\gone', pid: child.pid });
  child.kill();
  await exited(child);

  assert.deepEqual(liveRuns([gone]), [], 'its session went away');
  assert.deepEqual(
    liveRuns([newRun({ repo: 'D:\\here', pid: process.pid }), gone]).map((run) => run.repo),
    ['D:\\here'],
  );
});

// --- the store holds the runs ----------------------------------------------

test('two sessions in two repositories both appear on one deck', (t) => {
  tempDeck(t);

  registerRun({ repo: work('alpha'), pid: process.pid });
  registerRun({ repo: work('beta'), pid: process.pid });

  assert.deepEqual(
    listRuns().map((run) => run.name),
    ['alpha', 'beta'],
    'one deck, both runs',
  );
});

test('a session re-registering replaces its run rather than doubling it', (t) => {
  tempDeck(t);

  registerRun({ repo: work('alpha'), pid: process.pid });
  registerRun({ repo: work('alpha'), pid: process.pid });

  assert.equal(listRuns().length, 1);
});

test('two sessions in one repository are two runs: a run is a session, not a folder', (t) => {
  tempDeck(t);
  const other = sleeper(t);

  registerRun({ repo: work('alpha'), pid: process.pid });
  registerRun({ repo: work('alpha'), pid: other.pid });

  assert.deepEqual(
    listRuns().map((run) => run.pid),
    [process.pid, other.pid],
    'the second session joins the deck; only the same pid in the same repo replaces a row',
  );
});

test('registering a run drops the runs whose sessions have gone', async (t) => {
  tempDeck(t);
  const child = sleeper(t);
  registerRun({ repo: work('closed'), pid: child.pid });
  child.kill();
  await exited(child);

  registerRun({ repo: work('open'), pid: process.pid });

  assert.deepEqual(
    listRuns().map((run) => run.name),
    ['open'],
    'a closed session is not kept on disk for ever',
  );
});

/**
 * Slice A2, D4. Registering prunes, and until now it pruned every dead record —
 * so any session starting anywhere on the machine wiped the record of a run that
 * had ended with a question still open, and the tab that question hangs on
 * silently reverted to the directory name. What is kept is now "live, or still
 * wanted": a dead record whose repository has an open thread stays, with its name
 * and its table, and one with nothing waiting still goes.
 */
test('a dead run whose repository still has an open item keeps its record (D4)', async (t) => {
  tempDeck(t);
  const child = sleeper(t);
  const kept = registerRun({ repo: work('kept'), pid: child.pid });
  registerRun({ repo: work('quiet'), pid: child.pid });
  setSlices(kept.id, [{ slice: '4 an ended run', state: 'doing' }], 'deck-run-tabs');
  postItem({ kind: 'question', title: 'Which element?', body: 'copper?', repo: work('kept') });
  child.kill();
  await exited(child);

  registerRun({ repo: work('open'), pid: process.pid });

  const stored = listStoredRuns();
  assert.deepEqual(
    stored.map((run) => run.name),
    ['kept', 'open'],
    'the ended run with an open thread survives; the ended one with nothing waiting does not',
  );
  assert.equal(stored[0].feature, 'deck-run-tabs', 'and it keeps the name the pilot gave it');
  assert.deepEqual(
    stored[0].slices.map((row) => row.slice),
    ['4 an ended run'],
    'and the last table it posted',
  );
  assert.deepEqual(
    listRuns().map((run) => run.name),
    ['open'],
    'listRuns is unchanged: it is the live runs, which is what /api/runs and /items promise',
  );
});

test('a dead run whose item has been resolved is dropped on the next registration (D4)', async (t) => {
  tempDeck(t);
  const child = sleeper(t);
  registerRun({ repo: work('kept'), pid: child.pid });
  const item = postItem({ kind: 'question', title: 'Which element?', body: 'copper?', repo: work('kept') });
  child.kill();
  await exited(child);
  resolveItem(item.id, 'copper');

  registerRun({ repo: work('open'), pid: process.pid });

  assert.deepEqual(
    listStoredRuns().map((run) => run.name),
    ['open'],
    'nothing is waiting on that run any more, so the deck stops holding its record',
  );
});

test('the deck keeps a bounded number of runs even if sessions leak', (t) => {
  tempDeck(t);

  for (let index = 0; index < MAX_RUNS + 5; index += 1) {
    registerRun({ repo: work(`repo-${index}`), pid: process.pid });
  }

  const runs = listRuns();
  assert.equal(runs.length, MAX_RUNS);
  assert.equal(runs.at(-1).name, `repo-${MAX_RUNS + 4}`, 'the newest survives, the oldest is dropped');
});

test('the bound still holds when every ended run has a thread keeping it (D4)', (t) => {
  tempDeck(t);
  // One pid, asked for once and certainly gone: the child has exited before
  // `spawnSync` returns, so every record written below is dead on arrival.
  const dead = spawnSync(process.execPath, ['-e', '0']).pid;

  for (let index = 0; index < MAX_RUNS + 5; index += 1) {
    const repo = work(`repo-${index}`);
    registerRun({ repo, pid: dead });
    postItem({ kind: 'question', title: `which ${index}?`, body: 'copper?', repo });
  }

  const stored = listStoredRuns();
  assert.equal(stored.length, MAX_RUNS, 'wanting a record is not a licence to grow the store');
  assert.equal(stored.at(-1).name, `repo-${MAX_RUNS + 4}`, 'the newest survives, the oldest is dropped');
});

test('a run carrying a credential in its path is refused like anything else', (t) => {
  tempDeck(t);

  assert.throws(
    () => registerRun({ repo: 'D:\\work\\ghp_0123456789abcdefghijklmnopqrstuvwxyz', pid: process.pid }),
    DeckRefusal,
  );
  assert.deepEqual(listRuns(), []);
});

// --- sequence numbers, which is what deck_wait waits on ---------------------

test('each reply is stamped with a higher sequence number than the last', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  addReply(item.id, 'first');
  addReply(item.id, 'second');

  const [stored] = listItems();
  assert.equal(stored.replies[0].seq, 1);
  assert.equal(stored.replies[1].seq, 2);
  assert.equal(currentSeq(), 2);
});

test('repliesSince returns only what the caller has not seen, oldest first', (t) => {
  tempDeck(t);
  const first = postItem({ kind: 'question', title: 'One', body: 'a' });
  const second = postItem({ kind: 'question', title: 'Two', body: 'b' });
  addReply(first.id, 'answer to one');
  const cursor = currentSeq();
  addReply(second.id, 'answer to two');

  const { replies, seq } = repliesSince(cursor);

  assert.deepEqual(
    replies.map((reply) => [reply.itemId, reply.text]),
    [[second.id, 'answer to two']],
  );
  assert.equal(seq, 2, 'the caller gets a cursor it can wait from next time');
  assert.deepEqual(repliesSince(seq).replies, [], 'and nothing when it is up to date');

  // Document order stops being sequence order the moment a thread is answered twice:
  // the store walks items, so the older item's newer reply comes out ahead of the newer
  // item's older one. `deck_wait` promises oldest first, so the sort is load-bearing.
  addReply(second.id, 'a second answer to two');
  addReply(first.id, 'a late answer to one');

  assert.deepEqual(
    repliesSince(cursor).replies.map((reply) => reply.seq),
    [2, 3, 4],
    'oldest first, whatever order the items happen to hold them in',
  );
});

test('repliesSince is bounded, and its cursor never skips what it left behind', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });
  for (let index = 0; index < 5; index += 1) addReply(item.id, `reply ${index}`);

  // The bound is 3, not 2, on purpose: at 2 the last reply handed over is also the
  // second one, so a cursor taken from the wrong end of the batch would read the same.
  const first = repliesSince(0, 3);

  assert.equal(first.replies.length, 3);
  assert.equal(first.seq, 3, 'the cursor stops at the last reply actually handed over');
  assert.deepEqual(
    repliesSince(first.seq, 3).replies.map((reply) => reply.text),
    ['reply 3', 'reply 4'],
    'and the next call picks up exactly where the bound left off, skipping nothing',
  );
});

test('a deck written by slice 1 still reads, and gains sequence numbers from here on', (t) => {
  tempDeck(t);
  const sliceOne = {
    version: 1,
    items: [
      {
        id: 'itm_0123456789ab',
        kind: 'question',
        title: 'Which port?',
        body: '4321?',
        postedAt: '2026-09-13T08:00:00.000Z',
        replies: [{ from: 'user', text: 'yes', repliedAt: '2026-09-13T08:01:00.000Z' }],
      },
    ],
  };
  fs.writeFileSync(storeFile(), JSON.stringify(sliceOne), 'utf8');

  assert.equal(listItems().length, 1, 'a slice-1 deck is not suddenly "unreadable"');
  assert.deepEqual(listRuns(), [], 'and it simply has no runs on it yet');
  assert.deepEqual(repliesSince(0).replies, [], 'a reply from before the deck kept a cursor is not re-delivered');

  addReply('itm_0123456789ab', 'and again');

  assert.equal(currentSeq(), 1);
  assert.deepEqual(
    repliesSince(0).replies.map((reply) => reply.text),
    ['and again'],
  );
});

// --- the page --------------------------------------------------------------

test('the deck page names both repositories that have a run on it', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: path.join('D:', 'work', 'alpha'), pid: process.pid });
  registerRun({ repo: path.join('D:', 'work', 'beta'), pid: process.pid });

  const page = await (await fetch(base)).text();

  assert.match(page, /alpha/);
  assert.match(page, /beta/);
});

test('the deck page drops a run whose session has closed, and keeps the other', async (t) => {
  const base = await deckOnAPort(t);
  const child = sleeper(t);
  registerRun({ repo: path.join('D:', 'work', 'closed'), pid: child.pid });
  registerRun({ repo: path.join('D:', 'work', 'open'), pid: process.pid });
  child.kill();
  await exited(child);

  const page = await (await fetch(base)).text();

  assert.doesNotMatch(page, /closed/, 'the session that went away is off the deck');
  assert.match(page, /open/, 'and the one still running is still on it');
});

test('a repository path is escaped on the page, never rendered as HTML', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: 'D:\\work\\<img onerror=alert(1)>', pid: process.pid });

  const page = await (await fetch(base)).text();

  assert.doesNotMatch(page, /<img onerror/);
  assert.match(page, /&lt;img onerror/);
});

// --- the JSON API the stdio client calls -----------------------------------

test('the deck says who it is, where it serves and where its cursor stands', async (t) => {
  const base = await deckOnAPort(t);

  const health = await (await fetch(`${base}/api/health`)).json();

  assert.equal(health.ok, true);
  assert.equal(health.pid, process.pid, 'the pid is how a client stops the deck it started');
  assert.equal(typeof health.url, 'string');
  assert.equal(health.seq, 0);
});

test('a session registers its run over HTTP and is told where the cursor stands', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });
  addReply(item.id, 'answered before this session started');

  const response = await fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repo: work('alpha'), pid: process.pid }),
  });
  const registered = await response.json();

  assert.equal(response.status, 200);
  assert.equal(registered.run.name, 'alpha');
  assert.equal(registered.seq, 1, 'a new session is not woken by an answer that predates it');
  assert.deepEqual(
    (await (await fetch(`${base}/api/runs`)).json()).runs.map((run) => run.name),
    ['alpha'],
  );
});

test('deck_post over the API stores the item and tells the pilot its id', async (t) => {
  const base = await deckOnAPort(t);

  const said = await textOf(
    await callApi(base, 'deck_post', { kind: 'question', title: 'Which port?', body: '4321?' }),
  );

  const [stored] = listItems();
  assert.equal(stored.title, 'Which port?');
  assert.ok(said.includes(stored.id), `the id the pilot is told (${said}) is the id on the deck`);
});

test('deck_read is bounded, and says how much of the deck it left behind', async (t) => {
  const base = await deckOnAPort(t);
  for (let index = 0; index < 5; index += 1) {
    postItem({ kind: 'question', title: `Question ${index}`, body: 'body' });
  }

  const payload = JSON.parse(await textOf(await callApi(base, 'deck_read', { limit: 2 })));

  assert.equal(payload.total, 5);
  assert.deepEqual(
    payload.items.map((item) => item.title),
    ['Question 3', 'Question 4'],
    'the newest are the ones worth an agent\'s context',
  );
});

test('deck_read bounds itself even when the pilot asks for no bound', async (t) => {
  const base = await deckOnAPort(t);
  for (let index = 0; index < MAX_READ_ITEMS + 3; index += 1) {
    postItem({ kind: 'question', title: `Question ${index}`, body: 'body' });
  }

  const payload = JSON.parse(await textOf(await callApi(base, 'deck_read')));

  assert.equal(payload.total, MAX_READ_ITEMS + 3);
  assert.equal(payload.items.length, MAX_READ_ITEMS, 'the whole deck never goes into an agent unasked');
});

test("deck_read can be asked for one run's items, however much else the deck is holding", async (t) => {
  const base = await deckOnAPort(t);
  // The run's own item first, then more than a display window of somebody
  // else's on top of it. Without a filter this item is unreachable: `limit`
  // counts back from the newest across every repository on the machine, and
  // L14 keeps every item for ever, so a deck in use buries an older run.
  const ours = path.join(os.tmpdir(), 'work', 'ours');
  const theirs = path.join(os.tmpdir(), 'work', 'theirs');
  postItem({ kind: 'question', title: 'The intake question', body: 'body', repo: ours });
  for (let index = 0; index < MAX_READ_ITEMS + 3; index += 1) {
    postItem({ kind: 'question', title: `Another run ${index}`, body: 'body', repo: theirs });
  }

  const payload = JSON.parse(await textOf(await callApi(base, 'deck_read', { repo: ours })));

  assert.equal(payload.total, 1, 'the count is of this run, not of the machine');
  assert.deepEqual(
    payload.items.map((item) => item.title),
    ['The intake question'],
    "an item older than the display window is still this run's item",
  );

  // Two processes spell one path differently: the separators and, on Windows,
  // the case of the drive letter. The join has to survive both.
  const slashed = JSON.parse(await textOf(await callApi(base, 'deck_read', { repo: ours.replaceAll(path.sep, '/') })));
  assert.equal(slashed.total, 1);
  if (process.platform === 'win32') {
    const lowered = JSON.parse(await textOf(await callApi(base, 'deck_read', { repo: ours[0].toLowerCase() + ours.slice(1) })));
    assert.equal(lowered.total, 1);
  }

  const nobody = JSON.parse(await textOf(await callApi(base, 'deck_read', { repo: path.join(os.tmpdir(), 'work', 'nobody') })));
  assert.deepEqual(nobody.items, [], 'and a repository with nothing on the deck has nothing');
  assert.equal(nobody.total, 0);
});

test('deck_read refuses a repo that is not a path', async (t) => {
  const base = await deckOnAPort(t);
  postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await callApi(base, 'deck_read', { repo: '   ' });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /repo/);
});

test('deck_read refuses a limit past what the deck will serialise', async (t) => {
  const base = await deckOnAPort(t);
  postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const response = await callApi(base, 'deck_read', { limit: 5000 });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /limit/);
});

test('a tool the deck does not have is a refusal the agent can read, not a crash', async (t) => {
  const base = await deckOnAPort(t);

  const response = await callApi(base, 'deck_delete', { id: 'itm_000000000000' });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /no tool named deck_delete/);
});

test('a credential posted over the API is refused, and nothing is stored', async (t) => {
  const base = await deckOnAPort(t);

  const response = await callApi(base, 'deck_post', {
    kind: 'question',
    title: 'Deploy',
    body: 'use ghp_0123456789abcdefghijklmnopqrstuvwxyz',
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /looks like a GitHub token/);
  assert.deepEqual(listItems(), []);
});

test('an item of exactly the size the deck accepts still survives the API round trip', async (t) => {
  const base = await deckOnAPort(t);

  const response = await callApi(base, 'deck_post', {
    kind: 'walkthrough',
    title: 'A log',
    body: 'x'.repeat(MAX_TEXT_BYTES),
  });

  assert.equal(response.status, 200, 'the transport must not shrink the limit the store enforces');
  assert.equal(listItems().length, 1);
});

test('an item past the size the deck accepts is refused, and nothing is stored', async (t) => {
  const base = await deckOnAPort(t);

  const response = await callApi(base, 'deck_post', {
    kind: 'question',
    title: 'A log',
    body: 'x'.repeat(MAX_TEXT_BYTES + 1),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /longer than the deck accepts/);
  assert.deepEqual(listItems(), []);
});

test('a request body far past anything the deck could hold is cut off at the transport', async (t) => {
  const base = await deckOnAPort(t);

  const response = await callApi(base, 'deck_post', {}, {
    body: JSON.stringify({
      name: 'deck_post',
      arguments: { kind: 'question', title: 'A log', body: 'x'.repeat(MAX_TEXT_BYTES * 8) },
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(listItems(), []);
});

test('the API refuses a body that is not JSON, which is all a cross-site form can send', async (t) => {
  const base = await deckOnAPort(t);

  const response = await callApi(base, 'deck_post', {}, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'deck_post' }).toString(),
  });

  assert.equal(response.status, 415);
  assert.deepEqual(listItems(), []);
});

test('the API refuses a call from another origin, exactly as the reply form does', async (t) => {
  const base = await deckOnAPort(t);

  const response = await callApi(base, 'deck_post', { kind: 'question', title: 'x', body: 'y' }, {
    headers: { origin: 'http://evil.example' },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(listItems(), []);
});

test('a page that rebound DNS to loopback cannot reach the API either', async (t) => {
  const base = await deckOnAPort(t);

  const read = await requestWithHost(base, 'evil.example:4321', { path: '/api/health' });
  const write = await requestWithHost(base, 'evil.example:4321', {
    path: '/api/tool',
    method: 'POST',
    body: JSON.stringify({ name: 'deck_post', arguments: { kind: 'question', title: 'x', body: 'y' } }),
  });

  assert.equal(read.status, 421, 'a rebound page must not even learn the deck is there');
  assert.equal(write.status, 421);
  assert.deepEqual(listItems(), []);
});

// --- deck_wait -------------------------------------------------------------

test('deck_wait comes back the moment the human replies in the browser', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const started = Date.now();
  const waiting = callApi(base, 'deck_wait', { since: 0, timeout: 30_000 });
  await sleep(150);
  await replyInBrowser(base, item.id, 'yes, 4321');

  const payload = JSON.parse(await textOf(await waiting));
  const took = Date.now() - started;

  assert.equal(payload.replies.length, 1);
  assert.equal(payload.replies[0].text, 'yes, 4321');
  assert.equal(payload.replies[0].itemId, item.id);
  assert.equal(payload.seq, 1, 'and the cursor moves, so the same reply is not delivered twice');
  assert.ok(took < 20_000, `deck_wait returned early (${took}ms) rather than sitting out its timeout`);
});

test('deck_wait comes back empty when its timeout elapses', async (t) => {
  const base = await deckOnAPort(t);
  postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const started = Date.now();
  const payload = JSON.parse(await textOf(await callApi(base, 'deck_wait', { since: 0, timeout: 400 })));
  const took = Date.now() - started;

  assert.deepEqual(payload.replies, [], 'nothing arrived, so nothing comes back');
  assert.ok(took >= 350, `it waited (${took}ms) rather than returning at once`);
});

test('deck_wait returns at once when a reply is already waiting', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });
  addReply(item.id, 'answered while the pilot was busy elsewhere');

  const started = Date.now();
  const payload = JSON.parse(await textOf(await callApi(base, 'deck_wait', { since: 0, timeout: 30_000 })));

  assert.equal(payload.replies[0].text, 'answered while the pilot was busy elsewhere');
  assert.ok(Date.now() - started < 5_000, 'a reply already on the deck does not make the pilot wait');
});

test('deck_wait does not hand back a reply the cursor has already passed', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });
  addReply(item.id, 'the answer this session already read');

  const payload = JSON.parse(await textOf(await callApi(base, 'deck_wait', { since: 1, timeout: 300 })));

  assert.deepEqual(payload.replies, []);
});

test('one parked request is capped, however long the wait it is a part of', async (t) => {
  const base = await deckOnAPort(t);

  // Not `MAX_WAIT_MS * 10`: since a wait for a human runs for hours, a timeout the
  // *tool* accepts is now routinely longer than one request may park for, and the
  // cap the daemon enforces is the per-request one. Holding a socket open for four
  // hours is what this refusal exists to prevent.
  const response = await callApi(base, 'deck_wait', { since: 0, timeout: MAX_POLL_MS * 10 });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /timeout/);
});

test('one wait runs many polls, and one request still parks in minutes', () => {
  const wait = TOOLS.find((tool) => tool.name === 'deck_wait');

  assert.equal(MAX_POLL_MS, 120_000, 'one request stays comfortably inside fetch\'s 300s ceiling');
  // Independence spec 20: 55 minutes, inside the prompt cache's hour; `create.test.mjs` pins the clamp.
  assert.ok(MAX_WAIT_MS > MAX_POLL_MS * 20, 'a wait is still many polls long');
  assert.match(wait.description, /never poll in a loop/, 'and the description says it is not a loop');
});

// --- the deck as a process -------------------------------------------------

test('the deck listens on the port the environment names, and defaults to 4321', () => {
  assert.equal(DECK_HOST, '127.0.0.1', 'A4: loopback only');
  assert.equal(DECK_PORT, 4321, 'A4: the default the README and the statusline name');

  const previous = process.env.PILOT_DECK_PORT;
  try {
    delete process.env.PILOT_DECK_PORT;
    assert.equal(deckPort(), 4321);
    assert.equal(deckUrl(), 'http://127.0.0.1:4321');
    process.env.PILOT_DECK_PORT = String(PORT);
    assert.equal(deckPort(), PORT, 'a test or a hand check can move off 4321');
    process.env.PILOT_DECK_PORT = '';
    assert.equal(deckPort(), 4321, 'an override nobody set is an override that is not there');

    // A4 says a collision is reported and never silently moved, and a mistyped override
    // is that same failure wearing a different hat: falling back to 4321 would put this
    // session's posts on the live deck the override existed to keep them off.
    for (const mistyped of ['nonsense', '4321.5', '70000', '0', '-1']) {
      process.env.PILOT_DECK_PORT = mistyped;
      assert.throws(() => deckPort(), /PILOT_DECK_PORT/, `${mistyped} is not a port`);
    }
  } finally {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  }
});

test('a second deck on a held port says so and exits, rather than moving silently', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const held = createDeckHttpServer();
  await new Promise((resolve) => held.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => held.close(resolve)));

  const loser = tracked(
    t,
    spawn(process.execPath, [DAEMON], {
      env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
    }),
  );
  let said = '';
  loser.stderr.on('data', (chunk) => {
    said += chunk;
  });
  const code = await exited(loser);

  assert.equal(code, 1, 'the loser exits rather than lingering as a process that serves nothing');
  // The holder here is a deck in this test's own process, so the message names this pid (spec 7).
  assert.ok(said.includes(`a deck is already serving http://127.0.0.1:${port} (pid ${process.pid}, version `), said);
});

test('a daemon nobody is listening to writes its diagnostics to deck.log', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const log = path.join(dir, 'deck.log');
  const stale = `[deck] from a deck that ran last month\n${'x'.repeat(1024 * 1024)}\n`;
  fs.writeFileSync(log, stale, 'utf8');
  t.after(() => killDeckAt(port));

  // `stdio: 'ignore'` is exactly how `deck/client.mjs` spawns it: there is no console on
  // the other end of this process's stderr, so the file is the only place to look.
  tracked(
    t,
    spawn(process.execPath, [DAEMON], {
      env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
      stdio: 'ignore',
    }),
  );
  await until(() => healthAt(port), { what: 'the daemon coming up' });

  const started = fs.readFileSync(log, 'utf8');
  assert.match(started, /\[deck\] serving/, 'the daemon says where it is serving');
  assert.doesNotMatch(started, /last month/, 'a log past a megabyte starts again rather than growing for ever');

  // A request the deck cannot serve is the diagnostic worth having: without the file it
  // goes to a stderr nobody holds, and the human sees a 500 with no way to learn why.
  fs.writeFileSync(path.join(dir, 'deck.json'), '{ not json', 'utf8');
  assert.equal((await fetch(`http://127.0.0.1:${port}/`, { headers: bearer(dir) })).status, 500);

  const said = await until(
    () => {
      const text = fs.readFileSync(log, 'utf8');
      return /\[deck\] 500 GET \/:/.test(text) ? text : null;
    },
    { what: 'the refused request reaching deck.log' },
  );
  assert.match(said, /is not readable JSON/, 'and it says what the human has to fix');
});

test('one malformed request target cannot take the whole machine\'s deck down', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  t.after(() => killDeckAt(port));
  tracked(
    t,
    spawn(process.execPath, [DAEMON], {
      env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
    }),
  );
  const before = await until(() => healthAt(port), { what: 'the daemon coming up' });

  // `http://[` is a target `fetch` will not send and `new URL` cannot parse. Slice 1
  // could afford to throw on it: the server was per-session, so it took down only its
  // own. This slice makes one daemon serve the machine (L3), which turns the same line
  // into any local process killing every session's deck — and every parked `deck_wait`
  // holding a connection open — with a single packet, no authentication needed.
  const answer = await new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`GET http://[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
    let got = '';
    socket.on('data', (chunk) => {
      got += chunk;
    });
    socket.on('close', () => resolve(got));
    socket.on('error', (err) => resolve(`the deck hung up: ${err.code}`));
  });

  assert.match(answer, /^HTTP\/1\.1 400 /, `the deck refused it cleanly, got: ${answer.split('\r\n')[0]}`);
  const { rss: _before, ...stable } = before;
  const { rss: _after, ...now } = await healthAt(port);
  assert.deepEqual(now, stable, 'and the same deck is still serving everyone else');
});

test('the stdio client starts the deck, and the deck outlives the session that started it', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  t.after(() => killDeckAt(port));

  const session = tracked(
    t,
    spawn(process.execPath, [CLIENT], {
      cwd: dir,
      env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );

  const health = await until(() => healthAt(port), { what: 'the client starting the deck' });
  assert.notEqual(health.pid, session.pid, 'the deck is its own process, not the session');

  session.kill();
  await exited(session);
  await sleep(500);

  const after = await healthAt(port);
  assert.equal(after?.pid, health.pid, 'the same deck is still serving after its session went away');
});

test('two sessions in two repositories put two runs on one deck; closing one leaves the other', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  t.after(() => killDeckAt(port));

  const alpha = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-alpha-'));
  const beta = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-beta-'));
  const sessions = [alpha, beta].map((cwd) =>
    tracked(
      t,
      spawn(process.execPath, [CLIENT], {
        cwd,
        env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    ),
  );
  // Registered after the sessions, so it runs after the hooks that kill them: Windows
  // will not remove a directory that is a living process's working directory.
  t.after(() => {
    for (const dir of [alpha, beta]) fs.rmSync(dir, { recursive: true, force: true });
  });

  // "Not yet" is thrown, so a timeout names the run count and what each session said.
  const runsWhere = (enough) => async () => {
    let answer;
    try {
      const { runs } = await (await fetch(`http://127.0.0.1:${port}/api/runs`, { headers: bearer() })).json();
      if (enough(runs.length)) return runs;
      answer = `runs: ${runs.length}`;
    } catch (err) {
      answer = err.message;
    }
    throw new Error(`${answer}; alpha: ${heard(sessions[0]).trim()}; beta: ${heard(sessions[1]).trim()}`);
  };

  const names = (await until(runsWhere((n) => n === 2), { what: 'both sessions registering a run' })).map((run) => run.name).sort();
  assert.deepEqual(names, [path.basename(alpha), path.basename(beta)].sort());

  sessions[0].kill();
  await exited(sessions[0]);

  const left = await until(runsWhere((n) => n === 1), { what: 'the closed session leaving the deck' });
  assert.equal(left[0].name, path.basename(beta), 'the other run is untouched');
  assert.ok(await healthAt(port), 'and the deck is still up');
});

// --- the command a human runs by hand --------------------------------------

test('pilot deck starts the deck detached and returns, so closing the shell leaves it up', { timeout: 20_000 }, async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const cli = spawn(process.execPath, [CLI, 'deck'], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let said = '';
  cli.stdout.on('data', (chunk) => {
    said += chunk;
  });

  const code = await exited(cli);
  const health = await healthAt(port);
  t.after(() => {
    if (health?.pid) process.kill(health.pid);
  });

  assert.equal(code, 0, 'pilot deck returns once the deck answers');
  assert.ok(health, 'the deck is still up after pilot deck has exited');
  assert.notEqual(health.pid, cli.pid, "the deck is its own process, not the shell's child");
  assert.match(said, new RegExp(`127\.0\.0\.1:${port}`), 'it says where the deck is');
});

test('pilot deck --foreground serves the deck in this process, for Ctrl-C', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const cli = tracked(
    t,
    spawn(process.execPath, [CLI, 'deck', '--foreground'], {
      env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
    }),
  );

  const health = await until(() => healthAt(port), { what: 'pilot deck coming up' });

  assert.equal(health.pid, cli.pid, 'pilot deck is the deck, not a launcher that walks away');
});

test('pilot given something it cannot do explains itself and fails', async (t) => {
  const cli = tracked(t, spawn(process.execPath, [CLI, 'fly'], { stdio: ['ignore', 'pipe', 'pipe'] }));
  let said = '';
  cli.stdout.on('data', (chunk) => {
    said += chunk;
  });
  cli.stderr.on('data', (chunk) => {
    said += chunk;
  });

  const code = await exited(cli);

  assert.notEqual(code, 0);
  assert.match(said, /pilot deck/);
});

test('pilot answers when started through a link, as a global npm install starts it', (t) => {
  // `npm install -g` puts a link to the package on the PATH, so `argv[1]` names the
  // link while Node resolves the module itself to the real file. A junction on
  // Windows, a directory symlink elsewhere; neither needs elevation.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-link-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const linked = path.join(outside, 'pilot');
  fs.symlinkSync(ROOT, linked, 'junction');

  const cli = spawnSync(process.execPath, [path.join(linked, 'bin', 'pilot.mjs'), 'help'], {
    encoding: 'utf8',
  });

  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /pilot run/);
});

test('pilot run is the wrapper, and answers with the code the wrapper answers with', async () => {
  // `pilot run` starts a real terminal running a real `claude`, so the one thing
  // the dispatcher does with it — hand over, and make its code this process's —
  // is asked with the wrapper replaced. A load hook in a child process swaps the
  // module out before `bin/pilot.mjs` resolves it, the same way the probe below
  // watches the client's imports: stubbing where the two modules meet, rather
  // than anywhere inside either of them.
  const probe = `
    import { registerHooks } from 'node:module';
    const wrapper = ${JSON.stringify(pathToFileURL(path.join(ROOT, 'deck', 'run.mjs')).href)};
    const called = [];
    registerHooks({
      load(url, context, next) {
        if (url !== wrapper) return next(url, context);
        return { format: 'module', shortCircuit: true, source: 'export const run = async () => { console.log("the wrapper ran"); return 7; };' };
      },
    });
    const { run } = await import(${JSON.stringify(pathToFileURL(CLI).href)});
    await run(['run']);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', probe], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk) => {
    err += chunk;
  });

  const code = await exited(child);

  assert.match(out, /the wrapper ran/, `\`pilot run\` did not reach the wrapper: ${err}`);
  assert.equal(code, 7, 'and the code the wrapper answered with is the one this process exits on');
});

// --- the stdio client, driven in this process ------------------------------

/**
 * The client's cursor is module state belonging to one session, and a session is one
 * process — so a test that wants a session of its own has to have a module of its own.
 * The query string is what makes Node load a second copy rather than hand back the first.
 */
let sessions = 0;

/** A deck on an ephemeral port, and a fresh stdio client pointed at it. */
async function clientOnADeck(t) {
  const base = await deckOnAPort(t);
  const previous = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previous;
  });

  sessions += 1;
  return { base, client: await import(`../client.mjs?session=${sessions}`) };
}

test('the stdio client puts this session on the deck over HTTP', async (t) => {
  const { base, client } = await clientOnADeck(t);

  const run = await client.registerSession();

  assert.equal(run.repo, process.cwd(), 'the repository is where the session was opened');
  assert.equal(run.pid, process.pid);
  const { runs } = await (await fetch(`${base}/api/runs`)).json();
  assert.deepEqual(runs.map((onDeck) => onDeck.id), [run.id], 'and the daemon is what wrote it');
});

test('a tool call goes out through the client and comes back as the agent reads it', async (t) => {
  const { client } = await clientOnADeck(t);

  const result = await client.callDeckTool('deck_post', {
    kind: 'question',
    title: 'Which port?',
    body: '4321?',
  });

  const stored = listItems().find((item) => item.kind !== 'chat');
  assert.equal(stored.title, 'Which port?');
  assert.match(result.content[0].text, new RegExp(stored.id), 'the agent is told the id that was stored');
});

test('a refusal from the deck reaches the agent as a tool error, not a dead connection', async (t) => {
  const { client } = await clientOnADeck(t);
  const [forServer, forAgent] = InMemoryTransport.createLinkedPair();
  await client.createDeckClient().connect(forServer);
  const agent = new Client({ name: 'test-session', version: '0' });
  await agent.connect(forAgent);
  t.after(() => agent.close());

  assert.deepEqual(
    (await agent.listTools()).tools.map((tool) => tool.name),
    ['deck_post', 'deck_read', 'deck_reply', 'deck_resolve', 'deck_status', 'deck_ticket', 'deck_wait'],
    'the client advertises every deck tool without the daemon being asked',
  );

  const refused = await agent.callTool({ name: 'deck_nonesuch', arguments: {} });

  assert.equal(refused.isError, true, 'the agent can read the refusal and act on it');
  assert.match(refused.content[0].text, /no tool named deck_nonesuch/);
  assert.ok(await agent.listTools(), 'and the MCP connection is still up afterwards');
});

test('a reply on an item older than deck_read shows is still handed to deck_wait', async (t) => {
  const { client } = await clientOnADeck(t);
  // Through the door a tool call uses, not past it: registering twice replaces the run
  // and takes a fresh cursor with it, so a session that registered by hand here and
  // again on its first tool call would start reading from after the reply below.
  await client.ensureOnTheDeck();

  // `deck_read` is windowed to the newest 20 items but the deck's seq counts the whole
  // deck, so a cursor taken from a read would step past every reply outside the window.
  // Posted in this session's own repository, because that is what an item a session
  // posted carries and a read of the deck is now that session's run.
  const mine = { kind: 'question', repo: process.cwd(), body: 'asked first' };
  const oldest = postItem({ ...mine, title: 'item 1' });
  for (let index = 2; index <= MAX_READ_ITEMS + 5; index += 1) {
    postItem({ ...mine, title: `item ${index}`, body: 'asked later' });
  }
  addReply(oldest.id, 'answered long after it scrolled off the window');

  const read = JSON.parse((await client.callDeckTool('deck_read', {})).content[0].text);
  assert.equal(read.total, MAX_READ_ITEMS + 6, 'the items posted, and the chat the registration made');
  assert.ok(
    !read.items.some((item) => item.id === oldest.id),
    'the replied item is outside what the read returned, which is the whole point',
  );

  const waited = JSON.parse(
    (await client.callDeckTool('deck_wait', { timeout: 2000 })).content[0].text,
  );

  assert.deepEqual(
    waited.replies.map((reply) => [reply.itemId, reply.text]),
    [[oldest.id, 'answered long after it scrolled off the window']],
    'the reply is not skipped for ever by a cursor a read moved',
  );
});

test('a reply deck_read has handed over is not handed over again by deck_wait (spec 22.3)', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.ensureOnTheDeck();
  const asked = postItem({ kind: 'question', title: 'Forks?', body: 'which', repo: process.cwd() });
  addReply(asked.id, 'forks');

  const read = JSON.parse((await client.callDeckTool('deck_read', {})).content[0].text);
  assert.ok(read.items.some((item) => item.id === asked.id), 'the read returned the reply');

  const again = JSON.parse((await client.callDeckTool('deck_wait', { timeout: 300 })).content[0].text);
  assert.deepEqual(again.replies, [], 'the wait does not re-deliver it');

  addReply(asked.id, 'and spoons');
  const next = JSON.parse((await client.callDeckTool('deck_wait', { timeout: 2000 })).content[0].text);
  assert.deepEqual(next.replies.map((reply) => reply.text), ['and spoons'], 'a later reply still arrives');
});

test('a brief deck_read of a thread the reader owns with replies does not throw (audit-f1-f7 spec 2)', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.ensureOnTheDeck();
  const asked = postItem({ kind: 'question', title: 'Forks?', body: 'which', repo: process.cwd() });
  addReply(asked.id, 'forks');

  const answer = await client.callDeckTool('deck_read', { brief: true });
  const read = JSON.parse(answer.content[0].text);
  assert.equal(read.items.find((item) => item.id === asked.id)?.replies, 1, 'the brief line counts the reply');

  const next = JSON.parse((await client.callDeckTool('deck_wait', { timeout: 2000 })).content[0].text);
  assert.deepEqual(next.replies.map((reply) => reply.text), ['forks'], 'a brief read hands nothing over');
});

test('a wait whose page holds a handed-over reply and a new one hands over the new one only (spec 22.3)', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.ensureOnTheDeck();
  const asked = postItem({ kind: 'question', title: 'Forks?', body: 'which', repo: process.cwd() });
  addReply(asked.id, 'forks');
  await client.callDeckTool('deck_read', {});
  addReply(asked.id, 'and spoons');

  const answer = await client.callDeckTool('deck_wait', { timeout: 2000 });
  const next = JSON.parse(answer.content[0].text);
  assert.deepEqual(next.replies.map((reply) => reply.text), ['and spoons'], 'the page is re-wrapped without the read one');
  assert.ok(Number.isInteger(next.seq), 'and keeps the rest of the payload');
  assert.equal(answer.content.length, 1);
});

test('the same reply twice on a thread within ten seconds is stored once (spec 22.3)', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-25T10:00:00Z') });
  const asked = postItem({ kind: 'question', title: 'Forks?', body: 'which' });
  const texts = () => listItems().find((item) => item.id === asked.id).replies.map((reply) => reply.text);

  addReply(asked.id, 'forks');
  t.mock.timers.tick(9_000);
  addReply(asked.id, 'forks');
  assert.deepEqual(texts(), ['forks'], 'a double-click is one reply');

  addReply(asked.id, 'spoons');
  assert.deepEqual(texts(), ['forks', 'spoons'], 'different words are a new reply');

  t.mock.timers.tick(11_000);
  addReply(asked.id, 'spoons');
  assert.deepEqual(texts(), ['forks', 'spoons', 'spoons'], 'past ten seconds it is said again on purpose');
});

test('a wait about another run never steps this session past its own reply', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.ensureOnTheDeck();
  const mine = postItem({
    kind: 'question',
    title: 'Which port?',
    body: 'asked here',
    repo: process.cwd(),
  });
  addReply(mine.id, 'the answer this session is waiting for');

  // The tool lets an agent ask about the run next door, and the seq a wait hands back
  // counts the whole deck however narrow the question was. A cursor moved by an answer
  // about somebody else would step over this session's own, which is never handed to
  // it and never offered again.
  const elsewhere = JSON.parse(
    (
      await client.callDeckTool('deck_wait', {
        repo: path.join('D:', 'work', 'elsewhere'),
        timeout: 200,
      })
    ).content[0].text,
  );
  assert.deepEqual(elsewhere.replies, [], 'nothing of the other run has been answered');

  const waited = JSON.parse(
    (await client.callDeckTool('deck_wait', { timeout: 2000 })).content[0].text,
  );

  assert.deepEqual(
    waited.replies.map((reply) => reply.text),
    ['the answer this session is waiting for'],
    'the reply was still there to be handed over',
  );
});

test('a wait cannot be asked for longer than the deck allows, schema or no schema', async (t) => {
  const { client } = await clientOnADeck(t);

  // Before the wait became a loop, the daemon refused a timeout above its own cap
  // and that refusal was the ceiling. Now the daemon only ever sees one poll's
  // worth, so the ceiling has to be here — and a schema is not one: nothing
  // validates `inputSchema` between the model and this function.
  assert.equal(client.waitWindowMs(undefined), DEFAULT_WAIT_MS, 'no timeout is the default');
  assert.equal(client.waitWindowMs('an hour'), DEFAULT_WAIT_MS, 'and neither is a word');
  assert.equal(client.waitWindowMs(30_000), 30_000, 'what was asked for, when it is allowed');
  assert.equal(client.waitWindowMs(MAX_WAIT_MS), MAX_WAIT_MS, 'right up to the maximum');
  assert.equal(
    client.waitWindowMs(Number.MAX_SAFE_INTEGER),
    MAX_WAIT_MS,
    'a caller asking for a century gets 55 minutes, not a century',
  );
});

test('one deck_wait spans many polls, and returns a reply that lands during a later one', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  // The defect this fixes, in miniature. A wait is one HTTP request parked for at
  // most MAX_POLL_MS, and a human answers on their own clock: on 2026-09-16 a reply
  // arrived fourteen minutes after the question and the session never heard it.
  // A poll of 300ms inside a wait of 5s is the same shape as 120s inside four hours,
  // and the reply below is written after the first poll has already come back empty.
  const started = Date.now();
  const waiting = client.waitForReply({ timeout: 5000 }, 300);
  await new Promise((resolve) => setTimeout(resolve, 900));
  addReply(item.id, 'answered long after the first poll gave up');

  const payload = JSON.parse((await waiting).content[0].text);

  assert.deepEqual(
    payload.replies.map((reply) => reply.text),
    ['answered long after the first poll gave up'],
    'the wait outlived the poll it began with rather than returning empty at 300ms',
  );
  assert.ok(Date.now() - started >= 900, 'and it really did wait rather than reading it up front');
});

test('a wait nobody answers still gives up when the caller said to', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();
  postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const started = Date.now();
  const payload = JSON.parse(
    (await client.waitForReply({ timeout: 1200 }, 300)).content[0].text,
  );
  const took = Date.now() - started;

  assert.deepEqual(payload.replies, [], 'nothing arrived, so nothing comes back');
  assert.ok(took >= 1100, `it waited out its deadline (${took}ms) rather than one poll of it`);
  assert.ok(took < 4000, `and it stopped when the deadline came (${took}ms) rather than polling on`);
});

// --- a long wait has to keep saying it is alive ----------------------------
//
// Claude Code aborts a tool call that sends neither a response nor a progress
// notification for `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, thirty minutes by default on
// a stdio server. A `deck_wait` asked for four hours died at exactly 1800s — "sent no
// response or progress for 1800s; aborting" — which made the pilot's standing "one
// deck_wait, hours if needed" impossible as shipped. The loop already wakes every
// `MAX_POLL_MS`, two minutes, so it has something true to say fifteen times over
// before the harness gives up on it. Verified rather than assumed: a `claude -p` of Claude
// Code 2.1.277 against a recording stdio server sends
// `_meta: { "claudecode/toolUseId": …, progressToken: 2 }` on every tools/call, so
// the token these tests gate on is the one a real harness sends.

// How many polls a 1500ms window holds is the machine's business, not the contract's:
// under a loaded full suite each 300ms round trip runs long and only two fit. So these
// tests count the `deck_wait` POSTs the client actually made, at the transport, and
// hold the reports to that: every poll but the last (the one the deadline ends) is an
// empty one, and each is reported once, numbered in order.
function waitPolls(t) {
  const real = globalThis.fetch;
  let made = 0;
  t.mock.method(globalThis, 'fetch', (url, init) => {
    if (String(url).endsWith('/api/tool') && JSON.parse(init.body).name === 'deck_wait') made += 1;
    return real(url, init);
  });
  return () => made;
}

test('a wait that finds nothing says so once per poll, so the harness knows it is alive', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();
  const requests = waitPolls(t);

  const polls = [];
  await client.waitForReply({ timeout: 1500 }, 300, (n) => polls.push(n));

  assert.ok(requests() >= 2, `the window held more than one poll (${requests()})`);
  assert.deepEqual(
    polls,
    Array.from({ length: requests() - 1 }, (_, index) => index + 1),
    `every empty poll of the ${requests()} made reported itself once, counted in order`,
  );
});

test('a poll that finds a reply is not reported as an empty one', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });
  // Answered BEFORE the wait begins, so the first poll returns it and the number of
  // empty polls is exactly none. The timing version of this test — reply partway
  // through, assert "not too many" — cannot tell two empty polls apart from the
  // mutation that also reports the poll which found the reply.
  addReply(item.id, 'answered before anyone waited');

  const polls = [];
  const payload = JSON.parse(
    (await client.waitForReply({ timeout: 5000 }, 300, (n) => polls.push(n))).content[0].text,
  );

  assert.equal(payload.replies.length, 1, 'the reply comes back on the first poll');
  assert.deepEqual(polls, [], 'and nothing was reported as empty, because no poll was');
});

test('the harness is told only when it asked: a progress token is the asking', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();

  const sent = [];
  const extra = { sendNotification: async (notification) => void sent.push(notification) };
  const request = {
    params: { name: 'deck_wait', arguments: { timeout: 1500 }, _meta: { progressToken: 7 } },
  };
  const requests = waitPolls(t);

  await client.deckToolHandler(request, extra, 300);

  assert.ok(requests() >= 2, `the window held more than one poll (${requests()})`);
  assert.equal(sent.length, requests() - 1, `one notification per empty poll of the ${requests()} made`);
  assert.deepEqual(
    sent.map((notification) => notification.method),
    sent.map(() => 'notifications/progress'),
    'and they are progress notifications',
  );
  assert.deepEqual(
    sent.map((notification) => notification.params.progressToken),
    sent.map(() => 7),
    'each carrying back the token the caller sent',
  );
  assert.deepEqual(
    sent.map((notification) => notification.params.progress),
    sent.map((_, index) => index + 1),
    'and a progress that counts, rather than a constant that merely is a number',
  );
});

test('a progress token of 0 is a token: it is the absence that means no, not the falsiness', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();

  // `0` is a spec-valid token, and the obvious rewrite of the guard — `if
  // (!progressToken)` — would silently stop reporting for it. Nothing else here
  // would notice, so this is the test that keeps the check an `undefined` one.
  const sent = [];
  const extra = { sendNotification: async (notification) => void sent.push(notification) };
  const request = {
    params: { name: 'deck_wait', arguments: { timeout: 1500 }, _meta: { progressToken: 0 } },
  };
  const requests = waitPolls(t);

  await client.deckToolHandler(request, extra, 300);

  assert.ok(requests() >= 2, `the window held more than one poll (${requests()})`);
  assert.equal(sent.length, requests() - 1, `token 0 is still told about its polls (${sent.length})`);
  assert.deepEqual(
    sent.map((notification) => notification.params.progressToken),
    sent.map(() => 0),
    'and the token comes back as 0, not as undefined',
  );
});

test('waitPolls counts only deck_wait', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();
  // Answered before the wait, so its first poll returns: a 1ms window could hold two.
  addReply(postItem({ kind: 'question', title: 'Which port?', body: '4321?' }).id, 'answered before anyone waited');
  const requests = waitPolls(t);

  await client.waitForReply({ timeout: 5000 }, 300);
  await client.callDeckTool('deck_post', { kind: 'question', title: 'Which host?', body: 'localhost?' });

  assert.equal(requests(), 1, 'the post is not a poll; the one wait that found a reply at once is');
});

test('a caller that sent no progress token is sent no progress: the spec forbids it unasked', async (t) => {
  const { client } = await clientOnADeck(t);
  await client.registerSession();

  const sent = [];
  const extra = { sendNotification: async (notification) => void sent.push(notification) };
  const request = { params: { name: 'deck_wait', arguments: { timeout: 1500 } } };

  await client.deckToolHandler(request, extra, 300);

  assert.deepEqual(sent, [], 'nothing was sent to a caller that never asked for progress');
});

// --- the boundary this slice exists to draw --------------------------------

test('the stdio client never touches the store: the daemon is the only writer', async () => {
  // Grepping one file's source proved only that this file does not name the store; an
  // import two hops away would have passed it. L3 is a claim about the whole module
  // graph, so the graph is what is asked: a resolve hook in a child process records
  // every specifier the client actually pulls in, transitively.
  const probe = `
    import { registerHooks } from 'node:module';
    const seen = [];
    registerHooks({ resolve(spec, context, next) { const r = next(spec, context); seen.push(r.url); return r; } });
    await import(${JSON.stringify(pathToFileURL(CLIENT).href)});
    console.log(JSON.stringify(seen));
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', probe], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk) => {
    err += chunk;
  });
  assert.equal(await exited(child), 0, `the probe did not run: ${err}`);

  const graph = JSON.parse(out).map((url) => url.replace(/\?.*$/, ''));
  assert.ok(graph.length > 3, `the probe saw the client resolve its imports, got ${graph.length}`);
  assert.ok(graph.some((url) => url.endsWith('/deck/tools.mjs')), 'the client reaches the tools');
  // store-dir.mjs only names the store's directory, writes nothing, and the client resolves it.
  const siblings = fs.readdirSync(path.dirname(CLIENT))
    .filter((name) => /^(server|store)/.test(name) && name.endsWith('.mjs') && name !== 'store-dir.mjs');
  for (const forbidden of [...siblings.map((name) => `/deck/${name}`), '/deck/runs.mjs']) {
    assert.ok(
      !graph.some((url) => url.endsWith(forbidden)),
      `${forbidden} is in the stdio client's module graph, so the client can write the deck`,
    );
  }
});

test('Claude Code is pointed at the stdio client, not at the daemon', () => {
  const mcp = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8'));

  assert.deepEqual(mcp.mcpServers.deck.args, ['${CLAUDE_PLUGIN_ROOT}/deck/client.mjs']);
});
