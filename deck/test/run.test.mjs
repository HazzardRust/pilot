/**
 * S23: `pilot run` types `/clear` when the hand-off appears.
 *
 * Line 30 as amended asks for nothing from the user at all. The pilot already
 * stashes its state and posts a `handoff` item (S20's half), and a
 * `SessionStart` lane already hands that body to the fresh session — so the
 * only thing left between the two is the `/clear` itself, and nothing but
 * typing performs it. `deck/run.mjs` is the terminal that types it.
 *
 * One fact was probed live before any of this was designed, because the whole
 * feature rests on it and the documentation says nothing either way: a
 * background subagent spawned before `/clear` survives it, and its completion
 * reaches the fresh context. It does. An Explore agent spawned at 15:39:11 and
 * still reading files when `/clear` ran at 15:39:38 finished 35 seconds later,
 * and the fresh session said so unprompted: "A background subagent from before
 * the /clear just returned its final report. The whole report is the single
 * word MANGO."
 *
 * Two properties carry the most weight here, and neither is the happy path.
 *
 * The first is that the wrapper types `/clear` **once**. An item that stays
 * open would otherwise re-clear the fresh session on the next change event,
 * and the next, in a loop that eats the run it was meant to rescue. The claim
 * file is the whole of the mechanism: an exclusive create, keyed on the item,
 * so "once" survives a second event, a second wrapper and a restart alike.
 *
 * The second is that the claim is spelled out here rather than imported.
 * `hooks/lib/deck.js` is CommonJS and this is ESM (L35), so the two halves
 * write the same file by agreement and not by sharing code — and an agreement
 * that nothing checks is a drift waiting to happen. The tests below write a
 * claim with one half and read it with the other, in both directions, and pin
 * that the names themselves are different: the wrapper's claim says "I typed
 * it" and S20's says "I handed it over", and neither must consume the other.
 *
 * Nothing here touches the real deck or the real home: every stub binds a port
 * the operating system hands out, and every home is a scratch directory. A
 * test that claimed in the real home would silence the user's own next
 * `/clear`.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import './no-open.mjs';
import * as wrapper from '../run.mjs';
import { pasted } from '../run-prompt.mjs';
import { chainNext } from '../chain.mjs';
import { KIND_TICKET } from '../items.mjs';
import { FINISHED_CLEAN } from '../runs.mjs';
import { isAuthorized } from '../server-wait.mjs';
import { listItems, postItem, registerRun, setSlices } from '../store.mjs';
import { freePort, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { bearer, ensureSecret, readSecret, secretFile } from '../../hooks/lib/deck-secret.js';
import { startSession } from '../session.mjs';
import { statusLineSetting, subagentStatusLineSetting } from '../../scripts/install-settings.mjs';

// `run()` starts only a `claude` it finds off an absolute PATH entry (mac-linux S5), so this
// file puts a stand-in on its PATH: a runner with no claude installed tests the wrapper too.
const STAND_IN = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-run-claude-'));
for (const name of ['claude', 'claude.exe']) fs.writeFileSync(path.join(STAND_IN, name), '', { mode: 0o755 });
process.env.PATH = `${STAND_IN}${path.delimiter}${process.env.PATH ?? ''}`;
after(() => fs.rmSync(STAND_IN, { recursive: true, force: true }));

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

/**
 * S20's half of the same claim directory, reached the way nothing in
 * production may reach it. The seam this test exists to guard is exactly the
 * one the wrapper refuses to cross, so the test has to stand on both sides of
 * it.
 */
const require = createRequire(import.meta.url);
const deck = require('../../hooks/lib/deck.js');
const lane = require('../../hooks/session-handoff.js');

/** Two directories that are not each other, as a pilot run and a stranger. */
const OURS = path.join(os.tmpdir(), 'pilot-s23-repo');
const THEIRS = path.join(os.tmpdir(), 'pilot-s23-elsewhere');

/**
 * A home of this test's own. Both halves read `os.homedir()` when they are
 * asked and not when they load, so redirecting the environment is enough and
 * the module cache is left alone.
 */
function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s23-'));
  const before = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PILOT_DECK_PORT: process.env.PILOT_DECK_PORT,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // The home's deck secret, as a deck that has run once leaves it, for the fakes' guard below:
  // `deckDir()`'s, so the guard and the wrapper read one file whatever `PILOT_DECK_DIR` holds.
  ensureSecret();
  t.after(() => {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

/** An item as `deck_post` stores one, with only the fields the wrapper reads. */
const item = (given) => ({
  // Twelve hex digits always: `Math.random().toString(16)` drops trailing zeros, and an id `landerDue` will not name is no id (0.19% of draws).
  id: `itm_${crypto.randomBytes(6).toString('hex')}`,
  kind: 'handoff',
  title: 'Handoff: the pilot is at 31% of its context window',
  body: 'Stash at docs/handoff/deck-workspace.md. S13-S22 merged, S23 in flight.',
  repo: OURS,
  postedAt: new Date().toISOString(),
  replies: [],
  ...given,
});

/** What a fake deck answers on a route it does not model, so an unexpected call fails fast. */
const notModelled = (response) => {
  response.writeHead(404);
  response.end();
};

/**
 * The fakes' guard (deck-token S2): a request the real guard would refuse, by the store's secret as
 * S1 takes it, is 401, so every case here proves the wrapper sends it. Each route it let through is kept.
 */
const heard = new Set();
const guarded = (handler) => (request, response) => {
  if (!isAuthorized(request, readSecret())) {
    response.writeHead(401);
    return response.end();
  }
  heard.add(new URL(request.url, 'http://127.0.0.1').pathname);
  return handler(request, response);
};

/** A fake's teardown: end the connections a request left open, or `close` waits on them (L5). */
const closing = (server, before = () => {}) => () => new Promise((resolve) => {
  before();
  server.closeAllConnections();
  server.close(resolve);
});

/** `GET /api/record` with no co-pilot: the wrapper's co-pilot read (clear-waits-co-pilot L7), not a tool call. */
const noCoPilot = (response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ record: null, coPilot: null }));
};

/**
 * A deck holding exactly these items. What the wrapper *asks for* is itself
 * load-bearing — a read naming a `repo` marks the user's replies delivered
 * (`deck/server.mjs`) — so every call is recorded for the test below that
 * checks the wrapper never names one.
 */
async function deckHolding(t, items, refuse = () => false, record = noCoPilot) {
  const calls = [];
  const held = new Set(); // `POST /api/hold` as `markHold` answers it: true once per hand-off (held-handoff L2)
  const server = http.createServer(guarded((request, response) => {
    if (request.url.startsWith('/api/record')) return record(response);
    if (request.method !== 'POST' || !['/api/tool', '/api/hold'].includes(request.url)) return notModelled(response);
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      if (request.url === '/api/hold') {
        calls.push({ name: '/api/hold', arguments: body });
        const refused = refuse({ name: '/api/hold', arguments: body });
        response.writeHead(refused ? 400 : 200, { 'content-type': 'application/json' });
        const wrote = !refused && !held.has(body?.id);
        if (wrote) held.add(body?.id);
        return response.end(JSON.stringify({ held: wrote }));
      }
      calls.push(body);
      const open = body?.arguments?.open;
      const chosen = open ? items.filter((i) => !i.resolvedAt) : items;
      response.writeHead(refuse(body) ? 400 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        content: [{
          type: 'text',
          text: JSON.stringify({ url: 'http://127.0.0.1:0', seq: 7, total: items.length, items: chosen }),
        }],
      }));
    });
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(closing(server));
  process.env.PILOT_DECK_PORT = String(server.address().port);
  return calls;
}

/**
 * What one hand-off types: the `/clear`, then the fresh session's first prompt as one
 * bracketed paste, then Enter alone (handoff-prompt L1). A session after `/clear` holds
 * the lane's context but starts no turn until something is typed, so without the
 * prompt and its Enter somebody has to be there (S12).
 */
const HANDED_OFF = ['/clear\r', pasted('Pick up the hand-off on the deck.'), '\r'];

/**
 * A terminal that records what was typed into it, and the session behind it.
 * The `/clear` starts a fresh session, and that session's `SessionStart` lane
 * claims the newest hand-off in `items` — the marker the wrapper waits on
 * before it types the prompt (spec 24). A keyboard given no items is a session
 * whose lane never fires. A lone Enter starts the fresh session's turn, whose first
 * tool call `post-tool.js` stamps (handoff-prompt L3); `takes: false` is a session
 * whose input line never submits.
 */
function keyboard(items = [], { takes = true } = {}) {
  const typed = [];
  const type = (text) => {
    typed.push(text);
    if (text === '/clear\r' && items.length) deck.claim(lane.claimFor(items.at(-1).id));
    if (text === '\r' && takes) deck.markToolRan({ PILOT_RUN_PID: String(process.pid), PILOT_RUN_REPO: OURS }, OURS);
  };
  return { typed, type };
}

/**
 * The session behind the keyboard ending a turn, stamped with the Stop gate's own
 * half so the spelling is checked from both sides. Nothing is typed into a session
 * that has not come to rest since its hand-off was posted: a `/clear` written while
 * a permission prompt was open went to the prompt instead (2026-09-29).
 */
