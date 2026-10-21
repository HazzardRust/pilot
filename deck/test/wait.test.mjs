/**
 * `pilot wait` (`deck/wait.mjs`): the background listener that wakes an idle
 * agent when the user answers on the deck and nothing else is running.
 *
 * Since crew-waits S1 it is a client of the daemon's `deck_wait` (A5), so the
 * cases about what wakes it run the real daemon on a store and an ephemeral
 * port of the test's own, never 4321. The cases about a deck answering badly
 * are a raw HTTP stub, so a test cannot open a browser: see `./no-open.mjs`.
 * Its kinds, the taking itself, and `--item` against the daemon (one thread of a
 * kind's several) are `./wait-as.test.mjs`.
 */
import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort, freePort } from '../testUtils.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const { forgetAgents } = await import('../agents.mjs');
const { addReply, closeItem, listItems, markDelivered, postItem, registerRun } = await import('../store.mjs');
const { messagesOf } = await import('../items.mjs');
const { waiterCount } = await import('../server.mjs');
const { listeningRepo, main, parseArgs, wait } = await import('../wait.mjs');

/** Two directories that are not each other, as this repository and a stranger. */
const OURS = 'D:/work/pilot-wait-repo';
const THEIRS = 'D:/work/pilot-wait-elsewhere';

const stored = (id) => listItems().find((item) => item.id === id);
const question = (given = {}) => postItem({ kind: 'question', title: 'A question from the deck', body: 'A or B', repo: OURS, author: '', ...given });

async function deck(t) {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  forgetAgents();
  t.after(() => forgetAgents());
  return base;
}

/** A user reply, as the page's form sends one: the write that wakes a parked wait. */
async function reply(base, id, text) {
  const answer = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    redirect: 'manual',
    body: new URLSearchParams({ id, text }),
  });
  assert.equal(answer.status, 303);
}

/** Until a wait is parked in the daemon, so the reply posted next lands on it. */
async function parked() {
  for (let i = 0; i < 200 && waiterCount() < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(waiterCount(), 1, 'the wait is parked');
}

const short = (said) => ({ env: {}, cwd: OURS, pollMs: 200, timeoutMinutes: 0.005, say: (line) => said.push(line) });

// --- a reply for this repository wakes the wait -----------------------------

test('exits with the item once a user reply for this repo lands after the start', async (t) => {
  const base = await deck(t);
  const asked = question();
  const said = [];

  const waiting = wait({ ...short(said), timeoutMinutes: 0.05 });
  await parked();
  await reply(base, asked.id, 'go ahead');

  assert.equal(await waiting, 0);
  const printed = said.join('');
  assert.match(printed, new RegExp(asked.id));
  assert.match(printed, /A question from the deck/);
  assert.match(printed, /go ahead/);
});

test('a thread wakes the wait while open, and not once it is closed', async (t) => {
  const base = await deck(t);
  const closed = question({ title: 'Old one' });
  addReply(closed.id, 'too late');
  closeItem(closed.id);
  const open = question({ title: 'Side question' });
  const said = [];

  const waiting = wait({ ...short(said), timeoutMinutes: 0.05 });
  await parked();
  await reply(base, open.id, 'over here');

  assert.equal(await waiting, 0);
  assert.match(said.join(''), /over here/);
  assert.doesNotMatch(said.join(''), /too late/);
});

test('every call is one untaken deck_wait naming this repository and the kind', async (t) => {
  const calls = await deckAnswering(t, 200, JSON.stringify({ content: [{ type: 'text', text: '{"replies":[],"seq":1}' }] }));

  await wait({ env: {}, cwd: OURS, kind: 'qa', item: 'itm_1', pollMs: 10, timeoutMinutes: 0.001, say: () => {} });

  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.name, 'deck_wait');
    assert.deepEqual(
      { ...call.arguments, timeout: 1 },
      { untaken: true, timeout: 1, repo: OURS, author: 'qa', item: 'itm_1' },
      'the deck decides who hears what, and takes it (ADR 0061)',
    );
  }
});

