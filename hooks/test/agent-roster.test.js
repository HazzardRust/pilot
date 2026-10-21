#!/usr/bin/env node
/**
 * Slice S5 of deck-workspace: the heartbeat that makes the roster (spec 9; L7,
 * L8, A1, ADR 0024).
 *
 * The deck learns which agents are live from the one hook that already fires
 * after every subagent's tool call. That makes this lane the hottest path in
 * the package, so what is tested here is mostly what it does *not* do: it does
 * not post on every call (the throttle), it does not post for the pilot, it
 * does not send anything about an agent beyond what it is and where it is
 * working, and it never fails a tool call because the deck is not there.
 *
 * The deck is a stub HTTP server rather than a real daemon, because the claim
 * is about the request this lane makes — its address, its method and every
 * field in its body — and a stub is the only way to read the body it actually
 * sent rather than what the daemon made of it. What the daemon does with it is
 * `deck/test/agents.test.mjs`.
 *
 * Every test takes a home of its own and a port of its own. Nothing here may
 * touch the real deck at 4321 or the real ~/.claude: this machine runs a live
 * deck with a walkthrough in it.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const roster = require('../agent-roster.js');
const deck = require('../lib/deck.js');

// --- harness ---------------------------------------------------------------

/**
 * A home of this test's own. The lane asks `os.homedir()` when it needs it
 * rather than when it loads, so redirecting the environment is enough and the
 * module cache is left alone.
 */
function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s5-roster-'));
  const before = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PILOT_DECK_PORT: process.env.PILOT_DECK_PORT,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // A test that does not stand a deck up must still not reach the real one.
  process.env.PILOT_DECK_PORT = '1';
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

/** A deck that records what was posted to it, on a port the lane is pointed at. */
async function aStubDeck(t) {
  const posts = [];
  const server = http.createServer(function (request, response) {
    let body = '';
    request.on('data', function (chunk) { body += chunk; });
    request.on('end', function () {
      let parsed;
      try { parsed = JSON.parse(body || '{}'); } catch (err) { parsed = { unparseable: body }; }
      posts.push({ method: request.method, path: request.url, body: parsed });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  process.env.PILOT_DECK_PORT = String(server.address().port);
  t.after(function () {
    return new Promise(function (resolve) {
      server.closeAllConnections();
      server.close(resolve);
    });
  });
  return posts;
}

/** What the harness hands a PostToolUse hook inside a subagent's tool loop. */
const aSubagentCall = function (over) {
  return Object.assign(
    {
      hook_event_name: 'PostToolUse',
      session_id: 'sess-1',
      agent_id: 'a96a55151f78b7c83',
      agent_type: 'pilot-implementer',
      cwd: path.join('D:', 'work', 'pilot'),
      transcript_path: path.join('D:', 'transcripts', 'sess-1.jsonl'),
      tool_name: 'Edit',
    },
    over || {}
  );
};

/**
 * Every stamp this lane has written, put back in time. The throttle is the
 * modification time of a file, so this is what a window elapsing looks like
 * from the outside — and the test never has to know what the file is called.
 */
function ageTheStamps(ms) {
  const dir = path.dirname(deck.agentStampPath('any'));
  const when = new Date(Date.now() - ms);
  for (const name of fs.readdirSync(dir)) {
    fs.utimesSync(path.join(dir, name), when, when);
  }
}

// --- what the deck is told -------------------------------------------------

test("a subagent's tool call tells the deck what it is and where it is working", async function (t) {
  scratchHome(t);
  const posts = await aStubDeck(t);

  const said = await roster.run(aSubagentCall());

  assert.strictEqual(said, null, 'the roster says nothing to the agent it is reporting on');
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].method, 'POST');
  assert.strictEqual(posts[0].path, '/api/agents');
  assert.deepStrictEqual(
    posts[0].body,
    {
      agentId: 'a96a55151f78b7c83',
      agentType: 'pilot-implementer',
      cwd: path.join('D:', 'work', 'pilot'),
    },
    'three fields and no fourth: no session id, no transcript, nothing about the work'
  );
});

test('the heartbeat is throttled: a second tool call in the same window says nothing', async function (t) {
  scratchHome(t);
  const posts = await aStubDeck(t);

  await roster.run(aSubagentCall());
  await roster.run(aSubagentCall());
  await roster.run(aSubagentCall());

  assert.strictEqual(posts.length, 1, 'a tool call is not a request to the deck');

  ageTheStamps(roster.HEARTBEAT_MS + 1000);
  await roster.run(aSubagentCall());

  assert.strictEqual(posts.length, 2, 'and the window elapsing is');
});

test('two agents in one directory are two heartbeats', async function (t) {
  scratchHome(t);
  const posts = await aStubDeck(t);

  await roster.run(aSubagentCall());
  await roster.run(aSubagentCall({ agent_id: 'bOTHER2', agent_type: 'pilot-qa' }));

  assert.deepStrictEqual(
    posts.map(function (post) { return post.body.agentType; }),
    ['pilot-implementer', 'pilot-qa'],
    'the throttle is per agent, not per session'
  );
});

test("the pilot's own tool call puts nobody on the roster", async function (t) {
  scratchHome(t);
  const posts = await aStubDeck(t);

  const input = aSubagentCall();
  delete input.agent_id;
  delete input.agent_type;
  await roster.run(input);

  assert.deepStrictEqual(posts, [], 'a session is a run on the deck already, not an agent in it');
});

test('a deck that is not there costs the tool call nothing', async function (t) {
  scratchHome(t);
  // No stub: `PILOT_DECK_PORT` is 1, where nothing is listening.

  const said = await roster.run(aSubagentCall());

  assert.strictEqual(said, null, 'the lane says nothing, and nothing is thrown at the harness');
});
