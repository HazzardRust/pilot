/**
 * archive-page S5: run records and friction rows are rows (spec 3, 6; A7).
 *
 * Every test takes its own store directory; records are written straight into `deck.json`, where `deck_status` keeps them.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { tempDeck } from '../testUtils.mjs';

const { storeFile } = await import('../store.mjs');
const { archiveRows } = await import('../archive.mjs');

const REPO = 'd:/work/alpha';
const labelled = (row, label) => row.fields.find((field) => field.label === label)?.value;
const rowsOfKind = (kind) => archiveRows().filter((row) => row.kind === kind);

function seed(records) {
  fs.writeFileSync(storeFile(), JSON.stringify({ version: 2, items: [], runs: [], seq: 0, records: records.map((record) => ({ repo: REPO, record })) }), 'utf8');
}

const record = (over = {}) => ({
  slug: 'archive-page',
  feature: 'Archive page',
  ticket: 'itm_abc123',
  branch: 'feat/archive-page',
  base: 'pilot',
  artefact: 'docs/design/archive-page/architecture.md',
  slices: [
    { slice: 'S1', state: 'merged' },
    { slice: 'S2', state: 'building' },
  ],
  next: 'itm_next01',
  finished: 'closing report posted',
  finishedAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T11:00:00.000Z',
  ...over,
});

test('a run record reads as its fields', (t) => {
  tempDeck(t);
  seed([record()]);

  const rows = rowsOfKind('run');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, `${REPO}:archive-page`);
  assert.equal(rows[0].at, '2026-11-20T11:00:00.000Z');
  assert.equal(labelled(rows[0], 'Feature'), 'Archive page');
  assert.equal(labelled(rows[0], 'Branch'), 'feat/archive-page');
  assert.equal(labelled(rows[0], 'Slices'), '2: S1 merged, S2 building');
  assert.match(labelled(rows[0], 'Finished'), /^2026-11-20 \d{2}:\d{2}$/);
  assert.ok(rows.every((row) => row.fields.every((field) => !field.value.includes('{"'))), 'no raw JSON in a field');
});

test('a record with no slices still reads', (t) => {
  tempDeck(t);
  seed([record({ slices: undefined, updatedAt: undefined })]);

  const rows = rowsOfKind('run');

  assert.equal(labelled(rows[0], 'Slices'), '0');
  assert.equal(rows[0].at, '2026-11-20T10:00:00.000Z', 'finishedAt stands in for a missing updatedAt');
});

test('friction rows are rows', (t) => {
  tempDeck(t);
  seed([record({ friction: [{ agent: 'implementer', what: 'slow gate', evidence: 'gate.mjs took 9 min', size: 4 }, { kind: 'drain', what: 'context re-read', size: 7 }] })]);

  const rows = rowsOfKind('friction');

  assert.deepEqual(rows.map((row) => row.id), [`${REPO}:archive-page:0`, `${REPO}:archive-page:1`]);
  assert.equal(labelled(rows[0], 'Agent'), 'implementer');
  assert.equal(labelled(rows[0], 'Evidence'), 'gate.mjs took 9 min');
  assert.equal(labelled(rows[0], 'Size'), '4');
  assert.equal(labelled(rows[1], 'Agent'), 'drain');
  assert.equal(labelled(rows[1], 'What'), 'context re-read');
  assert.equal(rows[0].at, '2026-11-20T11:00:00.000Z');
});

test('a record with no friction adds none', (t) => {
  tempDeck(t);
  seed([record()]);

  assert.equal(rowsOfKind('friction').length, 0);
  assert.equal(rowsOfKind('run').length, 1);
});
