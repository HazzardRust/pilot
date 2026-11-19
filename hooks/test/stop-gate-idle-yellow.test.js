#!/usr/bin/env node
/**
 * yellow-never-idle S2 (spec 6; L4, L6): the Stop hook refuses the main session's turn end beside a held yellow ticket
 * whose crew has made no tool call for 20 min, reading the daemon's `lanes.refusal` with `hooks/stop-gate.js` unchanged.
 *
 * `run` against a real deck on a port the system hands out, never 4321, in a scratch store.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');

const MIN = 60000;

test('the Stop hook blocks on an idle yellow ticket, and not on one whose crew was just seen', async function (t) {
  await import('../../deck/test/no-open.mjs');
  const utils = await import('../../deck/testUtils.mjs');
  const agents = await import('../../deck/agents.mjs');
  const store = await import('../../deck/store.mjs');
  const base = await utils.deckOnAPort(t);
  const before = { PILOT_DECK_PORT: process.env.PILOT_DECK_PORT, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR };
  process.env.PILOT_DECK_PORT = new URL(base).port;
  delete process.env.CLAUDE_PROJECT_DIR; // the hook reads the payload's cwd
  t.after(function () {
    agents.forgetAgents();
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  });
  agents.forgetAgents();
  const repo = path.resolve('D:/work/pilot');
  const session = '0123a0b2-0000-4000-8000-0000000000b2';
  deck.startState(session, 0);
  const yellow = utils.aTicket('Building', 'yellow', repo);
  store.setCoPilot(yellow.id, true);
  const stopping = { session_id: session, cwd: repo, hook_event_name: 'Stop', stop_hook_active: false };

  agents.noteAgent({ agentId: 'crew1', agentType: 'pilot:pilot-co-pilot', cwd: repo }, Date.now() - 21 * MIN);
  const said = await stopGate.run(stopping);

  assert.strictEqual(said && said.decision, 'block');
  assert.ok(said.reason.includes(yellow.id), said.reason);
  assert.ok(said.reason.startsWith('yellow lane idle; '), said.reason);

  agents.noteAgent({ agentId: 'crew1', agentType: 'pilot:pilot-co-pilot', cwd: repo }, Date.now() - MIN);
  assert.strictEqual(await stopGate.run(stopping), null);
});
