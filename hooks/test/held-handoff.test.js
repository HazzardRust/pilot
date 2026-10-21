#!/usr/bin/env node
/**
 * handoff-closed-on-pickup S1 (spec 2, L4-L8, ADR 0115): the session a hand-off
 * was delivered to cannot end its turn while that item is open. Run against a
 * real daemon on a port the system hands out, in a scratch home.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const deck = require('../lib/deck.js');
const postTool = require('../post-tool.js');
const stopGate = require('../stop-gate.js');
const { bearer } = require('../lib/deck-secret.js');

const DAEMON = path.join(__dirname, '..', '..', 'deck', 'daemon.mjs');
const HANDED = '0115a0b1-0000-4000-8000-00000000c1ea';
const POSTER = '0115a0b1-0000-4000-8000-0000000000b5';

function freePort() {
  return new Promise(function (resolve) {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', function () {
      const port = probe.address().port;
      probe.close(function () { resolve(port); });
    });
  });
}

/** A scratch home the hooks write into, pointed at `port`. */
function scratchHome(t, port) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-held-home-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_PORT: process.env.PILOT_DECK_PORT };
  Object.assign(process.env, { HOME: home, USERPROFILE: home, PILOT_DECK_PORT: String(port) });
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

/** A scratch deck holding one open hand-off for the scratch home; its id and a resolver. */
async function deckWithHandoff(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-held-deck-'));
  const port = await freePort();
  const child = spawn(process.execPath, [DAEMON], {
    env: Object.assign({}, process.env, { PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) }),
    stdio: 'ignore',
  });
  // The hooks under test read this deck's secret from its dir (deck-token S1).
  const previousDir = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = dir;
  t.after(async function () {
    if (previousDir === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previousDir;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise(function (resolve) { child.on('exit', resolve); });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const home = scratchHome(t, port);
  const base = 'http://127.0.0.1:' + port;
  for (const deadline = Date.now() + 15000; ;) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch (err) { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('the scratch deck never came up');
    await new Promise(function (resolve) { setTimeout(resolve, 50); });
  }
  const tool = async function (name, args) {
    const response = await fetch(base + '/api/tool', {
      method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, bearer(dir)), body: JSON.stringify({ name: name, arguments: args }),
    });
    assert.ok(response.ok, name + ' refused: ' + response.status);
    return (await response.json()).content[0].text;
  };
  const post = async function (title) {
    return /Posted (itm_[0-9a-f]+)/.exec(await tool('deck_post', { kind: 'handoff', title: title, body: 'Stash at docs/x.md.', repo: home }))[1];
  };
  const id = await post('Handoff');
  return { home: home, id: id, post: post, resolve: function () { return tool('deck_resolve', { id: id, resolution: 'holding it' }); } };
}

/** The hand-off as delivered: both markers, as `session-handoff.js` writes them. */
function deliver(id) {
  fs.mkdirSync(path.dirname(deck.pickupPath(HANDED)), { recursive: true });
  fs.writeFileSync(deck.pickupPath(HANDED), JSON.stringify({ item: id }));
  deck.holdHandoff(HANDED, id);
}

/** The first tool call, judged to be the pilot's: the pickup marker goes and the held one stays. */
function judgedPilot() {
  postTool.PLAIN_PICKUP.load().run({ session_id: HANDED, agent_type: 'pilot:pilot' });
}

const stopping = function (s, given) {
  return Object.assign({ session_id: HANDED, cwd: s.home, hook_event_name: 'Stop', stop_hook_active: false }, given);
};

test('a held open hand-off blocks the stop and names it', async function (t) {
  const s = await deckWithHandoff(t);
  deliver(s.id);
  judgedPilot();

  const said = await stopGate.run(stopping(s));

  assert.strictEqual(said && said.decision, 'block');
  assert.ok(said.reason.includes(s.id), 'the reason names the item');
  assert.match(said.reason, /deck_reply/);
  assert.match(said.reason, /deck_resolve/);
});

test('a hand-off not yet judged at the first tool call does not block, and stays held', async function (t) {
  const s = await deckWithHandoff(t);
  deliver(s.id);

  assert.strictEqual(await stopGate.run(stopping(s)), null);
  assert.strictEqual(deck.heldHandoff(HANDED), s.id, 'the marker is kept for the judged stops');
});

test('a held hand-off outside the open page still blocks', async function (t) {
  const s = await deckWithHandoff(t);
  deliver(s.id);
  judgedPilot();
  for (let n = 0; n < deck.OPEN_READ_LIMIT; n++) await s.post('Newer ' + n);

  const said = await stopGate.run(stopping(s));

  assert.strictEqual(said && said.decision, 'block');
  assert.ok(said.reason.includes(s.id), 'the reason names the item');
  assert.strictEqual(deck.heldHandoff(HANDED), s.id, 'and the marker is still held');
});

test('a held id the deck cannot confirm neither blocks nor drops the marker', async function (t) {
  const s = await deckWithHandoff(t);
  deliver('itm_0115dead0000'); // not on the deck, so the read by id is refused
  judgedPilot();

  assert.strictEqual(await stopGate.run(stopping(s)), null);
  assert.strictEqual(deck.heldHandoff(HANDED), 'itm_0115dead0000', 'a failed confirm drops nothing');
});

test('a resolved hand-off lets the turn end and drops the marker', async function (t) {
  const s = await deckWithHandoff(t);
  deliver(s.id);
  judgedPilot();
  await s.post('Another open item');
  await s.resolve();

  assert.strictEqual(await stopGate.run(stopping(s)), null);
  assert.strictEqual(deck.heldHandoff(HANDED), null, 'the marker is gone');
});

test('the session that posted the hand-off is not held', async function (t) {
  const s = await deckWithHandoff(t);
  deck.holdHandoff(HANDED, s.id);

  assert.strictEqual(await stopGate.run(stopping(s, { session_id: POSTER })), null);
});

test('stop_hook_active and a subagent stand aside', async function (t) {
  const s = await deckWithHandoff(t);
  deck.holdHandoff(HANDED, s.id);

  assert.strictEqual(await stopGate.run(stopping(s, { stop_hook_active: true })), null, 'told once already');
  assert.strictEqual(await stopGate.run(stopping(s, { agent_id: 'a1b2c3' })), null, 'a subagent is not the session handed it');
  assert.strictEqual(deck.heldHandoff(HANDED), s.id, 'and the marker is still held');
});

test('a dead deck never blocks', async function (t) {
  const home = scratchHome(t, await freePort());
  deck.holdHandoff(HANDED, 'itm_0115dead0000');

  const said = await stopGate.run({ session_id: HANDED, cwd: home, hook_event_name: 'Stop' });

  assert.notStrictEqual(said && said.decision, 'block');
});

test('the marker round-trips and refuses a non-id', async function (t) {
  scratchHome(t, await freePort());
  deck.holdHandoff(HANDED, 'itm_0115abcdef01');
  assert.strictEqual(deck.heldHandoff(HANDED), 'itm_0115abcdef01');
  deck.dropHeldHandoff(HANDED);
  deck.dropHeldHandoff(HANDED);
  assert.strictEqual(deck.heldHandoff(HANDED), null, 'dropped, and dropping twice is fine');

  deck.holdHandoff(HANDED, '../x');
  assert.strictEqual(deck.heldHandoff(HANDED), null, 'a non-id writes nothing');
});
