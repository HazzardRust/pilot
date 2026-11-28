// A month archive holds stored paths, never absolute ones (portable-store spec 1, 3; L1, L6): a version 3 month
// file is rewritten once with its backup first, and one that cannot be read or backed up is left as it is.

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hostPlatform } from '../../hooks/lib/platform.js';
import { archiveOld, archivedItem } from '../store.mjs';
import { migrateMonthFile } from '../store-archive.mjs';
import { defaultRoots } from '../store-codec.mjs';
import { storeDir } from '../store-dir.mjs';
import { storedDeck, tempDeck } from '../testUtils.mjs';

const roots = () => defaultRoots(os.homedir(), hostPlatform());
const REPO = () => path.join(os.homedir(), 'Projects', 'pilot');
const closed = (id, extra = {}) => ({ id, kind: 'chat', repo: REPO(), dir: path.join(REPO(), 'docs'), title: id, resolvedAt: '2026-08-15T00:00:00.000Z', ...extra });

/** A month file as a version 3 deck wrote it: absolute paths in its items. */
function seedMonth(name = 'deck.archive-2026-08.json', items = [closed('itm_a'), closed('itm_b', { dir: undefined })]) {
  fs.mkdirSync(storeDir(), { recursive: true });
  const file = path.join(storeDir(), name);
  fs.writeFileSync(file, `${JSON.stringify({ items }, null, 2)}\n`, 'utf8');
  return file;
}

const backupsOf = (file) => fs.readdirSync(path.dirname(file)).filter((name) => name.startsWith(`${path.basename(file)}.v3-`)).sort();

test('a month archive is rewritten once with its backup', (t) => {
  tempDeck(t);
  const file = seedMonth();
  const before = fs.readFileSync(file, 'utf8');

  assert.equal(migrateMonthFile(file, roots()), true);

  const [backup, ...rest] = backupsOf(file);
  assert.equal(rest.length, 0);
  assert.match(backup, /\.v3-\d{4}-\d{2}-\d{2}$/);
  assert.equal(fs.readFileSync(path.join(storeDir(), backup), 'utf8'), before, 'the backup is byte-equal to the v3 file');
  const { items } = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(items.length, 2);
  assert.equal(items[0].repo, '@home/Projects/pilot');
  assert.equal(items[0].dir, '@home/Projects/pilot/docs');
  const absolute = items.flatMap((item) => [item.repo, item.dir]).filter((p) => typeof p === 'string' && !p.startsWith('@'));
  assert.deepEqual(absolute, [], 'no structured path is absolute');

  const after = fs.readFileSync(file, 'utf8');
  assert.equal(migrateMonthFile(file, roots()), false, 'a second call has nothing to do');
  assert.equal(fs.readFileSync(file, 'utf8'), after);
  assert.equal(backupsOf(file).length, 1, 'and takes no second backup');
});

test('a migrated archive reads back with its absolute paths', (t) => {
  tempDeck(t);
  seedMonth();
  assert.equal(archivedItem('itm_a').repo, REPO(), 'a version 3 file reads as it did');
  migrateMonthFile(path.join(storeDir(), 'deck.archive-2026-08.json'), roots());
  assert.equal(archivedItem('itm_a').repo, REPO());
  assert.equal(archivedItem('itm_a').dir, path.join(REPO(), 'docs'));
});

test('a backup already there is never overwritten: the copy goes to -2', (t) => {
  tempDeck(t);
  const file = seedMonth();
  const day = new Date();
  const local = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const taken = `${file}.v3-${local}`;
  fs.writeFileSync(taken, 'someone else', 'utf8');
  const before = fs.readFileSync(file, 'utf8');

  assert.equal(migrateMonthFile(file, roots()), true);

  assert.equal(fs.readFileSync(taken, 'utf8'), 'someone else');
  assert.equal(fs.readFileSync(`${taken}-2`, 'utf8'), before);
});

test('a backup that cannot be written leaves the month file as it was', (t) => {
  tempDeck(t);
  const file = seedMonth();
  const before = fs.readFileSync(file, 'utf8');
  // A disk that takes neither a link nor a copy beside the file.
  const refuse = () => { throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); };
  t.mock.method(fs, 'linkSync', refuse);
  t.mock.method(fs, 'copyFileSync', refuse);

  assert.throws(() => migrateMonthFile(file, roots()), /backed up/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('a month file that is not JSON is left untouched and the archive pass carries on', (t) => {
  tempDeck(t);
  const junk = seedMonth('deck.archive-2026-07.json', []);
  fs.writeFileSync(junk, '{ not json', 'utf8');
  assert.throws(() => migrateMonthFile(junk, roots()), /not readable JSON/);
  const v3 = seedMonth();
  const live = { version: 4, seq: 1, runs: [], items: [closed('itm_old', { resolvedAt: '2026-09-01T10:00:00.000Z' })] };
  fs.writeFileSync(path.join(storeDir(), 'deck.json'), `${JSON.stringify(live, null, 2)}\n`, 'utf8');
  const errors = [];
  t.mock.method(console, 'error', (line) => errors.push(String(line)));

  const { moved } = archiveOld({ now: new Date('2026-10-17T12:00:00.000Z') });

  assert.deepEqual(moved, ['itm_old']);
  assert.equal(fs.readFileSync(junk, 'utf8'), '{ not json');
  assert.equal(backupsOf(junk).length, 0);
  assert.ok(errors.some((line) => line.includes('deck.archive-2026-07.json')), 'the skipped file is named');
  assert.equal(backupsOf(v3).length, 1, 'the readable v3 month file migrated beside it');
});

test('a month file with a path this machine cannot decode is never overwritten, and its item stays live', (t) => {
  tempDeck(t);
  const file = seedMonth('deck.archive-2026-09.json', [closed('itm_x', { repo: '@nowhere/x' })]);
  const before = fs.readFileSync(file, 'utf8');
  const live = { version: 4, seq: 1, runs: [], items: [closed('itm_old', { resolvedAt: '2026-09-01T10:00:00.000Z' })] };
  fs.writeFileSync(path.join(storeDir(), 'deck.json'), `${JSON.stringify(live, null, 2)}\n`, 'utf8');
  t.mock.method(console, 'error', () => {});

  assert.throws(() => archiveOld({ now: new Date('2026-10-17T12:00:00.000Z') }), /cannot read/);

  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(storedDeck().items.map((item) => item.id), ['itm_old'], 'the item that was to move is still live');
});

test('the archive pass writes a month file with stored paths', (t) => {
  tempDeck(t);
  const live = { version: 4, seq: 1, runs: [], items: [closed('itm_old', { resolvedAt: '2026-09-01T10:00:00.000Z' })] };
  fs.mkdirSync(storeDir(), { recursive: true });
  fs.writeFileSync(path.join(storeDir(), 'deck.json'), `${JSON.stringify(live, null, 2)}\n`, 'utf8');

  archiveOld({ now: new Date('2026-10-17T12:00:00.000Z') });

  const month = JSON.parse(fs.readFileSync(path.join(storeDir(), 'deck.archive-2026-09.json'), 'utf8'));
  assert.equal(month.items[0].repo, '@home/Projects/pilot');
  assert.equal(archivedItem('itm_old').repo, REPO());
});
