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
import { sessionPid } from '../run-claim.mjs';
import { look, main } from '../run-look.mjs';
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

/**
 * A guarded deck holding `items`, answering as the daemon does: `deck_read` and `deck_reply` on `/api/tool`, the
 * directory's co-pilot on `GET /api/record`, and `POST /api/hold`. Every request is kept, in order, in `calls`.
 */
async function deckHolding(t, items, { coPilot = null, released = false } = {}) {
  const calls = [];
  const send = (response, body) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const server = http.createServer((request, response) => {
    if (!isAuthorized(request, readSecret())) {
      response.writeHead(401);
      return response.end();
    }
    let text = '';
    request.on('data', (chunk) => { text += chunk; });
    request.on('end', () => {
      const body = text ? JSON.parse(text) : null;
      const route = request.url.split('?')[0];
      calls.push({ method: request.method, route, name: body?.name, args: body?.arguments ?? body });
      if (request.method === 'POST' && route === '/api/tool' && body?.name === 'deck_read') {
        return send(response, { content: [{ type: 'text', text: JSON.stringify({ items }) }] });
      }
      if (request.method === 'POST' && route === '/api/tool' && body?.name === 'deck_reply') {
        return send(response, { content: [{ type: 'text', text: 'replied' }] });
      }
      if (request.method === 'GET' && route === '/api/record') return send(response, { coPilot });
      if (request.method === 'POST' && route === '/api/hold') return send(response, { held: true });
      if (request.method === 'POST' && route === '/api/started') return send(response, { released });
      response.writeHead(404);
      return response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  process.env.PILOT_DECK_PORT = String(server.address().port);
  return calls;
}

/** The lines this test's home holds in `wrapper.log`. */
function logLines(claims) {
  try {
    return fs.readFileSync(path.join(claims, '..', '..', 'pilot', 'wrapper.log'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const claimed = (claims, id) => fs.existsSync(path.join(claims, `clear-typed-${id}.claim`));
const MINUTE = 60 * 1000;
const at = (ms) => new Date(ms).toISOString();
const session = { ppid: PID };

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

  const first = await look('turn', { repo: OURS }, session);
  assert.deepEqual(first, { act: 'clear', id: handoff.id });
  assert.ok(fs.existsSync(path.join(claims, `clear-typed-${handoff.id}.claim`)), 'the claim is taken');

  const second = await look('turn', { repo: OURS }, session);
  assert.equal(second.act, 'none', 'one hand-off clears once');
});

test('turn in a session that posted nothing clears nothing', async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  stampPosted(claims, handoff.id, PID + 1); // another session's post

  const outcome = await look('turn', { repo: OURS }, { ...session, read: async () => [handoff] });

  assert.equal(outcome.act, 'none');
  assert.equal(fs.existsSync(path.join(claims, `clear-typed-${handoff.id}.claim`)), false, 'no claim taken');
});

test("a claude started inside the session that posted is its parent, not the outer CLAUDE_PID it inherits (F15)", async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  const outer = PID + 1;
  stampPosted(claims, handoff.id, outer);
  process.env.CLAUDE_PID = String(outer); // inherited from the outer session; scratchHome restores it
  const nested = { read: async () => [handoff], coPilot: async () => null, ppid: PID };

  await look('start', { repo: OURS }, nested);
  const outcome = await look('turn', { repo: OURS }, nested);

  assert.equal(outcome.act, 'none', 'the nested session clears nothing');
  assert.equal(fs.existsSync(path.join(claims, `clear-typed-${handoff.id}.claim`)), false, "the outer session's claim is left");
  assert.equal(fs.existsSync(path.join(claims, `mod-${outer}.stamp`)), false, 'the outer session is not said to have reported in');
  assert.ok(fs.existsSync(path.join(claims, `mod-${PID}.stamp`)), 'the nested session reports in as itself');
});

test("cleared with the lane's marker answers the prompt and drops the posted stamp", async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  stampPosted(claims, handoff.id);
  fs.writeFileSync(path.join(claims, `handoff-${handoff.id}.claim`), ''); // the SessionStart lane's marker

  const outcome = await look('cleared', { repo: OURS, id: handoff.id }, { ...session, read: async () => [handoff] });

  assert.deepEqual(outcome, { act: 'submit', id: handoff.id, prompt: 'Pick up the hand-off on the deck.' });
  assert.equal(fs.existsSync(path.join(claims, `posted-${PID}.stamp`)), false, 'the posted stamp is gone');
});

test('cleared waits for a lane marker that lands just after the clear', async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  stampPosted(claims, handoff.id);
  // Live: `$.command.run` only queues the clear, so the look ran 5 ms before the SessionStart lane marked it.
  const marker = setTimeout(() => fs.writeFileSync(path.join(claims, `handoff-${handoff.id}.claim`), ''), 150);
  t.after(() => clearTimeout(marker));

  const late = await look('cleared', { repo: OURS, id: handoff.id }, { ...session, read: async () => [handoff] });
  assert.equal(late.act, 'submit', 'the marker 150 ms late is waited for');
});

// --- S2: the look carries the whole watch -----------------------------------------------------------------

// handoff-mod S4 (L12, L13): the start releases this directory's co-pilot once and asks the deck for nothing else.
test("the look's start releases once", async (t) => {
  const claims = scratchHome(t);
  const calls = await deckHolding(t, [handoffItem()], { released: true });

  const outcome = await look('start', { repo: OURS }, session);

  assert.deepEqual(outcome, { act: 'none', why: 'released' });
  assert.ok(fs.existsSync(path.join(claims, `mod-${PID}.stamp`)), 'the reported-in stamp is written');
  assert.deepEqual(calls, [{ method: 'POST', route: '/api/started', name: undefined, args: { repo: OURS } }], 'one release, no chain (L12)');
});

test('a start with no co-pilot to release, or no deck, still reports in', async (t) => {
  const claims = scratchHome(t);
  const calls = await deckHolding(t, []);
  assert.deepEqual(await look('start', { repo: OURS }, session), { act: 'none', why: 'reported in' });
  assert.equal(calls.length, 1);

  fs.rmSync(path.join(claims, `mod-${PID}.stamp`));
  process.env.PILOT_DECK_PORT = '1'; // nothing listens there
  assert.deepEqual(await look('start', { repo: OURS }, session), { act: 'none', why: 'reported in' });
  assert.ok(fs.existsSync(path.join(claims, `mod-${PID}.stamp`)), 'the stamp is written first, whatever the deck says');
});

// handoff-no-wait S1 (L2): the clear keeps the crew, so a live co-pilot never holds it.
test('a live co-pilot does not hold the clear', async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  stampPosted(claims, handoff.id);
  const now = Date.now();
  const calls = await deckHolding(t, [handoff], { coPilot: { ticket: 'itm_c0c0c0c0c0c0', live: true, at: at(now - MINUTE) } });

  const outcome = await look('turn', { repo: OURS, turnEndedAt: now }, { ...session, now: () => now });

  assert.deepEqual(outcome, { act: 'clear', id: handoff.id });
  assert.equal(calls.filter((call) => call.route === '/api/hold').length, 0, 'no hold posted');
  assert.ok(claimed(claims, handoff.id), 'the claim is taken');
  assert.ok(calls.filter((call) => call.name === 'deck_read').every((call) => call.args.repo === undefined), 'no read names a repo');
});

test('a re-arm press clears with the co-pilot live, after a turn end past the press', async (t) => {
  const claims = scratchHome(t);
  const now = Date.now();
  const press = now - MINUTE;
  const handoff = { ...handoffItem(), hold: { at: at(now - 5 * MINUTE), rearmedAt: at(press) } };
  stampPosted(claims, handoff.id);
  await deckHolding(t, [handoff], { coPilot: { ticket: 'itm_c0c0c0c0c0c0', live: true, at: at(now - 10 * MINUTE) } });
  const deps = { ...session, now: () => now };

  const before = await look('turn', { repo: OURS, turnEndedAt: press - 1 }, deps);
  assert.equal(before.act, 'none', 'a turn that ended before the press does not clear');
  assert.equal(claimed(claims, handoff.id), false);

  assert.deepEqual(await look('turn', { repo: OURS, turnEndedAt: press }, deps), { act: 'clear', id: handoff.id });
});

// never-stuck S19 (spec 25): a co-pilot released on a queued pause frees the clear at the next turn end, not at the bound.
test('a released hold clears before the bound', async (t) => {
  const claims = scratchHome(t);
  const heldAt = Date.now() - 5 * MINUTE;
  const releasedAt = heldAt + 2 * MINUTE;
  const handoff = { ...handoffItem(), hold: { at: at(heldAt) } };
  stampPosted(claims, handoff.id);
  await deckHolding(t, [handoff], { coPilot: { ticket: 'itm_c0c0c0c0c0c0', live: false, at: at(releasedAt) } });

  const outcome = await look('turn', { repo: OURS, turnEndedAt: releasedAt + MINUTE }, { ...session, now: () => releasedAt + MINUTE });

  assert.deepEqual(outcome, { act: 'clear', id: handoff.id });
  assert.deepEqual(logLines(claims).filter((line) => line.includes('past 20 min')), [], 'not cleared as the bound');
});

test('a hand-off closed or superseded before the turn ended is not cleared', async (t) => {
  const claims = scratchHome(t);
  const closed = { ...handoffItem(), resolvedAt: new Date().toISOString() };
  stampPosted(claims, closed.id);
  await deckHolding(t, [closed]);

  assert.equal((await look('turn', { repo: OURS, turnEndedAt: Date.now() }, session)).act, 'none', 'closed');
  assert.equal(claimed(claims, closed.id), false, 'no claim kept for the closed one');

  const ours = handoffItem();
  const newer = handoffItem();
  stampPosted(claims, ours.id);
  const outcome = await look('turn', { repo: OURS, turnEndedAt: Date.now() }, { ...session, read: async () => [ours, newer], coPilot: async () => null });
  assert.equal(outcome.act, 'none', 'superseded');
  assert.equal(claimed(claims, ours.id) || claimed(claims, newer.id), false, 'no claim kept for either');
});

test('a forged hand-off inside the cooldown clears nothing', async (t) => {
  const claims = scratchHome(t);
  const first = handoffItem();
  const forged = handoffItem();
  const items = [first];
  const deps = (now) => ({ ...session, read: async () => items, coPilot: async () => null, now: () => now });
  const clearedAt = Date.now();
  stampPosted(claims, first.id);
  assert.deepEqual(await look('turn', { repo: OURS, turnEndedAt: clearedAt }, deps(clearedAt)), { act: 'clear', id: first.id });

  items.push(forged); // a fresh id, posted a minute after the clear and stamped as this session's
  stampPosted(claims, forged.id);
  const inside = await look('turn', { repo: OURS, turnEndedAt: clearedAt + MINUTE }, deps(clearedAt + MINUTE));
  assert.equal(inside.act, 'none', '0 clears inside the cooldown');
  assert.equal(claimed(claims, forged.id), false);

  const after = await look('turn', { repo: OURS, turnEndedAt: clearedAt + 5 * MINUTE }, deps(clearedAt + 5 * MINUTE));
  assert.deepEqual(after, { act: 'clear', id: forged.id }, 'cleared once 5 minutes have passed');
});

test('cleared names the oldest due lander', async (t) => {
  const claims = scratchHome(t);
  const handoff = handoffItem();
  const gate = (id) => ({ id, kind: 'gate2', title: 'Gate 2', repo: OURS, options: ['Sign off'], postedAt: new Date().toISOString(), replies: [{ from: 'user', text: 'Sign off', repliedAt: new Date().toISOString() }] });
  const oldest = gate('itm_0123456789ab');
  stampPosted(claims, handoff.id);
  fs.writeFileSync(path.join(claims, `handoff-${handoff.id}.claim`), '');
  await deckHolding(t, [oldest, gate('itm_ba9876543210'), handoff]);

  const outcome = await look('cleared', { repo: OURS, id: handoff.id }, session);

  assert.equal(outcome.act, 'submit');
  assert.ok(outcome.prompt.endsWith(` Spawn pilot-lander ${oldest.id}.`), outcome.prompt);
  assert.equal(logLines(claims).filter((line) => line.endsWith(`mod: cleared ${handoff.id}`)).length, 1, 'cleared logged once');
});

test('no marker, a refused submit and no turn each say it once', async (t) => {
  const claims = scratchHome(t);
  const [unmarked, refused, idle] = [handoffItem(), handoffItem(), handoffItem()];
  stampPosted(claims, unmarked.id);
  const calls = await deckHolding(t, [unmarked, refused, idle]);
  const replies = (id) => calls.filter((call) => call.name === 'deck_reply' && call.args.id === id);
  const lines = (id) => logLines(claims).filter((line) => line.includes(`mod: not started ${id}`));
  const cases = [
    [unmarked, () => look('cleared', { repo: OURS, id: unmarked.id }, { ...session, settleMs: 50 }), 'no marker'],
    [refused, () => look('unstarted', { repo: OURS, id: refused.id, why: 'refused' }, session), 'refused'],
    [idle, () => look('unstarted', { repo: OURS, id: idle.id, why: 'no turn' }, session), 'no turn'],
  ];

  for (const [handoff, call, why] of cases) {
    assert.deepEqual(await call(), { act: 'said', id: handoff.id, why }, why);
    assert.equal(replies(handoff.id).length, 1, `${why}: one reply on the hand-off`);
    assert.ok(replies(handoff.id)[0].args.text.includes(handoff.id), `${why}: the reply names the hand-off`);
    assert.deepEqual(lines(handoff.id).map((line) => line.slice(line.indexOf(' ') + 1)), [`mod: not started ${handoff.id} (${why})`], `${why}: one log line naming the cause`);

    await call();
    assert.equal(replies(handoff.id).length, 1, `${why}: a second call says nothing more`);
    assert.equal(lines(handoff.id).length, 1, `${why}: and logs nothing more`);
  }
  assert.equal(fs.existsSync(path.join(claims, `posted-${PID}.stamp`)), false, 'the posted stamp is gone after no marker');
  assert.equal(logLines(claims).some((line) => line.includes(`mod: cleared ${unmarked.id}`)), false, 'no marker is not a hand-off taken');
});

test('unstarted takes only a known cause and an item id', async (t) => {
  scratchHome(t);
  process.env.PILOT_DECK_PORT = '1';
  for (const argv of [
    ['unstarted', '--id', 'itm_0bad', '--why', 'no marker'],
    ['unstarted', '--id', 'itm_0bad', '--why', 'x\nmod: cleared itm_0bad'],
    ['unstarted', '--why', 'refused'],
    ['unstarted', '--id', 'itm_0bad'],
    ['turn', '--turn-ended', '-1'],
  ]) {
    const { code, lines } = await cli(argv);
    assert.equal(code, 2, `${JSON.stringify(argv)} is refused`);
    assert.deepEqual(lines, []);
  }
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
    ['turn', '--repo', OURS], // the look's repository is always its own listening one
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
