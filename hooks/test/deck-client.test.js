#!/usr/bin/env node
/**
 * `hooks/lib/deck.js` is the whole of a hook's conversation with the deck, and
 * so it is the whole of what can go wrong on that side. The slice's other tests
 * run it against a real daemon, which by construction answers properly; this one
 * runs it against things that are not a deck, because "no hook that fails
 * closed" is a promise about exactly those cases and nothing was requiring it.
 *
 * Every shape of not-being-a-deck is asserted twice: that the client rejects,
 * which is what tells a caller to stay silent, and that the Stop gate then lets
 * the turn end. The second is the one that matters — a gate that blocked because
 * it could not reach the deck would be a pilot that can never stop, and the only
 * way out would be killing the session.
 *
 * Nothing here binds or reads the real deck: every server is on a port the
 * operating system hands out, and every home is a scratch directory.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');

/** Where the hook keeps what it knows, spelled out rather than asked for. */
const STATE_DIR = ['.claude', 'pilot-inbox'];
const CLAIM_DIR = ['.claude', 'pilot-inbox', 'claims'];

/**
 * A home of this test's own. `lib/deck.js` reads `os.homedir()` when it is asked
 * and not when it loads, so redirecting the environment is enough and the module
 * cache is left alone.
 */
function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s5-lib-'));
  const before = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PILOT_DECK_PORT: process.env.PILOT_DECK_PORT,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

/**
 * A server on the loopback that answers however this test says, and which is
 * never a deck. Its sockets are tracked because one of these answers is not
 * answering, and a server with a request still parked on it never closes.
 */
async function stubDeck(t, answer) {
  const sockets = new Set();
  const server = http.createServer(answer);
  server.on('connection', function (socket) {
    sockets.add(socket);
    socket.on('close', function () { sockets.delete(socket); });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });

  t.after(function () {
    for (const socket of sockets) socket.destroy();
    return new Promise(function (resolve) { server.close(resolve); });
  });

  process.env.PILOT_DECK_PORT = String(server.address().port);
}

/** A session that has been on the deck, so the gate gets as far as asking it. */
function onTheDeck(home, sessionId) {
  fs.mkdirSync(path.join(home, STATE_DIR[0], STATE_DIR[1]), { recursive: true });
  fs.writeFileSync(
    path.join(home, STATE_DIR[0], STATE_DIR[1], sessionId + '.json'),
    JSON.stringify({ baseline: 1, cursor: 1 })
  );
}

const stopping = function (sessionId) {
  return stopGate.run({
    session_id: sessionId,
    cwd: process.cwd(),
    hook_event_name: 'Stop',
    stop_hook_active: false,
  });
};

// --- every way of not being a deck -----------------------------------------

const NOT_A_DECK = [
  {
    what: 'never answers at all',
    // Parked and never replied to. The hook is the one that has to give up:
    // this runs after every tool call, and a tool call the user waits on is the
    // cost of getting that wrong.
    answer: function () { /* nothing, ever */ },
  },
  {
    what: 'answers with something that is not JSON',
    answer: function (request, response) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html>a proxy, or somebody else entirely</html>');
    },
  },
  {
    what: 'answers with a refusal',
    answer: function (request, response) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'the deck fell over reading its store' }));
    },
  },
  {
    what: 'answers with more than a hook will read',
    answer: function (request, response) {
      response.writeHead(200, { 'content-type': 'application/json' });
      // Well-formed, and far past the two megabytes a hook is willing to hold.
      response.end('{"content":[{"type":"text","text":"' + 'x'.repeat(3 * 1024 * 1024) + '"}]}');
    },
  },
  {
    what: 'answers a tool with content that is not JSON',
    answer: function (request, response) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ content: [{ type: 'text', text: 'sorry, what?' }] }));
    },
  },
  {
    what: 'answers a tool with no content at all',
    answer: function (request, response) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    },
  },
];

