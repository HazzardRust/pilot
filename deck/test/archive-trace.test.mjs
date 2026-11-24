/**
 * archive-page S11: hand-off trace lines as archive rows (spec 3, 6). Each test builds its own store directory and
 * reads it through `trace.rowsOf`, the kind's one seam.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { step } from '../../hooks/lib/wrapper-log.js';
import trace from '../archive-kinds/trace.mjs';

const line = (over) => JSON.stringify({ at: '2026-11-01T10:00:00.000Z', step: 'posted', kind: 'crew-handoff', item: 'itm_abc', ticket: 'archive-page', agent: 'co-pilot', ...over });

const made = [];
after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function dirWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-trace-'));
  made.push(dir);
  for (const [name, lines] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n');
  return dir;
}

/** Rows written by the real writer, `step()`, into a scratch deck directory. */
function writtenBy(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-trace-'));
  made.push(dir);
  const before = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = dir;
  try {
    rows.forEach(step);
  } finally {
    if (before === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = before;
  }
  return dir;
}

const rowsFrom = (dir) => trace.rowsOf({ dir, deck: { items: [] }, months: [] });
const field = (row, label) => row.fields.find((f) => f.label === label)?.value;

test('a trace line reads as its fields', () => {
  const rows = rowsFrom(writtenBy([{ step: 'posted', kind: 'crew-handoff', item: 'itm_abc', ticket: 'archive-page', agent: 'co-pilot' }]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'trace');
  assert.equal(rows[0].id, 'trace:handoff-trace.jsonl:1');
  assert.ok(!Number.isNaN(Date.parse(rows[0].at)));
  assert.equal(rows[0].title, 'crew posted: itm_abc');
  assert.equal(field(rows[0], 'Kind'), 'crew');
  assert.equal(field(rows[0], 'Step'), 'posted');
  assert.equal(field(rows[0], 'Item'), 'itm_abc');
  assert.equal(field(rows[0], 'Ticket'), 'archive-page');
  assert.equal(field(rows[0], 'Agent'), 'co-pilot');
});

test('a pilot hand-off reads as pilot', () => {
  const rows = rowsFrom(dirWith({ 'handoff-trace.jsonl': [line({ kind: 'handoff', step: 'handed' })] }));
  assert.equal(field(rows[0], 'Kind'), 'pilot');
});

test('the rotated file is read too', () => {
  const rows = rowsFrom(dirWith({ 'handoff-trace.jsonl': [line(), line({ step: 'resolved' })], 'handoff-trace.jsonl.old': [line({ step: 'spawned' })] }));
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((r) => r.id)).size, 3);
});

test('a torn line is skipped, not fatal', () => {
  const rows = rowsFrom(dirWith({ 'handoff-trace.jsonl': [line(), 'not json', line({ step: 'resolved' })] }));
  assert.equal(rows.length, 2);
});

test('a non-object line and a bad time are tolerated; a deck-start row has a clean title', () => {
  const dir = writtenBy([{ step: 'deck started', version: '1' }]);
  fs.appendFileSync(path.join(dir, 'handoff-trace.jsonl'), '[1]\n' + line({ at: 'nope' }) + '\n');
  const rows = rowsFrom(dir);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'deck started');
  assert.equal(rows[1].at, null);
  assert.equal(field(rows[1], 'Time'), '');
});

test('no file is no rows', () => {
  assert.deepEqual(rowsFrom(dirWith({})), []);
});
