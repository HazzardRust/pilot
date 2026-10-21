/**
 * co-pilot-tickets S5 (spec 3; L6, L10, L13, A5): a v2 store spells a ticket `task` and a co-pilot
 * `foreman`; on its first read it is copied to `deck.v2-<local date>.json` beside it, once (L10, S20),
 * and written back as v3 with only kinds and keys renamed. This file is a §7 fixture (L13): it spells the v2 words.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { upgradeStore } from '../store-core.mjs';
import { listItems, storeFile } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

const REPO = 'd:\\work\\pilot';
const AT = '2026-10-01T00:00:00.000Z';
const ticket = (id, state) => ({ id, kind: 'task', title: `Ticket ${id}`, body: 'Keep the task word', repo: REPO, state, sliceCount: 1, author: 'pilot: task', postedAt: AT });

/** A v2 store: open tickets out of id order, a question and a gate1 on one, the co-pilot's lane and a run record. */
const v2 = () => ({
  version: 2,
  seq: 1,
  deckSeq: 0,
  decks: {},
  runs: [],
  items: [
    ticket('itm_000000000003', 'yellow'),
    { id: 'itm_000000000009', kind: 'question', title: 'Which?', body: 'Which task?', repo: REPO, task: 'itm_000000000003', author: 'architect', postedAt: AT,
      replies: [{ from: 'user', text: 'task it', repliedAt: AT, seq: 1, switch: { lane: 'foreman', from: null, to: 'itm_000000000003' } }] },
    ticket('itm_000000000001', 'red'),
    ticket('itm_000000000002', 'green'),
  ],
  foremen: { [REPO]: { task: 'itm_000000000003', live: true, at: AT } },
  switches: { [REPO]: { foreman: { from: null, to: 'itm_000000000003', at: AT } } },
  records: [{ repo: REPO, record: { slug: 'co-pilot-tickets', task: 'itm_000000000003', branch: 'feat/co-pilot-tickets' } }],
});

const listing = (items) => items.map(({ id, state }) => [id, state]);
const backups = (dir) => fs.readdirSync(dir).filter((name) => /^deck\.v\d+-/.test(name));
const today = () => new Date().toLocaleDateString('sv-SE'); // the user's date, YYYY-MM-DD

test('an old store reads back unchanged but its spelling', () => {
  const before = v2();
  const deck = upgradeStore(v2());
  assert.deepEqual(listing(deck.items), listing(before.items), 'ids, states and order are kept');
  assert.deepEqual(deck.items.filter((item) => item.id !== 'itm_000000000009').map((item) => item.kind), ['ticket', 'ticket', 'ticket']);
  const question = deck.items[1];
  assert.equal(question.ticket, 'itm_000000000003');
  assert.equal('task' in question, false);
  assert.deepEqual(Object.keys(question), Object.keys(before.items[1]).map((key) => (key === 'task' ? 'ticket' : key)), 'the field keeps its place');
  assert.deepEqual(deck.items.map(({ body, author }) => [body, author]), before.items.map(({ body, author }) => [body, author]), 'bodies and authors as written (A5)');
  assert.equal(question.replies[0].text, 'task it');
  assert.deepEqual(deck.records[0].record, { slug: 'co-pilot-tickets', ticket: 'itm_000000000003', branch: 'feat/co-pilot-tickets' });
});

test("the co-pilot's lane survives", () => {
  const deck = upgradeStore(v2());
  assert.deepEqual(deck.coPilots, { [REPO]: { ticket: 'itm_000000000003', live: true, at: AT } });
  assert.equal('foremen' in deck, false);
  assert.deepEqual(deck.switches[REPO], { coPilot: { from: null, to: 'itm_000000000003', at: AT } });
  assert.deepEqual(deck.items[1].replies[0].switch, { lane: 'coPilot', from: null, to: 'itm_000000000003' }, 'a pending switch reply keeps its lane');
});

