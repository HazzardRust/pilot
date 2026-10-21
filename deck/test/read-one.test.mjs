/**
 * audit-f1-f7 S1, spec 1 and 3: an agent reads one thread by id.
 *
 * `deck_read {id}` returns that thread alone, hands over its replies under the
 * read's ordinary rule (owned threads only, and only when the run is named), and
 * the schema that says so stays inside its 467 bytes (L2).
 *
 * Every test takes its own store directory; nothing here touches port 4321 or
 * the real store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { addReply, listItems, postItem, resolveItem } = await import('../store.mjs');
const { messagesOf } = await import('../items.mjs');
const { callTool } = await import('../server.mjs');
const { TOOLS } = await import('../tools.mjs');
// Taken inside the tests that need it, so the rest fail on behaviour, not on a missing module.
const selectItems = async (...args) => (await import('../read.mjs')).selectItems(...args);

const ALPHA = 'D:/work/alpha';

const question = (title) => postItem({ kind: 'question', title, body: 'A or B', repo: ALPHA, author: '' });
const stored = (id) => listItems().find((item) => item.id === id);
const read = (args) => JSON.parse(callTool('deck_read', args).content[0].text);

test('one item by id', (t) => {
  tempDeck(t);
  question('First');
  const wanted = question('Wanted');
  question('Last');
  addReply(wanted.id, 'B');

  const answer = read({ id: wanted.id, repo: ALPHA, author: 'pilot:pilot-qa' });

  assert.deepEqual(answer.items.map((item) => item.id), [wanted.id]);
  assert.deepEqual(messagesOf(answer.items[0]).map((m) => m.text).at(-1), 'B', 'with its messages');
  assert.equal(answer.total, 3, 'total still counts what was asked about');
});

test('an unknown id is refused by name', async () => {
  await assert.rejects(
    () => selectItems([{ id: 'itm_known' }], { id: 'itm_nope' }),
    (error) => error.name === 'DeckRefusal' && error.message.includes('itm_nope'),
  );
});

test('a read by id hands over only that owned thread', (t) => {
  tempDeck(t);
  const wanted = question('Wanted');
  const other = question('Other');
  addReply(wanted.id, 'A');
  addReply(other.id, 'B');

  read({ id: wanted.id });
  assert.equal(messagesOf(stored(wanted.id)).at(-1).deliveredAt, undefined, 'a read naming no repo hands nothing over');

  read({ id: wanted.id, repo: ALPHA });
  assert.equal(messagesOf(stored(wanted.id)).at(-1).deliveredTo, 'pilot');
  assert.equal(messagesOf(stored(other.id)).at(-1).deliveredAt, undefined, 'the thread not asked for is left');
});

test('the schema stays in its bytes', () => {
  const entry = TOOLS.find((tool) => tool.name === 'deck_read');
  assert.ok(entry.inputSchema.properties.id, 'deck_read declares id');
  // session-row S2 (2026-10-12) raised it from 467 to the measured 548: the `messages` property (L9), 81.
  assert.ok(JSON.stringify(entry).length <= 548, `deck_read schema is ${JSON.stringify(entry).length} bytes`);
});

test('newest-N reads are unchanged', async (t) => {
  tempDeck(t);
  const ids = ['a', 'b', 'c', 'd', 'e'].map((title) => question(title).id);
  resolveItem(ids[3], 'done');
  const items = listItems();

  assert.deepEqual((await selectItems(items, { limit: 2 })).map((item) => item.id), ids.slice(-2));
  assert.deepEqual((await selectItems(items, { open: true, limit: 2 })).map((item) => item.id), [ids[2], ids[4]]);
  assert.equal((await selectItems(items, {})).length, 5, 'the default limit is wider than five');
});
