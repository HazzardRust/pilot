#!/usr/bin/env node
/**
 * Slice S3 of crew-handoff-trace: the hooks that see a co-pilot stop and its successor spawn write
 * `stopped` and `spawned` (spec 1; L1, L4). The ticket is the deck's (`GET /api/record` `coPilot`),
 * never the prompt's, and nothing here writes the real trace: every test gets its own home, its own
 * deck directory and its own stub deck port. The payload shapes are the ones S3's live probe captured
 * (a main-session `Agent` PostToolUse has no `agent_id`; SubagentStop carries `agent_id`, `agent_type`).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const spawnTrace = require('../spawn-trace.js');
const subagentStop = require('../subagent-stop.js');

const REPO = path.join(os.tmpdir(), 'pilot-s3-repo');
const TICKET = 'itm_1f8238d5a300';

/** A home and deck directory of this test's own, a dead deck port, and no project dir from the harness. */
function scratch(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s3-trace-'));
  const names = ['HOME', 'USERPROFILE', 'PILOT_DECK_DIR', 'PILOT_DECK_PORT', 'CLAUDE_PROJECT_DIR'];
  const before = {};
  for (const name of names) before[name] = process.env[name];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.PILOT_DECK_DIR = path.join(home, 'deck');
  process.env.PILOT_DECK_PORT = '1'; // a deck that is down, until a test stands one up
  delete process.env.CLAUDE_PROJECT_DIR;
  t.after(function () {
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return path.join(home, 'deck', 'handoff-trace.jsonl');
}

/** A stub deck answering `/api/record` with this directory's co-pilot; every path asked is kept. */
async function stubDeck(t) {
  const asked = [];
  const server = http.createServer(function (request, response) {
    asked.push(request.url);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ record: null, coPilot: { ticket: TICKET, live: true, at: '2026-11-21T08:00:00.000Z' } }));
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  process.env.PILOT_DECK_PORT = String(server.address().port);
  t.after(function () { server.close(); });
  return asked;
}

function rowsIn(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(function (line) { return JSON.parse(line); });
}

/** A main-session PostToolUse for an Agent call, as the probe saw it: no `agent_id`. */
function agentCall(subagentType, extra) {
  return Object.assign({
    hook_event_name: 'PostToolUse',
    session_id: 'sess-main-1',
    cwd: REPO,
    tool_name: 'Agent',
    tool_input: { description: 'co-pilot', prompt: 'co-pilot of ' + TICKET, run_in_background: true, subagent_type: subagentType },
    tool_response: {},
  }, extra || {});
}

/** A SubagentStop, as the probe saw it. */
function stopOf(agentType) {
  return {
    hook_event_name: 'SubagentStop',
    session_id: 'sess-main-1',
    cwd: REPO,
    agent_id: 'a4a0177a5f2c',
    agent_type: agentType,
    agent_transcript_path: path.join(os.tmpdir(), 'agent.jsonl'),
    last_assistant_message: 'paused',
    stop_hook_active: false,
  };
}

const stdinOf = function (payload) { return Readable.from([JSON.stringify(payload)]); };

test('a co-pilot spawn leaves a row', async function (t) {
  const file = scratch(t);
  const asked = await stubDeck(t);
  const said = await spawnTrace.run(agentCall('pilot:pilot-co-pilot'));
  assert.strictEqual(said, null, 'the lane says nothing');
  const rows = rowsIn(file);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['at', 'kind', 'session', 'step', 'ticket']);
  assert.strictEqual(rows[0].step, 'spawned');
  assert.strictEqual(rows[0].kind, 'crew-handoff');
  assert.strictEqual(rows[0].ticket, TICKET);
  assert.strictEqual(rows[0].session, 'sess-main-1');
  assert.deepStrictEqual(asked, ['/api/record?repo=' + encodeURIComponent(REPO)]);
});

test("a spawn's prompt never reaches the row", async function (t) {
  const file = scratch(t);
  await stubDeck(t);
  const marker = 'MARKER-s3-prompt-9c1e';
  const call = agentCall('pilot:pilot-co-pilot');
  call.tool_input.prompt = marker + ' ticket itm_000000000000';
  call.tool_input.description = marker;
  call.tool_response = { content: marker };
  await spawnTrace.run(call);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes(marker), 'no prompt text in the trace');
  assert.ok(!text.includes('itm_000000000000'), 'no ticket parsed from the prompt');
});

test('any other spawn is silent', async function (t) {
  const file = scratch(t);
  const asked = await stubDeck(t);
  assert.strictEqual(await spawnTrace.run(agentCall('pilot:pilot-implementer')), null);
  // A co-pilot spawning anything, even a co-pilot type, is a subagent's call: its payload has agent_id.
  assert.strictEqual(await spawnTrace.run(agentCall('pilot:pilot-co-pilot', { agent_id: 'a9', agent_type: 'pilot:pilot-co-pilot' })), null);
  assert.strictEqual(await spawnTrace.run({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { subagent_type: 'pilot:pilot-co-pilot' } }), null);
  assert.strictEqual(await spawnTrace.run(undefined), null);
  assert.strictEqual(await spawnTrace.run({ tool_name: 'Agent' }), null);
  assert.deepStrictEqual(rowsIn(file), []);
  assert.deepStrictEqual(asked, [], 'a silent case asks the deck nothing');
});

test('a co-pilot stop leaves a row', async function (t) {
  const file = scratch(t);
  const asked = await stubDeck(t);
  await subagentStop.main(stdinOf(stopOf('pilot:pilot-co-pilot')));
  const rows = rowsIn(file);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['agent', 'at', 'kind', 'step', 'ticket']);
  assert.strictEqual(rows[0].step, 'stopped');
  assert.strictEqual(rows[0].kind, 'crew-handoff');
  assert.strictEqual(rows[0].agent, 'a4a0177a5f2c');
  assert.strictEqual(rows[0].ticket, TICKET);
  assert.deepStrictEqual(asked, ['/api/record?repo=' + encodeURIComponent(REPO)]);
});

test('a co-pilot stop with the deck down still leaves a row, with no ticket', async function (t) {
  const file = scratch(t); // port 1: nothing answers
  await subagentStop.main(stdinOf(stopOf('pilot:pilot-co-pilot')));
  const rows = rowsIn(file);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['agent', 'at', 'kind', 'step']);
  assert.strictEqual(rows[0].step, 'stopped');
});

test('any other stop, or a payload that is not JSON, writes nothing', async function (t) {
  const file = scratch(t);
  const asked = await stubDeck(t);
  await subagentStop.main(stdinOf(stopOf('pilot:pilot-implementer')));
  await subagentStop.main(Readable.from(['{not json']));
  await subagentStop.main(Readable.from([]));
  assert.deepStrictEqual(rowsIn(file), []);
  assert.deepStrictEqual(asked, []);
});
