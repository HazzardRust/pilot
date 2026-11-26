/** archive-page S7: usage windows and memory samples are rows (spec 3, 6; A2). */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { tempDeck } from '../testUtils.mjs';

const { archiveRows } = await import('../archive.mjs');
const { readingOf } = await import('../memory.mjs');

const MIB = 2 ** 20;
const counts = (n) => ({ input: n, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 });
const WINDOW = { from: '2026-10-04T10:00:00.000Z', to: '2026-10-04T10:30:00.000Z' };
const windowLine = (over = {}) => ({
  at: '2026-10-04T10:30:01.000Z',
  window: WINDOW,
  snapshot: { at: '2026-10-04T10:29:00.000Z', session: { pct: 42, resetsAt: null }, weekly: { pct: 7, resetsAt: null }, decks: {} },
  tokens: { total: counts(350), byModel: { 'claude-opus': counts(300), 'claude-haiku': counts(50) }, byRepo: { 'd:/work/alpha': { 'claude-opus': counts(350) } } },
  skippedLines: 0,
  ...over,
});

const seed = (name, lines) => {
  const file = path.join(process.env.PILOT_DECK_DIR, name);
  fs.writeFileSync(file, lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n') + '\n');
};
const rowsOfKind = (kind) => archiveRows().filter((row) => row.kind === kind);
const labelled = (row, label) => row.fields.find((field) => field.label === label)?.value;

test('a usage window reads as numbers with labels', (t) => {
  tempDeck(t);
  seed('usage.jsonl', [windowLine()]);

  const rows = rowsOfKind('usage');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].at, WINDOW.to);
  assert.equal(labelled(rows[0], 'Session %'), '42');
  assert.equal(labelled(rows[0], 'Weekly %'), '7');
  assert.equal(labelled(rows[0], 'Tokens'), '350');
  assert.equal(labelled(rows[0], 'By model'), 'claude-opus: 300, claude-haiku: 50');
  assert.equal(labelled(rows[0], 'By repo'), 'd:/work/alpha: 350');
  assert.ok(rows[0].fields.every((field) => !field.value.includes('{"')), 'no raw JSON in a field');
});

test('a window without a snapshot says why', (t) => {
  tempDeck(t);
  seed('usage.jsonl', [windowLine({ snapshot: null, snapshotError: 'absent' })]);

  const [row] = rowsOfKind('usage');

  assert.equal(labelled(row, 'Error'), 'absent');
  assert.equal(labelled(row, 'Session %'), '');
});

test('memory samples are rows in MB', (t) => {
  tempDeck(t);
  const stubs = { now: () => Date.parse('2026-10-04T12:00:00.000Z'), memoryUsage: () => ({ rss: 100 * MIB }), freemem: () => 4096 * MIB };
  seed('memory.jsonl', [readingOf('daemon', 'tick', stubs)]);

  const [row] = rowsOfKind('memory');

  assert.equal(labelled(row, 'RSS (MB)'), '100');
  assert.equal(labelled(row, 'Free (MB)'), '4096');
  assert.equal(labelled(row, 'Process'), 'daemon');
  assert.equal(labelled(row, 'Event'), 'tick');
  assert.equal(row.at, '2026-10-04T12:00:00.000Z');
});

test('torn lines are skipped', (t) => {
  tempDeck(t);
  const good = (event) => ({ at: '2026-10-04T12:00:00.000Z', process: 'wait', pid: 7, event, rss: 104857600, free: 1048576 });
  seed('memory.jsonl', [good('start'), '{"at":"2026-10-04T12:10:00.000Z","proc', good('exit')]);
  seed('usage.jsonl', ['{"at":"2026-10-04T10:3', windowLine()]);

  assert.equal(rowsOfKind('memory').length, 2);
  assert.equal(rowsOfKind('usage').length, 1);
});