const atRest = () => deck.markTurnEnded({ PILOT_RUN_PID: String(process.pid), PILOT_RUN_REPO: OURS }, OURS);

// --- the /clear is typed ---------------------------------------------------

test('a hand-off types /clear, the paste, then Enter alone', async (t) => {
  scratchHome(t);
  const items = [item()];
  await deckHolding(t, items);
  const keys = keyboard(items);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type }), true);
  assert.deepEqual(keys.typed, HANDED_OFF, 'the /clear first, the prompt pasted, its Enter a write of its own');
});

test('a second change event on the same hand-off types nothing more', async (t) => {
  scratchHome(t);
  const items = [item()];
  await deckHolding(t, items);
  const keys = keyboard(items);
  atRest();

  await wrapper.clearOnce({ cwd: OURS, type: keys.type });
  assert.equal(
    await wrapper.clearOnce({ cwd: OURS, type: keys.type }),
    false,
    'the item is still open, and clearing again would eat the session that just picked it up',
  );
  assert.deepEqual(keys.typed, HANDED_OFF);
});

// --- lander S8 (spec 5): a lander queued past the hand-off -------------------

/** A gate2 the user has signed in this directory, with no lander on it: a due lander (L9). */
const signedGate2 = (given) => item({
  kind: 'gate2',
  title: 'Gate 2',
  options: ['Sign off'],
  replies: [{ from: 'user', text: 'Sign off', repliedAt: new Date().toISOString() }],
  ...given,
});

test("the next session's first prompt spawns the queued lander", async (t) => {
  scratchHome(t);
  const gate = signedGate2();
  // The hand-off newest, as the lane claims it.
  const items = [gate, item()];
  await deckHolding(t, items);
  const keys = keyboard(items);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type }), true);
  assert.equal(keys.typed[0], '/clear\r', 'the old session is cleared, never told to spawn');
  assert.deepEqual(keys.typed.slice(1), [pasted(`Pick up the hand-off on the deck. Spawn pilot-lander ${gate.id}.`), '\r']);
});

test('two due landers name only the oldest', () => {
  const oldest = signedGate2();
  const items = [oldest, signedGate2(), item()];
  assert.equal(wrapper.firstPrompt(items, OURS), `Pick up the hand-off on the deck. Spawn pilot-lander ${oldest.id}.`);
  assert.equal(wrapper.firstPrompt([item()], OURS), 'Pick up the hand-off on the deck.', 'no lander, the plain prompt');
  assert.equal(wrapper.firstPrompt([signedGate2({ repo: THEIRS }), item()], OURS), 'Pick up the hand-off on the deck.', "another directory's lander is not ours");
});

test('a gate2 that landed clean while its lander was queued is still named until its report closes the ticket', () => {
  const ticket = item({ kind: KIND_TICKET, title: 'Ticket' });
  const landed = signedGate2({ ticket: ticket.id, landing: { state: 'landed', sha: 'abc1234' }, resolvedAt: new Date().toISOString() });
  assert.equal(wrapper.firstPrompt([ticket, landed, item()], OURS), `Pick up the hand-off on the deck. Spawn pilot-lander ${landed.id}.`);
  const closed = { ...ticket, resolvedAt: new Date().toISOString() };
  assert.equal(wrapper.firstPrompt([closed, landed, item()], OURS), 'Pick up the hand-off on the deck.', 'its report closed the ticket');
});

// --- spec 24: the prompt waits for the fresh session ------------------------

test('no prompt is written before the lane marks the fresh session, and it is written once it does (spec 24)', async (t) => {
  // Found live 2026-09-25: a prompt typed straight after the `/clear` landed in
  // the posting session's running turn. The `/clear` queues behind that turn;
  // only the fresh session's `SessionStart` lane claiming the hand-off says the
  // turn is over and a new session is there to type into.
  scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  const keys = keyboard(); // a pty whose session is still mid-turn: no lane yet
  atRest();

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10 });
  await eventually(() => keys.typed.length > 0, 'the /clear typed');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(keys.typed, ['/clear\r'], 'the /clear is queued; the prompt is not');

  deck.claim(lane.claimFor(stash.id)); // the fresh session starts, and its lane hands the body over
  assert.equal(await typing, true);
  assert.deepEqual(keys.typed, HANDED_OFF);
});

test('a hand-off a session has already picked up is never cleared into', async (t) => {
  // Changed 2026-09-29: this typed the /clear and only withheld the prompt. But the
  // lane fires once per hand-off, so the session that picked it up holds the body,
  // and a /clear now would throw that away for a fresh session holding nothing.
  scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  deck.claim(lane.claimFor(stash.id)); // picked up by a session started by hand earlier
  const keys = keyboard();
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, waitMs: 50 }), false);
  assert.deepEqual(keys.typed, []);
});

test('a lane that never marks is a /clear with no prompt after it, never a prompt on a timer', async (t) => {
  scratchHome(t);
  await deckHolding(t, [item()]);
  const keys = keyboard();
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, waitMs: 50 }), true);
  assert.deepEqual(keys.typed, ['/clear\r']);
});

// --- 2026-09-29: the /clear waits for the session to come to rest -------------

test('no /clear is typed until the session has ended a turn since the hand-off was posted', async (t) => {
  // Found live: a /clear written while the pilot's turn had a permission prompt
  // open went to the prompt — its return answered it — and never reached the input.
  scratchHome(t);
  const stash = item({ postedAt: new Date(Date.now() + 150).toISOString() });
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest(); // a turn that ended before the hand-off was posted says nothing about now

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(keys.typed, [], 'the posting turn is still running');

  atRest(); // the posting turn ends
  assert.equal(await typing, true);
  assert.deepEqual(keys.typed, HANDED_OFF);
});

test('a session that never comes to rest is typed nothing, and the claim is given back for the next look', async (t) => {
  scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, restWaitMs: 50 }), false);
  assert.deepEqual(keys.typed, []);
  assert.equal(deck.claimed(wrapper.claimNameFor(stash.id)), false);
});

test('a /clear the lane never answers is never typed a second time', async (t) => {
  // A silent lane may be a fresh session that could not reach the deck, and a
  // second /clear would throw away whatever that session has done since.
  scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  const keys = keyboard();
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, waitMs: 50 }), true);
  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, waitMs: 50 }), false);
  assert.deepEqual(keys.typed, ['/clear\r']);
});

test('a session that ends while the wrapper waits for the marker stops the wait', async (t) => {
  scratchHome(t);
  // The co-pilot read answers late, as a loaded machine's does, so the path to the `/clear` is slow: the
  // session ends once the `/clear` is typed, never on a timer, which aborted that read (AbortError).
  const late = (response) => setTimeout(() => noCoPilot(response), 100);
  await deckHolding(t, [item()], undefined, late);
  const keys = keyboard();
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, signal: stopping.signal, pollMs: 10 });
  await eventually(() => keys.typed.length > 0, 'the /clear typed');
  stopping.abort();

  assert.equal(await typing, true);
  assert.deepEqual(keys.typed, ['/clear\r']);
});

test("a hand-off posted from another directory is another run's and is not typed for", async (t) => {
  scratchHome(t);
  await deckHolding(t, [item({ repo: THEIRS })]);
  const keys = keyboard();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type }), false);
  assert.deepEqual(keys.typed, []);
});

test('a claim already held — by a second wrapper, or by this one before a restart — types nothing', async (t) => {
  scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  const keys = keyboard();

  assert.equal(deck.claim(wrapper.claimNameFor(stash.id)), true, 'someone else got there first');
  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type }), false);
  assert.deepEqual(keys.typed, []);
});

test('an item of another kind, one already resolved, and an empty deck are all silence', async (t) => {
  for (const [what, items] of [
    ['a question', [item({ kind: 'question' })]],
    ['a dismissed hand-off', [item({ resolvedAt: new Date().toISOString() })]],
    // S9/L17: a crew agent's notice at its own hard mark is posted as
    // `crew-handoff`, not `handoff`, precisely so this wrapper's `/clear`
    // never fires on it — only the pilot's own hand-off does.
    ['a crew agent\'s context notice', [item({ kind: 'crew-handoff', title: 'Handoff: pilot-implementer is at 36% of its context window' })]],
    ['nothing at all', []],
  ]) {
    await t.test(what, async (inner) => {
      scratchHome(inner);
      await deckHolding(inner, items);
      const keys = keyboard();
      assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type }), false);
      assert.deepEqual(keys.typed, []);
    });
  }
});

test('a hand-off the deck hands back despite `open`, and one with no id, are both silence', async (t) => {
  // Both arrive from a daemon this wrapper was not written against: one older
  // than the `open` argument, and one holding an item whose id the poster never
  // gave. The wrapper reads the item itself rather than trusting the answer —
  // and the id matters twice, because `clear-typed-x` is the one name every
  // id-less hand-off on the machine would otherwise share, so the first would
  // silence every other directory's.
  for (const [what, given] of [
    ['already dismissed', { resolvedAt: new Date().toISOString() }],
    ['carrying no id at all', { id: undefined }],
  ]) {
    await t.test(what, async (inner) => {
      scratchHome(inner);
      const keys = keyboard();
      const stale = item(given);

      assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, read: async () => [stale] }), false);
      assert.deepEqual(keys.typed, []);
      assert.equal(deck.claimed(wrapper.claimNameFor(stale.id)), false, 'and nothing was claimed on its behalf');
    });
  }
});

