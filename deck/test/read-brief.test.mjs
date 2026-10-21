/**
 * audit-f1-f7 S2, spec 2 and 3: a brief read lists the deck in one line per item.
 *
 * `deck_read {brief:true}` returns id, kind, state, owner, reply count and title per
 * item and no bodies, combines with `open` and `limit`, hands over no reply (the text
 * was never shown), and the schema that says so stays inside its 467 bytes (L2).
 *
 * Every test takes its own store directory; nothing here touches port 4321 or
 * the real store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addReply, listItems, postItem, resolveItem } = await import('../store.mjs');
const { messagesOf } = await import('../items.mjs');
const { TOOLS } = await import('../tools.mjs');
// Taken inside the tests that need them, so the rest fail on behaviour, not on a missing export.
const read = async () => import('../read.mjs');

const ALPHA = 'D:/work/alpha';
const LONG = 'A long body that a scan of the deck has no use for. '.repeat(22);

const question = (title, body = 'A or B') => postItem({ kind: 'question', title, body, repo: ALPHA, author: '' });

test('a brief item carries no body', async (t) => {
  tempDeck(t);
  const posted = question('Which port?', LONG);
  addReply(posted.id, 'B');

  const [line] = (await read()).selectItems(listItems(), { id: posted.id, brief: true });

  assert.deepEqual(Object.keys(line).sort(), ['id', 'kind', 'owner', 'replies', 'state', 'title']);
  assert.equal(line.id, posted.id);
  assert.equal(line.title, 'Which port?');
  assert.equal(line.replies, 1);
  assert.equal(typeof line.state, 'string');
});

test('brief combines with open and limit', async (t) => {
  tempDeck(t);
  const ids = ['a', 'b', 'c', 'd', 'e'].map((title) => question(title).id);
  resolveItem(ids[3], 'done');
  const items = listItems();
  const { selectItems } = await read();

  for (const options of [{}, { limit: 2 }, { open: true }, { open: true, limit: 2 }, { id: ids[1] }]) {
    const brief = selectItems(items, { ...options, brief: true });
    assert.deepEqual(
      brief.map((item) => item.id),
      selectItems(items, options).map((item) => item.id),
      `the same ids for ${JSON.stringify(options)}`,
    );
    assert.ok(brief.every((item) => !('body' in item) && !('replies' in item && Array.isArray(item.replies))));
  }
});

test('twenty open items are under 3 KB', async (t) => {
  const base = await deckOnAPort(t);
  const posted = Array.from({ length: 20 }, (_, index) => question(`Open question number ${index}`, LONG));
  for (const item of posted) addReply(item.id, LONG);

  const response = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'deck_read',
      arguments: { brief: true, open: true, repo: ALPHA, author: 'pilot:pilot' },
    }),
  });
  const text = (await response.json()).content[0].text;
  t.diagnostic(`brief read of 20 open long-bodied items: ${text.length} chars`);

  assert.equal(JSON.parse(text).items.length, 20);
  assert.ok(text.length < 3000, `a brief read is ${text.length} chars`);
  assert.ok(
    listItems().flatMap(messagesOf).every((message) => message.deliveredAt === undefined),
    'a brief read shows no reply text, so it hands none over',
  );
});

test('the schema stays in its bytes', () => {
  const entry = TOOLS.find((tool) => tool.name === 'deck_read');
  assert.ok(entry.inputSchema.properties.id, 'deck_read declares id');
  assert.equal(entry.inputSchema.properties.brief?.type, 'boolean', 'deck_read declares brief');
  // session-row S2 (2026-10-12) raised it from 467 to the measured 548: the `messages` property (L9), 81.
  assert.ok(JSON.stringify(entry).length <= 548, `deck_read schema is ${JSON.stringify(entry).length} bytes`);
});
