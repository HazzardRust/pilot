/**
 * S5 of ticket-state-accents (spec 2 chip, 10, 16; L3, L4, L19, L21, L22, A13; ADR 0106): each lane
 * names its state in a word the code defines. `switchOf` reads the main lane's switch, `coPilotStateOf` the
 * co-pilot's word; both are pure reads of the items and the lane's switch record, drawn on the Tickets panel
 * as `data-deck-state` and `data-co-pilot-state`. Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_QUESTION, KIND_TICKET, coPilotStateOf, repoKey, switchOf, ticketQueueOf } from '../items.mjs';
import { deckLanes, listItems, registerRun, setCoPilot, storeFile } from '../store.mjs';
import { tabsOf } from '../tabs.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { aTicket, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const AT = '2026-10-09T10:00:00.000Z';

const asked = (ticket) => postStored({ kind: KIND_QUESTION, title: 'Q', body: 'Q?', repo: REPO, options: ['A', 'B'], ticket: ticket.id });
const runs = () => [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
const lanesWith = (switches = {}) => ({ ...deckLanes(), switches: { [repoKey(REPO)]: switches } });
const tabPage = (lanes = deckLanes()) =>
  renderHomePage(listItems(), runs(), REPO, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true }, lanes);
const main = (switches) => switchOf(listItems(), REPO, switches, 'main');
const coPilot = (switches = {}) => coPilotStateOf(listItems(), REPO, deckLanes().coPilots[repoKey(REPO)] ?? null, switches);

/** Each Tickets row as `{ id, open tag, the markup before its link }`, in page order. */
const rows = (html) =>
  [...html.matchAll(/<li (data-state="[a-z]+"[^>]*)>((?:(?!<a ).)*)<a href="\/thread\/(itm_[0-9a-f]+)">/gs)].map(([, tag, lead, id]) => ({ id, tag, lead }));
const inHandRows = (html) => rows(html).filter((row) => /class="in-hand"/.test(row.tag)).map((row) => row.id);
const ticketsState = (html) => html.match(/<div class="tickets-state" data-planning-state="([a-z]+)" data-concluding-state="([a-z]+)" data-co-pilot-state="([a-z]+)">/)?.slice(1);

test('co-pilot lane: held with a live co-pilot', (t) => (tempDeck(t), setCoPilot(aTicket('Built', 'yellow').id, true), assert.equal(coPilot(), 'held')));

test('co-pilot lane: queued with yellow tickets but no co-pilot', (t) => {
  tempDeck(t);
  const head = aTicket('Head', 'yellow');
  aTicket('Second', 'yellow');
  assert.equal(coPilot(), 'queued');
  assert.equal(ticketQueueOf(listItems(), REPO, 'yellow')[0]?.id, head.id);
});

test('co-pilot lane: empty with no yellow ticket', (t) => (tempDeck(t), aTicket('Green', 'green'), assert.equal(coPilot(), 'empty')));

test('co-pilot lane: switching while switches.coPilot is pending', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'yellow');
  const to = aTicket('To', 'yellow');
  setCoPilot(from.id, true);
  assert.equal(coPilot({ coPilot: { from: from.id, to: to.id, at: AT } }), 'switching');
});

test('a main switch changes no co-pilot word', (t) => {
  tempDeck(t);
  const green = aTicket('Green', 'green');
  const red = aTicket('Red', 'red');
  setCoPilot(aTicket('Built', 'yellow').id, true);
  assert.equal(coPilot({ main: { from: green.id, to: red.id, at: AT } }), 'held');
});

test('a malformed switches entry reads as none', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'green');
  const to = aTicket('To', 'red');
  for (const bad of [null, 'x', [], { from: from.id }, { from: from.id, to: to.id }, { from: 7, to: to.id, at: AT }, { from: from.id, to: to.id, at: 1 }]) {
    assert.equal(main({ main: bad }), undefined, JSON.stringify(bad));
  }
  assert.equal(main(null), undefined, 'no record at all');
});