test('the read never names a repo, because naming one marks the user’s replies delivered', async (t) => {
  scratchHome(t);
  const items = [item()];
  const calls = await deckHolding(t, items);
  atRest();

  await wrapper.clearOnce({ cwd: OURS, type: keyboard(items).type });

  // Three reads: the look, the look again once the turn has ended (S17), and the first prompt's look for a lander (lander S8).
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.name, 'deck_read');
    assert.equal(call.arguments.open, true);
    assert.ok(
      !('repo' in call.arguments),
      'the repository join is made here against the item’s own repo, never by asking the deck for one',
    );
  }
});

test('a deck that is not there is not an error the wrapper raises', async (t) => {
  scratchHome(t);
  // A port nothing is listening on: the daemon has not started yet, or has stopped.
  process.env.PILOT_DECK_PORT = String(PORT);
  await assert.rejects(
    wrapper.clearOnce({ cwd: OURS, type: () => {} }),
    'clearOnce reports the failure to its caller, which is the watch loop, and the loop is what stays quiet',
  );
});

// --- the claim, spelled twice ----------------------------------------------

test('a claim the wrapper writes is a claim S20’s lane can read, and the other way round', (t) => {
  scratchHome(t);
  const name = wrapper.claimNameFor('itm_0123456789ab');

  assert.equal(wrapper.takeClaim(name), true, 'the wrapper takes it');
  assert.equal(deck.claimed(name), true, 'and the other half of the seam sees the same file');
  assert.equal(wrapper.takeClaim(name), false, 'the exclusive create is what makes "once" true');

  const theirs = 'pilot-s23-written-by-the-lane';
  assert.equal(deck.claim(theirs), true);
  assert.equal(
    wrapper.takeClaim(theirs),
    false,
    'and a claim the lane wrote is one the wrapper finds held — one directory, one suffix, one spelling',
  );
});

test('the wrapper’s claim and S20’s are different names for the same hand-off', (t) => {
  scratchHome(t);
  const id = 'itm_0123456789ab';

  assert.notEqual(
    wrapper.claimNameFor(id),
    lane.claimFor(id),
    'the wrapper’s claim says "I typed it" and the lane’s says "I handed it over"; ' +
      'whichever ran first would otherwise silence the other',
  );
  assert.equal(wrapper.takeClaim(wrapper.claimNameFor(id)), true);
  assert.equal(
    deck.claimed(lane.claimFor(id)),
    false,
    'so typing the /clear must not consume the pickup that follows it',
  );
});

test('an item id that is not a file name is made into one the same way on both sides', (t) => {
  scratchHome(t);
  for (const id of ['itm_../../escape', 'itm_a b/c', '', 'x'.repeat(200)]) {
    const ours = wrapper.claimNameFor(id);
    assert.ok(!ours.includes('/') && !ours.includes('\\') && !ours.includes('..'), `${id} stays inside the directory`);
    assert.equal(wrapper.takeClaim(ours), true);
    assert.equal(deck.claimed(ours), true, `the lane reads the wrapper’s file for ${JSON.stringify(id)}`);
  }
});

test('a write that fails gives the claim back, because the claim means "typed"', async (t) => {
  scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  atRest();

  await assert.rejects(
    wrapper.clearOnce({
      cwd: OURS,
      type: () => { throw new Error('the terminal closed under us'); },
    }),
    /terminal closed/,
  );
  assert.equal(
    deck.claimed(wrapper.claimNameFor(stash.id)),
    false,
    'a claim left behind for a /clear nobody typed would stop every later attempt, including a fresh `pilot run`',
  );

  const keys = keyboard([stash]);
  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type }), true, 'so the next event can still type it');
  assert.deepEqual(keys.typed, HANDED_OFF);
});

test('a prompt that will not type after the /clear went in keeps the claim, because the /clear was typed', async (t) => {
  scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  atRest();
  const typed = [];

  await assert.rejects(
    wrapper.clearOnce({
      cwd: OURS,
      type: (text) => {
        if (typed.length) throw new Error('the terminal closed under us');
        typed.push(text);
        deck.claim(lane.claimFor(stash.id)); // the fresh session's lane fires
      },
    }),
    /terminal closed/,
  );
  assert.deepEqual(typed, ['/clear\r']);
  assert.equal(
    deck.claimed(wrapper.claimNameFor(stash.id)),
    true,
    'giving it back would clear the fresh session again on the next change event',
  );
});

// --- the watch loop ---------------------------------------------------------

/**
 * A whole deck: the runs list the wrapper waits on before it subscribes, the
 * change stream it subscribes to, and the read it makes on each ping. `announce`
 * pushes a `changed` event the way a write to the real deck does.
 */
async function deckWatching(t, { runs, items, flood = false, chained = null, chainFailures = 0, record = noCoPilot }) {
  const streams = new Set();
  const chains = [];
  const subscribedAt = [];
  let subscriptions = 0;
  const server = http.createServer(guarded((request, response) => {
    if (request.url.startsWith('/api/runs')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ runs }));
    }
    if (request.url.startsWith('/api/record')) return record(response);
    if (request.url.startsWith('/events')) {
      subscriptions += 1;
      subscribedAt.push(request.url);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      streams.add(response);
      response.on('close', () => streams.delete(response));
      // A stream that is not one: no newline ever, so nothing but the
      // wrapper's own ceiling stops the buffer growing.
      if (flood) for (let i = 0; i < 40; i += 1) response.write('x'.repeat(1024));
      return undefined;
    }
    if (request.method !== 'POST' || !['/api/chain', '/api/tool'].includes(request.url)) return notModelled(response);
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    return request.on('end', () => {
      if (request.url === '/api/chain') {
        chains.push(JSON.parse(raw));
        if (chains.length <= chainFailures) { response.writeHead(500); return response.end(); }
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end(JSON.stringify({ handoff: chained }));
      }
      const open = JSON.parse(raw)?.arguments?.open;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify({ items: open ? items.filter((i) => !i.resolvedAt) : items }) }],
      }));
    });
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(closing(server, () => streams.forEach((s) => s.end())));
  process.env.PILOT_DECK_PORT = String(server.address().port);

  return {
    connected: () => streams.size,
    subscriptions: () => subscriptions,
    subscribedAt,
    chains,
    announce: () => streams.forEach((s) => s.write('event: changed\ndata: 1\n\n')),
    // End pressed on the deck (start-end-session S4, L1): the daemon's whole part in it.
    end: () => streams.forEach((s) => s.write('event: end\ndata: 1\n\n')),
    // A data line with no `event:` before it, which names no change.
    dataOnly: () => streams.forEach((s) => s.write('data: 1\n\n')),
  };
}

// Only before an assertion that something did *not* happen (ADR 0121, L7).
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

// The one wait budget in this file (L3): a wait for something to happen polls for it.
const SETTLE_BUDGET_MS = 5000;
async function eventually(predicate, what) {
  const deadline = Date.now() + SETTLE_BUDGET_MS;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`${what}: still not so after ${SETTLE_BUDGET_MS} ms`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
const typedIs = (keys, expected) => () => isDeepStrictEqual(keys.typed, expected);

test('eventually names what never happened', async () => {
  await assert.rejects(eventually(() => false, 'the sky fell'), /the sky fell/);
});

test('eventually resolves as soon as the condition holds', async () => {
  let checks = 0;
  const started = Date.now();
  await eventually(() => ++checks >= 3, 'the third check');
  assert.equal(checks, 3);
  assert.ok(Date.now() - started < SETTLE_BUDGET_MS / 4, 'well inside the budget');
});

test('an unmodelled route is 404', async (t) => {
  scratchHome(t);
  const unknown = () => fetch(`http://127.0.0.1:${process.env.PILOT_DECK_PORT}/api/unknown`, { headers: bearer() }).then((r) => r.status);
  await deckHolding(t, [item()]);
  assert.equal(await unknown(), 404, 'deckHolding models /api/tool and /api/record only');
  await deckWatching(t, { runs: [{ repo: OURS }], items: [item()] });
  assert.equal(await unknown(), 404, 'deckWatching models its five routes only');
});

test('the watcher types once across two change events, and stops when the session does', async (t) => {
  scratchHome(t);
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(() => stream.connected() === 1, 'the subscription: a registered run is the cue to subscribe');

  stream.announce();
  await eventually(typedIs(keys, HANDED_OFF), 'the first ping typed');
  stream.announce();
  await settle();
  assert.deepEqual(keys.typed, HANDED_OFF, 'the second ping finds the claim already taken');

  stopping.abort();
  assert.equal(await watching, true, 'and it reports that the deck was reached');
});

test('a data line without an event is not a change', async (t) => {
  scratchHome(t);
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(() => stream.connected() === 1, 'the subscription');
  stream.dataOnly();
  await settle();
  assert.deepEqual(keys.typed, [], 'nothing typed for it');

  stream.announce();
  await eventually(typedIs(keys, HANDED_OFF), 'the changed event typed');
  stopping.abort();
  await watching;
});

test('pilot run asks the deck to chain once at start', async (t) => {
  scratchHome(t);
  // The daemon's answer to /api/chain is the hand-off it posted; the watcher
  // then clears into it without waiting for a change event.
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items, chained: items[0] });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(typedIs(keys, HANDED_OFF), 'the chained ticket typed');
  assert.deepEqual(stream.chains, [{ repo: OURS }], 'one ask, naming this directory');

  stream.announce();
  await settle();
  assert.equal(stream.chains.length, 1, 'once, not on every change event');
  assert.deepEqual(keys.typed, HANDED_OFF);
  stopping.abort();
  await watching;
});

