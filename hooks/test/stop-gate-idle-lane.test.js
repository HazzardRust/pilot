#!/usr/bin/env node
/**
 * idle-main-lane S2 (spec 2, 3; L6, A3; ADR 0123): the Stop hook refuses the main session's
 * turn end while its main lane is idle and a green or red ticket is queued, with the line the
 * daemon hands back on `GET /api/record` `lanes.refusal`, never a rule of its own.
 *
 * `run` against a real deck on a port the system hands out, never 4321, in a scratch store.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');

let sessions = 0;

/**
 * A deck on a port for this test, its store holding nothing yet, and a session on it in its repository.
 * `deck/testUtils.mjs` points HOME and USERPROFILE at a temp home on import, so the session's state is never the user's.
 */
async function onADeck(t) {
  await import('../../deck/test/no-open.mjs');
  const utils = await import('../../deck/testUtils.mjs');
  const store = await import('../../deck/store.mjs');
  const base = await utils.deckOnAPort(t);
  const before = { PILOT_DECK_PORT: process.env.PILOT_DECK_PORT, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR };
  process.env.PILOT_DECK_PORT = new URL(base).port;
  delete process.env.CLAUDE_PROJECT_DIR; // the hook reads the payload's cwd, not the shell running the suite
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  });
  const repo = path.resolve('D:/work/pilot');
  const session = '0123a0b2-0000-4000-8000-' + String(++sessions).padStart(12, '0');
  deck.startState(session, 0);
  return {
    repo: repo,
    session: session,
    aTicket: function (title, state) { return utils.aTicket(title, state, repo); },
    handoff: function () { return store.postItem({ kind: 'handoff', title: 'Handoff', body: 'Stash at docs/x.md.', repo: repo }); },
    stopping: function (given) {
      return Object.assign({ session_id: session, cwd: repo, hook_event_name: 'Stop', stop_hook_active: false }, given);
    },
  };
}

test('an idle planning lane with a red pick refuses the stop', async function (t) {
  const s = await onADeck(t);
  const red = s.aTicket('Waiting', 'red');

  const said = await stopGate.run(s.stopping());

  assert.strictEqual(said && said.decision, 'block');
  assert.strictEqual(said.reason, 'planning lane empty; ' + red.id + ' is queued — deck_ticket take it first');
});

test('the idle concluding lane is named first (three-lanes A4)', async function (t) {
  const s = await onADeck(t);
  s.aTicket('Earlier', 'red');
  const green = s.aTicket('Needs the user', 'green');

  const said = await stopGate.run(s.stopping());

  assert.strictEqual(said && said.decision, 'block');
  assert.strictEqual(said.reason, 'concluding lane empty; ' + green.id + ' is queued — deck_ticket take it first');
});

test('nothing queued lets the turn end', async function (t) {
  const s = await onADeck(t); // an open yellow is the yellow lane's refusal (yellow-lane S1)

  assert.strictEqual(await stopGate.run(s.stopping()), null);
});

test('a crew agent\'s stop is never refused', async function (t) {
  const s = await onADeck(t);
  s.aTicket('Waiting', 'red');

  assert.strictEqual(await stopGate.run(s.stopping({ agent_id: 'a1b2c3', agent_type: 'pilot:pilot-implementer' })), null);
});

test('stop_hook_active lets the second stop through', async function (t) {
  const s = await onADeck(t);
  s.aTicket('Waiting', 'red');

  assert.strictEqual(await stopGate.run(s.stopping({ stop_hook_active: true })), null);
});

test('an open handoff lets the stop through', async function (t) {
  const s = await onADeck(t);
  s.aTicket('Waiting', 'red');
  s.handoff();

  assert.strictEqual(await stopGate.run(s.stopping()), null);
});

test('a record read that fails refuses nothing', async function (t) {
  const s = await onADeck(t);
  s.aTicket('Waiting', 'red');
  const read = t.mock.method(deck, 'record', async function () { throw new Error('the deck answered 500'); });

  const said = await stopGate.run(s.stopping());

  assert.strictEqual(read.mock.callCount(), 1, 'the lane was asked for');
  assert.strictEqual(said, null);
});
