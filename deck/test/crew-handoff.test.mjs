/**
 * Slice S5 of crew-handoff-trace (spec 5): a successor's `deck_ticket co-pilot` grant closes its ticket's open
 * crew-handoff, and the guard's crew-handoff names the ticket the deck holds. Each test runs on a scratch deck,
 * whose directory is where the trace goes, so no test reaches the real file.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { openCrewHandoffsOf } from '../crew-handoff.mjs';
import { KIND_CREW_HANDOFF, KIND_TICKET } from '../items.mjs';
import { listItems } from '../store.mjs';
import { trace } from '../trace.mjs';
import { deckOnAPort, postStored, shapedTicketBody } from '../testUtils.mjs';

const require = createRequire(import.meta.url);
const { coPilotItem } = require('../../hooks/lib/guard-advice.js');

const REPO = path.join('D:', 'work', 'pilot');

const tool = async (base, name, args) => {
  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
  const said = await answer.json();
  return said.content?.[0]?.text ?? said.error;
};

const aYellowTicket = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 7, state: 'yellow' });
const aCrewHandoff = (ticket) => ({ kind: KIND_CREW_HANDOFF, title: `Handoff: pilot-co-pilot on ${ticket} paused itself`, body: `Ticket: ${ticket}.`, repo: REPO, ticket });
const posted = (said) => said.match(/itm_[0-9a-f]+/)[0];
const byId = (id) => listItems().find((item) => item.id === id);

async function traced(id) {
  const out = [];
  assert.equal(await trace([id], { say: (text) => out.push(text), complain: (text) => out.push(text) }), 0);
  return out.join('').trimEnd().split('\n');
}

/** The hooks' deck client reads its port per call: pointed at this test's deck, put back after. */
function hooksTo(t, base) {
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  t.after(() => {
    if (before === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = before;
  });
}

test('a grant closes its ticket\'s crew-handoff', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = aYellowTicket('paused');
  const handoff = posted(await tool(base, 'deck_post', aCrewHandoff(ticket.id)));
  assert.deepEqual(openCrewHandoffsOf(listItems(), ticket.id).map((item) => item.id), [handoff], 'open before the grant');

  const said = await tool(base, 'deck_ticket', { id: ticket.id, action: 'co-pilot' });

  assert.match(said, new RegExp(`: live; closed ${handoff}\\.`));
  assert.deepEqual(openCrewHandoffsOf(listItems(), ticket.id), []);
  assert.equal(byId(handoff).resolution, 'successor granted');
  const lines = await traced(handoff);
  assert.match(lines[0], new RegExp(` posted crew-handoff item=${handoff} ticket=${ticket.id}$`));
  assert.match(lines[1], new RegExp(` resolved crew-handoff item=${handoff} ticket=${ticket.id}$`));
  assert.equal(lines.at(-1), 'done');
});

test('another ticket\'s crew-handoff stays open', async (t) => {
  const base = await deckOnAPort(t);
  const [mine, theirs] = [aYellowTicket('mine'), aYellowTicket('theirs')];
  const other = posted(await tool(base, 'deck_post', aCrewHandoff(theirs.id)));
  const unnamed = posted(await tool(base, 'deck_post', { ...aCrewHandoff(mine.id), ticket: undefined }));

  const said = await tool(base, 'deck_ticket', { id: mine.id, action: 'co-pilot' });

  assert.match(said, /: live\. /, 'nothing closed, so the reply is unchanged');
  assert.deepEqual(openCrewHandoffsOf(listItems(), theirs.id).map((item) => item.id), [other]);
  assert.equal(byId(unnamed).resolvedAt, undefined, 'a crew-handoff naming no ticket is left to the pilot');
  assert.deepEqual(openCrewHandoffsOf(listItems(), undefined), []);
});

test('a close the store refuses is named, and the grant still stands', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = aYellowTicket('refused');
  // Owned by the architect, so a close as the pilot is refused.
  const theirs = postStored({ ...aCrewHandoff(ticket.id), owner: 'architect' });

  const said = await tool(base, 'deck_ticket', { id: ticket.id, action: 'co-pilot' });

  assert.match(said, new RegExp(`: live; ${theirs.id} left open: item ${theirs.id} is owned by architect`));
  assert.deepEqual(openCrewHandoffsOf(listItems(), ticket.id).map((item) => item.id), [theirs.id]);
  assert.deepEqual(await traced(theirs.id), [`no trace rows for ${theirs.id}`, 'waiting: posted, 0m'], 'no resolved row');
});

test("the guard's item names its ticket", async (t) => {
  const base = await deckOnAPort(t);
  hooksTo(t, base);
  const seen = { used: 120_000 };

  const before = await coPilotItem(seen, REPO);
  assert.equal(Object.hasOwn(before, 'ticket'), false, 'no co-pilot on the deck, no field');

  const ticket = aYellowTicket('granted');
  await tool(base, 'deck_ticket', { id: ticket.id, action: 'co-pilot' });
  const item = await coPilotItem(seen, REPO);
  assert.equal(item.ticket, ticket.id);
  const stored = byId(posted(await tool(base, 'deck_post', item)));
  assert.equal(stored.ticket, ticket.id, 'the deck takes the field');
});
