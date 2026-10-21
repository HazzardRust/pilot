/**
 * yellow-lane S15 (spec 12, 15, 26; L9, A4): red is planning, green is concluding. A store written
 * before the swap, version 1, loads with each ticket's meaning kept: its `green` reads `red` and its
 * `red` reads `green`, once, and the file is written back as version 2. No ticket changes queue.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIND_QUESTION, KIND_TICKET, TICKET_STATES, nextTicketOf, stateOf } from '../items.mjs';
import { upgradeStore } from '../store-core.mjs';
import { listItems, storeFile } from '../store.mjs';
import { shapedTicketBody, tempDeck } from '../testUtils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve('D:/work/pilot');
const NOW = new Date().toISOString();

const ticket = (id, state, extra = {}) => ({
  id, kind: KIND_TICKET, title: `Ticket ${id}`, body: shapedTicketBody(`Ticket ${id}`), repo: REPO, state, sliceCount: 1, createdAt: NOW, ...extra,
});

/** A v1 store: planning saved `green`, concluding saved `red`, one of each other state, and a non-ticket item. */
const v1 = () => ({
  version: 1,
  seq: 0,
  deckSeq: 0,
  decks: {},
  runs: [],
  items: [
    ticket('planning', 'green'),
    ticket('implementing', 'yellow'),
    ticket('concluding', 'red'),
    ticket('done', 'closed', { status: 'resolved' }),
    ticket('stateless', undefined),
    { id: 'q1', kind: KIND_QUESTION, title: 'Which?', body: 'Which one?', repo: REPO, state: 'green', createdAt: NOW },
  ],
});

const stateById = (deck) => Object.fromEntries(deck.items.map((item) => [item.id, item.state]));

test('a v1 store keeps every ticket\'s meaning', () => {
  const deck = upgradeStore(v1());
  assert.equal(deck.version, 3, 'through v2 to v3 (co-pilot-tickets S5)');
  assert.deepEqual(stateById(deck), {
    planning: 'red',
    implementing: 'yellow',
    concluding: 'green',
    done: 'closed',
    stateless: undefined,
    q1: 'green',
  }, 'a planning ticket reads red, a concluding one green, the rest and every non-ticket untouched');
  assert.equal(stateOf(deck.items.find((item) => item.id === 'stateless')), 'red', 'a ticket stored without a state still reads planning');
});

test('it runs once', () => {
  const once = upgradeStore(v1());
  const again = upgradeStore(structuredClone(once));
  assert.deepEqual(again, once, 'a v2 store comes back identical');
});

test('readDeck upgrades a v1 file and writes v3 before answering', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify(v1()));
  const read = Object.fromEntries(listItems().filter((item) => item.kind === KIND_TICKET && item.status !== 'resolved').map((item) => [item.id, item.state]));
  assert.deepEqual(read, { planning: 'red', implementing: 'yellow', concluding: 'green', stateless: undefined });
  const stored = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  assert.equal(stored.version, 3, 'the file on disk is v3 after one read');
  assert.equal(stateById(stored).planning, 'red');
  assert.equal(stateById(stored).concluding, 'green');
  listItems();
  assert.equal(stateById(JSON.parse(fs.readFileSync(storeFile(), 'utf8'))).planning, 'red', 'a second read swaps nothing');
});

test('a store of another version is still refused', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify({ ...v1(), version: 4 }));
  assert.throws(() => listItems(), /is version 4, and this deck reads version 3/);
});

test('the lanes read the new names', () => {
  assert.deepEqual(TICKET_STATES, ['red', 'yellow', 'green', 'closed']);
  const items = [ticket('t1', 'yellow'), ticket('t2', 'red'), ticket('t3', 'red')];
  assert.equal(nextTicketOf(items, REPO, 'red')?.id, 't2', 'the red planning head is next, as the green one was');
});

test('the plugin version moved with the store', () => {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).version;
  const pkg = read('package.json');
  assert.equal(read('.claude-plugin/plugin.json'), pkg);
  assert.notEqual(pkg, '0.9.0', 'the v3 store ships in a new release (co-pilot-tickets S5)');
  assert.equal(pkg, '0.9.5');
});
