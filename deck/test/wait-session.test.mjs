/**
 * `pilot wait` under a session (process-gc spec 2, L1, L3): `main` holds a leash on the session's
 * `CLAUDE_PID` and, when that pid exits, says `NO SESSION: <pid> has exited` and exits 0, instead of
 * parking on until its 50-minute timeout. With no `CLAUDE_PID` there is no leash and it waits as
 * before. The deck is a stub of this file's own or a daemon on an ephemeral port, never 4321.
 */
import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { deckOnAPort } from '../testUtils.mjs';

const { forgetAgents } = await import('../agents.mjs');
const { postItem } = await import('../store.mjs');
const { waiterCount } = await import('../server.mjs');
const { main, wait, listeningRepo } = await import('../wait.mjs');

const OURS = 'D:/work/pilot-wait-session-repo';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What `main` writes to stdout, captured as text; anything else (the runner's own frames) passes through. */
function stdoutOf(t) {
  const said = [];
  const original = process.stdout.write;
  process.stdout.write = function write(chunk, ...rest) {
    if (typeof chunk === 'string') {
      said.push(chunk);
      return true;
    }
    return original.call(this, chunk, ...rest);
  };
  t.after(() => { process.stdout.write = original; });
  return said;
}

/** A process standing in for the session: a node that sleeps, killed in teardown if the test did not. */
function sleeper(t) {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  return child;
}

/** A deck that knows the repository and refuses nothing, and never answers a `deck_wait`. */
async function silentDeck(t) {
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const json = (body) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(body); };
      if (request.url === '/api/runs?live=1') return json('{"runs":[]}');
      if (request.url.startsWith('/api/record?')) return json('{"lanes":{"refusal":null}}');
      if (JSON.parse(raw || '{}').name === 'deck_read') return json(JSON.stringify({ content: [{ type: 'text', text: '{"items":[{"id":"itm_open"}]}' }] }));
      // deck_wait: parked for good.
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  process.env.PILOT_DECK_PORT = String(server.address().port);
}

async function liveDeck(t) {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  forgetAgents();
  t.after(() => forgetAgents());
  return base;
}

async function reply(base, id, text) {
  const answer = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    redirect: 'manual',
    body: new URLSearchParams({ id, text }),
  });
  assert.equal(answer.status, 303);
}

async function parked() {
  for (let i = 0; i < 400 && waiterCount() < 1; i += 1) await sleep(5);
  assert.equal(waiterCount(), 1, 'the wait is parked');
}

/** Where `main` listens: the git join of this process's cwd, since no env names a repository (handoff-mod S8). */
const HERE = listeningRepo(process.cwd());

const question = () => postItem({ kind: 'question', title: 'A question from the deck', body: 'A or B', repo: HERE, author: '' });

test('no run env is read', async (t) => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-wait-run-env-')));
  const port = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = '1'; // closed: the wait says where it listens, then finds no deck
  t.after(() => {
    if (port === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = port;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const said = [];
  await wait({ cwd: dir, env: { PILOT_RUN_REPO: OURS }, say: (line) => said.push(line), warn: () => {} });
  assert.equal(said[0], `listening on ${dir}\n`, 'PILOT_RUN_REPO names nothing a wait listens on');
});

test('a wait under a killed session exits with NO SESSION', async (t) => {
  await silentDeck(t);
  const said = stdoutOf(t);
  const session = sleeper(t);
  await new Promise((resolve) => session.once('spawn', resolve));

  const waiting = main(['--timeout', '0.5'], { env: { CLAUDE_PID: String(session.pid) } });
  await sleep(500);
  session.kill();
  await new Promise((resolve) => session.once('exit', resolve));
  const killedAt = Date.now();

  const outcome = await Promise.race([waiting, sleep(12000).then(() => 'still waiting')]);
  assert.equal(outcome, 0, 'the wait ends on its own once the session is gone');
  assert.ok(Date.now() - killedAt <= 10000, 'within 10 s of the kill');
  assert.ok(said.join('').includes(`NO SESSION: ${session.pid} has exited\n`), said.join(''));
});

test('a wait with no CLAUDE_PID waits as today', async (t) => {
  const base = await liveDeck(t);
  const asked = question();
  const said = stdoutOf(t);

  let done = false;
  const waiting = main(['--timeout', '1'], { env: {} }).finally(() => { done = true; });
  await parked();
  await sleep(3000);
  assert.equal(done, false, 'still parked after 3 s');
  assert.equal(waiterCount(), 1);

  await reply(base, asked.id, 'go ahead');
  assert.equal(await waiting, 0);
  assert.match(said.join(''), /go ahead/);
  assert.doesNotMatch(said.join(''), /NO SESSION/);
});

test('a reply before the session goes is printed once', async (t) => {
  const base = await liveDeck(t);
  const asked = question();
  const said = stdoutOf(t);
  let up = true;

  const waiting = main(['--timeout', '1'], { env: { CLAUDE_PID: '424242' }, alive: () => up });
  await parked();
  await reply(base, asked.id, 'go ahead');
  assert.equal(await waiting, 0);

  // The session goes after the reply: the leash was let go with the wait, so nothing more is said.
  up = false;
  await sleep(2500);
  const printed = said.join('');
  assert.equal(printed.split('go ahead').length - 1, 1, printed);
  assert.doesNotMatch(printed, /NO SESSION/);
});