test('a chain at start the deck did not answer is asked again', async (t) => {
  scratchHome(t);
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items, chained: items[0], chainFailures: 1 });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(() => isDeepStrictEqual(keys.typed, HANDED_OFF), 'the retried chain typed');
  assert.equal(stream.chains.length, 2, 'a failed ask is retried');
  await settle();
  assert.equal(stream.chains.length, 2, 'then not again');
  stopping.abort();
  await watching;
});

test('a deck that chains nothing at start types nothing', async (t) => {
  scratchHome(t);
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items: [] });
  const keys = keyboard();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(() => stream.chains.length === 1, 'the ask at start');
  await settle();
  assert.equal(stream.chains.length, 1);
  assert.deepEqual(keys.typed, []);
  stopping.abort();
  await watching;
});

test('the wrapper opens /events?wrapper= with its cwd encoded', async (t) => {
  scratchHome(t);
  // Its own stream, not a page's (start-end-session L5): the daemon counts it apart from the
  // browsers and tells the pages when it closes, so a window closed by hand ends its tab live.
  const cwd = path.join(os.tmpdir(), 'pilot s3 & co #1');
  const stream = await deckWatching(t, { runs: [{ repo: cwd }], items: [] });
  const stopping = new AbortController();

  const watching = wrapper.watch({ cwd, type: () => {}, signal: stopping.signal, retryMs: 20 });
  t.after(() => stopping.abort());
  await eventually(() => stream.subscribedAt.length === 1, 'the subscription');

  assert.deepEqual(stream.subscribedAt, [`/events?wrapper=${encodeURIComponent(cwd)}`]);
  stopping.abort();
  await watching;
});

test("pilot run's requests are taken by a guarded deck", async (t) => {
  scratchHome(t);
  heard.clear();
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items, chained: items[0] });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());
  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(typedIs(keys, HANDED_OFF), 'the chained ticket typed');
  await eventually(() => stream.connected() === 1, 'the subscription');
  stopping.abort();
  await watching;

  // `deck_reply`, the sixth, goes out only for a hand-off no fresh session marked.
  const stash = item();
  const calls = await deckHolding(t, [stash]);
  atRest();
  await wrapper.clearOnce({ cwd: OURS, type: keyboard().type, pollMs: 10, waitMs: 50 });
  assert.ok(calls.some((call) => call?.name === 'deck_reply'), 'the reply was let through');
  assert.deepEqual([...heard].sort(), ['/api/chain', '/api/record', '/api/runs', '/api/tool', '/events']);
});

test('an end event makes watch call end once and stop', async (t) => {
  scratchHome(t);
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items: [] });
  const stopping = new AbortController();
  t.after(() => stopping.abort());
  let ended = 0;

  const watching = wrapper.watch({ cwd: OURS, type: () => {}, signal: stopping.signal, retryMs: 20, end: () => { ended += 1; } });
  await eventually(() => stream.connected() === 1, 'the subscription');
  stream.end();
  stream.end();

  // Never aborted here: the end event alone is what stops the watcher.
  const stillWatching = new Promise((resolve) => setTimeout(() => resolve('still watching'), 2000));
  assert.equal(await Promise.race([watching, stillWatching]), true);
  assert.equal(ended, 1, 'once, however many arrive');
  await settle();
  assert.equal(stream.subscriptions(), 1, 'and it does not subscribe again');
});

test('the watcher waits for this directory to be a run before it subscribes at all', async (t) => {
  scratchHome(t);
  // The deck opens a browser when a session registers and nobody is reading
  // `/events` yet; a wrapper that subscribed first would cost the user that page.
  const stream = await deckWatching(t, { runs: [{ repo: THEIRS }], items: [item()] });
  const keys = keyboard();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await settle();

  assert.equal(stream.connected(), 0);
  assert.deepEqual(keys.typed, []);
  stopping.abort();
  assert.equal(await watching, false, 'and a deck this run is not on was never reached');
});

test('a fresh hand-off inside the cooldown is not typed for, however new its id', async (t) => {
  // The per-item claim makes the same hand-off arrive once; it says nothing
  // about a stream of new ones. The deck's port trusts any loopback caller and
  // mints a fresh id per post, and a forged hand-off has stashed nothing — so
  // without this, one local process could clear the session over and over.
  scratchHome(t);
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({
    cwd: OURS,
    type: keys.type,
    signal: stopping.signal,
    retryMs: 20,
    cooldownMs: 60_000,
  });
  await eventually(() => stream.connected() === 1, 'the subscription');
  stream.announce();
  await eventually(typedIs(keys, HANDED_OFF), 'the first hand-off typed');

  items.push(item()); // a different id, so the claim alone would let it through
  stream.announce();
  await settle();
  assert.deepEqual(keys.typed, HANDED_OFF, 'the cooldown is what holds, not the claim, and it holds for the prompt too');

  stopping.abort();
  await watching;
});

test('a cooldown that has passed lets the next real hand-off through', async (t) => {
  // A long run genuinely hands off more than once, so the bound must be a
  // cooldown and never "once per terminal".
  scratchHome(t);
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20, cooldownMs: 0 });
  await eventually(() => stream.connected() === 1, 'the subscription');
  stream.announce();
  await eventually(typedIs(keys, HANDED_OFF), 'the first hand-off typed');
  items.push(item());
  atRest(); // the fresh session's first turn ends after the second hand-off is posted
  stream.announce();
  await eventually(typedIs(keys, [...HANDED_OFF, ...HANDED_OFF]), 'the second hand-off typed');

  stopping.abort();
  await watching;
});

test('a change skipped in the cooldown is looked at again when the cooldown ends', async (t) => {
  // A co-pilot's release is a change event and the hold's only retry (clear-waits-co-pilot L5): one
  // that lands inside the cooldown must not be lost (QA F1, 2026-10-07: a /clear six minutes late).
  scratchHome(t);
  const items = [item()];
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();

  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20, cooldownMs: 600 });
  await eventually(() => stream.connected() === 1, 'the subscription');
  stream.announce();
  await eventually(typedIs(keys, HANDED_OFF), 'the first hand-off typed');

  items.push(item());
  atRest();
  stream.announce(); // inside the cooldown, and no change comes after it
  await settle();
  assert.deepEqual(keys.typed, HANDED_OFF, 'the cooldown still holds');
  await eventually(typedIs(keys, [...HANDED_OFF, ...HANDED_OFF]), 'the look when the cooldown ends');

  stopping.abort();
  await watching;
});

test('a stream that is not events is dropped and retried, not buffered without end', async (t) => {
  scratchHome(t);
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items: [item()], flood: true });
  const keys = keyboard();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(() => stream.subscriptions() > 1, 'a second subscription');

  assert.deepEqual(keys.typed, [], 'and nothing is typed on the strength of it');
  stopping.abort();
  assert.equal(await watching, true);
});

test('a deck that never answers is a wrapper that says so, not one that spins or throws', async (t) => {
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT); // nothing listening
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({
    cwd: OURS,
    type: () => assert.fail('nothing may be typed when there is no deck'),
    signal: stopping.signal,
    retryMs: 20,
  });
  await settle();
  stopping.abort();
  assert.equal(await watching, false);
});

test('a deck with no secret file is told by the missing-secret message, once, and nothing is typed', async (t) => {
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT);
  fs.rmSync(secretFile(), { force: true });
  const stopping = new AbortController();
  t.after(() => stopping.abort());
  const said = [];

  const watching = wrapper.watch({
    cwd: OURS,
    type: () => assert.fail('nothing may be typed with no secret'),
    signal: stopping.signal,
    retryMs: 20,
    say: (line) => said.push(line),
  });
  await settle();
  await settle();
  stopping.abort();
  assert.equal(await watching, false);
  assert.equal(said.length, 1);
  assert.match(said[0], /the deck has no secret at .*deck\.secret; start the deck with `pilot deck`/);
});

// --- node-pty is optional ---------------------------------------------------

test('a missing node-pty is a notice and a plain start, never a throw', async () => {
  const said = [];
  const code = await wrapper.run({
    load: async () => null,
    plain: async () => 3,
    say: (line) => said.push(line),
  });

  assert.equal(code, 3, 'and the child’s exit code is still the wrapper’s');
  const notice = said.join('');
  assert.equal(said.length, 1, 'one line, not a paragraph: the session starts either way');
  assert.match(notice, /node-pty/, 'it names what is missing');
  assert.match(notice, /\/clear/, 'and what the user therefore has to type themselves');
});

test('loadPty answers null rather than throwing when the module is absent or unbuildable', async () => {
  const loaded = await wrapper.loadPty();
  assert.ok(
    loaded === null || typeof loaded.spawn === 'function',
    'an optional dependency that failed to build must leave `pilot run` working, not broken',
  );
});

