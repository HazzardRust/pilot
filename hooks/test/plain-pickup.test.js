#!/usr/bin/env node
/**
 * S5 (audit-fixes, spec 8, ADR 0080): a hand-off picked up by a session that
 * is not the pilot is warned at its first tool call and released.
 *
 * `SessionStart` carries no `agent_type`, so the pickup lane cannot tell who
 * it is handing to; it leaves a marker keyed on the session instead, and the
 * PostToolUse process, whose payload does carry `agent_type` for a main
 * session started with `--agent`, judges the role once. Every home here is a
 * scratch directory and every deck a stub on a port the system hands out.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const handoff = require('../session-handoff.js');
const postTool = require('../post-tool.js');
const deck = require('../lib/deck.js');

const REPO = path.join(os.tmpdir(), 'pilot-s5-repo');
const SESSION = '5e55a0b1-0000-4000-8000-00000000c1ea';

function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s5-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_PORT: process.env.PILOT_DECK_PORT };
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

/** A deck holding one open hand-off for REPO; no record, no runs. */
async function deckWithHandoff(t) {
  const stash = {
    id: 'itm_5a5a5a5a5a5a', kind: 'handoff', title: 'Handoff', body: 'Stash at docs/x.md.',
    repo: REPO, postedAt: new Date().toISOString(), replies: [],
  };
  const server = http.createServer(function (request, response) {
    response.writeHead(200, { 'content-type': 'application/json' });
    if (request.method === 'GET') {
      return response.end(JSON.stringify(request.url.startsWith('/api/runs') ? { runs: [] } : { record: null, yellow: null }));
    }
    request.resume();
    request.on('end', function () {
      response.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ seq: 1, items: [stash] }) }] }));
    });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  t.after(function () { return new Promise(function (resolve) { server.close(resolve); }); });
  process.env.PILOT_DECK_PORT = String(server.address().port);
  return stash;
}

/** SessionStart for SESSION, delivered: what the harness would have received. */
async function startAndDeliver(sessionId) {
  const result = await handoff.run({ session_id: sessionId || SESSION, cwd: REPO, hook_event_name: 'SessionStart', source: 'startup' });
  await handoff.deliver(result, function (text, callback) { callback(null); });
  return result;
}

function toolCall(given) {
  return Object.assign({ session_id: SESSION, cwd: REPO, hook_event_name: 'PostToolUse', tool_name: 'Bash' }, given);
}

/** The PostToolUse process with only the plain-pickup lane in its table. */
function postToolUse(input) {
  return postTool.runModules(input, [postTool.PLAIN_PICKUP]);
}

test('a plain session\'s first tool call after a pickup warns, naming pilot run', async function (t) {
  scratchHome(t);
  const stash = await deckWithHandoff(t);
  assert.ok(await startAndDeliver(), 'the hand-off is delivered');

  const merged = await postToolUse(toolCall());

  assert.ok(merged, 'the plain session is told');
  assert.match(merged.payload.systemMessage, /not the pilot/);
  assert.match(merged.payload.systemMessage, /`pilot run`/);
  assert.ok(merged.payload.systemMessage.includes(stash.id), 'and which hand-off it was');
  assert.match(merged.payload.hookSpecificOutput.additionalContext, /do not act on it/i);
});

test('the plain session\'s claim is released', async function (t) {
  scratchHome(t);
  const stash = await deckWithHandoff(t);
  await startAndDeliver();
  assert.ok(deck.claimed(handoff.claimFor(stash.id)), 'delivery claimed it');

  await postToolUse(toolCall());

  assert.ok(!deck.claimed(handoff.claimFor(stash.id)), 'the claim is gone');
  const next = await startAndDeliver('a-following-session');
  assert.ok(next, 'a following SessionStart delivers the same hand-off');
  assert.ok(next.payload.hookSpecificOutput.additionalContext.includes(stash.body));
});

test('a pilot session\'s first tool call is silent and keeps the claim', async function (t) {
  for (const type of ['pilot:pilot', 'pilot']) {
    await t.test(type, async function (inner) {
      scratchHome(inner);
      const stash = await deckWithHandoff(inner);
      await startAndDeliver();

      assert.strictEqual(await postToolUse(toolCall({ agent_type: type })), null, 'silent');
      assert.ok(deck.claimed(handoff.claimFor(stash.id)), 'the claim is kept');
      assert.ok(!fs.existsSync(deck.pickupPath(SESSION)), 'and the marker is spent');
    });
  }
});

test('a plain pick-up drops the held marker', async function (t) {
  scratchHome(t);
  const stash = await deckWithHandoff(t);
  await startAndDeliver();
  assert.strictEqual(deck.heldHandoff(SESSION), stash.id, 'delivery held it');

  await postToolUse(toolCall());

  assert.strictEqual(deck.heldHandoff(SESSION), null, 'released, so no longer this session\'s to resolve');
});

test('a session with no marker is untouched', async function (t) {
  scratchHome(t);
  const reads = [];
  const real = fs.readFileSync;
  fs.readFileSync = function (file) { reads.push(String(file)); return real.apply(fs, arguments); };
  t.after(function () { fs.readFileSync = real; });

  const merged = await postToolUse(toolCall());

  fs.readFileSync = real;
  assert.strictEqual(merged, null, 'no output');
  assert.deepStrictEqual(reads, [deck.pickupPath(SESSION)], 'no file read past the marker check');
});

test('the warning fires once', async function (t) {
  scratchHome(t);
  await deckWithHandoff(t);
  await startAndDeliver();

  assert.ok(await postToolUse(toolCall()), 'the first call warns');
  assert.strictEqual(await postToolUse(toolCall()), null, 'a second tool call is silent');
});

test('a subagent\'s tool call (agent_id set) never judges the main session\'s pickup', async function (t) {
  scratchHome(t);
  const stash = await deckWithHandoff(t);
  await startAndDeliver();

  const sub = toolCall({ agent_id: 'a1b2c3', agent_type: 'Explore' });
  assert.strictEqual(await postToolUse(sub), null, 'the subagent is not warned');
  assert.ok(deck.claimed(handoff.claimFor(stash.id)), 'nor is the claim released');
  assert.ok(fs.existsSync(deck.pickupPath(SESSION)), 'and the marker waits for the main session');
});

test('release refuses a name that is not a claim name, and is false when absent', function (t) {
  scratchHome(t);
  assert.strictEqual(deck.release('handoff-itm_absent'), false);
  assert.ok(deck.claim('handoff-itm_present'));
  assert.strictEqual(deck.release('handoff-itm_present'), true);
  assert.strictEqual(deck.release('../outside'), false);
});

test('the plain-pickup lane is one of the PostToolUse lanes', function () {
  assert.ok(postTool.MODULES.indexOf(postTool.PLAIN_PICKUP) !== -1);
});
