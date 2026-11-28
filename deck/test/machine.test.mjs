/**
 * portable-store S2 (spec 2, 8; F4, L3, A4): the machine-bound state (runs' pid, session and lastSeenAt, co-pilot
 * leases, switches, live tickets, landing pids) lives in `machine.json` beside `deck.json`, which names none of it.
 * A lost machine file costs live sessions and nothing else; an unreadable one is set aside, never overwritten; the
 * machine file is written before `deck.json`, so a write that dies between them loses no live state.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isWindows, pathKey } from '../../hooks/lib/platform.js';
import { readMachine } from '../machine.mjs';
import { listItems, registerRun, storeFile } from '../store.mjs';
import { readDeck, writeDeck } from '../store-core.mjs';
import { storedDeck, tempDeck } from '../testUtils.mjs';

const AT = '2026-11-01T00:00:00.000Z';
const today = () => new Date().toLocaleDateString('sv-SE');
const MACHINE_KEYS = ['pid', 'session', 'lastSeenAt'];

/** Every key named `name` anywhere in `value`, counted. */
const keysNamed = (value, name) => {
  if (Array.isArray(value)) return value.reduce((n, entry) => n + keysNamed(entry, name), 0);
  if (value === null || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((n, [key, entry]) => n + (key === name ? 1 : 0) + keysNamed(entry, name), 0);
};

/** A v3 store holding every kind of machine state of F4 in `deck.json`, as stores before S2 did. */
function seed(t) {
  const dir = tempDeck(t);
  const repo = path.join(os.homedir(), 'Projects', 'machine');
  fs.mkdirSync(repo, { recursive: true });
  const key = pathKey(repo);
  const deck = {
    version: 3,
    seq: 1,
    deckSeq: 1,
    decks: { [key]: 1 },
    coPilots: { [key]: { ticket: 'itm_000000000001', live: true, at: AT } },
    switches: { [key]: { coPilot: { from: 'a', at: AT } } },
    runs: [{ id: 'run_1', repo, name: 'machine', pid: process.pid, session: 'sess-1', startedAt: AT, lastSeenAt: AT, slices: [] }],
    items: [
      { id: 'itm_000000000001', kind: 'ticket', title: 'T', body: 'T', repo, state: 'red', live: true, author: 'pilot', postedAt: AT },
      { id: 'itm_000000000002', kind: 'question', title: 'Q', body: 'Q', repo, author: 'pilot', postedAt: AT, landing: { pid: 4242, line: 'landing' } },
      { id: 'itm_000000000003', kind: 'chat', title: 'chat', body: '', repo, author: 'user', postedAt: AT },
    ],
    records: [{ repo: key, record: { slug: 'machine', branch: 'feat/machine' } }],
  };
  fs.writeFileSync(storeFile(), JSON.stringify(deck));
  return { dir, repo, key };
}

const onDisk = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));

test('deck.json names no machine state; machine.json holds each', (t) => {
  const { dir, key } = seed(t);

  writeDeck(readDeck());

  const stored = onDisk(dir, 'deck.json');
  assert.deepEqual(MACHINE_KEYS.map((name) => keysNamed(stored, name)), [0, 0, 0], 'no pid, session or lastSeenAt key');
  assert.equal(keysNamed(stored, 'live'), 0, 'no live ticket');
  assert.equal(Object.keys(stored.coPilots ?? {}).length, 0, 'no co-pilot lease');
  assert.equal(Object.keys(stored.switches ?? {}).length, 0, 'no switch');

  const machine = onDisk(dir, 'machine.json');
  assert.deepEqual(machine.sessions.run_1, { pid: process.pid, session: 'sess-1', lastSeenAt: AT });
  assert.equal(machine.coPilots[key].ticket, 'itm_000000000001');
  assert.deepEqual(Object.keys(machine.switches), [key]);
  assert.deepEqual(machine.live, ['itm_000000000001']);
  assert.deepEqual(machine.landingPids, { itm_000000000002: 4242 });

  const back = readDeck();
  assert.equal(back.runs[0].session, 'sess-1', 'the run reads its session back');
  assert.equal(back.items[0].live, true, 'the ticket reads live');
  assert.equal(back.items[1].landing.pid, 4242, 'the landing reads its pid');
  assert.equal(back.coPilots[key].ticket, 'itm_000000000001');
});

