/**
 * A signed ticket goes back to planning (never-stuck S1, spec 6; L7): `recutTicket` turns an open yellow ticket red
 * with a `recut { from, why, files, at }` mark, at its red queue's head, its plan kept until a fresh gate1's Sign off
 * replaces it. Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, SIGN_OFF, ticketQueueOf } from '../items.mjs';
import { DeckRefusal, addReply, listItems, pivotTicket, postItem, resolveItem, setCoPilot } from '../store.mjs';
import { recutTicket } from '../store-tickets.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { deckOnAPort, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const EVIDENCE = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x', surface: false };
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

const aTicket = (title) => postItem({ kind: KIND_TICKET, sliceCount: 60, title, body: shapedTicketBody(title), repo: REPO });
const aGate1 = (ticket, sha, body = 'The design.') => postItem({ kind: KIND_GATE1, title: 'Gate 1', body: `${body}\nBase: pilot`, repo: REPO, ...EVIDENCE, sha, ticket });

/** A ticket signed through its own gate1, as the user signs one: yellow, its plan at `sha`. */
function aSigned(title, sha = '0305827') {
  const ticket = aTicket(title);
  takeLive(ticket.id);
  const gate = aGate1(ticket.id, sha);
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return reread(ticket.id);
}

test('a signed ticket re-cuts to red with its mark', (t) => {
  tempDeck(t);
  const signed = aSigned('other host');
  assert.equal(signed.state, 'yellow');
  const queued = aTicket('queued first');

  const ticket = recutTicket(signed.id, 'owned file moved', ['deck/lanes.mjs']);

  const stored = reread(signed.id);
  assert.equal(stored.state, 'red');
  assert.notEqual(stored.live, true, 'not live: the planning lane takes it');
  assert.equal(stored.recut.from, '0305827', 'the old plan sha');
  assert.equal(stored.recut.why, 'owned file moved');
  assert.deepEqual(stored.recut.files, ['deck/lanes.mjs']);
  assert.ok(Number.isFinite(Date.parse(stored.recut.at)), 'stamped');
  assert.deepEqual(stored.plan, signed.plan, 'the plan is kept until a gate1 replaces it');
  assert.deepEqual(ticket.recut, stored.recut, 'returned as stored');
  assert.deepEqual(ticketQueueOf(listItems(), REPO, 'red').map((item) => item.id), [signed.id, queued.id], 'at the red queue head');
});

test('a re-cut ticket card shows the re-cut mark with its why; a plain red one does not (S6a, §9 item 1)', (t) => {
  tempDeck(t);
  const signed = aSigned('other host');
  const plain = aTicket('plain red');
  recutTicket(signed.id, 'landing 1a2b3c4', ['deck/lanes.mjs']);
  const page = renderHomePage(listItems(), [{ id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid, startedAt: new Date().toISOString() }], REPO);
  const rowOf = (title) => {
    const end = page.indexOf(`>${title}</a>`);
    assert.notEqual(end, -1, `${title} is on the tab`);
    return page.slice(page.lastIndexOf('<li', end), page.indexOf('</li>', end));
  };

  assert.match(rowOf('other host'), /<span class="recut" title="landing 1a2b3c4">re-cut<\/span>/);
  assert.doesNotMatch(rowOf(plain.title), /class="recut"/);
  // A mark left on a ticket that has since left planning is not drawn.
  const moved = { ...reread(signed.id), state: 'green' };
  assert.doesNotMatch(renderHomePage([moved], [], REPO), /class="recut"/);
});

test("a live co-pilot's ticket is refused", (t) => {
  tempDeck(t);
  const signed = aSigned('building');
  setCoPilot(signed.id, true);

  assert.throws(() => recutTicket(signed.id, 'stale'), refusedNaming(signed.id, 'co-pilot'));
  assert.equal(reread(signed.id).state, 'yellow');
  assert.equal(reread(signed.id).recut, undefined);
});

test('a red ticket, one whose gate2 was posted, or a bad why or files list is refused', (t) => {
  tempDeck(t);
  const signed = aSigned('signed');
  const red = aTicket('planning');
  assert.throws(() => recutTicket(red.id, 'stale'), refusedNaming(red.id, 'red', 'yellow'));
  assert.throws(() => recutTicket(signed.id, ' '), refusedNaming('why'));
  assert.throws(() => recutTicket(signed.id, 'stale', 'deck/lanes.mjs'), refusedNaming('files'));
  assert.equal(reread(signed.id).state, 'yellow', 'a refused re-cut writes nothing');

  const built = postStored({ kind: KIND_TICKET, title: 'built', body: shapedTicketBody('built'), repo: REPO, state: 'yellow' });
  const gate2 = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: built.id });
  pivotTicket(built.id);
  assert.equal(reread(built.id).state, 'yellow', 'pivoted back to yellow');
  assert.throws(() => recutTicket(built.id, 'stale'), refusedNaming(built.id, gate2.id));
  assert.equal(reread(built.id).state, 'yellow');
});

test('the action answers with the lane line', async (t) => {
  const base = await deckOnAPort(t);
  const signed = aSigned('other host');
  const deckTicket = async (args) => {
    const said = await (await fetch(`${base}/api/tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'deck_ticket', arguments: { id: signed.id, action: 'recut', ...args } }),
    })).json();
    return said.content?.[0]?.text ?? said.error;
  };
  assert.match(await deckTicket({ author: 'pilot:pilot-architect' }), /is the pilot's/, "an agent's stamp is refused");
  assert.equal(reread(signed.id).state, 'yellow');
  const text = await deckTicket({});
  assert.ok(text.startsWith(`Re-cut ${signed.id}: red`), text);
  assert.equal(reread(signed.id).state, 'red');
  assert.equal(reread(signed.id).recut.from, '0305827');
});

test('a gate1 on the re-cut ticket is accepted and its press replaces the plan', (t) => {
  tempDeck(t);
  const signed = aSigned('other host');
  recutTicket(signed.id, 'owned file moved');
  takeLive(signed.id);

  const gate = aGate1(signed.id, 'abc1234', 'The design.\n\nChanged since 0305827: S1 owns deck/lanes.mjs.');
  addReply(gate.id, SIGN_OFF);
  assert.equal(reread(signed.id).plan.sha, '0305827', 'the old plan stands until the gate closes on its press');
  resolveItem(gate.id, 'Signed off.');

  const stored = reread(signed.id);
  assert.equal(stored.state, 'yellow');
  assert.equal(stored.plan.sha, 'abc1234');
  assert.equal(stored.plan.gate1, gate.id);
  assert.equal(stored.recut, undefined, 'the mark is cleared');
});
