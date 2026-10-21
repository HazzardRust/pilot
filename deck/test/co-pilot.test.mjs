/**
 * S1 of clear-waits-co-pilot (spec 2, 5; L3, L4, L8): the deck's `co-pilots` entry. The main session says
 * `deck_ticket co-pilot` before it spawns its co-pilot and `release` when one stops; `needTicket`, the gate2
 * post that turns the yellow ticket green, and `pilot run` starting release it too. Every test takes its
 * own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { chainNext } from '../chain.mjs';
import { KIND_GATE2, KIND_HANDOFF, KIND_TICKET, KIND_WALKTHROUGH } from '../items.mjs';
import { coPilotFor, needTicket, postItem, resolveItem, setCoPilot, storeFile } from '../store.mjs';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');

const yellow = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state: 'yellow' });

const deckTicket = async (base, args) => {
  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: args }),
  });
  const said = await answer.json();
  return said.content?.[0]?.text ?? said.error;
};

const recordOf = async (base) => (await (await fetch(`${base}/api/record?repo=${encodeURIComponent(REPO)}`)).json()).coPilot;

test('a co-pilot is live once set and released by release', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = yellow('building');
  assert.equal(await recordOf(base), null, 'no entry, no co-pilot');

  assert.ok((await deckTicket(base, { id: ticket.id, action: 'co-pilot' })).startsWith(`Co-pilot ${ticket.id}: live. Yellow: `));
  const live = await recordOf(base);
  assert.equal(live.ticket, ticket.id);
  assert.equal(live.live, true);
  assert.ok(Number.isFinite(Date.parse(live.at)), 'stamped');

  assert.ok((await deckTicket(base, { id: ticket.id, action: 'release' })).startsWith(`Co-pilot ${ticket.id}: released. Yellow: `));
  assert.equal((await recordOf(base)).live, false);

  const red = postItem({ kind: KIND_TICKET, title: 'Queued', body: shapedTicketBody('queued'), repo: REPO, sliceCount: 60 });
  assert.match(await deckTicket(base, { id: red.id, action: 'co-pilot' }), /yellow/, 'a red ticket has no co-pilot');
});

test('needTicket releases its ticket\'s co-pilot', async (t) => {
  tempDeck(t);
  const ticket = yellow('walking');
  setCoPilot(ticket.id, true);
  postItem({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket: ticket.id });

  needTicket(ticket.id);
  assert.equal(coPilotFor(REPO).live, false);
});

test('a gate2 on the yellow ticket releases it', async (t) => {
  tempDeck(t);
  const ticket = yellow('done');
  setCoPilot(ticket.id, true);

  postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
  assert.equal(coPilotFor(REPO).live, false);
});

test('another ticket\'s need leaves it live', async (t) => {
  tempDeck(t);
  const building = yellow('building');
  const other = yellow('other');
  setCoPilot(building.id, true);
  postItem({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket: other.id });

  needTicket(other.id);
  assert.deepEqual({ ticket: coPilotFor(REPO).ticket, live: coPilotFor(REPO).live }, { ticket: building.id, live: true });
});

test('a pilot run start releases the directory\'s co-pilot', async (t) => {
  tempDeck(t);
  const ticket = yellow('building');
  setCoPilot(ticket.id, true);

  chainNext(REPO, { atStart: true });
  assert.equal(coPilotFor(REPO).live, false);
});

test('the stored deck gains co-pilots and no other key', async (t) => {
  tempDeck(t);
  const ticket = yellow('building');
  const before = Object.keys(JSON.parse(fs.readFileSync(storeFile(), 'utf8')));
  setCoPilot(ticket.id, true);
  setCoPilot(ticket.id, false);

  const after = Object.keys(JSON.parse(fs.readFileSync(storeFile(), 'utf8')));
  assert.deepEqual(after.filter((key) => !before.includes(key)), ['coPilots']);
  assert.deepEqual(before.filter((key) => !after.includes(key)), []);
});

const handoff = (next) => postItem({ kind: KIND_HANDOFF, title: next ? 'Next run: Run 2' : 'Context is at 85%', body: 'Stash at run.json.', repo: REPO, ...(next ? { next } : {}) });

test('a co-pilot is refused while a chain hand-off is open', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = yellow('building');
  const chain = handoff('itm_ticket00000002');

  assert.equal(
    await deckTicket(base, { id: ticket.id, action: 'co-pilot' }),
    `a /clear is due for ${chain.id}; spawn no co-pilot, the session after it will`,
  );
  assert.equal(await recordOf(base), null, 'no co-pilot set');
});

test('a context hand-off does not refuse a co-pilot', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = yellow('building');
  handoff();

  assert.ok((await deckTicket(base, { id: ticket.id, action: 'co-pilot' })).startsWith(`Co-pilot ${ticket.id}: live. Yellow: `));
});

test('once the lane resolves the chain hand-off a co-pilot is set', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = yellow('building');
  const chain = handoff('itm_ticket00000002');
  resolveItem(chain.id, 'delivered');

  assert.ok((await deckTicket(base, { id: ticket.id, action: 'co-pilot' })).startsWith(`Co-pilot ${ticket.id}: live. Yellow: `));
  assert.equal((await recordOf(base)).live, true);
});

test("another directory's chain hand-off does not refuse a co-pilot", async (t) => {
  const base = await deckOnAPort(t);
  const ticket = yellow('building');
  postItem({ kind: KIND_HANDOFF, title: 'Next run: Elsewhere', body: 'Stash at run.json.', repo: path.join('D:', 'work', 'other'), next: 'itm_ticket00000002' });

  assert.ok((await deckTicket(base, { id: ticket.id, action: 'co-pilot' })).startsWith(`Co-pilot ${ticket.id}: live. Yellow: `));
});

test('a paused co-pilot is released while a chain hand-off is open', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = yellow('building');
  setCoPilot(ticket.id, true);
  handoff('itm_ticket00000002');

  assert.ok((await deckTicket(base, { id: ticket.id, action: 'release' })).startsWith(`Co-pilot ${ticket.id}: released. Yellow: `));
  assert.equal((await recordOf(base)).live, false);
});

// --- principles review (F2, F3, F4) ---

test('the store refuses a co-pilot while a chain hand-off is open', async (t) => {
  tempDeck(t);
  const ticket = yellow('building');
  const chain = handoff('itm_ticket00000002');

  assert.throws(() => setCoPilot(ticket.id, true), { name: 'DeckRefusal', message: `a /clear is due for ${chain.id}; spawn no co-pilot, the session after it will` });
  assert.equal(coPilotFor(REPO), null, 'no co-pilot set');
});

test('a release of a ticket the entry does not name says which co-pilot is live', async (t) => {
  const base = await deckOnAPort(t);
  const building = yellow('building');
  const other = yellow('other');
  assert.equal(await deckTicket(base, { id: other.id, action: 'release' }), `Co-pilot ${other.id}: no co-pilot is live here.`);

  setCoPilot(building.id, true);
  assert.equal(await deckTicket(base, { id: other.id, action: 'release' }), `Co-pilot ${other.id}: not the live one; ${building.id} is live.`);
  assert.equal((await recordOf(base)).live, true, 'the /clear is still held for the live one');
});

test('a co-pilot builds only an open yellow ticket', async (t) => {
  tempDeck(t);
  const green = postStored({ kind: KIND_TICKET, title: 'green', body: shapedTicketBody('green'), repo: REPO, sliceCount: 60, state: 'green' });
  const closed = yellow('closed');
  resolveItem(closed.id, 'done');

  assert.throws(() => setCoPilot(green.id, true), { name: 'DeckRefusal', message: `item ${green.id} is green; a co-pilot builds an open yellow ticket` });
  assert.throws(() => setCoPilot(closed.id, true), { name: 'DeckRefusal', message: `item ${closed.id} is closed; a co-pilot builds an open yellow ticket` });
  assert.equal(coPilotFor(REPO), null);
});

// co-pilot-tickets S3 (spec 1, L12): the action is renamed with no alias, so the old word is an unknown action.
test('the action is co-pilot', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = yellow('steering');
  assert.ok((await deckTicket(base, { id: ticket.id, action: 'co-pilot' })).startsWith(`Co-pilot ${ticket.id}: live. Yellow: `));
  assert.equal((await recordOf(base)).ticket, ticket.id);
  const retired = 'fore' + 'man'; // spelt apart so the live grep finds only the stored spellings
  assert.match(await deckTicket(base, { id: ticket.id, action: retired }), new RegExp(`not ${retired}$`));
});
