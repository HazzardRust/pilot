/**
 * yellow-lane S7, spec 11; L6, A2, A3.
 *
 * An owed thread is an open chat or user thread of the directory whose last message is the
 * user's (unanswered), or whose last message is a pilot reply sent with `promise: true`
 * (promised). `owedThreadsOf` is pure; `GET /api/record` serves it as `owed`. The promise is
 * the stored flag and never a phrase in the text (A2), and `line` is the last message on one
 * line, clipped to 120 characters (A3).
 *
 * Every test takes its own store and port; nothing here touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';

const { owedThreadsOf } = await import('../owed.mjs');
const { listItems } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

const REPO = path.resolve('D:/work/owed');
const OTHER = path.resolve('D:/work/elsewhere');
const AT = '2026-10-14T10:00:00.000Z';

const user = (text, more = {}) => ({ from: 'user', text, repliedAt: AT, seq: 1, ...more });
const pilot = (text, more = {}) => ({ from: 'pilot', text, repliedAt: AT, ...more });
const thread = (id, kind, replies, more = {}) => ({ id, kind, title: id, body: 'opened', repo: REPO, postedAt: AT, replies, ...more });

test("a user's last word is unanswered", () => {
  const long = `can you\n  check the   gate ${'x'.repeat(200)}`;
  const items = [
    // Read through a pass: the pilot's deck_read handed it over, and reading is not answering.
    thread('itm_u1', 'user', [pilot('hello'), user('is S3 merged?', { deliveredAt: AT })]),
    thread('itm_c1', 'chat', [user(long)]),
  ];

  const owed = owedThreadsOf(items, REPO);

  assert.deepEqual(owed.map(({ id, why }) => ({ id, why })), [
    { id: 'itm_u1', why: 'unanswered' },
    { id: 'itm_c1', why: 'unanswered' },
  ]);
  assert.equal(owed[0].line, 'is S3 merged?');
  assert.equal(owed[1].line.length, 120, 'clipped to 120 characters');
  assert.ok(owed[1].line.startsWith('can you check the gate x'), 'one line, its whitespace collapsed');
  assert.doesNotMatch(owed[1].line, /\n/);
});

test('a line is trimmed, and cut only past 120 characters', () => {
  const lineOf = (text) => owedThreadsOf([thread('itm_l1', 'chat', [user(text)])], REPO)[0].line;

  assert.equal(lineOf('  \n padded \t '), 'padded', 'trimmed at both ends');
  assert.equal(lineOf('y'.repeat(120)), 'y'.repeat(120), 'exactly 120 is kept whole');
  assert.equal(lineOf('y'.repeat(121)), `${'y'.repeat(119)}…`, '121 is cut to 120, its last an ellipsis');
});

test('a promise is owed until the next pilot reply', (t) => {
  tempDeck(t);
  const chat = postStored({ kind: 'chat', title: 'chat', body: 'opened', repo: REPO, replies: [user('look at the flake')] });

  callTool('deck_reply', { id: chat.id, text: 'I will come back on it\nonce the gate is in', author: '', promise: true });
  assert.deepEqual(owedThreadsOf(listItems(), REPO), [{ id: chat.id, line: 'I will come back on it once the gate is in', why: 'promised' }]);

  callTool('deck_reply', { id: chat.id, text: 'I will come back to it, promise', author: '' });
  assert.deepEqual(owedThreadsOf(listItems(), REPO), [], 'a plain reply discharges it, whatever its words say');

  assert.throws(() => callTool('deck_reply', { id: chat.id, text: 'later', author: '', promise: 'yes' }), /promise/);
});

test('a closed or answered thread is not owed', () => {
  const items = [
    thread('itm_a1', 'user', [user('why?'), pilot('because')]),
    thread('itm_n1', 'chat', []),
    thread('itm_x1', 'user', [user('still there?')], { resolvedAt: AT, resolution: 'closed by the user' }),
    thread('itm_o1', 'chat', [user('other directory')], { repo: OTHER }),
    thread('itm_q1', 'question', [user('B')], { options: ['A', 'B'] }),
    thread('itm_p1', 'chat', [pilot('on it', { promise: true }), user('thanks'), pilot('done')]),
  ];

  assert.deepEqual(owedThreadsOf(items, REPO), []);
});

// never-stuck S12 (spec 1, 2): a ticket is owed its closing report once its gate2 landed, and an
// architect while it is the live red ticket with no gate1 open on it; both by the ticket's id and title.
const ticket = (id, more = {}) => ({ id, kind: 'ticket', title: `Ticket ${id}`, body: 'spec', repo: REPO, postedAt: AT, sliceCount: 2, replies: [], ...more });
const gate = (id, kind, ticketId, more = {}) => ({ id, kind, title: id, body: 'gate', repo: REPO, postedAt: AT, ticket: ticketId, replies: [], ...more });
const LANDED = { state: 'landed', startedAt: AT, at: AT, sha: '0123456789abcdef', line: 'landed' };

test('a landed gate2 with no report is owed', () => {
  const green = ticket('itm_t1', { state: 'green', title: 'Never\n  stuck' });
  const items = [
    green,
    gate('itm_g2', 'gate2', 'itm_t1', { landing: LANDED, resolvedAt: AT, resolution: 'landed at 0123456' }),
    // Not landed yet, refused, or another directory's: nothing owed.
    ticket('itm_t2', { state: 'green' }),
    gate('itm_g3', 'gate2', 'itm_t2', { landing: { ...LANDED, state: 'running' } }),
    ticket('itm_t3', { state: 'green' }),
    gate('itm_g4', 'gate2', 'itm_t3', { landing: { ...LANDED, state: 'refused' } }),
    ticket('itm_t4', { state: 'green', repo: OTHER }),
    gate('itm_g5', 'gate2', 'itm_t4', { landing: LANDED, repo: OTHER }),
  ];

  assert.deepEqual(owedThreadsOf(items, REPO), [{ id: 'itm_t1', line: 'Never stuck', why: 'report owed' }]);

  // The closing report closes its ticket, and that discharges it.
  const reported = items.map((item) => (item === green ? { ...green, resolvedAt: AT, resolution: 'reported' } : item));
  assert.deepEqual(owedThreadsOf(reported, REPO), []);
});

test('a live red ticket with no gate1 is owed an architect', () => {
  const red = ticket('itm_r1', { state: 'red', live: true, title: 'Re-cut the plan' });
  const items = [
    red,
    // Red but not live, or live in another directory: no architect is owed on it.
    ticket('itm_r2', { state: 'red' }),
    ticket('itm_r3', { state: 'red', live: true, repo: OTHER }),
    gate('itm_q1', 'gate1', 'itm_r1', { resolvedAt: AT, resolution: 'Not yet, withdrawn' }),
  ];

  assert.deepEqual(owedThreadsOf(items, REPO), [{ id: 'itm_r1', line: 'Re-cut the plan', why: 'architect owed' }], 'a closed gate1 is no open one');

  const planned = [...items, gate('itm_q2', 'gate1', 'itm_r1')];
  assert.deepEqual(owedThreadsOf(planned, REPO), [], 'an open gate1 is the architect at work');
});

test('the card reads report owed', async () => {
  const { renderCard } = await import('../ui/render-cards.mjs');
  const green = ticket('itm_c1', { state: 'green' });
  const landed = gate('itm_c2', 'gate2', 'itm_c1', { landing: LANDED });
  const label = /<span class="owed">report owed<\/span>/;

  assert.match(renderCard(green, { items: [green, landed] }), label);
  assert.doesNotMatch(renderCard(green, { items: [green, { ...landed, landing: { ...LANDED, state: 'running' } }] }), label, 'not before it lands');
  const closed = { ...green, resolvedAt: AT, resolution: 'reported' };
  assert.doesNotMatch(renderCard(closed, { items: [closed, landed] }), label, 'not once the report closed it');
});

test('the record route serves it', async (t) => {
  const base = await deckOnAPort(t);
  postStored({ kind: 'user', title: 'ask', body: 'opened', repo: REPO, replies: [user('where is S7?')] });
  postStored({ kind: 'chat', title: 'chat', body: 'opened', repo: REPO, replies: [pilot('back soon', { promise: true })] });

  const served = await (await fetch(`${base}/api/record?repo=${encodeURIComponent(REPO)}`)).json();

  assert.deepEqual(served.owed, owedThreadsOf(listItems(), REPO));
  assert.deepEqual(served.owed.map((owed) => owed.why), ['unanswered', 'promised']);
});