test('a long wait asks in requests of one poll each, never one request for the whole timeout', async (t) => {
  const empty = JSON.stringify({ content: [{ type: 'text', text: '{"replies":[],"seq":1}' }] });
  const answered = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ replies: [{ itemId: 'itm_1', title: 'T', text: 'done' }], seq: 2 }) }] });
  const calls = await deckAnswering(t, 200, (count) => (count < 3 ? empty : answered));

  assert.equal(await wait({ env: {}, cwd: OURS, pollMs: 40, timeoutMinutes: 60, say: () => {} }), 0);

  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call.arguments.timeout, 40, 'each request parks for one poll');
});

// --- what it prints: the repository first, then one exit line (L1) ----------

const EMPTY = JSON.stringify({ content: [{ type: 'text', text: '{"replies":[],"seq":1}' }] });

test('the first line names the repository it listens on', async (t) => {
  await deckAnswering(t, 200, EMPTY);
  const said = [];
  await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 0.001, say: (l) => said.push(l) });
  assert.equal(said[0], `listening on ${OURS}\n`);
});

test('a reply prints REPLY <id> "<title>" above its text', async (t) => {
  const answered = JSON.stringify({ replies: [{ itemId: 'itm_1', title: 't', text: 'go ahead' }], seq: 2 });
  await deckAnswering(t, 200, JSON.stringify({ content: [{ type: 'text', text: answered }] }));
  const said = [];
  assert.equal(await wait({ env: {}, cwd: OURS, pollMs: 40, timeoutMinutes: 1, say: (l) => said.push(l) }), 0);
  assert.deepEqual(said, [`listening on ${OURS}\n`, 'REPLY itm_1 "t"\ngo ahead\n\n']);
});

// --- the repository it listens on (spec 5, L2) -------------------------------