test('the child’s exit code is the wrapper’s exit code', async () => {
  assert.equal(await wrapper.startPlain(process.execPath, ['-e', 'process.exit(7)']), 7);
  assert.equal(await wrapper.startPlain(process.execPath, ['-e', '0']), 0);
});

// --- the terminal is owned, and given back ----------------------------------

/**
 * A pty that is not one. `failSetup` is the terminal that accepts a spawn and
 * then refuses to be wired up — the case that would otherwise leave a live
 * child nobody holds a reference to.
 */
function fakePty({ failSetup = false } = {}) {
  let onExit = null;
  const child = {
    written: [],
    resized: [],
    killed: 0,
    disposed: 0,
    write: (text) => child.written.push(text),
    resize: (cols, rows) => child.resized.push([cols, rows]),
    kill: () => { child.killed += 1; },
    onData: () => {
      if (failSetup) throw new Error('this terminal will not echo');
      return { dispose: () => { child.disposed += 1; } };
    },
    onExit: (fn) => { onExit = fn; return { dispose() {} }; },
    finish: (exitCode) => onExit({ exitCode, signal: 0 }),
  };
  const spawned = [];
  const argv = [];
  return { spawn: (file, args, options) => { spawned.push(options); argv.push(args); return child; }, child, spawned, argv };
}

/** Everything `startUnderPty` attaches to this process, counted. */
const wiring = () => ({
  input: process.stdin.listenerCount('data'),
  resize: process.stdout.listenerCount('resize'),
  sigint: process.listenerCount('SIGINT'),
  sigterm: process.listenerCount('SIGTERM'),
});

test('the session owns the terminal while it runs and gives every part of it back', async (t) => {
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT); // no deck: this test is about the terminal
  const before = wiring();
  const pty = fakePty();

  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: () => {} });
  await eventually(() => wiring().sigterm === before.sigterm + 1, 'the terminal wired');

  assert.deepEqual(wiring(), {
    input: before.input + 1,
    resize: before.resize + 1,
    sigint: before.sigint + 1,
    sigterm: before.sigterm + 1,
  }, 'keystrokes, resizes and the two signals that would otherwise orphan the pty');

  process.stdout.emit('resize');
  assert.equal(pty.child.resized.length, 1, 'a resize reaches the child, so the session is never the wrong shape');

  pty.child.finish(5);
  assert.equal(await running, 5, 'the child’s exit code is the wrapper’s');
  assert.deepEqual(wiring(), before, 'and nothing of this process is left wired to a pty that has gone');
  assert.equal(pty.child.disposed, 1);
});

test('with no secret file the missing-secret message is the only line, not "the deck never answered" too', async (t) => {
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT);
  fs.rmSync(secretFile(), { force: true });
  const pty = fakePty();
  const said = [];

  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: (line) => said.push(line) });
  await eventually(() => pty.spawned.length === 1, 'the pty spawned');
  await eventually(() => said.length > 0, 'the missing-secret message');
  pty.child.finish(0);
  await running;

  assert.equal(said.length, 1);
  assert.match(said[0], /the deck has no secret at /);
});

test('the session under the terminal is told who types its /clear, and for which directory', async (t) => {
  // `pilot handoff` reads these to say whether a /clear will be typed, and to post the
  // item for the directory this wrapper watches rather than wherever the shell has drifted.
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT);
  const pty = fakePty();

  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: () => {} });
  await eventually(() => pty.spawned.length === 1, 'the pty spawned');
  pty.child.finish(0);
  await running;

  const [{ env }] = pty.spawned;
  assert.equal(env.PILOT_RUN_PID, String(process.pid));
  assert.equal(env.PILOT_RUN_REPO, process.cwd());
  assert.equal(env.PATH ?? env.Path, process.env.PATH ?? process.env.Path, 'and the rest of the environment is the wrapper\'s own');
});

// Claude Code stops background shells under memory pressure, the pilot's listener among
// them, unless the session was started with this variable set; a shell cannot set it later.
// Cleared first, so a suite run inside a `pilot run` session does not pass on its own env.
function withoutReapVariable(t) {
  const was = process.env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP;
  delete process.env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP;
  t.after(() => { if (was !== undefined) process.env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP = was; });
}

test('the pty spawn\'s env carries CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1 beside PILOT_RUN_PID and PILOT_RUN_REPO', async (t) => {
  withoutReapVariable(t);
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT);
  const pty = fakePty();

  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: () => {} });
  await eventually(() => pty.spawned.length === 1, 'the pty spawned');
  pty.child.finish(0);
  await running;

  const [{ env }] = pty.spawned;
  assert.equal(env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP, '1');
  assert.equal(env.PILOT_RUN_PID, String(process.pid));
  assert.equal(env.PILOT_RUN_REPO, process.cwd());
});

test('the plain spawn\'s env carries it too, and the rest of process.env', async (t) => {
  withoutReapVariable(t);
  const probe = 'process.exit(process.env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP === "1" && process.env.PATH === process.env.PILOT_S12_PATH ? 3 : 4)';
  process.env.PILOT_S12_PATH = process.env.PATH;
  try {
    assert.equal(await wrapper.startPlain(process.execPath, ['-e', probe]), 3);
  } finally {
    delete process.env.PILOT_S12_PATH;
  }
});

test('the terminal is the one node-pty ships, not the one built into Windows', async (t) => {
  // Windows 11 22631's own pseudoconsole lets the CLI's full-screen drawing drift until a
  // resize repaints it (the user, 2026-09-28); the library node-pty bundles is newer.
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT);
  const pty = fakePty();

  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: () => {} });
  await eventually(() => pty.spawned.length === 1, 'the pty spawned');
  pty.child.finish(0);
  await running;

  const [{ useConptyDll }] = pty.spawned;
  assert.equal(useConptyDll, true);
});

test('run() kills its pty child on end', async (t) => {
  // The daemon kills nothing (L1): End reaches the wrapper as an event, and the wrapper
  // stops the session it owns, the same way a SIGTERM does.
  scratchHome(t);
  const stream = await deckWatching(t, { runs: [{ repo: process.cwd() }], items: [] });
  const before = wiring();
  const pty = fakePty();
  t.after(() => pty.child.finish(0)); // a red run still lets its wrapper go

  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: () => {} });
  await eventually(() => stream.connected() === 1, 'the wrapper on its stream');
  assert.equal(pty.child.killed, 0);

  stream.end();
  await eventually(() => pty.child.killed >= 1, 'the pty child killed');

  // Never `finish`ed: a ConPTY killed through node-pty's own DLL need never fire its exit
  // (seen on the live gate, 2026-09-30), and a wrapper waiting on it keeps its window open.
  const stillRunning = new Promise((resolve) => setTimeout(() => resolve('still running'), 1000));
  assert.equal(await Promise.race([running, stillRunning]), 1, 'the wrapper returns, as a killed session does');
  assert.deepEqual(wiring(), before, 'with the terminal given back');
});

test('a terminal that will not wire up kills what it spawned and starts plainly', async (t) => {
  scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT);
  const before = wiring();
  const pty = fakePty({ failSetup: true });
  const said = [];

  const code = await wrapper.run({ load: async () => pty, plain: async () => 42, say: (line) => said.push(line) });

  assert.equal(code, 42, 'the user still gets their pilot');
  assert.equal(pty.child.killed, 1, 'and the half-started pty is not left behind');
  assert.deepEqual(wiring(), before, 'nor is this process left listening for it');
  assert.match(said.join(''), /plainly/);
});

test('a claude that is not on the PATH is one line, not a stack trace', async () => {
  const said = [];
  const code = await wrapper.startPlain(
    path.join(os.tmpdir(), 'pilot-s23-no-such-claude'),
    [],
    (line) => said.push(line),
  );
  assert.notEqual(code, 0);
  assert.equal(said.length, 1);
  assert.match(said.join(''), /pilot run/);
});

test('run() with no claude on an absolute PATH entry is 127 and one line, never the bare name', async (t) => {
  const { PATH } = process.env;
  t.after(() => { process.env.PATH = PATH; });
  process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-run-no-claude-')); // absolute, and empty
  const said = [];
  const code = await wrapper.run({
    load: async () => assert.fail('nothing is loaded before the binary is found'),
    plain: async () => assert.fail('nothing is started'),
    say: (line) => said.push(line),
  });
  assert.equal(code, 127);
  assert.deepEqual(said, ['pilot run: could not start claude: no absolute PATH entry has it\n']);
});

// --- the pilot survives /bg -------------------------------------------------

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..', '..');
const EVERYTHING = { level: 'everything', chosen: false };
const NOTHING = { level: 'nothing', chosen: true };

test('the pilot is also the session’s default agent, so a /bg then /clear lands in the pilot', () => {
  const args = wrapper.claudeArgs(EVERYTHING, PLUGIN_ROOT);
  assert.deepEqual(args.slice(0, 2), ['--agent', 'pilot:pilot']);
  const at = args.indexOf('--settings');
  assert.ok(at > 0, '`/bg` carries --settings into the background session and drops --agent');
  assert.equal(JSON.parse(args[at + 1]).agent, 'pilot:pilot');
  assert.deepEqual(JSON.parse(args[at + 1]), { agent: 'pilot:pilot', enabledPlugins: { 'pilot@pilot': true } }, 'everything adds no status line');
  assert.equal(args.includes('--add-dir'), false, 'and no rules root');
});

