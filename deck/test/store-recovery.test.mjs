/**
 * store-durability S1 (spec 2, 3; L1-L3, A4, A7): every store write first keeps the store it replaces as
 * `deck.json.bak`, and only one this process parsed; a read that finds deck.json corrupt sets it aside as
 * `deck.json.corrupt-<date>[-n]`, never overwriting one, serves the backup and says so on stderr. A newer
 * version, or no readable backup, keeps today's refusal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { keepBackup, recoverStore } from '../store-recovery.mjs';
import { listItems, postItem, storeFile } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/pilot';
const post = (title) => postItem({ kind: 'question', title, body: 'A or B', repo: REPO, author: '' });
const read = (file) => fs.readFileSync(file);
const titles = () => listItems().map((item) => item.title);

function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

/** Two posts, so `.bak` holds the store as it stood after the first; returns those bytes. */
function twoPosts() {
  post('First');
  const afterFirst = read(storeFile());
  post('Second');
  return afterFirst;
}

const quiet = (t) => t.mock.method(console, 'error', () => {});
const lines = (mocked) => mocked.mock.calls.map((call) => call.arguments.join(' '));

test('the backup is the store a write replaced', (t) => {
  tempDeck(t);
  const afterFirst = twoPosts();
  assert.deepEqual(read(`${storeFile()}.bak`), afterFirst, '.bak holds the store as it stood after the first post');
  assert.deepEqual(JSON.parse(read(`${storeFile()}.bak`)).items.map((item) => item.title), ['First']);
});

test('a store changed behind the deck\'s back is not backed up', (t) => {
  tempDeck(t);
  const afterFirst = twoPosts();
  listItems();
  const external = { version: 3, items: [], runs: [], seq: 0, deckSeq: 0, decks: {}, note: 'written by another program' };
  fs.writeFileSync(storeFile(), JSON.stringify(external));
  keepBackup(storeFile());
  assert.deepEqual(read(`${storeFile()}.bak`), afterFirst, 'a file this process did not parse never becomes the backup');
});

test('a corrupt store is set aside and the backup served', (t) => {
  tempDeck(t);
  const errors = quiet(t);
  twoPosts();
  const bad = Buffer.from('{"version":');
  fs.writeFileSync(storeFile(), bad);
  assert.deepEqual(titles(), ['First'], 'the next read serves the backup\'s items');
  const aside = `${storeFile()}.corrupt-${today()}`;
  assert.deepEqual(read(aside), bad, 'the corrupt bytes are kept byte-identical');
  const said = lines(errors).filter((line) => line.includes(aside) && line.includes(`${storeFile()}.bak`));
  assert.equal(said.length, 1, `one line names the set-aside file and the backup: ${lines(errors).join(' | ')}`);
  assert.deepEqual(titles(), ['First'], 'a second read serves the restored store without recovering again');
  assert.equal(lines(errors).length, 1);
});

test('a second corruption the same day does not overwrite the first', (t) => {
  tempDeck(t);
  quiet(t);
  twoPosts();
  const first = Buffer.from('truncated');
  const second = Buffer.from('[1, 2, 3]');
  fs.writeFileSync(storeFile(), first);
  listItems();
  fs.writeFileSync(storeFile(), second);
  assert.deepEqual(titles(), ['First']);
  assert.deepEqual(read(`${storeFile()}.corrupt-${today()}`), first, 'the first set-aside file is kept');
  assert.deepEqual(read(`${storeFile()}.corrupt-${today()}-2`), second, 'the second goes to -2');
});

test('a store on a filesystem without hard links is still set aside by copy', (t) => {
  tempDeck(t);
  quiet(t);
  twoPosts();
  t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error('links not supported'), { code: 'EPERM' });
  });
  fs.writeFileSync(storeFile(), 'truncated');
  assert.deepEqual(titles(), ['First']);
  assert.equal(read(`${storeFile()}.corrupt-${today()}`).toString(), 'truncated');
  fs.writeFileSync(storeFile(), 'truncated again');
  assert.deepEqual(titles(), ['First']);
  assert.equal(read(`${storeFile()}.corrupt-${today()}`).toString(), 'truncated', 'the copy never overwrites one');
  assert.equal(read(`${storeFile()}.corrupt-${today()}-2`).toString(), 'truncated again');
});

test('no readable backup keeps today\'s refusal', (t) => {
  tempDeck(t);
  const errors = quiet(t);
  post('Only');
  fs.writeFileSync(storeFile(), 'truncated');
  assert.equal(recoverStore(storeFile(), 'is not readable JSON'), null, 'no .bak: nothing to recover from');
  assert.throws(() => listItems(), /is not readable JSON.*It has been left untouched; move it aside to start a fresh deck\./s);
  fs.writeFileSync(`${storeFile()}.bak`, '{"items": ');
  assert.throws(() => listItems(), /is not readable JSON/, 'a .bak that does not parse is no backup either');
  fs.writeFileSync(`${storeFile()}.bak`, '{"version": 3}');
  assert.throws(() => listItems(), /is not readable JSON/, 'nor is one that parses but is not a deck');
  assert.equal(read(storeFile()).toString(), 'truncated', 'the corrupt store is left untouched');
  assert.deepEqual(fs.readdirSync(storeFile().replace(/deck\.json$/, '')).filter((name) => name.includes('corrupt')), []);
  assert.equal(lines(errors).length, 0, 'nothing claims a recovery');
});

test('a store that is not a deck, versioned or not, is set aside and the backup served', (t) => {
  tempDeck(t);
  quiet(t);
  twoPosts();
  for (const [n, bad] of ['{"not":"a deck"}', '{"version":"3","items":[]}'].entries()) {
    fs.writeFileSync(storeFile(), bad);
    assert.deepEqual(titles(), ['First'], `${bad} recovers from .bak`);
    assert.equal(read(`${storeFile()}.corrupt-${today()}${n ? `-${n + 1}` : ''}`).toString(), bad, `${bad} is set aside as corrupt`);
  }
});

test('a newer version is not recovered', (t) => {
  tempDeck(t);
  quiet(t);
  twoPosts();
  const bak = read(`${storeFile()}.bak`);
  const newer = JSON.stringify({ version: 4, items: [] });
  fs.writeFileSync(storeFile(), newer);
  assert.throws(() => listItems(), /is version 4, and this deck reads version 3/);
  assert.equal(read(storeFile()).toString(), newer, 'the newer store stays where it is');
  assert.deepEqual(read(`${storeFile()}.bak`), bak, '.bak is untouched');
  assert.deepEqual(fs.readdirSync(storeFile().replace(/deck\.json$/, '')).filter((name) => name.includes('corrupt')), []);
});