test('a lost machine file loses no thread, and the next write makes it again', (t) => {
  const { dir, repo } = seed(t);
  writeDeck(readDeck());
  fs.rmSync(path.join(dir, 'machine.json'));

  const deck = readDeck();
  assert.deepEqual(deck.items.map((item) => item.id), ['itm_000000000001', 'itm_000000000002', 'itm_000000000003'], 'every item, the chat among them');
  assert.ok(deck.items.every((item) => item.repo === repo), 'every repo decoded');
  assert.equal(deck.records.length, 1, 'the record');
  assert.equal(deck.runs.length, 1, 'the run');
  assert.deepEqual(MACHINE_KEYS.filter((name) => name in deck.runs[0]), [], 'the run has no session');
  assert.equal(deck.items[0].live, undefined, 'no ticket is live');

  writeDeck(deck);
  assert.ok(fs.existsSync(path.join(dir, 'machine.json')), 'the next write creates the file');
});

test('an unreadable machine file is set aside, never overwritten', (t) => {
  const { dir } = seed(t);
  const bad = '{ not json';
  fs.writeFileSync(path.join(dir, 'machine.json'), bad);

  assert.deepEqual(readMachine(dir).sessions, {}, 'it reads as an empty machine');
  listItems(); // the v3 read writes
  assert.equal(fs.readFileSync(path.join(dir, `machine.json.unreadable-${today()}`), 'utf8'), bad, 'its bytes survive the write');
  assert.equal(onDisk(dir, 'machine.json').sessions.run_1.session, 'sess-1', 'a fresh machine file');
});

test('a machine file that cannot be written leaves deck.json as it was', (t) => {
  const { dir } = seed(t);
  writeDeck(readDeck());
  const before = fs.readFileSync(storeFile(), 'utf8');
  fs.rmSync(path.join(dir, 'machine.json'));
  fs.mkdirSync(path.join(dir, 'machine.json')); // neither readable nor replaceable

  const deck = readDeck();
  deck.items = deck.items.slice(0, 1);
  assert.throws(() => writeDeck(deck));
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before, 'the machine file is written first');
});

test('machine.json wins over machine state an older deck.json still holds, entry by entry', (t) => {
  const { dir, key } = seed(t);
  const other = pathKey(path.join(os.homedir(), 'Projects', 'other'));
  fs.writeFileSync(path.join(dir, 'machine.json'), JSON.stringify({ sessions: { run_1: { pid: 7, session: 'sess-2' } }, coPilots: { [other]: { ticket: 'itm_000000000009' } }, later: { kept: true } }));

  const deck = readDeck();
  assert.equal(deck.runs[0].session, 'sess-2', "the machine file's session");
  assert.equal(deck.runs[0].lastSeenAt, AT, 'a field it lacks comes from deck.json');
  assert.deepEqual(Object.keys(deck.coPilots).sort(), [key, other].sort(), 'both leases');
  assert.equal(storedDeck().runs[0].session, 'sess-2', 'storedDeck reads through the machine file');
  writeDeck(deck);
  assert.deepEqual(onDisk(dir, 'machine.json').later, { kept: true }, 'a key this build does not know survives its write');
});

test('a run re-registers under another spelling as one run', (t) => {
  tempDeck(t);
  const repo = path.join(os.homedir(), 'Projects', 'pilot');
  fs.mkdirSync(repo, { recursive: true });
  const slashed = repo.split(path.sep).join('/');
  const respelt = isWindows() ? repo.replace(`${path.sep}Projects${path.sep}`, `${path.sep}projects${path.sep}`) : `${repo}${path.sep}`;

  registerRun({ repo: slashed, pid: process.pid });
  registerRun({ repo: respelt, pid: process.pid });

  assert.equal(storedDeck().runs.length, 1);
});