// --- the session starts on the deck's run -----------------------------------

test('the session is started with the prompt to resume the run on this deck, or else to start the next red ticket', () => {
  const args = wrapper.claudeArgs(EVERYTHING, PLUGIN_ROOT);
  assert.equal(args.at(-1), 'Resume the run on this deck if there is one; if there is nothing to resume, take the next red ticket and start it. Start listening to the deck now.');
  assert.equal(args.at(-1), wrapper.RESUME_PROMPT);
  assert.equal(args.filter((arg) => !arg.startsWith('--')).length, 3, 'two option values and one prompt, so the prompt is the only positional');
});

// --- plain-session S1: the plugin enabled for this process only (L1, A3, A4) ---

test('the prompt stays last after a variadic --add-dir', () => {
  const args = wrapper.claudeArgs(NOTHING, PLUGIN_ROOT);
  const addDir = args.indexOf('--add-dir');
  assert.ok(addDir >= 0, 'below everything the rules root is added');
  assert.ok(addDir < args.indexOf('--agent'), '--add-dir precedes --agent, so it swallows no positional');
  assert.equal(args[addDir + 1], path.join(os.homedir(), '.claude', 'pilot', 'rules-root'));
  assert.equal(args.at(-1), wrapper.RESUME_PROMPT);
  const settings = JSON.parse(args[args.indexOf('--settings') + 1]);
  assert.deepEqual(settings.enabledPlugins, { 'pilot@pilot': true });
  assert.deepEqual(settings.statusLine, statusLineSetting(PLUGIN_ROOT), 'the status line rides in the run settings below everything');
  assert.deepEqual(settings.subagentStatusLine, subagentStatusLineSetting(PLUGIN_ROOT), 'and so does the subagent status line');
  assert.deepEqual(wrapper.claudeArgs({ level: 'rules', chosen: true }, PLUGIN_ROOT), args, 'rules adds the same as nothing');
});

test('both spawn paths carry the args and env', async (t) => {
  const home = scratchHome(t);
  process.env.PILOT_DECK_PORT = String(PORT);
  fs.mkdirSync(path.join(home, '.claude', 'pilot'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'pilot', 'reach.json'), JSON.stringify({ level: 'nothing', at: '' }));
  const expected = wrapper.claudeArgs(NOTHING, PLUGIN_ROOT);
  assert.equal(wrapper.runEnv(NOTHING).CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, '1');
  assert.equal(wrapper.runEnv(EVERYTHING).CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, undefined);

  const pty = fakePty();
  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: () => {} });
  await eventually(() => pty.spawned.length === 1, 'the pty spawned');
  pty.child.finish(0);
  await running;
  assert.deepEqual(pty.argv[0], expected);
  assert.equal(pty.spawned[0].env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, '1');
  assert.equal(pty.spawned[0].env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP, '1');

  const started = [];
  const code = await wrapper.run({
    load: async () => null,
    plain: async (command, args, say, options) => { started.push({ args, options }); return 0; },
    say: () => {},
  });
  assert.equal(code, 0);
  assert.deepEqual(started[0].args, expected);
  assert.equal(started[0].options.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, '1');
  assert.equal(started[0].options.env.CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP, '1');
});

// --- yellow-agent S8: `pilot run --sub` is gone (ADR 0088) -------------------

const PILOT_BIN = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));

/** `pilot <args>` in a scratch directory, the deck pointed at a port nothing serves. */
const pilotCli = (t, ...args) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s8-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };
  const done = spawnSync(process.execPath, [PILOT_BIN, ...args], { cwd: dir, encoding: 'utf8', env, timeout: 20_000 });
  return { code: done.status, out: done.stdout, err: done.stderr };
};

test('pilot run --sub is refused by name', (t) => {
  assert.deepEqual(pilotCli(t, 'run', '--sub'), { code: 1, out: '', err: 'pilot run: unknown option --sub\n' });
});

test('startSession takes no sub option', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s8-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push(args);
    return { on() {}, unref() {} };
  };
  startSession(repo, { sub: true, spawn, platform: 'win32', env: {}, execPath: 'C:/node.exe', bin: 'C:/pilot.mjs' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(-2), ['"C:/pilot.mjs"', 'run'], 'a plain pilot run, whatever is passed');
  assert.ok(calls[0].includes('"pilot run"'), 'titled as the one session there is');
});

test('pilot --help names no --sub', (t) => {
  const { code, out } = pilotCli(t, '--help');
  assert.equal(code, 0);
  const entry = out.slice(out.indexOf('  pilot run '), out.indexOf('  pilot handoff'));
  assert.match(entry, /start the pilot/);
  assert.doesNotMatch(entry, /--sub|sub-deck/);
});

// --- S17: every decision logged, and a hand-off that never reaches a session said aloud ---

/** The log both halves append to, under the test's own home. */
const wrapperLog = (home) => {
  try {
    return fs.readFileSync(path.join(home, '.claude', 'pilot', 'wrapper.log'), 'utf8');
  } catch {
    return '';
  }
};

test('the wrapper logs the /clear it typed and the marker it waited for', async (t) => {
  const home = scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10 }), true);
  const log = wrapperLog(home);
  assert.match(log, new RegExp(`^\\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z run: typed /clear for ${stash.id}$`, 'm'));
  assert.match(log, new RegExp(`Z run: marker for ${stash.id}, typed the prompt$`, 'm'));
});

test('a stop during the settle types the paste and no Enter (F5)', async (t) => {
  const home = scratchHome(t);
  const stash = item();
  await deckHolding(t, [stash]);
  const stop = new AbortController();
  const keys = keyboard([stash]);
  const type = (text) => {
    keys.type(text);
    if (text.startsWith('\x1b[200~')) stop.abort();
  };
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type, signal: stop.signal, pollMs: 10 }), true);
  assert.deepEqual(keys.typed, ['/clear\r', pasted('Pick up the hand-off on the deck.')]);
  assert.match(wrapperLog(home), new RegExp(`Z run: stopped before the prompt was taken for ${stash.id}$`, 'm'));
});

test('on no marker the wrapper posts the failure on the handoff thread and the chat, and types no prompt', async (t) => {
  const home = scratchHome(t);
  const stash = item();
  const chat = item({ kind: 'chat', title: 'Chat', body: '' });
  const calls = await deckHolding(t, [chat, stash]);
  const keys = keyboard();
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, waitMs: 50 }), true);
  assert.deepEqual(keys.typed, ['/clear\r'], 'no prompt into a session nobody marked');
  const replies = calls.filter((c) => c?.name === 'deck_reply');
  assert.deepEqual(replies.map((c) => c.arguments.id), [stash.id, chat.id], 'one on the thread, one in the chat');
  for (const reply of replies) {
    assert.equal(reply.arguments.text, `no fresh session marked for ${stash.id} within 1 min; type /clear yourself`, 'the wait it was given, rounded up (N8)');
  }
  assert.match(wrapperLog(home), new RegExp(`Z run: no marker for ${stash.id} after 50$`, 'm'));
  assert.ok(fs.existsSync(path.join(home, '.claude', 'pilot-inbox', 'claims', `${wrapper.claimNameFor(stash.id)}.claim`)),
    'the claim is kept: one hand-off never clears a session twice');
});

// handoff-prompt S3: a prompt the fresh session never took is said once, never silent (spec 2, 3).
const NOT_STARTED = /^hand-off itm_[0-9a-f]{12} not started: no tool call within 1 min of its prompt or of a second Enter; look at the terminal$/;

test('not started is said on the thread', async (t) => {
  const home = scratchHome(t);
  const stash = item();
  const chat = item({ kind: 'chat', title: 'Chat', body: '' });
  const calls = await deckHolding(t, [chat, stash]);
  const keys = keyboard([stash], { takes: false });
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, takenWaitMs: 50 }), true);
  assert.deepEqual(keys.typed, [...HANDED_OFF, '\r'], 'one retype, never two');
  const replies = calls.filter((c) => c?.name === 'deck_reply');
  assert.deepEqual(replies.map((c) => c.arguments.id), [stash.id], 'one reply, on the hand-off');
  assert.match(replies[0].arguments.text, NOT_STARTED);
  assert.ok(replies[0].arguments.text.includes(stash.id));
  assert.match(wrapperLog(home), new RegExp(`Z run: retyped Enter for ${stash.id}\\n.*Z run: hand-off not started for ${stash.id}$`, 'm'));
});

test('a closed thread falls back to the chat', async (t) => {
  scratchHome(t);
  const stash = item();
  const chat = item({ kind: 'chat', title: 'Chat', body: '' });
  const calls = await deckHolding(t, [chat, stash], (body) => body?.name === 'deck_reply' && body.arguments.id === stash.id);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keyboard([stash], { takes: false }).type, pollMs: 10, takenWaitMs: 50 }), true);
  const replies = calls.filter((c) => c?.name === 'deck_reply');
  assert.deepEqual(replies.map((c) => c.arguments.id), [stash.id, chat.id], 'the thread refused, so the chat');
  assert.match(replies[1].arguments.text, NOT_STARTED);
});

