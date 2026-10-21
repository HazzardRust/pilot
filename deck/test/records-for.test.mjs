/**
 * S7 of usage-telemetry: `recordsFor(repo)`, the store's one read-only export for a
 * reader outside the daemon (ADR 0044). The store is written by hand in a temp
 * `PILOT_DECK_DIR`; nothing here touches 4321 or `~/.claude/pilot/`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from '../items.mjs';
import { tempDeck } from '../testUtils.mjs';

const { recordsFor, storeFile } = await import('../store.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'other');

test('recordsFor returns every slug of one repository and none of another', (t) => {
  tempDeck(t);
  const entry = (repo, slug) => ({ repo: repoKey(repo), record: { slug, updatedAt: '2026-09-28T10:00:00.000Z' } });
  const deck = {
    version: 3, items: [], runs: [], seq: 0, deckSeq: 0, decks: {},
    records: [entry(MINE, 'first'), entry(THEIRS, 'elsewhere'), entry(MINE, 'second')],
  };
  fs.writeFileSync(storeFile(), `${JSON.stringify(deck)}\n`);
  const before = fs.readFileSync(storeFile(), 'utf8');

  assert.deepEqual(recordsFor(MINE).map((record) => record.slug), ['first', 'second'], 'oldest first');
  assert.deepEqual(recordsFor(THEIRS).map((record) => record.slug), ['elsewhere']);
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before, 'reading writes nothing');
});

test('recordsFor with no store file is [] and creates none', (t) => {
  const dir = tempDeck(t);
  assert.deepEqual(recordsFor(MINE), []);
  assert.deepEqual(fs.readdirSync(dir), ['deck.secret'], 'nothing beside the secret tempDeck made');
});
