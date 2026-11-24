/**
 * archive-page S15: upgrade backups and the defender marker as archive rows (spec 3, 6; L9). The backups are
 * written by the store's own upgrade, the marker by `markAdvised`, and both are read through `archiveRows`.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { markAdvised } from '../doctor.mjs';
import { listItems, storeFile } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

const { archiveRows } = await import('../archive.mjs');

const today = () => new Date().toLocaleDateString('sv-SE');
const REPO = 'd:\\work\\pilot';
const AT = '2026-10-01T00:00:00.000Z';

/** A version 2 store of four items, which the first read upgrades and backs up. */
const v2 = () => ({
  version: 2,
  seq: 4,
  deckSeq: 0,
  decks: {},
  runs: [],
  items: [1, 2, 3, 4].map((n) => ({ id: `itm_00000000000${n}`, kind: 'question', title: `Q${n}`, body: 'x', repo: REPO, author: 'architect', postedAt: AT })),
});

const field = (row, label) => row.fields.find((f) => f.label === label)?.value;
const backupRows = (dir) => archiveRows(dir).filter((row) => row.kind === 'backup');
/** The upgrade copies alone: the upgrade's write also leaves `deck.json.bak`, a row of its own. */
const upgradeRows = (dir) => backupRows(dir).filter((row) => row.id.startsWith('backup:deck.v'));

test('an upgrade backup reads as its fields', (t) => {
  const day = today();
  const dir = tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify(v2()));
  listItems();
  const rows = upgradeRows(dir);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, `backup:deck.v2-${day}.json`);
  assert.equal(field(rows[0], 'File'), `deck.v2-${day}.json`);
  assert.equal(field(rows[0], 'Version'), '2');
  assert.equal(field(rows[0], 'Day'), day);
  assert.equal(field(rows[0], 'Items'), '4');
});

test('a numbered backup is read too', (t) => {
  const day = today();
  const dir = tempDeck(t);
  fs.writeFileSync(path.join(dir, `deck.v2-${day}.json`), '{"version":2,"items":[');
  fs.writeFileSync(storeFile(), JSON.stringify(v2()));
  listItems();
  const rows = upgradeRows(dir);
  assert.deepEqual(rows.map((row) => row.id), [`backup:deck.v2-${day}-2.json`], 'the truncated copy is no row, the numbered one is');
  assert.equal(field(rows[0], 'Items'), '4');
});

test('a malformed backup is skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-backups-'));
  try {
    fs.writeFileSync(path.join(dir, 'deck.v1-2026-11-01.json'), 'not json');
    fs.writeFileSync(path.join(dir, 'deck.v2-2026-11-01.json'), '{"version":2}');
    fs.writeFileSync(path.join(dir, 'deck.v3-2026-11-01.json'), JSON.stringify({ version: 3, items: [{}, {}] }));
    assert.deepEqual(backupRows(dir).map((row) => field(row, 'Items')), ['2']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the write backup and the set-aside stores are rows too (F3, L9)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-backups-'));
  try {
    fs.writeFileSync(path.join(dir, 'deck.json.bak'), JSON.stringify({ version: 3, items: [{}, {}, {}] }));
    fs.writeFileSync(path.join(dir, 'deck.json.corrupt-2026-11-01'), 'truncated');
    fs.writeFileSync(path.join(dir, 'deck.json.replaced-2026-11-02-2'), JSON.stringify({ version: 3, items: [{}] }));
    const rows = backupRows(dir);
    assert.deepEqual(
      rows.map((row) => [row.id, field(row, 'Day'), field(row, 'Items')]),
      [
        ['backup:deck.json.bak', new Date(fs.statSync(path.join(dir, 'deck.json.bak')).mtimeMs).toLocaleDateString('sv-SE'), '3'],
        ['backup:deck.json.corrupt-2026-11-01', '2026-11-01', 'not a deck'],
        ['backup:deck.json.replaced-2026-11-02-2', '2026-11-02', '1'],
      ],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the defender marker is a switch row', (t) => {
  const dir = tempDeck(t);
  markAdvised({ where: 'install', storeDir: dir, now: new Date('2026-10-19T08:30:00Z') });
  const rows = archiveRows(dir).filter((row) => row.kind === 'switch' && row.id === 'defender-advised.json');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].fields.map((f) => f.label), ['Where', 'At']);
  assert.equal(field(rows[0], 'Where'), 'install');
  for (const { value } of rows[0].fields) assert.ok(!value.startsWith('{'), `a field shows raw JSON: ${value}`);
});
