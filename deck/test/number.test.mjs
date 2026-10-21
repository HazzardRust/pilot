/**
 * Slice S3 of deck-workspace: every deck has a number (spec 10, L2).
 *
 * A deck is one working directory's tab and everything under it, and until now
 * nothing in the deck said *which* one it was except a directory name. The
 * number is the name a human can say out loud — "S2 in D4" — so the only thing
 * that matters about it is that it does not move. That is what is tested here,
 * and it is tested against the store rather than a page, because the identity is
 * minted in the store and every later slice only draws what the store already
 * decided.
 *
 * The three ways a number could move are the three tests: the same directory
 * registering twice (a restarted session is a new pid, and a run row is a fresh
 * `run_<hex>` every time — which is exactly why the number is keyed on the path
 * instead, ADR 0023); a directory taken off the page by hand and put back; and a
 * second directory arriving. None of them may change a number, and none of them
 * may hand out one that has been used.
 *
 * The fourth is a store written before this slice, which has neither field. It
 * must read rather than be called unreadable — the deck has added a field to its
 * one JSON file twice before without a migration, and this is the third — and it
 * must start numbering from the next thing that happens on it.
 *
 * Every test takes its own store directory. Nothing here may touch the real
 * store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { tempDeck } from '../testUtils.mjs';

const { dismissRun, listDeckNumbers, registerRun, storeFile } = await import('../store.mjs');
const { repoKey } = await import('../runs.mjs');
const { callTool } = await import('../server.mjs');

/** Two directories, spelled the way the platform running the test spells them. */
const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');

/** A pid that has certainly exited: the child is gone before `spawnSync` returns. */
const exitedPid = () => spawnSync(process.execPath, ['-e', '0']).pid;

/** The number the deck holds for a directory, or `undefined` if it holds none. */
const numberOf = (repo) => listDeckNumbers()[repoKey(repo)];

/** What `deck_status` said, as the agent that called it reads it. */
const statusAnswer = (run) =>
  callTool('deck_status', { slug: 'a-run', run: run.id, slices: [{ slice: '3 deck number', state: 'doing' }] })
    .content[0].text;

test('a directory that has never registered takes the next number, and no two share one', (t) => {
  tempDeck(t);

  const mine = registerRun({ repo: MINE, pid: process.pid });
  const theirs = registerRun({ repo: THEIRS, pid: process.pid });

  assert.equal(numberOf(MINE), 1, 'the first directory the deck ever sees is D1');
  assert.equal(numberOf(THEIRS), 2, 'and the next one is D2, whatever its run row says');
  assert.notEqual(mine.id, theirs.id);
});

test('the same directory keeps its number across a restart, however the run row changes', (t) => {
  tempDeck(t);

  const first = registerRun({ repo: MINE, pid: exitedPid() });
  registerRun({ repo: THEIRS, pid: process.pid });
  // A session restarted in the same directory: a new process, and a run id the
  // deck mints fresh. Neither is what the number is keyed on.
  const second = registerRun({ repo: MINE, pid: process.pid });

  assert.notEqual(second.id, first.id, 'the run row really is a different row');
  assert.equal(numberOf(MINE), 1, 'and the directory is still D1');
  assert.equal(numberOf(THEIRS), 2, 'nothing else moved either');
});

test('a dismissed directory keeps its number, and no later deck is ever given it', (t) => {
  tempDeck(t);

  const mine = registerRun({ repo: MINE, pid: process.pid });
  dismissRun(mine.id);
  registerRun({ repo: MINE, pid: process.pid });

  assert.equal(numberOf(MINE), 1, 'taking a deck off the page does not take its number away');

  registerRun({ repo: THEIRS, pid: process.pid });

  assert.equal(numberOf(THEIRS), 2, 'and a dismissal frees nothing for the next directory');
});