test('a record whose from or to is no longer an open green or red ticket reads as none', (t) => {
  tempDeck(t);
  const from = aTicket('From', 'green');
  const to = aTicket('To', 'red');
  const yellow = aTicket('Yellow', 'yellow');
  const shut = postStored({ kind: KIND_TICKET, title: 'Shut', body: shapedTicketBody('Shut'), repo: REPO, sliceCount: 60, state: 'closed', closedAt: AT });
  for (const [f, t2] of [[from.id, shut.id], [shut.id, to.id], [from.id, yellow.id], [from.id, 'itm_gone']]) {
    assert.equal(main({ main: { from: f, to: t2, at: AT } }), undefined, `${f} -> ${t2}`);
  }
  assert.ok(main({ main: { from: null, to: to.id, at: AT } }), 'a null from is allowed');
  assert.equal(coPilot({ coPilot: { from: yellow.id, to: to.id, at: AT } }), 'queued', 'the co-pilot lane switches between yellow tickets only');
});

test('invariant: one in-hand row per stage with an open ticket, none live (three-lanes spec 6)', async (t) => {
  for (const mix of [['green'], ['red'], ['asked'], ['green', 'red'], ['red', 'asked', 'green'], ['red', 'red']]) {
    await t.test(mix.join('+'), (tt) => {
      tempDeck(tt);
      for (const state of mix) {
        if (state === 'asked') asked(aTicket('Asked', 'red'));
        else aTicket(state, state);
      }
      aTicket('Built', 'yellow');
      assert.equal(inHandRows(tabPage()).length, new Set(mix.map((state) => (state === 'asked' ? 'red' : state))).size);
    });
  }
  await t.test('only yellow tickets', (tt) => {
    tempDeck(tt);
    aTicket('Built', 'yellow');
    const html = tabPage();
    assert.deepEqual(inHandRows(html), []);
    assert.equal(ticketsState(html)[0], 'empty');
  });
  await t.test('switching', (tt) => {
    tempDeck(tt);
    const from = aTicket('From', 'green');
    const to = aTicket('To', 'red');
    aTicket('Built', 'yellow'); // session-row L7: an open yellow keeps green before red
    const html = tabPage(lanesWith({ main: { from: from.id, to: to.id, at: AT } }));
    assert.deepEqual(inHandRows(html), [from.id], 'from stays in hand; to is never');
    assert.equal(ticketsState(html)[0], 'switching');
  });
});

test('the Tickets panel carries both words', (t) => {
  tempDeck(t);
  takeLive(aTicket('Live', 'green').id);
  const html = tabPage();
  assert.deepEqual(ticketsState(html), ['empty', 'held', 'empty']);
  const region = html.match(/<div class="panel" data-live="tickets"[^>]*>(.*)/s)[1];
  assert.match(region, /^<div class="tickets-state" /, 'inside the live region, never on it (L5)');
  aTicket('Built', 'yellow');
  assert.deepEqual(ticketsState(tabPage()), ['empty', 'held', 'queued']);
});

test("deckLanes reads the stored switches and the live co-pilots, keyed per repository", (t) => {
  tempDeck(t);
  const built = aTicket('Built', 'yellow');
  setCoPilot(built.id, true);
  const switches = { main: { from: null, to: built.id, at: AT } };
  fs.writeFileSync(storeFile(), JSON.stringify({ ...JSON.parse(fs.readFileSync(storeFile(), 'utf8')), switches: { [repoKey(REPO)]: switches } }), 'utf8');
  const lanes = deckLanes();
  assert.deepEqual(lanes, { coPilots: { [repoKey(REPO)]: built.id }, switches: { [repoKey(REPO)]: switches }, records: [] });
  const tab = tabsOf(runs(), listItems(), {}, {}, [], {}, lanes).find((each) => each.repo === REPO);
  assert.equal(tab.coPilot, built.id);
  assert.deepEqual(tab.switching, switches);
  assert.deepEqual(tabsOf(runs(), listItems())[0].switching, {}, 'no lanes, no switch');
});

test('with no co-pilot, the yellow head carries the blue next chip and no row is co-pilot-held', (t) => {
  tempDeck(t);
  const head = aTicket('Head', 'yellow');
  const second = aTicket('Second', 'yellow');
  const html = tabPage();
  const row = rows(html).find((each) => each.id === head.id);
  assert.equal(row.tag, 'data-state="yellow"', 'no row class');
  assert.equal(row.lead, '<span class="next" data-lane="co-pilot">next</span>');
  assert.equal(rows(html).find((each) => each.id === second.id).lead, '');
  assert.ok(rows(html).every((each) => !/co-pilot-held/.test(each.tag)), 'no row is co-pilot-held');

  setCoPilot(head.id, true);
  assert.ok(rows(tabPage()).every((each) => !/data-lane="co-pilot"/.test(each.lead)), 'with a co-pilot live, no chip');
});
