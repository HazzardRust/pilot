/**
 * landed-pr-closed S2 (spec 3; L3, L4, A3): the deck refuses to record a run as cut from anything but the pilot
 * branch (`<login>-pilot` or the legacy `pilot`) or a chained `feat/<slug>`, at the write only. A record already
 * stored with `base: "main"` is left as written and still reads back.
 *
 * Every test takes its own store; nothing here touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { tempDeck } from '../testUtils.mjs';
import { storeFile } from '../store-core.mjs';

const { recordFor, registerRun } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

const MINE = path.join('D:', 'work', 'pilot');

const status = (run, fields) => callTool('deck_status', { run: run.id, slug: 'run-base', slices: [{ slice: 'S1', state: 'building' }], ...fields });

test('a main base is refused at write, naming the allowed forms, and writes no record', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  for (const base of ['main', 'trunk', 'release/1.2']) {
    assert.throws(() => status(run, { base }), { name: 'DeckRefusal', message: /base must be your pilot branch, pilot or feat\/<slug>, not "/ }, base);
  }
  assert.equal(recordFor(MINE), null);
});

test('the pilot branch, the legacy pilot and feat/<slug> are written as sent', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  for (const base of ['hazzardrust-pilot', 'pilot', 'feat/x']) {
    status(run, { base });
    assert.equal(recordFor(MINE).base, base);
  }
});

test('a record already stored with base main reads back unchanged after a status write that sends no base', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  status(run, { base: 'pilot', next: 'first' });

  // Seeded by file, as a record written before the refusal holds it (L3): no write path can make it now.
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  deck.records.find((entry) => entry.record.slug === 'run-base').record.base = 'main';
  fs.writeFileSync(storeFile(), JSON.stringify(deck), 'utf8');

  status(run, { next: 'second' });
  assert.deepEqual({ base: recordFor(MINE).base, next: recordFor(MINE).next }, { base: 'main', next: 'second' });
});
