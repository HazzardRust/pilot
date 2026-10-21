/**
 * S11 of ticket-state-accents (spec 18, 20; L18, L20, L23): the pilot completes a co-pilot switch. `setCoPilot(to, true)`
 * while the co-pilot lane's switch to `to` is pending writes `to` live and clears the record in one write; a release
 * of `from` first changes nothing about that. Cancel beside the lit yellow button posts `/switch-cancel` with lane
 * `co-pilot`, clears that lane only and tells the pilot. Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from '../items.mjs';
import { aTicket, deckOnAPort, page, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

const { registerRun, repliesSince, requestSwitch, setCoPilot, storeFile } = await import('../store.mjs');
const { printed } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/pilot');

const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
const lanes = () => stored().switches?.[repoKey(REPO)] ?? {};

/** How many times `fn` replaced the store file. */
function writesDuring(t, fn) {
  const writes = [];
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => {
    writes.push(target);
    return rename(source, target);
  });
  try {
    fn();
  } finally {
    t.mock.restoreAll();
  }
  return writes.filter((file) => path.resolve(file) === path.resolve(storeFile())).length;
}

/** A held yellow ticket, another yellow one, and a co-pilot switch pending from the first to the second. */
function pendingCoPilotSwitch() {
  const from = aTicket('From', 'yellow');
  setCoPilot(from.id, true);
  const to = aTicket('To', 'yellow');
  requestSwitch(REPO, to.id);
  return { from, to };
}

test('co-pilot <to> while pending makes to live and clears the record in one write', (t) => {
  tempDeck(t);
  const { to } = pendingCoPilotSwitch();

  assert.equal(writesDuring(t, () => setCoPilot(to.id, true)), 1, 'one writeDeck');
  assert.deepEqual({ ticket: stored().coPilots[repoKey(REPO)].ticket, live: stored().coPilots[repoKey(REPO)].live }, { ticket: to.id, live: true });
  assert.equal(lanes().coPilot, undefined, 'the record is cleared');
  assert.equal(stored().items.find((item) => item.id === to.id).live, undefined, 'never live on a yellow ticket');
});

test('release from, then co-pilot to, also completes', (t) => {
  tempDeck(t);
  const { from, to } = pendingCoPilotSwitch();

  setCoPilot(from.id, false);
  assert.equal(lanes().coPilot.to, to.id, 'a release leaves the switch pending');
  setCoPilot(to.id, true);
  assert.equal(stored().coPilots[repoKey(REPO)].ticket, to.id);
  assert.equal(lanes().coPilot, undefined);
});

test('co-pilot <to> with no pending switch behaves as today', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'yellow');
  setCoPilot(from.id, true);
  const other = aTicket('Other', 'yellow');

  setCoPilot(other.id, true);
  assert.equal(stored().coPilots[repoKey(REPO)].ticket, other.id);
  assert.equal(lanes().coPilot, undefined, 'no switch record is written');
});

test('cancel on the co-pilot lane clears only that lane and the pilot\'s wait sees switch cancelled', async (t) => {
  const origin = await deckOnAPort(t);
  registerRun({ repo: REPO, pid: process.pid });
  takeLive(aTicket('Main from', 'red').id);
  const mainTo = aTicket('Main to', 'green');
  requestSwitch(REPO, mainTo.id);
  const { from, to } = pendingCoPilotSwitch();
  const lit = rowsOf(page())[to.id];
  assert.match(lit, new RegExp(`<form class="switch" method="post" action="/switch-cancel" data-in-place>.*name="to" value="${to.id}".*<button type="submit" data-switch="cancel">Cancel</button></form>`, 's'), 'Cancel beside the lit yellow button, posting its to');
  assert.doesNotMatch(lit, /name="lane"/, 'the lane is to\'s state, never a field');
  const { seq } = repliesSince(Number.MAX_SAFE_INTEGER);

  const pressed = await fetch(`${origin}/switch-cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ repo: REPO, to: to.id, back: '/' }),
  });
  assert.equal(pressed.status, 303);
  assert.equal(lanes().coPilot, undefined, 'the co-pilot record is cleared');
  assert.equal(lanes().concluding.to, mainTo.id, 'the main lane is kept');
  assert.equal(stored().coPilots[repoKey(REPO)].ticket, from.id, 'the co-pilot keeps from');
  const [reply] = repliesSince(seq).replies;
  assert.equal(reply.itemId, to.id);
  assert.equal(reply.text, 'switch cancelled');
  assert.deepEqual(reply.switch, { lane: 'coPilot', from: from.id, to: to.id, cancelled: true });
  assert.match(printed(reply), /^SWITCH cancelled$/m);
  assert.doesNotMatch(rowsOf(page())[to.id], /data-switch="pending"/, 'the button goes dark');
});

test('after completion co-pilot-held is on to and no yellow button is lit', (t) => {
  tempDeck(t);
  const { from, to } = pendingCoPilotSwitch();

  setCoPilot(to.id, true);
  const html = page();
  const rows = rowsOf(html);
  assert.match(rows[to.id], /class="co-pilot-held"/);
  assert.doesNotMatch(rows[from.id], /co-pilot-held/);
  assert.doesNotMatch(Object.values(rows).join(''), /data-switch="pending"/);
  assert.match(html, /data-co-pilot-state="held"/);
});
