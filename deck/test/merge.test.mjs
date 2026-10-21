/**
 * Merging a red ticket into the live one (ticket-states spec 11; L14, L15, A2). During planning
 * the pilot folds a same-type red ticket into the live red one with `deck_ticket merge`: the
 * absorbed ticket closes "merged into" the host, and its title, body and comments arrive on the
 * host as one reply; the host's slice count becomes the sum and its body is never edited. A yellow
 * ticket was signed on its own plan and never merges, either way round.
 *
 * Every test takes its own store; nothing touches the real deck or port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_TICKET, messagesOf, stateOf } from '../items.mjs';
import { DeckRefusal, addReply, listItems, mergeTicket, postItem, reopenItem, storeFile } from '../store.mjs';
import { deckOnAPort, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');

const aTicket = (title, sliceCount = 60) => postItem({ kind: KIND_TICKET, sliceCount, title, body: shapedTicketBody(title), repo: REPO });
const reread = (id) => listItems().find((item) => item.id === id);
const refusedNaming = (...words) => (error) =>
  error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('merging closes the absorbed ticket as merged into the live one', (t) => {
  tempDeck(t);
  const host = aTicket('host');
  const absorbed = aTicket('absorbed');
  takeLive(host.id);

  const result = mergeTicket(absorbed.id);

  const merged = reread(absorbed.id);
  assert.equal(merged.resolution, `merged into ${host.id}`);
  assert.equal(merged.mergedInto, host.id);
  assert.equal(merged.state, 'closed');
  assert.equal(stateOf(merged), 'closed');
  assert.ok(merged.resolvedAt);
  assert.equal(result.merged.id, absorbed.id);
  assert.equal(result.host.id, host.id);
  assert.equal(stateOf(reread(host.id)), 'red', 'the host stays red');
  assert.equal(reread(host.id).live, true, 'and live');
});

test('the host gains one reply carrying the absorbed body, and its slice count is the sum', (t) => {
  tempDeck(t);
  const host = aTicket('host', 60);
  const absorbed = aTicket('absorbed', 45);
  addReply(absorbed.id, 'and the footer too');
  takeLive(host.id);

  mergeTicket(absorbed.id);

  const stored = reread(host.id);
  assert.equal(stored.body, host.body, 'the host body is never edited');
  assert.equal(stored.sliceCount, 105);
  const replies = messagesOf(stored);
  assert.equal(replies.length, 1);
  const [reply] = replies;
  assert.equal(reply.from, 'pilot');
  assert.equal(reply.seq, undefined, 'the pilot is not woken by its own merge');
  assert.ok(reply.text.includes(absorbed.id));
  assert.ok(reply.text.includes('absorbed'), 'the title');
  assert.ok(reply.text.includes(absorbed.body), 'the body');
  assert.ok(reply.text.includes('and the footer too'), 'the comments');
});

test('merge is refused with no live planning ticket, a yellow source, or the live ticket itself', (t) => {
  tempDeck(t);
  const host = aTicket('host');
  const absorbed = aTicket('absorbed');
  assert.throws(() => mergeTicket(absorbed.id), refusedNaming('no ticket is live'));

  takeLive(host.id);
  assert.throws(() => mergeTicket(host.id), refusedNaming(host.id, 'live'));

  const yellow = postStored({ kind: KIND_TICKET, title: 'yellow', body: shapedTicketBody('y'), repo: REPO, state: 'yellow', sliceCount: 30 });
  assert.throws(() => mergeTicket(yellow.id), refusedNaming(yellow.id, 'yellow'));

  // The host is the live planning ticket (three-lanes spec 1): a live concluding ticket alone takes no merge.
  const signed = postStored({ kind: KIND_TICKET, title: 'signed', body: shapedTicketBody('s'), repo: REPO, state: 'green', sliceCount: 30 });
  takeLive(signed.id);
  assert.throws(() => mergeTicket(absorbed.id), refusedNaming('no ticket is live in planning'));

  assert.equal(reread(absorbed.id).resolvedAt, undefined, 'nothing merged');
  assert.equal(messagesOf(reread(host.id)).length, 0);
  assert.equal(reread(host.id).sliceCount, 60);
});

test('the merge is one store write', (t) => {
  tempDeck(t);
  const host = aTicket('host');
  const absorbed = aTicket('absorbed');
  takeLive(host.id);

  const writes = [];
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    writes.push(to);
    return rename(from, to);
  });
  mergeTicket(absorbed.id);
  t.mock.restoreAll();

  assert.equal(writes.filter((file) => path.resolve(file) === path.resolve(storeFile())).length, 1, 'one writeDeck');
});

test('a merged ticket is not reopened: the host already carries its words and slice count (N6, QA F2)', (t) => {
  tempDeck(t);
  const host = aTicket('host');
  const absorbed = aTicket('absorbed');
  takeLive(host.id);
  mergeTicket(absorbed.id);

  assert.throws(() => reopenItem(absorbed.id), refusedNaming(absorbed.id, host.id));
  assert.throws(() => addReply(absorbed.id, 'one more thing'), refusedNaming(absorbed.id, host.id), 'nor by a reply');
  assert.equal(stateOf(reread(absorbed.id)), 'closed');
  assert.equal(reread(host.id).sliceCount, 120, 'counted once');
});

test('merging a 4 into a live 8 leaves the host at 12 and answers "12 slices"', async (t) => {
  const base = await deckOnAPort(t);
  const host = aTicket('host', 8);
  const absorbed = aTicket('absorbed', 4);
  takeLive(host.id);

  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: { id: absorbed.id, action: 'merge' } }),
  });
  assert.equal(answer.status, 200);
  const { content } = await answer.json();
  assert.equal(content[0].text, `Merged ${absorbed.id} into ${host.id}: 12 slices.`);
  assert.equal(reread(host.id).sliceCount, 12);
  assert.equal(reread(absorbed.id).mergedInto, host.id);
});

test('merging two tickets with no count leaves the host with no count, not "0 slices"', (t) => {
  tempDeck(t);
  const legacy = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, estimate: 90 });
  const host = legacy('host');
  const absorbed = legacy('absorbed');
  takeLive(host.id);
  mergeTicket(absorbed.id);
  assert.equal('sliceCount' in reread(host.id), false);
});

test('merging two tickets with no count answers "no slice count", not "undefined slices"', async (t) => {
  const base = await deckOnAPort(t);
  const legacy = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO });
  const host = legacy('host');
  const absorbed = legacy('absorbed');
  takeLive(host.id);

  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: { id: absorbed.id, action: 'merge' } }),
  });
  const { content } = await answer.json();
  assert.equal(content[0].text, `Merged ${absorbed.id} into ${host.id}: no slice count.`);
});

test('a host with no count merging a ticket of 4 is left with 4 and answers "4 slices"', async (t) => {
  const base = await deckOnAPort(t);
  const host = postStored({ kind: KIND_TICKET, title: 'host', body: shapedTicketBody('host'), repo: REPO });
  const absorbed = aTicket('absorbed', 4);
  takeLive(host.id);

  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: { id: absorbed.id, action: 'merge' } }),
  });
  const { content } = await answer.json();
  assert.equal(content[0].text, `Merged ${absorbed.id} into ${host.id}: 4 slices.`);
  assert.equal(reread(host.id).sliceCount, 4);
});

// The merge comment names its caller (principles review, fix 3): the architect's merge step
// reads as the architect's in `pilot tickets`, and the pilot's own merge as the pilot's.
test('the merge comment carries the architect when the architect merges, and the pilot otherwise', async (t) => {
  tempDeck(t);
  const { callTool } = await import('../server.mjs');
  const { queueView } = await import('../tickets.mjs');
  const host = aTicket('host');
  takeLive(host.id);
  callTool('deck_ticket', { id: aTicket('by the architect').id, action: 'merge', author: 'pilot:pilot-architect' });
  callTool('deck_ticket', { id: aTicket('by the pilot').id, action: 'merge' });
  const comments = queueView(listItems(), REPO).live.comments;
  assert.deepEqual(comments.map((comment) => comment.from), ['architect', 'pilot']);
  assert.match(comments[0].text, /by the architect/);
});
