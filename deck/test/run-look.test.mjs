/**
 * handoff-mod S1: the look, `deck/run-look.mjs`, is the one decision behind the mod's clear and submit.
 *
 * Only the session that posted the hand-off is cleared (A6), by its posted stamp; the clear is claimed once by
 * the `wx` file `clear-typed-<id>` (L2); and the prompt is answered only once the lane has marked the fresh
 * session (L3). Every home is a scratch directory and the one deck is a stub on a port the system hands out:
 * a claim in the real home would silence the user's own next clear.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import './no-open.mjs';
import { look, main, sessionPid } from '../run-look.mjs';
import { isAuthorized } from '../server-wait.mjs';
import { ensureSecret, readSecret } from '../../hooks/lib/deck-secret.js';

const OURS = path.join(os.tmpdir(), 'pilot-look-repo');
const PID = 4242;

/** A home of this test's own, with the deck secret a deck that has run once leaves. */
function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-look-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_PORT: process.env.PILOT_DECK_PORT, CLAUDE_PID: process.env.CLAUDE_PID };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  ensureSecret();
  t.after(() => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return path.join(home, '.claude', 'pilot-inbox', 'claims');
}

const handoffItem = () => ({
  id: `itm_${crypto.randomBytes(6).toString('hex')}`,
  kind: 'handoff',
  title: 'Handoff: the run',
  repo: OURS,
  postedAt: new Date().toISOString(),
  replies: [],
});

/** What `pilot handoff` leaves for the session that posted `id`. */
function stampPosted(claims, id, pid = PID) {
  fs.mkdirSync(claims, { recursive: true });
  fs.writeFileSync(path.join(claims, `posted-${pid}.stamp`), id);
}

/** A guarded deck holding `items`, answering `deck_read` as the daemon does. */
async function deckHolding(t, items) {
  const server = http.createServer((request, response) => {
    if (!isAuthorized(request, readSecret())) {
      response.writeHead(401);
      return response.end();
    }
    if (request.method !== 'POST' || request.url !== '/api/tool') {
      response.writeHead(404);
      return response.end();
    }
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ items }) }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  process.env.PILOT_DECK_PORT = String(server.address().port);
}

/** `main` with its one line caught. */
async function cli(argv) {
  const lines = [];
  const code = await main(argv, { out: (line) => lines.push(line) });
  return { code, lines };
}

test('turn in the session that posted the hand-off answers clear and takes the claim', async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  await deckHolding(t, [handoff]);
  stampPosted(claims, handoff.id);
  process.env.CLAUDE_PID = String(PID);

  const first = await cli(['turn', '--repo', OURS]);
  assert.equal(first.code, 0);
  assert.equal(first.lines.length, 1, 'one line');
  assert.deepEqual(JSON.parse(first.lines[0]), { act: 'clear', id: handoff.id });
  assert.ok(fs.existsSync(path.join(claims, `clear-typed-${handoff.id}.claim`)), 'the claim is taken');

  const second = await cli(['turn', '--repo', OURS]);
  assert.equal(JSON.parse(second.lines[0]).act, 'none', 'one hand-off clears once');
});

test('turn in a session that posted nothing clears nothing', async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  stampPosted(claims, handoff.id, PID + 1); // another session's post

  const outcome = await look('turn', { repo: OURS }, { read: async () => [handoff], env: { CLAUDE_PID: String(PID) }, ppid: 1 });

  assert.equal(outcome.act, 'none');
  assert.equal(fs.existsSync(path.join(claims, `clear-typed-${handoff.id}.claim`)), false, 'no claim taken');
});

test("cleared with the lane's marker answers the prompt and drops the posted stamp", async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  stampPosted(claims, handoff.id);
  fs.writeFileSync(path.join(claims, `handoff-${handoff.id}.claim`), ''); // the SessionStart lane's marker

  const outcome = await look('cleared', { repo: OURS, id: handoff.id }, { read: async () => [handoff], env: { CLAUDE_PID: String(PID) }, ppid: 1 });

  assert.deepEqual(outcome, { act: 'submit', id: handoff.id, prompt: 'Pick up the hand-off on the deck.' });
  assert.equal(fs.existsSync(path.join(claims, `posted-${PID}.stamp`)), false, 'the posted stamp is gone');
});

test('an id that is not itm_<hex> is refused before any read', async (t) => {
  const claims = scratchHome(t);
  process.env.PILOT_DECK_PORT = '1'; // a read would be refused loudly, never answered

  for (const argv of [
    ['cleared', '--id', 'itm_../../x'],
    ['cleared', '--id', 'itm_ABC'],
    ['cleared'],
    ['turn', '--id'],
    ['turn', '--bogus', 'x'],
    ['turn', 'toString', 'x'], // an inherited key is no flag
    ['end'],
    [],
  ]) {
    const { code, lines } = await cli(argv);
    assert.equal(code, 2, `${JSON.stringify(argv)} is refused`);
    assert.deepEqual(lines, [], 'and prints no line');
  }
  assert.equal(fs.existsSync(claims), false, 'no claim, nothing written');
});

test('the session pid is CLAUDE_PID, else the parent', () => {
  assert.equal(sessionPid({ CLAUDE_PID: '4242' }, 7), 4242);
  assert.equal(sessionPid({}, 7), 7);
  for (const CLAUDE_PID of ['', '0', '-3', '1.5', 'abc']) assert.equal(sessionPid({ CLAUDE_PID }, 7), 7);
});