test('a thread that refuses the missing-marker reply still gets the chat line (F10)', async (t) => {
  const home = scratchHome(t);
  const stash = item();
  const chat = item({ kind: 'chat', title: 'Chat', body: '' });
  const calls = await deckHolding(t, [chat, stash], (body) => body?.name === 'deck_reply' && body.arguments.id === stash.id);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keyboard().type, pollMs: 10, waitMs: 50 }), true);
  assert.deepEqual(calls.filter((c) => c?.name === 'deck_reply').map((c) => c.arguments.id), [stash.id, chat.id]);
  assert.ok(wrapperLog(home).includes(`run: could not post the notice for ${stash.id} on the thread (the deck answered deck_reply with 400)`));
});

test('a hand-off closed while the posting turn ran is not cleared into (itm_3b422012fde0)', async (t) => {
  // Found on run 1's finish: the chain posted the hand-off mid-turn, the wrapper took its claim and
  // waited for the turn to end; in that turn the pilot resolved the hand-off itself, the /clear then
  // threw the session away anyway, and the lane — rightly — found nothing open to hand over.
  const home = scratchHome(t);
  const stash = item({ postedAt: new Date(Date.now() + 100).toISOString() });
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  stash.resolvedAt = new Date().toISOString(); // the pilot closes it before its turn ends
  atRest();

  assert.equal(await typing, false);
  assert.deepEqual(keys.typed, [], 'no /clear for a hand-off nobody will be handed');
  assert.equal(fs.existsSync(path.join(home, '.claude', 'pilot-inbox', 'claims', `${wrapper.claimNameFor(stash.id)}.claim`)),
    false, 'the claim means "typed", and nothing was');
  assert.match(wrapperLog(home), new RegExp(`Z run: no /clear for ${stash.id} \\(closed before the turn ended\\)$`, 'm'));
});

test('a hand-off superseded while the posting turn ran is left for the next look', async (t) => {
  const home = scratchHome(t);
  const stash = item({ postedAt: new Date(Date.now() + 100).toISOString() });
  const items = [stash];
  await deckHolding(t, items);
  const keys = keyboard(items);

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const newer = item();
  items.push(newer);
  atRest();

  assert.equal(await typing, false);
  assert.deepEqual(keys.typed, []);
  assert.match(wrapperLog(home), new RegExp(`Z run: no /clear for ${stash.id} \\(superseded by ${newer.id}\\)$`, 'm'));
});

// --- clear-waits-co-pilot S1: a hand-off waits for the co-pilot's release (spec 1, 3, 6, 7; L5, L7, L11) ---

const CO_PILOT_TICKET = 'itm_0f0e0a0b0c0d';
/** The `co-pilot` field of `GET /api/record`, as the wrapper's injected reader answers it. */
const liveCoPilot = () => async () => ({ ticket: CO_PILOT_TICKET, live: true, at: new Date(Date.now() - 1000).toISOString() });
const releasedAt = (at) => async () => ({ ticket: CO_PILOT_TICKET, live: false, at });
/** The hold the wrapper posts (held-handoff L2): item state through `/api/hold`, never a `deck_reply`. */
const HOLD = (id) => ({ name: '/api/hold', arguments: { id, ticket: CO_PILOT_TICKET } });
const pauseFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a chain hand-off with a live co-pilot types nothing, and gives the claim back', async (t) => {
  scratchHome(t);
  const stash = item({ title: 'Next run: the next ticket', next: 'itm_aaaaaaaaaaaa' });
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 50 }), false);
  assert.deepEqual(keys.typed, []);
  assert.equal(deck.claimed(wrapper.claimNameFor(stash.id)), false, 'the release\'s change event tries again');
});

test('a released co-pilot lets the /clear through after the next turn end', async (t) => {
  scratchHome(t);
  const stash = item({ next: 'itm_aaaaaaaaaaaa', postedAt: new Date(Date.now() - 5000).toISOString() });
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest(); // the turn ended before the release
  await pauseFor(20);
  const coPilot = releasedAt(new Date().toISOString());

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot, pollMs: 10, restWaitMs: 50 }), false, 'the hand-back turn is still running');
  assert.deepEqual(keys.typed, []);

  atRest(); // the turn after the release ends
  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot, pollMs: 10, restWaitMs: 50 }), true);
  assert.deepEqual(keys.typed, HANDED_OFF);
});

test('a co-pilot set again before the turn ends holds it again', async (t) => {
  scratchHome(t);
  const stash = item({ next: 'itm_aaaaaaaaaaaa', postedAt: new Date(Date.now() + 100).toISOString() });
  const calls = await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  let set = false; // released when the hand-off is found, set again while the posting turn runs
  const coPilot = () => (set ? liveCoPilot() : releasedAt(new Date(Date.now() - 2000).toISOString()))();

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot, pollMs: 10, restWaitMs: 2000 });
  await pauseFor(150);
  set = true;
  atRest();

  assert.equal(await typing, false);
  assert.deepEqual(keys.typed, []);
  assert.deepEqual(calls.filter((call) => call?.name === '/api/hold'), [HOLD(stash.id)]);
  assert.equal(calls.some((call) => call?.name === 'deck_reply'), false, 'a hold is not a reply');
  assert.equal(deck.claimed(wrapper.claimNameFor(stash.id)), false, "the release's change event tries again");
});

test('a co-pilot set and released while the turn ran waits for the turn after that release, in the same look', async (t) => {
  // Review finding: the release's own change event found the claim taken, so returning here left nothing to retry.
  scratchHome(t);
  const stash = item({ next: 'itm_aaaaaaaaaaaa', postedAt: new Date(Date.now() - 5000).toISOString() });
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest();
  await pauseFor(20);
  const later = new Date().toISOString(); // released after the turn that satisfied the first wait
  const coPilot = releasedAt(later);

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot, pollMs: 10, restWaitMs: 2000 });
  await pauseFor(150);
  assert.deepEqual(keys.typed, [], 'the turn after the release has not ended');
  atRest();
  assert.equal(await typing, true);
  assert.deepEqual(keys.typed, HANDED_OFF);
});

test('a context hand-off with a live co-pilot types nothing until the release', async (t) => {
  scratchHome(t);
  const stash = item({ postedAt: new Date(Date.now() - 5000).toISOString() }); // `pilot handoff`'s: no `next`
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 50 }), false);
  assert.deepEqual(keys.typed, [], 'held like a chain hand-off (L11)');

  await pauseFor(20);
  const released = releasedAt(new Date().toISOString());
  await pauseFor(5);
  atRest(); // the pilot's turn that released it ends
  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot: released, pollMs: 10, restWaitMs: 50 }), true);
  assert.deepEqual(keys.typed, HANDED_OFF);
});

test('the wrapper marks the hold and logs the same ticket', async (t) => {
  const home = scratchHome(t);
  const stash = item({ next: 'itm_aaaaaaaaaaaa' });
  const calls = await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest();

  await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 50 });
  await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 50 });

  assert.deepEqual(calls.filter((call) => call?.name === '/api/hold'), [HOLD(stash.id), HOLD(stash.id)], 'each look marks it; the deck keeps the first');
  assert.equal(calls.some((call) => call?.name === 'deck_reply'), false, 'no reply on the thread (A1)');
  const logged = wrapperLog(home).match(new RegExp(`Z run: held ${stash.id} for the co-pilot on ${CO_PILOT_TICKET}$`, 'gm'));
  assert.equal(logged?.length, 1, 'logged once, when the deck wrote it');
  assert.equal(deck.claimed(`clear-held-${stash.id}`), false, 'no claim of its own any more');
});

test('a hold the deck will not take is logged, and the hand-off stays held', async (t) => {
  const home = scratchHome(t);
  const stash = item({ next: 'itm_aaaaaaaaaaaa' });
  await deckHolding(t, [stash], (body) => body?.name === '/api/hold');
  const keys = keyboard([stash]);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 50 }), false);
  assert.deepEqual(keys.typed, []);
  assert.match(wrapperLog(home), new RegExp(`Z run: could not post the hold on ${stash.id} \\(the deck answered /api/hold with 400\\)$`, 'm'));
  assert.equal(deck.claimed(wrapper.claimNameFor(stash.id)), false);
});

test('a co-pilot read the deck refuses throws, and gives the claim back', async (t) => {
  scratchHome(t);
  const stash = item({ next: 'itm_aaaaaaaaaaaa', postedAt: new Date(Date.now() - 5000).toISOString() });
  await deckHolding(t, [stash], () => false, (response) => {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end('{}');
  });
  const keys = keyboard([stash]);
  atRest();

  await assert.rejects(wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, restWaitMs: 50 }), /the deck answered \/api\/record with 500/);
  assert.deepEqual(keys.typed, []);
  assert.equal(deck.claimed(wrapper.claimNameFor(stash.id)), false);
});

// --- held-handoff S2: Handoff failed on a held hand-off re-arms the /clear (spec 3, L3) ---

const LIVE = { ticket: CO_PILOT_TICKET, live: true, at: new Date(Date.now() - 60_000).toISOString() };
const rearmed = (rearmedAt, given = {}) => item({ hold: { ticket: CO_PILOT_TICKET, at: LIVE.at, rearmedAt }, ...given });

