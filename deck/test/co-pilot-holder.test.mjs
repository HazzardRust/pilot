/**
 * never-stuck S7 (spec 17, 18): the yellow lane cannot be taken over while a co-pilot still holds it. `setCoPilot`
 * refuses a second open yellow ticket while the holder is live, naming the holder and both ways out; the holder's
 * own re-call and a pending switch's `to` are granted, and `deck_ticket co-pilot` on a switch names what it replaced.
 * Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from '../items.mjs';
import { aTicket, deckOnAPort, tempDeck } from '../testUtils.mjs';

const { coPilotFor, requestSwitch, resolveItem, setCoPilot, storeFile } = await import('../store.mjs');

/** `aTicket`'s repository. */
const LANE_REPO = path.resolve('D:/work/pilot');

const slot = () => {
  const entry = coPilotFor(LANE_REPO);
  return entry && { ticket: entry.ticket, live: entry.live };
};

test('a second ticket is refused naming the holder', (t) => {
  tempDeck(t);
  const holder = aTicket('Holder', 'yellow');
  const second = aTicket('Second', 'yellow');
  setCoPilot(holder.id, true);

  assert.throws(
    () => setCoPilot(second.id, true),
    (err) => {
      assert.equal(err.message, `co-pilot lane held by ${holder.id}: \`deck_ticket release ${holder.id}\` or a SWITCH to ${second.id}`);
      return true;
    },
  );
  assert.deepEqual(slot(), { ticket: holder.id, live: true }, 'the slot is unchanged');
});

test('the holder and the switch\'s to are allowed', (t) => {
  tempDeck(t);
  const holder = aTicket('Holder', 'yellow');
  const to = aTicket('To', 'yellow');
  setCoPilot(holder.id, true);

  setCoPilot(holder.id, true);
  assert.deepEqual(slot(), { ticket: holder.id, live: true }, 'the holder\'s re-call is granted');

  requestSwitch(LANE_REPO, to.id);
  setCoPilot(to.id, true);
  assert.deepEqual(slot(), { ticket: to.id, live: true }, 'the switch\'s to is granted');
  assert.equal(JSON.parse(fs.readFileSync(storeFile(), 'utf8')).switches?.[repoKey(LANE_REPO)]?.coPilot, undefined, 'the switch is cleared');
});

test('a released or closed holder, or one in another repository, leaves the lane free', (t) => {
  tempDeck(t);
  const released = aTicket('Released', 'yellow');
  setCoPilot(released.id, true);
  setCoPilot(released.id, false);
  const closed = aTicket('Closed', 'yellow');
  setCoPilot(closed.id, true);
  resolveItem(closed.id, 'Done.');
  const elsewhere = aTicket('Elsewhere', 'yellow', path.resolve('D:/work/other'));
  setCoPilot(elsewhere.id, true);

  const next = aTicket('Next', 'yellow');
  setCoPilot(next.id, true);
  assert.deepEqual(slot(), { ticket: next.id, live: true });
});

test('a switch names what it replaced', async (t) => {
  const base = await deckOnAPort(t);
  const from = aTicket('From', 'yellow');
  const to = aTicket('To', 'yellow');
  setCoPilot(from.id, true);
  requestSwitch(LANE_REPO, to.id);
  const logged = [];
  t.mock.method(console, 'error', (line) => logged.push(String(line)));

  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: { id: to.id, action: 'co-pilot' } }),
  });
  const said = await answer.json();

  assert.ok(said.content?.[0]?.text.startsWith(`Co-pilot ${to.id}: live, replaced ${from.id}.`), said.content?.[0]?.text ?? said.error);
  assert.deepEqual(logged.filter((line) => line.includes('co-pilot')), [`[deck] co-pilot ${from.id} -> ${to.id}`]);
});
