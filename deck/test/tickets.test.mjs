/**
 * Merge-first S1, spec 8-10; L5, L11.
 *
 * `pilot tickets` is how the architect reads the red queue a merge is judged from:
 * the live ticket first, then the repository's other open red tickets in deck order,
 * each with its body and comments, and the live ticket's merge decision when one exists
 * (derived on read by `mergeDecisionOf`, never stored). A read: it marks no reply
 * delivered, which is why it is a route beside `/api/record` and not `deck_read`.
 * Never port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';

import { deckOnAPort, postStored, shapedTicketBody, snapshotAt, takeLive } from '../testUtils.mjs';

const { addReply, listItems, moveTicket, postItem, resolveItem, storeFile } = await import('../store.mjs');
const { mergeDecisionOf, messagesOf, repoKey } = await import('../items.mjs');
const { tickets } = await import('../tickets.mjs');

const ALPHA = 'D:/work/alpha';
const BETA = 'D:/work/beta';
const ARCHITECT = 'pilot:pilot-architect';

const stored = (id) => listItems().find((item) => item.id === id);
const ticket = (title, repo = ALPHA) => postItem({ kind: 'ticket', title, body: shapedTicketBody(title), repo, sliceCount: 30 });
const queueOf = async (base, repo = ALPHA) => (await fetch(`${base}/api/tickets?repo=${encodeURIComponent(repo)}`)).json();

test('/api/tickets lists the live ticket and the repository\'s red queue in deck order', async (t) => {
  const base = await deckOnAPort(t);
  const live = takeLive(ticket('the live one').id);
  const second = ticket('second');
  const first = ticket('first');
  moveTicket(first.id, 'up'); // deck order, not posting order
  addReply(first.id, 'and the footer too');
  postStored({ kind: 'ticket', title: 'yellow', body: shapedTicketBody(), repo: ALPHA, sliceCount: 30, state: 'yellow' });
  resolveItem(ticket('closed').id, 'not needed', '');
  ticket('elsewhere', BETA);

  const view = await queueOf(base);
  assert.equal(view.live.id, live.id);
  assert.deepEqual(view.red.map((item) => item.title), ['first', 'second'], 'yellow, closed and other repositories are left out');
  assert.equal(view.red[0].body, shapedTicketBody('first'));
  assert.equal(view.red[0].sliceCount, 30);
  assert.deepEqual(view.red[0].comments, [{ from: 'user', text: 'and the footer too' }]);
  assert.equal(view.decision, null);
  assert.equal(second.id, view.red[1].id);
});

test('/api/tickets marks no reply delivered', async (t) => {
  const base = await deckOnAPort(t);
  takeLive(ticket('the live one').id);
  const other = ticket('other');
  addReply(other.id, 'a comment the pilot has not read');

  await queueOf(base);
  const [reply] = messagesOf(stored(other.id));
  assert.equal(reply.deliveredAt, undefined);
  assert.equal(reply.deliveredTo, undefined);
});

test("/api/tickets carries this directory's records and marks nothing delivered", async (t) => {
  const base = await deckOnAPort(t);
  const entry = (repo, record) => ({ repo: repoKey(repo), record });
  const a = { slug: 'a', branch: 'feat/a', worktree: 'D:/w/a', finished: null, updatedAt: '2026-10-04T09:00:00.000Z' };
  const b = { slug: 'b', branch: 'feat/b', finished: 'closing report posted', updatedAt: '2026-10-04T10:00:00.000Z' };
  const deck = { version: 1, items: [], runs: [], seq: 0, deckSeq: 0, decks: {}, records: [entry(ALPHA, a), entry(BETA, { slug: 'x', branch: 'feat/x' }), entry(ALPHA, b)] };
  fs.writeFileSync(storeFile(), `${JSON.stringify(deck)}
`);
  const other = ticket('other');
  addReply(other.id, 'unread');

  const view = await queueOf(base);
  assert.deepEqual(view.records, [
    { slug: 'a', branch: 'feat/a', finished: null, updatedAt: '2026-10-04T09:00:00.000Z' },
    { slug: 'b', branch: 'feat/b', finished: 'closing report posted', updatedAt: '2026-10-04T10:00:00.000Z' },
  ], 'this directory only, four fields each');
  assert.equal(messagesOf(stored(other.id))[0].deliveredAt, undefined);
});

test('mergeDecisionOf finds a resolved architect item naming the ticket', () => {
  const resolvedAt = '2026-10-04T10:00:00Z';
  const decided = { id: 'itm_d', author: 'architect', ticket: 'itm_t', resolvedAt, resolution: 'merged itm_b' };
  const open = { id: 'itm_o', author: 'architect', ticket: 'itm_t' };
  const pilots = { id: 'itm_p', author: 'pilot', ticket: 'itm_t', resolvedAt };
  const another = { id: 'itm_a', author: 'architect', ticket: 'itm_x', resolvedAt };

  assert.equal(mergeDecisionOf([open, pilots, another, decided], 'itm_t'), decided);
  assert.equal(mergeDecisionOf([open, pilots, another], 'itm_t'), undefined, 'not an open one, a pilot one, or another ticket\'s');
});

/** `pilot tickets` against this test's deck: its exit code and what it printed. */
async function printed(base) {
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const said = [];
  const code = await tickets({ cwd: ALPHA, say: (text) => said.push(text) });
  return { code, text: said.join('') };
}