/** A real directory of the test's own, by its long name, removed after. */
function tmpDir(t, prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A real main checkout with linked worktrees of the given names, built once per set of names. */
function checkoutWith(t, ...names) {
  return gitFixture(t, `wait:checkoutWith:${names.join(',')}`, (dir) => buildCheckout(dir, names));
}

/** `dir` by its long name, as `tmpDir` gives it. */
function buildCheckout(dir, names) {
  const root = fs.realpathSync.native(dir);
  const checkout = path.join(root, 'main');
  const git = (...args) => execFileSync('git', args, { cwd: checkout, stdio: 'ignore' });
  fs.mkdirSync(checkout);
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  const trees = names.map((name) => path.join(root, name));
  for (const tree of trees) git('worktree', 'add', '-q', '-b', path.basename(tree), tree);
  return { checkout, trees };
}

/** A wait from `cwd` under `env`, a reply on an item stamped `stamp`: what it printed, once it has exited 0. */
async function heard(t, { cwd, env, stamp, text }) {
  const base = await deck(t);
  const asked = question({ repo: stamp });
  const said = [];
  const waiting = wait({ cwd, env, pollMs: 200, timeoutMinutes: 0.2, say: (l) => said.push(l) });
  await parked();
  await reply(base, asked.id, text);
  assert.equal(await waiting, 0);
  assert.match(said.join(''), new RegExp(`REPLY ${asked.id} "A question from the deck"\n${text}`));
  return said;
}

test('a wait started in a git worktree takes a reply posted on the main checkout', async (t) => {
  const { checkout, trees: [tree] } = checkoutWith(t, 'tree');
  const said = await heard(t, { cwd: tree, env: {}, stamp: checkout, text: 'heard from the worktree' });
  assert.equal(said[0], `listening on ${checkout}\n`);
});

test('a wait in a pilot run session listens on PILOT_RUN_REPO, not on its cwd', async (t) => {
  const { checkout, trees: [tree] } = checkoutWith(t, 'tree');
  const said = await heard(t, { cwd: checkout, env: { PILOT_RUN_REPO: tree }, stamp: tree, text: 'heard by the session' });
  assert.equal(said[0], `listening on ${tree}\n`);
});

test('a session launched in a worktree hears its own thread from a wait whose shell drifted elsewhere', async (t) => {
  const { trees: [tree, other] } = checkoutWith(t, 'tree', 'other');
  const said = await heard(t, { cwd: other, env: { PILOT_RUN_REPO: tree }, stamp: tree, text: 'heard after the drift' });
  assert.equal(said[0], `listening on ${tree}\n`);
});

test('an empty PILOT_RUN_REPO falls back to the git join', async (t) => {
  const { checkout, trees: [tree] } = checkoutWith(t, 'tree');
  const said = await heard(t, { cwd: tree, env: { PILOT_RUN_REPO: '  ' }, stamp: checkout, text: 'heard on the join' });
  assert.equal(said[0], `listening on ${checkout}\n`);
});

test('outside git the wait listens on its cwd', async (t) => {
  await deckAnswering(t, 200, EMPTY);
  const dir = tmpDir(t, 'pilot-wait-nogit-');
  const said = [];
  await wait({ env: {}, cwd: dir, pollMs: 10, timeoutMinutes: 0.001, say: (l) => said.push(l) });
  assert.equal(said[0], `listening on ${dir}\n`);
});

test('a git dir that is not a checkout\'s .git (a bare repository, a submodule) listens on the cwd', () => {
  const dir = path.resolve('/work/sub');
  assert.equal(listeningRepo(dir, () => `${path.resolve('/work/main/.git')}\n`), path.resolve('/work/main'));
  assert.equal(listeningRepo(dir, () => `${path.resolve('/work/main/.git/modules/sub')}\n`), dir);
  assert.equal(listeningRepo(dir, () => `${path.resolve('/work/bare.git')}\n`), dir);
});

test('a title with a line break stays on its REPLY line', async (t) => {
  const answered = JSON.stringify({ replies: [{ itemId: 'itm_1', title: 'two\nlines', text: 'ok' }], seq: 2 });
  await deckAnswering(t, 200, JSON.stringify({ content: [{ type: 'text', text: answered }] }));
  const said = [];
  await wait({ env: {}, cwd: OURS, pollMs: 40, timeoutMinutes: 1, say: (l) => said.push(l) });
  assert.equal(said[1], 'REPLY itm_1 "two lines"\nok\n\n');
});

// --- everything the wait must ignore -----------------------------------------

test('a reply on another repository is ignored', async (t) => {
  await deck(t);
  const theirs = question({ repo: THEIRS });
  addReply(theirs.id, 'not yours');
  const said = [];

  const code = await wait(short(said));
  assert.equal(code, 0, 'the timeout, not a match, is what ends it');
  assert.doesNotMatch(said.join(''), /not yours/, 'another repository’s reply is never printed');
});

for (const author of ['pilot:pilot-qa', 'pilot:pilot-teacher']) test(`a ${author}-owned thread is ignored by the pilot`, async (t) => {
  await deck(t);
  const kind = author === 'pilot:pilot-qa' ? 'walkthrough' : 'lesson';
  const theirs = postItem({ kind, title: 'Theirs', body: 'Step one.', repo: OURS, author });
  addReply(theirs.id, 'their thread');
  const said = [];

  const code = await wait(short(said));
  assert.equal(code, 0);
  assert.doesNotMatch(said.join(''), /their thread/, 'nothing was printed for a thread that is not the pilot’s');
});

test('a reply the pilot was already handed is ignored', async (t) => {
  await deck(t);
  const asked = question();
  addReply(asked.id, 'already read');
  assert.equal(markDelivered(messagesOf(stored(asked.id)), 'pilot'), true);
  const said = [];

  const code = await wait(short(said));
  assert.equal(code, 0);
  assert.doesNotMatch(said.join(''), /already read/, 'a reply handed to a turn is not the wait’s to print again');
});

// --- the timeout, and a deck that will not answer ---------------------------

test('a timeout prints NO REPLY after <n> minutes', async (t) => {
  await deck(t);
  const said = [];
  const code = await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 0.001, say: (l) => said.push(l) });

  assert.equal(code, 0);
  assert.equal(said.at(-1), 'NO REPLY after 0.001 minutes\n');
});

