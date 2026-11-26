#!/usr/bin/env node
/**
 * blocked-yellow-yields S5 (spec 6): the Stop hook holds no turn on a `Blocked:` item the pilot
 * closed as `Moot:`. The item is recorded as this session's post, so while open it is a thread
 * the gate would wait on; once moot it is closed, and the gate says nothing.
 *
 * `run` against a real deck on a port the system hands out, never 4321, in a scratch store.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');

test('the stop hook holds nothing on a moot item', async function (t) {
  await import('../../deck/test/no-open.mjs');
  const utils = await import('../../deck/testUtils.mjs');
  const store = await import('../../deck/store.mjs');
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
  const session = '0123a0b2-0000-4000-8000-0000000000b5';
  deck.startState(session, 0);
  const ticket = utils.aTicket('Building', 'red', repo);
  utils.takeLive(ticket.id);
  const blocked = store.postItem({
    kind: 'question', title: 'Blocked: npm publish', body: 'denied', repo: repo,
    options: ['I ran it', 'Skip it'], recommended: 'Skip it', ticket: ticket.id, blocking: true,
  });
  deck.recordPosted(session, blocked.id);
  const items = store.listItems();
  assert.strictEqual(stopGate.awaitsUser(items.find(function (item) { return item.id === blocked.id; }), [blocked.id], items), true,
    'open, it is a thread the gate waits on');

  store.resolveItem(blocked.id, 'Moot: done another way', '');
  const after = store.listItems();
  assert.strictEqual(stopGate.awaitsUser(after.find(function (item) { return item.id === blocked.id; }), [blocked.id], after), false,
    'moot, it is a thread the gate no longer waits on');

  const said = await stopGate.run({ session_id: session, cwd: repo, hook_event_name: 'Stop', stop_hook_active: false });
  assert.strictEqual(said, null);
});

// steps-in-previews spec 5 (A1): a steps thread is queued for the user and still standing for agents, so the
// Stop gate holds no turn on one this session posted.
test('the stop hook holds nothing on an open steps thread', async function (t) {
  await import('../../deck/test/no-open.mjs');
  const utils = await import('../../deck/testUtils.mjs');
  const store = await import('../../deck/store.mjs');
  const items = await import('../../deck/items.mjs');
  const base = await utils.deckOnAPort(t);
  const before = { PILOT_DECK_PORT: process.env.PILOT_DECK_PORT, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR };
  process.env.PILOT_DECK_PORT = new URL(base).port;
  delete process.env.CLAUDE_PROJECT_DIR;
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  });
  const repo = path.resolve('D:/work/pilot');
  const session = '0123a0b2-0000-4000-8000-0000000000b6';
  deck.startState(session, 0);
  const ticket = utils.aTicket('Landed', 'green', repo);
  utils.takeLive(ticket.id);
  const steps = store.postSteps({ ticket: ticket.id, repo: repo, title: 'Human steps: Landed', steps: [{ text: 'Merge the main PR.' }] });
  deck.recordPosted(session, steps.id);
  const open = store.listItems().find(function (item) { return item.id === steps.id; });
  assert.strictEqual(items.isQueued(open), true, 'queued for the user');
  assert.strictEqual(stopGate.awaitsUser(open, [steps.id], store.listItems()), false, 'standing for agents');

  const said = await stopGate.run({ session_id: session, cwd: repo, hook_event_name: 'Stop', stop_hook_active: false });
  assert.strictEqual(said, null);
});