test('pilot tickets prints "no other red ticket" on a one-ticket deck and "merge decided" once a decision exists', async (t) => {
  const base = await deckOnAPort(t);
  const live = takeLive(ticket('the live one').id);

  const alone = await printed(base);
  assert.equal(alone.code, 0);
  assert.match(alone.text, /the live one/);
  assert.match(alone.text, new RegExp(live.id));
  assert.match(alone.text, /no other red ticket/);
  assert.doesNotMatch(alone.text, /merge decided/);

  ticket('candidate');
  const thread = postItem({ kind: 'question', title: 'Merge?', body: 'candidate', repo: ALPHA, ticket: live.id, author: ARCHITECT });
  resolveItem(thread.id, 'merged none: candidate is another surface', ARCHITECT);
  const decided = await printed(base);
  assert.match(decided.text, /candidate/);
  assert.match(decided.text, new RegExp(`merge decided: ${thread.id} — merged none: candidate is another surface`));

  // A deck that does not answer is exit 1, never a silent empty queue.
  const closed = http.createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  const down = await printed(`http://127.0.0.1:${port}`);
  assert.equal(down.code, 1);
});

// Missing assertions (principles review, fix 6): a red ticket prints its own header, body and
// comment; a deck answering non-OK is exit 1; an argument is exit 2.
test('pilot tickets prints a red ticket\'s header, body and comment line', async (t) => {
  const base = await deckOnAPort(t);
  takeLive(ticket('the live one').id);
  const other = ticket('other');
  addReply(other.id, 'and the footer too');

  const { code, text } = await printed(base);
  assert.equal(code, 0);
  assert.ok(text.includes(`## ${other.id} — other (30 slices)`), 'its header');
  assert.ok(text.includes(shapedTicketBody('other')), 'its body');
  assert.ok(text.includes('- user: and the footer too'), 'its comment line');
});

// slice-estimates spec 2, L11: a ticket's size is its slice count; a stored minute estimate is dropped, so it prints none.
test('pilot tickets prints no size for a ticket with no slice count, and never minutes', async (t) => {
  const base = await deckOnAPort(t);
  takeLive(ticket('the live one').id);
  const legacy = postStored({ kind: 'ticket', title: 'legacy', body: shapedTicketBody('legacy'), repo: ALPHA, estimate: 90 });

  const { text } = await printed(base);
  assert.ok(text.includes(`## ${legacy.id} — legacy
`), 'its header carries no size');
  assert.doesNotMatch(text, /min\)|\?/, 'no minutes and no placeholder');
});

test('pilot tickets is exit 1 when the deck answers non-OK', async (t) => {
  const refusing = http.createServer((request, response) => response.writeHead(500).end());
  await new Promise((resolve) => refusing.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => refusing.close(resolve)));
  const { code, text } = await printed(`http://127.0.0.1:${refusing.address().port}`);
  assert.equal(code, 1);
  assert.equal(text, '', 'nothing printed as a queue');
});

test('pilot tickets with no deck secret says so alone, and never asks the deck', async (t) => {
  snapshotAt(t, ALPHA, 0); // a home with no deck.secret
  let asked = 0;
  const deck = http.createServer((request, response) => { asked += 1; response.writeHead(500).end(); });
  await new Promise((resolve) => deck.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => deck.close(resolve)));
  process.env.PILOT_DECK_PORT = String(deck.address().port);
  const written = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true; };
  let code;
  try {
    code = await tickets({ cwd: ALPHA, say: () => {} });
  } finally {
    process.stderr.write = write;
  }
  assert.equal(code, 1);
  assert.equal(asked, 0);
  assert.match(written.join(''), /^pilot tickets: the deck has no secret at .*; start the deck with `pilot deck`\n$/);
});

test('pilot tickets with an argument is exit 2', async () => {
  const { main } = await import('../tickets.mjs');
  assert.equal(await main(['x']), 2);
});