test('a re-armed directory clears with the co-pilot live', () => {
  const press = new Date().toISOString();
  const now = Date.now();

  assert.deepEqual(wrapper.holdFor([rearmed(press)], OURS, LIVE, now), { clear: true, why: 'rearmed', since: Date.parse(press) });
  assert.deepEqual(wrapper.holdFor([item()], OURS, LIVE, now), { clear: false, ticket: CO_PILOT_TICKET, until: now + 20 * 60 * 1000 }, 'held without the press');
  assert.deepEqual(wrapper.holdFor([item()], OURS, null, now), { clear: true, why: 'free', since: 0 });
  const released = { ...LIVE, live: false };
  assert.deepEqual(wrapper.holdFor([item()], OURS, released, now), { clear: true, why: 'free', since: Date.parse(LIVE.at) });
  const later = new Date(now + 1000).toISOString();
  assert.deepEqual(wrapper.holdFor([rearmed(press)], OURS, { ...LIVE, live: false, at: later }, now),
    { clear: true, why: 'rearmed', since: Date.parse(later) }, 'a release after the press: the turn after it (review)');
  assert.equal(wrapper.holdFor([rearmed(press, { repo: THEIRS })], OURS, LIVE, now).clear, false, 'another directory\'s press');
  assert.equal(wrapper.holdFor([rearmed(press, { resolvedAt: press })], OURS, LIVE, now).clear, false, 'a closed one\'s');
});

test('a re-arm on a superseded hand-off clears the newest', () => {
  const press = new Date().toISOString();
  const items = [rearmed(press), item()];

  assert.deepEqual(wrapper.holdFor(items, OURS, LIVE, Date.now()), { clear: true, why: 'rearmed', since: Date.parse(press) });
});

test('the re-armed /clear waits for a turn end after the press', async (t) => {
  const home = scratchHome(t);
  const stash = item({ postedAt: new Date(Date.now() - 5000).toISOString() });
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest(); // the turn that posted it ended, and the co-pilot held it
  await pauseFor(20);
  stash.hold = { ticket: CO_PILOT_TICKET, at: LIVE.at, rearmedAt: new Date().toISOString() }; // the press

  const typing = wrapper.clearOnce({ cwd: OURS, type: keys.type, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 2000 });
  await pauseFor(150);
  assert.deepEqual(keys.typed, [], 'no /clear mid-turn: the turn the press started has not ended');
  atRest();

  assert.equal(await typing, true);
  assert.deepEqual(keys.typed, HANDED_OFF, 'typed with the co-pilot live');
  assert.match(wrapperLog(home), new RegExp(`Z run: re-armed by the user, typed /clear for ${stash.id}$`, 'm'));
});

test('a /clear typed by hand reaches the pty while a co-pilot is live', async (t) => {
  scratchHome(t);
  const server = http.createServer((request, response) => {
    request.resume();
    if (!/^\/api\/(runs|record)/.test(request.url)) return notModelled(response);
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ runs: [], record: null, coPilot: { ticket: CO_PILOT_TICKET, live: true, at: new Date().toISOString() } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(closing(server));
  process.env.PILOT_DECK_PORT = String(server.address().port);
  const pty = fakePty();

  const running = wrapper.run({ load: async () => pty, plain: async () => 99, say: () => {} });
  await eventually(() => pty.spawned.length === 1, 'the pty spawned');
  process.stdin.emit('data', Buffer.from('/clear\r'));
  pty.child.finish(0);
  await running;

  assert.deepEqual(pty.child.written, ['/clear\r'], 'the user\'s keys go in unchanged, co-pilot or none');
});

// handoff-over-mark S1, spec 1: a finish under the mark posts no hand-off, so the wrapper has nothing to clear on.
test('no hand-off, no clear', async (t) => {
  scratchHome(t);
  tempDeck(t);
  const run = registerRun({ repo: OURS, pid: process.pid });
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Next', body: shapedTicketBody('spec'), repo: OURS });
  setSlices(run.id, [], undefined, { slug: 'feature-one', finished: FINISHED_CLEAN });
  chainNext(OURS, { pastMark: () => false });
  const items = listItems();
  await deckHolding(t, items);
  const keys = keyboard(items);
  atRest();

  assert.equal(await wrapper.clearOnce({ cwd: OURS, type: keys.type, pollMs: 10, waitMs: 50, restWaitMs: 50 }), false);
  assert.deepEqual(keys.typed, [], 'nothing typed into the session that holds the ticket');
});

// --- held-handoff S3: a hold past 20 minutes types the /clear anyway (spec 4, 6; L4-L6) ---

const BOUND = 20 * 60 * 1000;
// After the fixtures' go-live (LIVE, liveCoPilot, both near the real now), so the bound counts from the hold; the F4 case below pins the other way.
const HELD_AT = Date.now() + 24 * 60 * 60 * 1000;
const heldSince = (at, given = {}) => item({ hold: { ticket: CO_PILOT_TICKET, at: new Date(at).toISOString() }, ...given });

test('a hold under 20 minutes stays held', () => {
  assert.deepEqual(wrapper.holdFor([heldSince(HELD_AT)], OURS, LIVE, HELD_AT + BOUND - 1000),
    { clear: false, ticket: CO_PILOT_TICKET, until: HELD_AT + BOUND });
});

test('a hold at 20 minutes clears with the co-pilot live', () => {
  assert.deepEqual(wrapper.holdFor([heldSince(HELD_AT)], OURS, LIVE, HELD_AT + BOUND), { clear: true, why: 'bound', since: 0 });
});

test('the bound counts from the earliest held hand-off in the directory', () => {
  const items = [
    heldSince(HELD_AT - 60_000, { repo: THEIRS }),
    heldSince(HELD_AT - 30_000, { resolvedAt: new Date(HELD_AT).toISOString() }),
    heldSince(HELD_AT),
    heldSince(HELD_AT + 5 * 60_000),
  ];

  assert.equal(wrapper.holdFor(items, OURS, LIVE, HELD_AT + 10 * 60_000).until, HELD_AT + BOUND, 'from the oldest open hold here');
});

test('the bound fires on a timer with no change event', async (t) => {
  scratchHome(t);
  const stash = heldSince(HELD_AT, { postedAt: new Date(Date.now() - 5000).toISOString() });
  await deckHolding(t, [stash]);
  const woken = [];
  atRest();

  const typed = await wrapper.clearOnce({
    cwd: OURS, type: () => {}, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 50, now: () => HELD_AT + 60_000, wake: (at) => woken.push(at),
  });
  assert.equal(typed, false);
  assert.deepEqual(woken, [HELD_AT + BOUND], 'the hold names the moment it ends');

  // The watch loop's own timer: the hold ends 300 ms from now, and no change event comes after the first.
  const soon = heldSince(Date.now() - BOUND + 300);
  const items = [soon];
  const record = (response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ record: null, coPilot: { ticket: CO_PILOT_TICKET, live: true, at: new Date(Date.now() - BOUND - 1000).toISOString() } }));
  };
  const stream = await deckWatching(t, { runs: [{ repo: OURS }], items, record });
  const keys = keyboard(items);
  atRest();
  const stopping = new AbortController();
  t.after(() => stopping.abort());

  const watching = wrapper.watch({ cwd: OURS, type: keys.type, signal: stopping.signal, retryMs: 20 });
  await eventually(() => stream.connected() === 1, 'the subscription');
  stream.announce();
  await settle();
  assert.deepEqual(keys.typed, [], 'held while the co-pilot is live');
  await eventually(typedIs(keys, HANDED_OFF), 'the /clear when the bound ends');

  stopping.abort();
  await watching;
});

test('the forced /clear is logged with the live ticket', async (t) => {
  const home = scratchHome(t);
  const stash = heldSince(HELD_AT, { postedAt: new Date(Date.now() - 5000).toISOString() });
  await deckHolding(t, [stash]);
  const keys = keyboard([stash]);
  atRest();

  assert.equal(await wrapper.clearOnce({
    cwd: OURS, type: keys.type, coPilot: liveCoPilot(), pollMs: 10, restWaitMs: 50, now: () => HELD_AT + BOUND + 1000,
  }), true);
  assert.deepEqual(keys.typed, HANDED_OFF);
  assert.match(wrapperLog(home),
    new RegExp(`Z run: hold on ${stash.id} past 20 min, typed /clear with the co-pilot on ${CO_PILOT_TICKET} live$`, 'm'));
});

test('a hold and press from before the co-pilot went live count from its go-live, and the bound still fires (QA F4)', () => {
  const now = Date.now();
  const hoursBefore = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  const stale = item({ hold: { ticket: CO_PILOT_TICKET, at: hoursBefore, rearmedAt: hoursBefore } });
  const goLive = Date.parse(LIVE.at);

  assert.deepEqual(wrapper.holdFor([stale], OURS, LIVE, now), { clear: false, ticket: CO_PILOT_TICKET, until: goLive + BOUND });
  assert.deepEqual(wrapper.holdFor([stale], OURS, LIVE, goLive + BOUND), { clear: true, why: 'bound', since: 0 }, 'never slides past it');
});
