/**
 * audit-f1-f7 S3, spec 4: `GET /api/items` answers JSON.
 *
 * The route makes deck_read's selection (L1, through `selectItems`) from `id`, `open`,
 * `brief` and `limit` in the query, and marks nothing delivered (L3): a curl is not a
 * session, so it never tells the user a reply has been taken.
 *
 * Every test takes its own store directory; nothing here touches port 4321 or
 * the real store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckOnAPort } from '../testUtils.mjs';

const { addReply, listItems, postItem } = await import('../store.mjs');
const { messagesOf } = await import('../items.mjs');

const ALPHA = 'D:/work/alpha';

const question = (title) => postItem({ kind: 'question', title, body: 'A or B', repo: ALPHA, author: '' });

const deckRead = async (base, args) => {
  const response = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_read', arguments: args }),
  });
  return JSON.parse((await response.json()).content[0].text);
};

test('json not html', async (t) => {
  const base = await deckOnAPort(t);
  question('Which port?');

  const response = await fetch(`${base}/api/items`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const body = await response.json();
  assert.equal(body.total, 1);
  assert.equal(typeof body.seq, 'number');
  assert.equal(body.items.length, 1);
});

test('brief and id pass through', async (t) => {
  const base = await deckOnAPort(t);
  const ids = ['a', 'b', 'c'].map((title) => question(title).id);
  addReply(ids[1], 'B');

  const brief = await (await fetch(`${base}/api/items?brief=1&open=1&limit=2`)).json();
  const expectedBrief = await deckRead(base, { brief: true, open: true, limit: 2 });
  assert.deepEqual(brief.items, expectedBrief.items);
  assert.equal(brief.total, expectedBrief.total);

  const one = await (await fetch(`${base}/api/items?id=${ids[1]}`)).json();
  const expectedOne = await deckRead(base, { id: ids[1] });
  assert.deepEqual(one.items, expectedOne.items);
  assert.deepEqual(one.items.map((item) => item.id), [ids[1]]);
});

test('a curl reads without taking', async (t) => {
  const base = await deckOnAPort(t);
  const posted = question('Which port?');
  addReply(posted.id, 'B');
  const marks = () => messagesOf(listItems().find((item) => item.id === posted.id)).map((reply) => reply.deliveredAt);
  const before = marks();

  for (const query of ['', '?open=1', `?id=${posted.id}`, '?brief=1']) {
    assert.equal((await fetch(`${base}/api/items${query}`)).status, 200, query);
  }

  assert.deepEqual(marks(), before);
  assert.ok(before.every((mark) => mark === undefined), 'the reply was undelivered to begin with');
});

test('an unknown id is 404', async (t) => {
  const base = await deckOnAPort(t);
  question('Which port?');

  const response = await fetch(`${base}/api/items?id=itm_nope`);

  assert.equal(response.status, 404);
  assert.equal(typeof (await response.json()).error, 'string');
});

test('a bad limit is 400', async (t) => {
  const base = await deckOnAPort(t);

  for (const limit of ['0', 'ten', '1.5']) {
    const response = await fetch(`${base}/api/items?limit=${limit}`);
    assert.equal(response.status, 400, limit);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});