test('a deck that is not there is one line on stderr and exit 1, never a silent hang', async () => {
  process.env.PILOT_DECK_PORT = String(PORT); // nothing listening
  const warned = [];

  const code = await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 1, warn: (l) => warned.push(l) });

  assert.equal(code, 1);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /deck/i);
});

// --- every unparsable answer is one line on stderr and exit 1, never a hang -

/**
 * A stub that answers every `deck_wait` with a fixed status and body, or the body a
 * function gives for the number of calls so far, and records what it was asked. The
 * start-up check (`/api/runs`, `deck_read`) is answered apart and not recorded: as a
 * repository with an open thread, or, with `check: 'fail'`, with a 500. The pilot's lane read is answered apart too, as a lane that refuses nothing.
 */
async function deckAnswering(t, status, body, { check = 'known' } = {}) {
  const calls = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      let call = null;
      try {
        call = JSON.parse(raw);
      } catch {
        // A GET has no body; the check below is what it is.
      }
      if (request.url === '/api/runs?live=1' || call?.name === 'deck_read') {
        const known = JSON.stringify({ content: [{ type: 'text', text: '{"items":[{"id":"itm_open"}]}' }] });
        response.writeHead(check === 'fail' ? 500 : 200, { 'content-type': 'application/json' });
        return response.end(request.method === 'GET' ? '{"runs":[]}' : known);
      }
      // The pilot's lane read (idle-main-lane L5): a deck with nothing queued, not recorded.
      if (request.url.startsWith('/api/record?')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end('{"lanes":{"refusal":null}}');
      }
      calls.push(call);
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(typeof body === 'function' ? body(calls.length) : body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  process.env.PILOT_DECK_PORT = String(server.address().port);
  return calls;
}

test('a non-200 answer is one line on stderr and exit 1', async (t) => {
  await deckAnswering(t, 500, JSON.stringify({ error: 'refused' }));
  const warned = [];

  const code = await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 1, warn: (l) => warned.push(l) });

  assert.equal(code, 1);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /500/);
});

test('a body that is not JSON is one line on stderr and exit 1, not a raw parser error', async (t) => {
  await deckAnswering(t, 200, 'this is not JSON');
  const warned = [];

  const code = await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 1, warn: (l) => warned.push(l) });

  assert.equal(code, 1);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /not JSON/);
});

test('a body larger than this will read is refused rather than held in memory whole', async (t) => {
  await deckAnswering(t, 200, 'x'.repeat(2 * 1024 * 1024 + 1));
  const warned = [];

  const code = await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 1, warn: (l) => warned.push(l) });

  assert.equal(code, 1);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /more than this will read/);
});

test('a tool result whose own inner JSON is malformed is one line, not a raw parser error', async (t) => {
  await deckAnswering(t, 200, JSON.stringify({ content: [{ type: 'text', text: '{not json' }] }));
  const warned = [];

  const code = await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 1, warn: (l) => warned.push(l) });

  assert.equal(code, 1);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /not JSON/);
});

// --- a wait on a directory nobody posts to says so (spec 3, L4, L5, L7) -----

const NO_DECK = `NO DECK for ${OURS}: no run and no open thread is filed here, so nothing reaches this wait until a session registers it\n`;

test('a wait on a directory no run and no open thread names says NO DECK on line 2', async (t) => {
  await deck(t);
  const said = [];
  assert.equal(await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 0.001, say: (l) => said.push(l) }), 0);
  assert.deepEqual(said, [`listening on ${OURS}\n`, NO_DECK, 'NO REPLY after 0.001 minutes\n']);
});

