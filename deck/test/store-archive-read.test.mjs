/**
 * An archived item reads by id and refuses a reply (store-durability S5, spec 8; A2). `deck_read`,
 * `GET /api/items?id=` and the thread page fall back to `archivedItem` for an id the live store lacks,
 * read-only; a reply to it is refused as archived and moves nothing back live. The archive is reached
 * only through `archiveOld` and `archivedItem`, so any archive layout keeps these tests.
 */

import './no-open.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

import { DeckRefusal, addReply, archiveOld, archivedItem } from '../store.mjs';
import { storeDir } from '../store-dir.mjs';
import { deckOnAPort } from '../testUtils.mjs';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const OLD = '2026-09-01T10:00:00.000Z';

const old = {
  id: 'itm_archived',
  kind: 'chat',
  repo: 'C:/repo',
  title: 'the archived thread',
  body: 'what was said',
  createdAt: '2026-08-30T00:00:00.000Z',
  resolvedAt: OLD,
  resolution: 'settled',
  replies: [{ from: 'user', text: 'a reply', seq: 9, repliedAt: '2026-08-31T00:00:00.000Z' }],
};

/** A deck on a port of its own whose store holds `old` in the archive and one live item. */
async function archivedDeck(t) {
  const base = await deckOnAPort(t);
  const deck = { version: 3, items: [old, { id: 'itm_live', kind: 'chat', repo: 'C:/repo', title: 'live', createdAt: OLD }], runs: [], seq: 9 };
  fs.writeFileSync(path.join(storeDir(), 'deck.json'), `${JSON.stringify(deck, null, 2)}\n`, 'utf8');
  archiveOld({ now: NOW });
  assert.deepEqual(archivedItem(old.id), old, 'the fixture archived the item');
  return base;
}

/** Every file in the store directory and its bytes, so a test can say nothing was written. */
const snapshot = () =>
  Object.fromEntries(fs.readdirSync(storeDir()).sort().map((name) => [name, fs.readFileSync(path.join(storeDir(), name), 'utf8')]));

/**
 * A form post as the page's navigation makes it. `node:http` and not `fetch`: undici always sends
 * `Sec-Fetch-Mode: cors` and overwrites the `navigate` a refused press needs to land on its page.
 */
const press = (base, route, fields) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, 'sec-fetch-mode': 'navigate' },
    });
    request.on('response', (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location ?? '' }));
    });
    request.on('error', reject);
    request.end(String(new URLSearchParams(fields)));
  });

test('deck_read finds an archived item', async (t) => {
  const base = await archivedDeck(t);
  const before = snapshot();

  const response = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_read', arguments: { id: old.id } }),
  });
  const answer = await response.json();
  assert.equal(response.status, 200, JSON.stringify(answer));
  const read = JSON.parse(answer.content[0].text);

  assert.equal(read.items.length, 1);
  const { owner: _owner, ...got } = read.items[0];
  assert.deepEqual(got, old);
  assert.deepEqual(snapshot(), before, 'a read writes nothing');
});

test('the API finds an archived item', async (t) => {
  const base = await archivedDeck(t);
  const before = snapshot();

  const response = await fetch(`${base}/api/items?id=${old.id}`);
  assert.equal(response.status, 200);
  const { items } = await response.json();
  assert.equal(items.length, 1);
  const { owner: _owner, ...got } = items[0];
  assert.deepEqual(got, old);

  const unknown = await fetch(`${base}/api/items?id=itm_nowhere`);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: 'no item itm_nowhere to read' });
  assert.deepEqual(snapshot(), before, 'a read writes nothing');
});

test('the thread page renders an archived item', async (t) => {
  const base = await archivedDeck(t);
  const before = snapshot();

  const response = await fetch(`${base}/thread/${old.id}`);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /the archived thread/);
  assert.match(page, /what was said/);
  assert.equal((await fetch(`${base}/thread/itm_nowhere`)).status, 404);
  assert.deepEqual(snapshot(), before, 'a read writes nothing');
});

test('the thread page says an archived item is archived and draws no reopen or reply form', async (t) => {
  const base = await archivedDeck(t);
  const page = await (await fetch(`${base}/thread/${old.id}`)).text();
  assert.match(page, /<\/span> · archived · /, 'the kind line says archived');
  assert.doesNotMatch(page, /action="\/reopen"/);
  assert.doesNotMatch(page, /action="\/reply"/);
});

test('archivedItem reads past a corrupt month file, naming it once, and archiveOld still refuses it', async (t) => {
  await archivedDeck(t);
  const corrupt = path.join(storeDir(), 'deck.archive-2026-10.json');
  fs.writeFileSync(corrupt, '{"items": ');
  const errors = t.mock.method(console, 'error', () => {});
  assert.deepEqual(archivedItem(old.id), old, 'the older month still reads');
  assert.equal(archivedItem('itm_nowhere'), null, 'an unknown id is not an error');
  const said = errors.mock.calls.map((call) => call.arguments.join(' '));
  assert.ok(said.length >= 1 && said.every((line) => line.includes(corrupt)), said.join(' | '));
  const live = JSON.parse(fs.readFileSync(path.join(storeDir(), 'deck.json'), 'utf8'));
  live.items.push({ ...old, id: 'itm_october', resolvedAt: '2026-10-01T00:00:00.000Z' });
  fs.writeFileSync(path.join(storeDir(), 'deck.json'), JSON.stringify(live));
  assert.throws(() => archiveOld({ now: new Date('2026-11-15T00:00:00.000Z') }), /deck\.archive-2026-10\.json is not readable JSON/);
  assert.equal(fs.readFileSync(corrupt, 'utf8'), '{"items": ', 'the corrupt month is left untouched');
});

test('a reply to an archived item is refused', async (t) => {
  await archivedDeck(t);
  const before = snapshot();

  assert.throws(
    () => addReply(old.id, 'one more thing'),
    (err) => err instanceof DeckRefusal && err.message === 'item itm_archived is archived (closed 2026-09-01); post a new thread',
  );
  assert.throws(() => addReply('itm_nowhere', 'hello'), { message: 'no item itm_nowhere on the deck' });
  assert.deepEqual(snapshot(), before, 'the refusal writes nothing and moves nothing back live');
});

test('a press on an archived page lands its refusal on that page', async (t) => {
  const base = await archivedDeck(t);
  const before = snapshot();

  for (const [route, fields] of [['/reply', { id: old.id, text: 'one more thing' }], ['/reopen', { id: old.id }]]) {
    const response = await press(base, route, fields);
    assert.equal(response.status, 303, route);
    const location = new URL(response.location, base);
    assert.equal(location.pathname, `/thread/${old.id}`, route);
    assert.match(location.searchParams.get('refused'), /is archived \(closed 2026-09-01\); post a new thread/, route);
  }
  assert.deepEqual(snapshot(), before, 'neither press writes anything');
});
