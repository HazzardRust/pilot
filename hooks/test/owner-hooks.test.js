'use strict';

/**
 * ADR 0041 on the hooks' side (S2): the pilot's two hooks hear only the threads
 * the pilot owns. A reply on a walkthrough QA owns is QA's to act on, so it is
 * neither injected into the pilot's context nor a reason to hold its turn open.
 *
 * The Stop gate is driven in-process against a stubbed `deck_read`; the inbox
 * lane runs as a real hook process against a scratch daemon on an ephemeral
 * port, never the user's deck at 4321.
 */

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');
const { bearer } = require('../lib/deck-secret.js');

const POST_TOOL = path.join(__dirname, '..', 'post-tool.js');
const DAEMON = path.join(__dirname, '..', '..', 'deck', 'daemon.mjs');
const QA = 'pilot:pilot-qa';

// --- the Stop gate, over a stubbed deck -------------------------------------

/** One open thread whose last word is the user's, answered after the session arrived. */
const answeredThread = (owner) => ({
  id: 'itm_' + owner,
  kind: 'walkthrough',
  title: 'Try it',
  owner: owner,
  replies: [{ from: 'user', seq: 5, text: 'Step two fails.' }],
});

/** `deck_read` hands back `items`; the session arrived at seq 1 and posted nothing. */
function stubDeck(t, items) {
  const saved = { tool: deck.tool, readState: deck.readState, readPosted: deck.readPosted };
  deck.tool = async () => ({ items: items });
  deck.readState = () => ({ baseline: 1, cursor: 1 });
  deck.readPosted = () => [];
  t.after(() => Object.assign(deck, saved));
}

for (const owner of ['qa', 'teacher', 'auditor']) {
  test('the stop gate does not block on an answered thread ' + owner + ' owns', async (t) => {
    stubDeck(t, [answeredThread(owner)]);
    assert.equal(await stopGate.run({ session_id: 's', cwd: process.cwd() }), null);
  });
}

test('the stop gate blocks on a reply qa passed to the pilot, though the pass is the last message', async (t) => {
  const passed = answeredThread('pilot');
  passed.replies = passed.replies.concat([{ from: 'pilot', author: 'qa', text: 'yours now', carries: [5] }]);
  stubDeck(t, [passed]);
  const said = await stopGate.run({ session_id: 's', cwd: process.cwd() });
  assert.equal(said && said.decision, 'block');
  assert.match(said.reason, /Step two fails\./, 'the reply is quoted, not the pass');
});

test('the stop gate still blocks on an answered thread the pilot owns', async (t) => {
  stubDeck(t, [answeredThread('qa'), answeredThread('pilot')]);
  const said = await stopGate.run({ session_id: 's', cwd: process.cwd() });
  assert.equal(said && said.decision, 'block');
  assert.match(said.reason, /itm_pilot/);
  assert.doesNotMatch(said.reason, /itm_qa/, 'only the pilot\'s thread is named');
});

const FELL_BACK_NOTE = "This was qa's thread, and qa did not pick this reply up.";

test("the stop gate blocks on a reply the deck fell back to the pilot, saying qa's thread went unclaimed", async (t) => {
  stubDeck(t, [answeredThread('qa')]);
  const asked = [];
  deck.tool = async (name, args) => {
    asked.push({ name: name, args: args });
    if (name !== 'deck_wait') return { items: [answeredThread('qa')] };
    return { replies: [{ itemId: 'itm_qa', title: 'Try it', from: 'user', seq: 5, text: '4390 is not up', fallback: FELL_BACK_NOTE }] };
  };
  const said = await stopGate.run({ session_id: 's', cwd: process.cwd() });
  assert.equal(said && said.decision, 'block');
  assert.match(said.reason, /itm_qa/);
  assert.match(said.reason, /4390 is not up/);
  assert.ok(said.reason.includes(FELL_BACK_NOTE), 'the pilot is told why it has the thread');
  const fallbackOnly = asked.find((call) => call.name === 'deck_wait');
  assert.equal(fallbackOnly.args.since, Number.MAX_SAFE_INTEGER, 'it asks for the fallback alone, never the cursor\'s replies');
  assert.equal(fallbackOnly.args.repo, process.cwd());
});