test('a counter that has fallen behind the numbers already given out hands out neither again', (t) => {
  tempDeck(t);
  // The two fields can only come apart by hand, and by hand is exactly how they
  // will: the file is plain JSON a human is invited to move aside and look at. A
  // counter reset while the map it counts for survives is the one corruption that
  // could give one number to two directories, which is the single thing the whole
  // notation rests on — so the mint reads the floor off both rather than one.
  fs.writeFileSync(
    storeFile(),
    JSON.stringify({ version: 1, items: [], runs: [], seq: 0, decks: { [repoKey(MINE)]: 1, [repoKey(THEIRS)]: 2 } }),
    'utf8',
  );

  const third = path.join('D:', 'work', 'thermos');
  registerRun({ repo: third, pid: process.pid });

  assert.equal(numberOf(third), 3, 'the next number is past every number the map already holds');
  assert.equal(numberOf(MINE), 1, 'and the two that were already given out are untouched');
  assert.equal(numberOf(THEIRS), 2);

  // A null decks map, then a mix of a non-integer and a negative entry beside a valid one.
  fs.writeFileSync(
    storeFile(),
    JSON.stringify({ version: 1, items: [], runs: [], seq: 0, deckSeq: 3, decks: null }),
    'utf8',
  );
  const fourth = path.join('D:', 'work', 'kestrel');
  registerRun({ repo: fourth, pid: process.pid });
  assert.equal(numberOf(fourth), 4, 'a null decks map still mints past the counter, and nothing throws');

  fs.writeFileSync(
    storeFile(),
    JSON.stringify({ version: 1, items: [], runs: [], seq: 0, decks: { [repoKey(MINE)]: 3, [repoKey(THEIRS)]: 'x', [repoKey(third)]: -2 } }),
    'utf8',
  );
  const fifth = path.join('D:', 'work', 'osprey');
  registerRun({ repo: fifth, pid: process.pid });
  assert.equal(numberOf(fifth), 4, 'the non-integer and negative entries do not move the true highest');
  registerRun({ repo: third, pid: process.pid });
  assert.equal(numberOf(third), 5, 'a negative number on the map is minted past afresh, never handed back');
});

test('one directory spelled two ways is one deck with one number', (t) => {
  tempDeck(t);

  registerRun({ repo: MINE, pid: process.pid });
  registerRun({ repo: MINE + path.sep, pid: process.pid });

  assert.equal(numberOf(MINE), 1);
  assert.equal(
    Object.keys(listDeckNumbers()).length,
    1,
    'a trailing separator is the same directory, as it already is for a tab',
  );
  if (process.platform === 'win32') {
    registerRun({ repo: MINE.toUpperCase(), pid: process.pid });
    assert.deepEqual(Object.keys(listDeckNumbers()), [path.resolve(MINE).toLowerCase()], 'and folds to the lower-cased key');
  }
});

/**
 * A deck as it was written before this slice: neither field, and a run row a
 * session is still holding. `postedAt` and the stamps are recent enough that
 * nothing here ages out while the test runs.
 */
const aDeckWithoutNumbers = (at = new Date().toISOString()) => ({
  version: 1,
  items: [
    {
      id: 'itm_0123456789ab',
      kind: 'question',
      title: 'Which port?',
      body: '4321?',
      repo: MINE,
      postedAt: at,
      replies: [],
    },
  ],
  runs: [
    { id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: at, lastSeenAt: at },
  ],
  seq: 4,
});

test('a deck written before this slice reads, and numbers from the next registration', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify(aDeckWithoutNumbers()), 'utf8');

  assert.deepEqual(listDeckNumbers(), {}, 'a deck with no numbers on it is not unreadable');

  registerRun({ repo: MINE, pid: process.pid });

  assert.equal(numberOf(MINE), 1, 'and the first registration after this slice numbers it');
  assert.equal(
    JSON.parse(fs.readFileSync(storeFile(), 'utf8')).items.filter((item) => item.kind !== 'chat').length,
    1,
    'without dropping anything the old deck was holding (the registration adds its chat beside it)',
  );
});

test('a session that registered before this slice is told its number when it posts a table', (t) => {
  tempDeck(t);
  // The upgrade as it actually happens: the daemon is restarted with this slice in
  // it, and the session in that directory is not — it is holding a run id from a
  // registration that minted nothing, and the next thing it does is post a table.
  fs.writeFileSync(storeFile(), JSON.stringify(aDeckWithoutNumbers()), 'utf8');

  assert.match(
    statusAnswer({ id: 'run_000000000001' }),
    /^D1: /,
    'so a table is the first sight of that directory, and names it rather than nothing',
  );
  assert.equal(numberOf(MINE), 1, 'and the number it was told is the one the deck kept');
});

test('deck_status names the deck, and names the same one after a restart', (t) => {
  tempDeck(t);

  const theirs = registerRun({ repo: THEIRS, pid: process.pid });
  const mine = registerRun({ repo: MINE, pid: process.pid });

  assert.match(
    statusAnswer(theirs),
    /^D1: /,
    'the answer opens with the deck the table was posted to',
  );
  assert.match(statusAnswer(mine), /^D2: /);
  assert.match(
    statusAnswer(registerRun({ repo: THEIRS, pid: process.pid })),
    /^D1: /,
    'and a session restarted in that directory is told the same number',
  );
});
