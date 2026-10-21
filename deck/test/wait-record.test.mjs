/**
 * S3 of report-record (spec 3; L2, L3, ADR 0148): a user reply stored on a report before S1
 * refused one is handed to no pilot. `repliesSince` is where every `deck_wait` reads replies,
 * so the filter sits there and every wait, any `--as` and any `--item`, inherits it.
 *
 * The store refuses such a reply now, so each test plants it in the store file by hand, as
 * an older deck kept it. The daemon runs on a store and an ephemeral port of the test's own.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';
import { KIND_REPORT } from '../items.mjs';

const { forgetAgents } = await import('../agents.mjs');
const { currentSeq, fallbackDue, repliesSince, storeFile } = await import('../store.mjs');
const { wait } = await import('../wait.mjs');
const { callTool } = await import('../server.mjs');

const REPO = path.resolve('D:/work/alpha');

const report = (extra = {}) => postStored({ kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO, ...extra });
const question = () => postStored({ kind: 'question', title: 'Which?', body: 'A or B', repo: REPO });

/** A user reply written straight into the store file, the way a deck before ADR 0148 kept one. */
function plant(id, text) {
  const file = storeFile();
  const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
  deck.seq = (Number.isInteger(deck.seq) ? deck.seq : 0) + 1;
  deck.items.find((item) => item.id === id).replies.push({ from: 'user', text, repliedAt: new Date().toISOString(), seq: deck.seq });
  fs.writeFileSync(file, JSON.stringify(deck), 'utf8');
  return deck.seq;
}

test('a planted reply on a report is not handed to a waiter', (t) => {
  tempDeck(t);
  const since = currentSeq();
  const closing = report();
  const asked = question();
  plant(closing.id, 'please also fix the header');
  const answered = plant(asked.id, 'B');

  const { replies, seq } = repliesSince(since);
  assert.deepEqual(replies.map((reply) => reply.itemId), [asked.id]);
  assert.equal(seq, answered, 'the cursor still passes the report reply');
});

test("a report owned by another kind is not the fallback's to hand to the pilot", (t) => {
  tempDeck(t);
  const closing = report({ owner: 'qa' });
  plant(closing.id, 'please also fix the header');
  assert.deepEqual(fallbackDue(REPO, Date.now() + 1e12, () => 0).overdue, []);
});

test('wait --item on a report never returns', async (t) => {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  forgetAgents();
  t.after(() => forgetAgents());
  const closing = report();
  plant(closing.id, 'do this next');

  const said = [];
  const code = await wait({ env: {}, cwd: REPO, kind: 'pilot', item: closing.id, timeoutMinutes: 0.01, pollMs: 200, say: (line) => said.push(line) });
  assert.equal(code, 0);
  assert.match(said.join(''), /NO REPLY after/);
  assert.doesNotMatch(said.join(''), /do this next/);
});

test("deck_read hands a pilot no user reply on a report, and stamps none delivered", (t) => {
  tempDeck(t);
  const closing = report();
  const asked = question();
  plant(closing.id, 'please also fix the header');
  plant(asked.id, 'B');

  const read = JSON.parse(callTool('deck_read', { repo: REPO, open: true }).content[0].text);
  const shown = (id) => read.items.find((item) => item.id === id).replies.map((reply) => reply.text);
  assert.deepEqual(shown(closing.id), [], 'the report is read without the user reply');
  assert.deepEqual(shown(asked.id), ['B'], "a question's reply is still handed over");

  const stored = JSON.parse(fs.readFileSync(storeFile(), 'utf8')).items.find((item) => item.id === closing.id);
  assert.equal(stored.replies[0].deliveredAt, undefined, 'nothing marks it delivered');
  assert.equal(stored.replies[0].text, 'please also fix the header', 'and the store is not rewritten (L5)');
});
