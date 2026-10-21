/**
 * S6 of ticket-state-accents (spec 11, 12, 15; L9, L13, L20, L21): Continue on an open green or red row
 * not in hand asks to switch the main lane to it. Its first press shows the shared confirm step; Confirm
 * is `requestSwitch`, one write of the record and a user reply on `to` carrying `switch`, and the pressed
 * row's button lights `switching…` while the in-hand mark stays where it was. Completion is S7's.
 * Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from '../items.mjs';
import { DeckRefusal, registerRun, requestSwitch, storeFile } from '../store.mjs';
import { aTicket, deckOnAPort, page, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const OTHER = path.resolve('D:/work/other');

const switchOf = (row) => row.match(/<form class="switch" method="post" action="\/switch"[^>]*>.*?<\/form>/s)?.[0];
const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));

test('Continue is drawn on green and red rows not in hand, never on the in-hand row', (t) => {
  tempDeck(t);
  const live = aTicket('Live', 'red');
  takeLive(live.id);
  const green = aTicket('Green', 'green');
  const red = aTicket('Red', 'red');
  const yellow = aTicket('Yellow', 'yellow');
  const rows = rowsOf(page());

  assert.match(switchOf(rows[green.id]), /data-switch="idle"/);
  assert.match(switchOf(rows[red.id]), /data-switch="idle"/);
  assert.match(switchOf(rows[yellow.id]), /data-switch="idle"/, 'a yellow row\'s is the co-pilot lane\'s (spec 17), read from its state');
  assert.equal(switchOf(rows[live.id]), undefined, 'the ticket in hand is not switched to');
});

test('the confirm step is in the markup, hidden, with Confirm alone (L13 as amended)', (t) => {
  tempDeck(t);
  takeLive(aTicket('Live', 'red').id);
  const green = aTicket('Green <b>', 'green');
  const form = switchOf(rowsOf(page())[green.id]);

  assert.match(form, /method="post" action="\/switch" data-in-place>/, 'Confirm posts in place (handoff-failed-confirm S5)');
  assert.match(form, new RegExp(`name="to" value="${green.id}"`));
  assert.match(form, /<button type="submit" data-switch="idle" title="Continue" aria-label="Continue" data-confirm>&#9654;&#xFE0E;<\/button>/);
  assert.match(form, /<div class="step sure" hidden><p>Switch to <span class="ref">Green &lt;b&gt;<\/span>\?<\/p><button type="submit">Confirm<\/button><\/div>/);
  assert.doesNotMatch(form, /confirm\(/, 'no confirm() dialog');
});

test('requestSwitch writes the record and the reply in one write', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'red');
  takeLive(from.id);
  const to = aTicket('To', 'red');

  const writes = [];
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => {
    writes.push(target);
    return rename(source, target);
  });
  const record = requestSwitch(REPO, to.id);
  t.mock.restoreAll();

  assert.equal(writes.filter((file) => path.resolve(file) === path.resolve(storeFile())).length, 1, 'one writeDeck');
  assert.deepEqual({ from: record.from, to: record.to }, { from: from.id, to: to.id });
  const deck = stored();
  assert.deepEqual(deck.switches[repoKey(REPO)].planning, record, 'the record, per repository and lane');
  const reply = deck.items.find((item) => item.id === to.id).replies.at(-1);
  assert.equal(reply.from, 'user');
  assert.deepEqual(reply.switch, { from: from.id, to: to.id });
  assert.equal(reply.seq, deck.seq, 'a sequenced user reply, so the pilot\'s wait hears it');
  assert.equal(deck.items.find((item) => item.id === from.id).live, true, 'no park or take: completion is S7\'s');
  assert.equal(deck.items.find((item) => item.id === to.id).live, undefined);
});

test('a second request while one is pending is refused', (t) => {
  tempDeck(t);
  takeLive(aTicket('From', 'red').id);
  const first = aTicket('First', 'green');
  const second = aTicket('Second', 'green');
  requestSwitch(REPO, first.id);
  const before = fs.readFileSync(storeFile(), 'utf8');

  assert.throws(() => requestSwitch(REPO, second.id), (err) => err instanceof DeckRefusal && /pending/.test(err.message));
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before, 'nothing written');
});

test('a closed, in-hand or other directory\'s to is refused', (t) => {
  tempDeck(t);
  const live = aTicket('Live', 'red');
  takeLive(live.id);
  const closed = aTicket('Closed', 'closed');
  const elsewhere = aTicket('Elsewhere', 'green', OTHER);
  const before = fs.readFileSync(storeFile(), 'utf8');

  for (const to of [closed.id, live.id, elsewhere.id]) {
    assert.throws(() => requestSwitch(REPO, to), DeckRefusal, to);
  }
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before, 'nothing written');
});

test('POST /switch from another origin is a 403', async (t) => {
  const origin = await deckOnAPort(t);
  registerRun({ repo: REPO, pid: process.pid }); // a live run: the request waits for its pilot (S7 completes it at once without one)
  takeLive(aTicket('From', 'red').id);
  const to = aTicket('To', 'green');
  const back = `/?run=${encodeURIComponent(REPO)}`;
  const press = (headers, id = to.id) =>
    fetch(`${origin}/switch`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      redirect: 'manual',
      body: new URLSearchParams({ repo: REPO, to: id, back }),
    });

  assert.equal((await press({ origin: 'http://evil.example' })).status, 403);
  assert.equal((await press({})).status, 403, 'no Origin at all is refused too');
  assert.equal(stored().switches, undefined, 'a refused press writes nothing');

  const pressed = await press({ origin });
  assert.equal(pressed.status, 303);
  assert.equal(pressed.headers.get('location'), back);
  assert.equal(stored().switches[repoKey(REPO)].concluding.to, to.id);
  assert.equal((await press({ origin })).status, 400, 'a second request is the usual refusal');
});

test('the pending row\'s button is lit and the in-hand row is unchanged', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'red');
  takeLive(from.id);
  const to = aTicket('To', 'green');
  const before = rowsOf(page())[from.id];
  requestSwitch(REPO, to.id);
  const rows = rowsOf(page());

  assert.match(rows[to.id], /<button type="submit" data-switch="pending" disabled>switching…<\/button>/);
  assert.doesNotMatch(rows[to.id], /class="in-hand"/, 'to is never in hand before completion');
  assert.equal(rows[from.id], before, 'the in-hand row is drawn exactly as before');
});