for (const kind of NOT_A_DECK) {
  test('a deck that ' + kind.what + ' is a rejected promise', async function (t) {
    scratchHome(t);
    await stubDeck(t, kind.answer);

    await assert.rejects(
      function () { return deck.tool('deck_read', { open: true, limit: 20 }); },
      'every way of not being a deck rejects, so one path in each caller covers them all'
    );
  });

  test('a deck that ' + kind.what + ' never blocks a stop', async function (t) {
    const home = scratchHome(t);
    await stubDeck(t, kind.answer);
    onTheDeck(home, 'session-g');

    const first = await stopping('session-g');
    assert.ok(
      first === null || first.decision !== 'block',
      'a deck nobody can reach must never be able to stop the pilot stopping'
    );
    if (first) assert.match(first.systemMessage, /not answering/, 'the pilot is told why, once');

    const again = await stopping('session-g');
    assert.equal(again, null, 'and once is once, not at every attempt to end a turn');
  });
}

/**
 * The two tests above pass whichever of `tool`'s checks rejected — the status it
 * came back with, or the content it came back without — so between them the
 * status check was deletable with every test in this file green. `health` is the
 * seam where that check stands alone: nothing below it reads a body, so a deck
 * that has fallen over would be taken for a deck that answered, and the reason it
 * gave would be lost.
 */
test('a deck that answers with a refusal is a refusal, not an answer', async function (t) {
  scratchHome(t);
  await stubDeck(t, function (request, response) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'the deck fell over reading its store' }));
  });

  await assert.rejects(
    function () { return deck.health(); },
    /fell over reading its store/,
    'the status is read before the body, and the deck\'s own reason is what the caller is given'
  );
});

// --- what a claim is for ----------------------------------------------------

test('a claim given back brings an undelivered reply round again', function (t) {
  const home = scratchHome(t);

  assert.equal(deck.claim('session-c-r7'), true, 'the first copy of the hook wins it');
  assert.equal(deck.claim('session-c-r7'), false, 'and the others leave it to that one');
  assert.ok(fs.existsSync(path.join(home, CLAIM_DIR[0], CLAIM_DIR[1], CLAIM_DIR[2], 'session-c-r7.claim')));

  // Which is what the rollback does when the harness never received the write.
  deck.unclaim('session-c-r7');
  assert.equal(deck.claim('session-c-r7'), true, 'given back, the next tool call may deliver it');

  deck.unclaim('session-c-never-claimed');
  assert.equal(deck.claim('session-c-never-claimed'), true, 'giving back what was never taken is not an error');
});

// --- a state file that cannot be read ---------------------------------------

test('a state file cut short is taken away rather than left to wedge the session', function (t) {
  const home = scratchHome(t);
  const file = path.join(home, STATE_DIR[0], STATE_DIR[1], 'session-w.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"baseline":3,"cur');

  assert.equal(deck.readState('session-w'), null, 'half a state file is not a state');
  assert.ok(!fs.existsSync(file), 'and it does not survive being read');

  // Which is the whole point: startState creates exclusively, so a file it could
  // never overwrite would leave this session without a baseline for good, and a
  // session without a baseline never hears another reply as long as it lives.
  assert.deepStrictEqual(deck.startState('session-w', 9), { baseline: 9, cursor: 9 });
  assert.deepStrictEqual(deck.readState('session-w'), { baseline: 9, cursor: 9 });
});

test('a state file that is JSON but not a state is taken away too', function (t) {
  const home = scratchHome(t);
  const file = path.join(home, STATE_DIR[0], STATE_DIR[1], 'session-w.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ cursor: 4 }));

  assert.equal(deck.readState('session-w'), null, 'a cursor with no baseline is not a state either');
  assert.ok(!fs.existsSync(file));
});

test('a session with no state file at all leaves the directory as it found it', function (t) {
  const home = scratchHome(t);

  assert.equal(deck.readState('session-absent'), null);
  assert.ok(!fs.existsSync(path.join(home, STATE_DIR[0], STATE_DIR[1])), 'nothing is created by looking');
});
