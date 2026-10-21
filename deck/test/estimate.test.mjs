/**
 * Gate 1 writes the plan (ticket-states spec 7; L5, L7): signing a gate1 stores the ticket's plan by
 * reference, with its slice count and no estimate (slice-estimates spec 3, L2, L11).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_GATE1, KIND_TICKET, NOT_YET, SIGN_OFF } from '../items.mjs';
import { DeckRefusal, addReply, listItems, postItem, resolveItem, storeFile } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const GATE1 = {
  artefact: 'docs/design/ticket-states/architecture.md',
  sha: '0305827',
  locked: 3,
  slices: '| S1 |',
  sliceCount: 11,
  branch: 'feat/ticket-states',
};
const reread = (id) => listItems().find((item) => item.id === id);
const aTicket = () => takeLive(postItem({ kind: KIND_TICKET, title: 'Apple', body: shapedTicketBody(), repo: REPO, sliceCount: 180 }).id);
const aGate1 = (ticket, fields = GATE1) => postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...fields, ticket });

test('signing a gate1 writes the plan with slug and slice count and no estimate', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  assert.deepEqual(reread(ticket.id).plan, {
    artefact: 'docs/design/ticket-states/architecture.md',
    branch: 'feat/ticket-states',
    sha: '0305827',
    slug: 'ticket-states',
    sliceCount: 11,
    gate1: gate.id,
  });
});

test('a gate1 with no Sign off refuses its resolve and writes no plan', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const gate = aGate1(ticket.id);
  addReply(gate.id, NOT_YET);
  assert.throws(() => resolveItem(gate.id, 'Re-posting.'), DeckRefusal, 'a gate passes only on its press (merge-first L12)');
  assert.equal(reread(ticket.id).plan, undefined);
});

test('a stored plan with estimate reads back without it, idempotently', (t) => {
  tempDeck(t);
  const plan = { ...GATE1, slug: 'ticket-states', estimate: 330, gate1: 'itm_abc123' };
  const stored = postStored({ kind: KIND_TICKET, title: 'Apple', body: shapedTicketBody(), repo: REPO, state: 'yellow', plan });
  const { estimate: _, ...without } = plan;
  assert.deepEqual(stored.plan, without);
  assert.deepEqual(reread(stored.id).plan, without, 'a second read changes nothing');
  aTicket();
  assert.equal(fs.readFileSync(storeFile(), 'utf8').includes('"estimate"'), false, 'gone from the file after the next write');
});

test('items.mjs exports no minutesPerSlice', async () => {
  assert.equal('minutesPerSlice' in (await import('../items.mjs')), false);
});

test('a gate1 without sliceCount or branch is refused by name', (t) => {
  tempDeck(t);
  for (const name of ['sliceCount', 'branch']) {
    const { [name]: _, ...without } = GATE1;
    assert.throws(
      () => aGate1(aTicket().id, without),
      (error) => error instanceof DeckRefusal && error.message.includes(name),
      name,
    );
  }
  assert.throws(() => aGate1(aTicket().id, { ...GATE1, sliceCount: '11' }), (error) => error instanceof DeckRefusal && error.message.includes('sliceCount'));
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 0, 'no gate1 stored');
});

test('a yellow row shows its slice count and no minutes (spec 7 as amended at Gate 2)', () => {
  const run = { id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid, startedAt: new Date().toISOString() };
  const ticket = {
    id: 't1', kind: KIND_TICKET, title: 'Apple', body: 'Apple spec', repo: REPO, replies: [], state: 'yellow',
    plan: { ...GATE1, slug: 'ticket-states', gate1: 'itm_abc123' },
  };
  const page = renderHomePage([ticket], [run], REPO);
  const end = page.indexOf('>Apple</a>');
  assert.notEqual(end, -1, 'the ticket is on the tab');
  const row = page.slice(page.lastIndexOf('<li', end), page.indexOf('</li>', end));
  assert.match(row, /<span class="ticket-slices">11 slices<\/span>/);
  assert.doesNotMatch(row, /\d+[hm]\b|est\./, 'no minutes on the row');
  assert.match(row, /<a [^>]*href="\/thread\/itm_abc123">docs\/design\/ticket-states\/architecture\.md<\/a>/, 'the artefact links to the gate that carries it');
});
