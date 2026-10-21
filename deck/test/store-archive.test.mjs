/**
 * The month archive (store-durability S4, spec 6, 7; L4-L6, A1, A3, A8). Old closed items leave the live store,
 * the archive is written before the live store, and an archived item reads back by id. Tests 1 to 5 read the
 * archive only through `archivedItem` and a count over the store directory, so any archive layout keeps them.
 */

import './no-open.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { archiveOld, archivedItem } from '../store.mjs';
import { freePort, tempDeck } from '../testUtils.mjs';

const DAEMON = fileURLToPath(new URL('../daemon.mjs', import.meta.url));
const NOW = new Date('2026-10-17T12:00:00.000Z');
const OLD = '2026-09-01T10:00:00.000Z';
const OLDER = '2026-08-03T10:00:00.000Z';
const RECENT = '2026-10-10T10:00:00.000Z';

const item = (id, fields = {}) => ({ id, kind: 'chat', repo: 'C:/repo', title: `the ${id} thread`, createdAt: '2026-07-01T00:00:00.000Z', ...fields });

/** A version 3 store holding `items`, with every top-level field L6 keeps live. */
function plant(dir, items) {
  const deck = {
    version: 3,
    items,
    runs: [{ id: 'run_1', repo: 'C:/repo' }],
    records: [{ id: 'rec_1' }],
    seq: 41,
    deckSeq: 3,
    decks: { 'C:/repo': 1 },
    coPilots: {},
    switches: {},
  };
  fs.writeFileSync(path.join(dir, 'deck.json'), `${JSON.stringify(deck, null, 2)}\n`, 'utf8');
  return deck;
}

const live = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deck.json'), 'utf8'));
const liveIds = (dir) => live(dir).items.map((each) => each.id);

/** How many copies of `id` the store directory holds outside the live store, its backup and its log. */
function archivedCopies(dir, id) {
  const outside = fs.readdirSync(dir).filter((name) => !name.startsWith('deck.json') && name !== 'deck.log');
  return outside.reduce((sum, name) => sum + fs.readFileSync(path.join(dir, name), 'utf8').split(JSON.stringify(id)).length - 1, 0);
}

test('old closed items leave and open ones keep their order', (t) => {
  const dir = tempDeck(t);
  plant(dir, [
    item('itm_open1'),
    item('itm_old1', { resolvedAt: OLD }),
    item('itm_recent', { resolvedAt: RECENT }),
    item('itm_old2', { resolvedAt: OLDER }),
    item('itm_open2'),
  ]);

  const { moved } = archiveOld({ now: NOW });

  assert.deepEqual([...moved].sort(), ['itm_old1', 'itm_old2']);
  assert.deepEqual(liveIds(dir), ['itm_open1', 'itm_recent', 'itm_open2'], 'live ids keep their order, minus the moved');
  for (const id of moved) assert.equal(archivedItem(id)?.id, id, `${id} is in the archive`);
  for (const id of liveIds(dir)) assert.equal(archivedItem(id), null, `${id} is live only`);
});

test('an open item, a notice and a named ticket stay', (t) => {
  const dir = tempDeck(t);
  plant(dir, [
    item('itm_openold', { createdAt: '2026-01-01T00:00:00.000Z' }),
    item('itm_notice', { resolvedAt: OLDER, notice: true }),
    item('itm_host', { kind: 'ticket', resolvedAt: OLDER }),
    item('itm_merged', { kind: 'ticket', resolvedAt: OLDER, mergedInto: 'itm_host' }),
    item('itm_thread', { ticket: 'itm_merged' }),
    item('itm_gone', { kind: 'ticket', resolvedAt: OLDER }),
    item('itm_goneThread', { resolvedAt: OLD, ticket: 'itm_gone' }),
  ]);

  const { moved } = archiveOld({ now: NOW });

  assert.deepEqual(liveIds(dir), ['itm_openold', 'itm_notice', 'itm_host', 'itm_merged', 'itm_thread']);
  assert.deepEqual([...moved].sort(), ['itm_gone', 'itm_goneThread'], 'a ticket only a moved item names moves with it');
});

test('a failed live write loses nothing', (t) => {
  const dir = tempDeck(t);
  const ids = ['itm_keep', 'itm_a', 'itm_b'];
  plant(dir, [item('itm_keep'), item('itm_a', { resolvedAt: OLD }), item('itm_b', { resolvedAt: OLDER })]);

  assert.throws(
    () => archiveOld({ now: NOW, writeLive: () => { throw new Error('the disk said no'); } }),
    /the disk said no/,
  );
  for (const id of ids) {
    assert.ok(liveIds(dir).includes(id) || archivedItem(id) !== null, `${id} is in the live store or the archive`);
  }

  archiveOld({ now: NOW });
  assert.deepEqual(liveIds(dir), ['itm_keep']);
  for (const id of ['itm_a', 'itm_b']) {
    assert.equal(archivedCopies(dir, id), 1, `${id} has one copy after the second pass`);
  }
});

test('seq, runs and records stay live', (t) => {
  const dir = tempDeck(t);
  const planted = plant(dir, [item('itm_old', { resolvedAt: OLD })]);

  archiveOld({ now: NOW });

  const { items, ...rest } = live(dir);
  const { items: _, ...before } = planted;
  assert.deepEqual(items, []);
  assert.deepEqual(rest, before);
});

test('an archived item reads back by id', (t) => {
  const dir = tempDeck(t);
  const old = item('itm_whole', {
    resolvedAt: OLD,
    body: 'what was said',
    messages: [{ from: 'user', text: 'a reply', seq: 9 }],
  });
  plant(dir, [old, item('itm_live')]);

  archiveOld({ now: NOW });

  assert.deepEqual(archivedItem('itm_whole'), old);
  assert.equal(archivedItem('itm_nowhere'), null);
});

test('the daemon archives on start', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const resolvedAt = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  plant(dir, [item('itm_open'), item('itm_forty', { resolvedAt })]);

  const child = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) },
    stdio: 'ignore',
  });
  const gone = new Promise((resolve) => child.once('exit', resolve));
  try {
    // The pass runs after the port is bound; the store is read until it has run or the deadline passes.
    const deadline = Date.now() + 20_000;
    while (liveIds(dir).includes('itm_forty') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));

    assert.deepEqual(liveIds(dir), ['itm_open'], 'the 40-day-old closed item has left the live store');
    assert.equal(archivedItem('itm_forty')?.id, 'itm_forty', 'and is in the archive');
  } finally {
    // Before tempDeck's removal: on Windows a live child holds the directory.
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await gone;
  }
});
