/**
 * S10 of ticket-state-accents (spec 17, 20; L16, L17, L19, L20): Continue on an open yellow row the co-pilot does not
 * hold asks to switch the co-pilot lane to it. Confirm is `requestSwitch(repo, to)` on a yellow `to`, one write
 * of `switches[repoKey].coPilot` and a user reply on `to` carrying `switch` with lane `co-pilot`; the pilot's wait
 * prints `SWITCH co-pilot`. The lanes are independent: a pending main switch neither refuses nor locks it.
 * Completion is S11's. Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from '../items.mjs';
import { aTicket, deckOnAPort, page, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

// Destructured from the namespaces, so a name a slice has yet to export fails only the tests that call it.
const { DeckRefusal, requestSwitch, setCoPilot, storeFile } = await import('../store.mjs');
const { printed } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/pilot');

const switchOf = (row) => row.match(/<form class="switch" method="post" action="\/switch"[^>]*>.*?<\/form>/s)?.[0];
const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));

/** A held yellow ticket and another open yellow one beside it. */
function coPilotLane() {
  const held = aTicket('Held', 'yellow');
  setCoPilot(held.id, true);
  return { held, to: aTicket('To', 'yellow') };
}

test('yellow rows not held by the co-pilot carry Continue; the co-pilot\'s own row does not', (t) => {
  tempDeck(t);
  const { held, to } = coPilotLane();
  const rows = rowsOf(page());

  const form = switchOf(rows[to.id]);
  assert.match(form, /<button type="submit" data-switch="idle" title="Continue" aria-label="Continue" data-confirm>&#9654;&#xFE0E;<\/button>/);
  assert.doesNotMatch(form, /name="lane"/, 'the lane is to\'s state, never a field');
  assert.match(form, /<div class="step sure" hidden><p>Switch to <span class="ref">To<\/span>\?<\/p><button type="submit">Confirm<\/button>/, 'S6\'s confirm step');
  assert.doesNotMatch(rows[held.id], /data-switch=/, 'the co-pilot\'s own row');
});

test('a co-pilot request writes switches.coPilot and the reply in one write', (t) => {
  tempDeck(t);
  const { held, to } = coPilotLane();

  const writes = [];
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => {
    writes.push(target);
    return rename(source, target);
  });
  const record = requestSwitch(REPO, to.id);
  t.mock.restoreAll();

  assert.equal(writes.filter((file) => path.resolve(file) === path.resolve(storeFile())).length, 1, 'one writeDeck');
  assert.deepEqual({ from: record.from, to: record.to }, { from: held.id, to: to.id });
  const deck = stored();
  assert.deepEqual(deck.switches[repoKey(REPO)].coPilot, record, 'the record, on the co-pilot lane');
  assert.equal(deck.switches[repoKey(REPO)].main, undefined, 'the main lane untouched');
  const reply = deck.items.find((item) => item.id === to.id).replies.at(-1);
  assert.equal(reply.from, 'user');
  assert.deepEqual(reply.switch, { lane: 'coPilot', from: held.id, to: to.id });
  assert.equal(reply.seq, deck.seq);
  assert.deepEqual(deck.coPilots[repoKey(REPO)].ticket, held.id, 'the co-pilot entry is S11\'s to move');
  assert.equal(deck.items.find((item) => item.id === to.id).live, undefined, 'never live on a yellow ticket');
});

test('a second co-pilot request while one is pending is refused', (t) => {
  tempDeck(t);
  const { held, to } = coPilotLane();
  const other = aTicket('Other', 'yellow');
  assert.throws(() => requestSwitch(REPO, held.id), DeckRefusal, "the co-pilot's own ticket");
  requestSwitch(REPO, to.id);
  const before = fs.readFileSync(storeFile(), 'utf8');

  assert.throws(() => requestSwitch(REPO, other.id), (err) => err instanceof DeckRefusal && /pending/.test(err.message));
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before, 'nothing written');
});

test('a co-pilot entry that is not live gives from null', (t) => {
  tempDeck(t);
  const { held, to } = coPilotLane();
  setCoPilot(held.id, false);

  assert.equal(requestSwitch(REPO, to.id).from, null);
});

test('a pending main switch does not refuse a co-pilot request', async (t) => {
  const origin = await deckOnAPort(t);
  takeLive(aTicket('From', 'red').id);
  const mainTo = aTicket('Main to', 'green');
  const { held, to } = coPilotLane();
  requestSwitch(REPO, mainTo.id);
  assert.match(switchOf(rowsOf(page())[to.id]), /data-switch="idle"/, 'a main switch locks no yellow row');

  const pressed = await fetch(`${origin}/switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    redirect: 'manual',
    body: new URLSearchParams({ repo: REPO, to: to.id, back: '/' }),
  });
  assert.equal(pressed.status, 303);
  const lanes = stored().switches[repoKey(REPO)];
  assert.equal(lanes.concluding.to, mainTo.id, 'the main record kept');
  assert.deepEqual({ from: lanes.coPilot.from, to: lanes.coPilot.to }, { from: held.id, to: to.id });
});

test('pilot wait prints SWITCH co-pilot', () => {
  const reply = { itemId: 'itm_00000000002a', title: 'To', text: 'Continue this ticket', switch: { lane: 'coPilot', from: 'itm_000000000001', to: 'itm_00000000002a' } };
  assert.match(printed(reply), /^SWITCH co-pilot itm_000000000001 -> itm_00000000002a: pause the co-pilot, then deck_ticket co-pilot itm_00000000002a$/m);
  assert.match(printed({ ...reply, switch: { ...reply.switch, from: null } }), /^SWITCH co-pilot none -> itm_00000000002a: /m);
});

test('the pressed yellow button is pending and co-pilot-held stays on from', (t) => {
  tempDeck(t);
  const { held, to } = coPilotLane();
  requestSwitch(REPO, to.id);
  const html = page();
  const rows = rowsOf(html);

  assert.match(rows[to.id], /<button type="submit" data-switch="pending" disabled>switching…<\/button>/);
  assert.doesNotMatch(rows[to.id], /co-pilot-held/);
  assert.match(rows[held.id], /class="co-pilot-held"/);
  assert.match(html, /data-co-pilot-state="switching"/);
});

test("a lit button keeps the page's own text colour on a tint of its lane, so it reads in both themes", () => {
  // QA at Gate 2: `color: Canvas` on the full lane hue read at about 2:1 on the co-pilot lane's blue in the dark theme.
  const css = fs.readFileSync(new URL('../ui/deck.css', import.meta.url), 'utf8');
  const lit = css.match(/^[^{\n]*button\[data-switch="pending"\][^{]*\{[^}]*\}/gm) ?? [];
  assert.equal(lit.length, 2, 'one rule per lane for the lit button');
  assert.match(lit[0], /\bcolor:\s*inherit\b/, lit[0]);
  for (const rule of lit) {
    assert.doesNotMatch(rule, /\bcolor:\s*Canvas\b/, rule);
    assert.match(rule, /background:\s*color-mix\(in srgb, var\(--(state-waiting|lane-co-pilot)\) \d+%, transparent\)/, rule);
  }
});