test('a wait on a repository with a run prints no NO DECK line', async (t) => {
  await deck(t);
  registerRun({ repo: OURS, pid: process.pid });
  const said = [];
  await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 0.001, say: (l) => said.push(l) });
  assert.deepEqual(said, [`listening on ${OURS}\n`, 'NO REPLY after 0.001 minutes\n']);
});

test('a wait on a repository with an open thread and no run prints no NO DECK line', async (t) => {
  await deck(t);
  question();
  const said = [];
  await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 0.001, say: (l) => said.push(l) });
  assert.deepEqual(said, [`listening on ${OURS}\n`, 'NO REPLY after 0.001 minutes\n']);
});

test('a deck that does not answer the check is the unreachable line and exit 1', async (t) => {
  const calls = await deckAnswering(t, 200, EMPTY, { check: 'fail' });
  const said = [];
  const warned = [];
  const code = await wait({ env: {}, cwd: OURS, pollMs: 10, timeoutMinutes: 0.001, say: (l) => said.push(l), warn: (l) => warned.push(l) });
  assert.equal(code, 1);
  assert.deepEqual(said, [`listening on ${OURS}\n`], 'line 1 still came first');
  assert.equal(warned.length, 1);
  assert.match(warned[0], /is not answering .*500/);
  assert.equal(calls.length, 0, 'no deck_wait after a failed check');
});

test('a wait on an unknown directory still takes a reply that arrives later', async (t) => {
  const base = await deck(t);
  const said = [];
  const waiting = wait({ ...short(said), timeoutMinutes: 0.05 });
  await parked();
  const asked = question();
  await reply(base, asked.id, 'registered late');
  assert.equal(await waiting, 0);
  assert.equal(said[1], NO_DECK);
  assert.match(said.join(''), /registered late/);
});

test('the check takes no reply: one already waiting when the wait starts is still printed', async (t) => {
  await deck(t);
  const asked = question();
  addReply(asked.id, 'answered before the wait');
  const said = [];
  assert.equal(await wait({ ...short(said), timeoutMinutes: 0.05 }), 0);
  assert.match(said.join(''), /answered before the wait/);
});

// --- argument parsing --------------------------------------------------------

test('parseArgs takes a positive --timeout in minutes', () => {
  // A10: well inside Claude Code's 2-hour cap on a background command, which killed a 600-minute wait.
  assert.deepEqual(parseArgs([]), { timeoutMinutes: 110, kind: 'pilot' });
  assert.deepEqual(parseArgs(['--timeout', '30']), { timeoutMinutes: 30, kind: 'pilot' });
  assert.deepEqual(parseArgs(['--timeout', '0.5']), { timeoutMinutes: 0.5, kind: 'pilot' });
});

test('parseArgs refuses a --timeout that is not a positive number', () => {
  for (const bad of ['0', '-5', 'soon', '']) {
    const parsed = parseArgs(['--timeout', bad]);
    assert.match(parsed.error, /--timeout wants a number of minutes/, `--timeout ${bad}`);
  }
});

test('parseArgs refuses an option it does not know', () => {
  assert.match(parseArgs(['--nope']).error, /there is no "--nope" option/);
});

// --- the CLI entry point, end to end -----------------------------------------

test('main writes one line to stderr and exits 1 on a bad --timeout, never starting a wait', async (t) => {
  const calls = await deckAnswering(t, 200, 'unreached'); // if main started a wait, this would be asked
  const stderr = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => { stderr.push(chunk); return true; };
  t.after(() => { process.stderr.write = original; });

  const code = await main(['--timeout', '0']);
  process.stderr.write = original;

  assert.equal(code, 1);
  assert.equal(stderr.length, 1);
  assert.match(stderr[0], /--timeout wants a number of minutes/);
  assert.equal(calls.length, 0);
});