test("the inbox notice says when a reply reached the pilot because qa never picked it up", () => {
  const inbox = require('../inbox-alert.js');
  const said = inbox.notice([{ itemId: 'itm_w', title: 'Try it', text: '4390 is not up', seq: 7, fallback: FELL_BACK_NOTE }]).additionalContext;
  assert.ok(said.includes(FELL_BACK_NOTE));
});

// --- the inbox lane, against a scratch deck ----------------------------------

function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function until(probe) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if (await probe()) return; } catch (err) { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the scratch deck never came up');
}

/** A scratch home and a scratch deck, both gone when the test ends. */
async function scratch(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s2-home-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s2-deck-'));
  const port = await freePort();
  const child = spawn(process.execPath, [DAEMON], {
    env: Object.assign({}, process.env, { PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) }),
    stdio: 'ignore',
  });
  // The hooks under test, and `call` below, read this deck's secret from its dir (deck-token S1).
  const previousDir = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = dir;
  t.after(async () => {
    if (previousDir === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previousDir;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.on('exit', resolve));
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + port;
  await until(async () => (await fetch(base + '/api/health')).ok);
  return { home: home, port: port, base: base };
}

async function call(base, pathname, body, form) {
  const response = await fetch(base + pathname, form
    ? { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...bearer() }, body: new URLSearchParams(body), redirect: 'manual' }
    : { method: 'POST', headers: { 'content-type': 'application/json', ...bearer() }, body: JSON.stringify(body) });
  assert.ok(response.status < 400, pathname + ' refused: ' + response.status);
  return form ? null : response.json();
}

const post = async (s, args) => {
  const said = await call(s.base, '/api/tool', { name: 'deck_post', arguments: Object.assign({ title: 'Try it', body: 'Step one.' }, args) });
  return /Posted (itm_[0-9a-f]+)/.exec(said.content[0].text)[1];
};

/** The PostToolUse process, as the harness spawns it for the pilot. */
function toolCall(s) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [POST_TOOL], {
      env: Object.assign({}, process.env, { HOME: s.home, USERPROFILE: s.home, PILOT_DECK_PORT: String(s.port) }),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', reject);
    child.on('close', () => {
      const json = out.trim() === '' ? null : JSON.parse(out);
      resolve((json && json.hookSpecificOutput && json.hookSpecificOutput.additionalContext) || '');
    });
    child.stdin.end(JSON.stringify({
      session_id: 'session-a', cwd: s.home, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {}, tool_response: {},
    }));
  });
}

/** A session on the deck with one tool call spent taking its place, then a user reply on `id`. */
async function repliedOn(s, id, text) {
  await call(s.base, '/api/runs', { repo: s.home, pid: process.pid });
  assert.equal(await toolCall(s), '', 'arriving is not news');
  await call(s.base, '/reply', { id: id, text: text }, true);
}

const cursorOf = (s) =>
  JSON.parse(fs.readFileSync(path.join(s.home, '.claude', 'pilot-inbox', 'session-a.json'), 'utf8')).cursor;

test('the inbox hook injects nothing for a reply on a qa thread', async (t) => {
  const s = await scratch(t);
  const id = await post(s, { kind: 'walkthrough', author: QA });
  await repliedOn(s, id, 'Step two fails.');
  const { seq } = await (await fetch(s.base + '/api/health')).json();

  assert.equal(await toolCall(s), '', 'QA\'s reply is not the pilot\'s news');
  assert.ok(cursorOf(s) >= seq, 'and the cursor has read past it');
});

test('the inbox hook still injects a reply on a pilot thread', async (t) => {
  const s = await scratch(t);
  const id = await post(s, { kind: 'question' });
  await repliedOn(s, id, 'Port 4321 is fine.');

  assert.match(await toolCall(s), /Port 4321 is fine/);
});

test("the inbox notice for a Sign off on qa's walkthrough says it is not Gate 2 and leaves the thread to qa", () => {
  const inbox = require('../inbox-alert.js');
  const said = inbox.notice([{ itemId: 'itm_w', title: 'Try it', text: 'Sign off', owner: 'qa', seq: 7 }]).additionalContext;
  // pilot.md step 9: the walkthrough's Sign off is not the feature's Gate 2; the pilot asks for that with a gate2.
  assert.match(said, /not Gate 2/);
  assert.match(said, /with a gate2/);
  assert.match(said, /QA closes/);
  assert.doesNotMatch(said, /deck_resolve|cannot end/, 'no resolve of a thread the pilot does not own, no held turn');
});