test('the backup is written once, before', (t) => {
  const day = today(); // taken before the read, so a run across midnight does not flake
  const dir = tempDeck(t);
  const old = `${JSON.stringify(v2(), null, 2)}
`;
  fs.writeFileSync(storeFile(), old);
  listItems();
  assert.deepEqual(backups(dir), [`deck.v2-${day}.json`]);
  assert.equal(fs.readFileSync(path.join(dir, `deck.v2-${day}.json`), 'utf8'), old, 'the backup holds the old bytes');
  listItems();
  assert.deepEqual(backups(dir), [`deck.v2-${day}.json`], 'a second read writes no second backup');

  const fresh = tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify(upgradeStore(v2())));
  listItems();
  assert.deepEqual(backups(fresh), [], 'a v3 store is never backed up');
});

test('the backup is named by the local day, not the UTC one', (t) => {
  const zone = process.env.TZ;
  process.env.TZ = 'Australia/Brisbane'; // UTC+10, no daylight saving
  t.after(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-16T14:21:00Z') }); // 00:21 on the 17th, local
  const dir = tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify(v2()));
  listItems();
  assert.deepEqual(backups(dir), ['deck.v2-2026-10-17.json']);
});

test('a backup already there with other bytes is kept, and the copy goes beside it', (t) => {
  const day = today(); // taken before the read, so a run across midnight does not flake
  const dir = tempDeck(t);
  const other = path.join(dir, `deck.v2-${day}.json`);
  fs.writeFileSync(other, '{"version":2,"items":[');
  const old = JSON.stringify(v2());
  fs.writeFileSync(storeFile(), old);
  listItems();
  assert.equal(fs.readFileSync(other, 'utf8'), '{"version":2,"items":[', 'the truncated backup is kept as it was');
  assert.equal(fs.readFileSync(path.join(dir, `deck.v2-${day}-2.json`), 'utf8'), old, 'the old store has a copy of its own');
  assert.deepEqual(backups(dir).sort(), [`deck.v2-${day}-2.json`, `deck.v2-${day}.json`]);
});

test('a backup that cannot be written refuses the v3 write and names the backup', (t) => {
  const day = today(); // taken before the read, so a run across midnight does not flake
  const dir = tempDeck(t);
  const backup = path.join(dir, `deck.v2-${day}.json`);
  fs.mkdirSync(backup); // the backup's name is taken by something that cannot be read back
  const old = JSON.stringify(v2());
  fs.writeFileSync(storeFile(), old);
  assert.throws(() => listItems(), (err) => err.message.includes(backup) && err.message.includes(storeFile()));
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), old, 'the store is left as it was, v2');
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')), [], 'no temporary file is left behind');
});

test('a v1 store spelling task reads as v3 tickets, with its backup', (t) => {
  const day = today(); // taken before the read, so a run across midnight does not flake
  const dir = tempDeck(t);
  const old = JSON.stringify({ ...v2(), version: 1 });
  fs.writeFileSync(storeFile(), old);
  const kinds = listItems().filter((item) => item.id !== 'itm_000000000009').map((item) => item.kind);
  assert.deepEqual(kinds, ['ticket', 'ticket', 'ticket']);
  assert.deepEqual(listing(listItems().filter((item) => item.kind === 'ticket')), [['itm_000000000003', 'yellow'], ['itm_000000000001', 'green'], ['itm_000000000002', 'red']], 'the v1 green/red swap is applied');
  assert.equal(JSON.parse(fs.readFileSync(storeFile(), 'utf8')).version, 3);
  assert.deepEqual(backups(dir), [`deck.v1-${day}.json`]);
  assert.equal(fs.readFileSync(path.join(dir, `deck.v1-${day}.json`), 'utf8'), old);
});

test('the migration is one-way', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify(v2()));
  assert.deepEqual(listing(listItems().filter((item) => item.kind === 'ticket')), [['itm_000000000003', 'yellow'], ['itm_000000000001', 'red'], ['itm_000000000002', 'green']]);
  const stored = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  assert.equal(stored.version, 3, 'the file on disk is v3 after one read');
  // The previous release (0.9.x before S5) reads version 1 or 2 only, so it refuses this file.
  assert.equal([1, 2].includes(stored.version), false);
});
