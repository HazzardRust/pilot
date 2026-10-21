/**
 * S7 of ticket-state-accents (spec 12, 13, 15; L8, L13-L15, L20): the pilot hears a main switch and completes it.
 * Its wait prints `SWITCH <from> -> <to>`; `takeTicket(to)` while the record is pending parks `from`, takes `to`
 * and clears the record in one write; Cancel clears the record and tells the pilot; with no live run, Confirm
 * completes at once. Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from '../items.mjs';
import { aTicket, deckOnAPort, page, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

// Destructured from the namespaces, so a name a slice has yet to export fails only the tests that call it.
const { DeckRefusal, cancelSwitch, registerRun, repliesSince, requestSwitch, storeFile, takeTicket } = await import('../store.mjs');
const { printed } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/pilot');

const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
const itemOf = (id) => stored().items.find((item) => item.id === id);
/** A co-pilot lane's record beside the main one, written straight in: completing or cancelling main must keep it. */
const withCoPilotLane = () => {
  const deck = stored();
  deck.switches[repoKey(REPO)].coPilot = { from: null, to: 'itm_0000000000ff', at: 'then' };
  fs.writeFileSync(storeFile(), JSON.stringify(deck), 'utf8');
};

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

test('take of the pending to parks from, takes to and clears the record', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'red');
  takeLive(from.id);
  const to = aTicket('To', 'red');
  requestSwitch(REPO, to.id);

  assert.equal(writesDuring(t, () => takeTicket(to.id)), 1, 'one writeDeck');
  assert.equal(itemOf(from.id).live, undefined, 'from is parked');
  assert.equal(itemOf(to.id).live, true, 'to is taken');
  assert.equal(stored().switches[repoKey(REPO)].planning, undefined, 'the record is cleared');
});

test('take of a red to past a waiting green succeeds while it is the pending switch', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'red');
  takeLive(from.id);
  aTicket('Waiting green', 'green');
  const to = aTicket('Red', 'red');
  requestSwitch(REPO, to.id);
  withCoPilotLane();

  takeTicket(to.id);
  assert.equal(itemOf(to.id).live, true);
  assert.equal(itemOf(from.id).live, undefined);
  assert.equal(stored().switches[repoKey(REPO)].coPilot.to, 'itm_0000000000ff', 'the co-pilot lane is kept');
});

test('cancel clears the record and the pilot\'s wait sees switch cancelled', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'red');
  takeLive(from.id);
  const to = aTicket('To', 'green');
  requestSwitch(REPO, to.id);
  withCoPilotLane();
  const { seq } = repliesSince(Number.MAX_SAFE_INTEGER);

  cancelSwitch(REPO, to.id);
  assert.equal(stored().switches[repoKey(REPO)].concluding, undefined, 'the record is cleared');
  assert.equal(stored().switches[repoKey(REPO)].coPilot.to, 'itm_0000000000ff', 'the co-pilot lane is kept');
  assert.equal(itemOf(from.id).live, true, 'from stays in hand');
  const [reply] = repliesSince(seq).replies;
  assert.equal(reply.itemId, to.id);
  assert.equal(reply.text, 'switch cancelled');
  assert.match(printed(reply), /^SWITCH cancelled$/m);
  assert.throws(() => cancelSwitch(REPO, to.id), DeckRefusal, 'none is pending now');
});

test('pilot wait prints the SWITCH line', () => {
  const reply = { itemId: 'itm_00000000002a', title: 'To', text: 'Continue this ticket', switch: { from: 'itm_000000000001', to: 'itm_00000000002a' } };
  assert.match(printed(reply), /^SWITCH itm_000000000001 -> itm_00000000002a: stash, then deck_ticket take itm_00000000002a$/m);
  assert.match(printed({ ...reply, switch: { from: null, to: 'itm_00000000002a' } }), /^SWITCH none -> itm_00000000002a: /m);
  assert.doesNotMatch(printed({ itemId: 'itm_00000000002a', title: 'To', text: 'hi' }), /SWITCH/);
});

test('with no live run, Confirm completes at once', async (t) => {
  const origin = await deckOnAPort(t);
  const from = aTicket('From', 'red');
  takeLive(from.id);
  const to = aTicket('To', 'red');

  const pressed = await fetch(`${origin}/switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ repo: REPO, to: to.id, back: '/' }),
  });
  assert.equal(pressed.status, 303);
  assert.equal(stored().switches?.[repoKey(REPO)]?.planning, undefined, 'the record is never left standing');
  assert.equal(itemOf(to.id).live, true);
  assert.equal(itemOf(from.id).live, undefined);
  assert.doesNotMatch(printed(repliesSince(0).replies.at(-1)), /SWITCH/, 'a later wait is told nothing to take');
  assert.equal(requestSwitch(REPO, from.id, { complete: true }), null, 'a completed request returns null');
  assert.equal(itemOf(from.id).live, true);
});

test('after completion, the in-hand mark is on to and no button is lit', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'red');
  takeLive(from.id);
  const to = aTicket('To', 'red');
  requestSwitch(REPO, to.id);
  const lit = rowsOf(page())[to.id];
  assert.match(lit, /<form class="switch" method="post" action="\/switch-cancel" data-in-place>.*<button type="submit" data-switch="cancel">Cancel<\/button><\/form>/s, 'Cancel beside the lit button');

  takeTicket(to.id);
  const html = page();
  const rows = rowsOf(html);
  assert.match(rows[to.id], /class="in-hand"/);
  assert.doesNotMatch(rows[from.id], /class="in-hand"/);
  assert.doesNotMatch(Object.values(rows).join(''), /data-switch="pending"/);
});

test('POST /switch-cancel clears a pending switch from the deck\'s own page only', async (t) => {
  const origin = await deckOnAPort(t);
  registerRun({ repo: REPO, pid: process.pid });
  takeLive(aTicket('From', 'red').id);
  const to = aTicket('To', 'green');
  requestSwitch(REPO, to.id);
  const press = (headers) =>
    fetch(`${origin}/switch-cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      redirect: 'manual',
      body: new URLSearchParams({ repo: REPO, to: to.id, back: '/' }),
    });

  assert.equal((await press({ origin: 'http://evil.example' })).status, 403);
  assert.equal(stored().switches[repoKey(REPO)].concluding.to, to.id, 'a refused press writes nothing');
  assert.equal((await press({ origin })).status, 303);
  assert.equal(stored().switches[repoKey(REPO)].main, undefined);
  assert.equal((await press({ origin })).status, 400, 'nothing pending is the usual refusal');
});
