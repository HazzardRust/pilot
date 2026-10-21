#!/usr/bin/env node
/**
 * yellow-lane S1 (spec 1; L2): the Stop hook refuses the main session's turn end while a yellow
 * ticket is open with no live co-pilot, with the daemon's `lanes.refusal` unchanged.
 *
 * `run` against a real deck on a port the system hands out, never 4321, in a scratch store.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');

test('the Stop hook blocks with it', async function (t) {
  await import('../../deck/test/no-open.mjs');
  const utils = await import('../../deck/testUtils.mjs');
  const base = await utils.deckOnAPort(t);
  const before = { PILOT_DECK_PORT: process.env.PILOT_DECK_PORT, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR };
  process.env.PILOT_DECK_PORT = new URL(base).port;
  delete process.env.CLAUDE_PROJECT_DIR; // the hook reads the payload's cwd
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  });
  const repo = path.resolve('D:/work/pilot');
  const session = '0123a0b2-0000-4000-8000-0000000000a1';
  deck.startState(session, 0);
  const yellow = utils.aTicket('Building', 'yellow', repo);

  const said = await stopGate.run({ session_id: session, cwd: repo, hook_event_name: 'Stop', stop_hook_active: false });

  assert.strictEqual(said && said.decision, 'block');
  assert.strictEqual(said.reason, 'yellow lane empty; ' + yellow.id + ' is planned — deck_ticket co-pilot it first');
});
