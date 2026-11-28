/**
 * The month archive (store-durability S4, spec 6, 7; L4-L6, A1, A3, A8). Closed items older than
 * 30 days (A1) move out of the live store into `deck.archive-YYYY-MM.json`, one file per month of close,
 * and read back by id only. Three kinds stay however old: an open item, a closed one still showing a
 * notice, and a ticket an item that stays names by `ticket` or `mergedInto`. The archive is written before
 * the live store (L5), so a failure between leaves an item in both, never in neither, and the next pass
 * dedupes it by id. Only `items` changes: a live item keeps its id and order, and `seq`, `runs`, `records`
 * and every other top-level field stay live (L6). Called from `daemon.mjs` `main` only, never from
 * `writeDeck` (L4), so a test process and the CLI never archive.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { atomicWriteFileSync, privateDir } from '../hooks/lib/atomic-write.js';
import { hostPlatform } from '../hooks/lib/platform.js';
import { isOpen } from './items.mjs';
import { readDeck, writeDeck } from './store-core.mjs';
import { setAside } from './store-recovery.mjs';
import { emptyMachine } from './machine.mjs';
import { defaultRoots, fromStored, toStored } from './store-codec.mjs';
import { storeDir } from './store-dir.mjs';

// A month file holds closed items' paths only (S3): no machine file stands beside it, so none is read or written.
const monthFrom = (archive, roots) => fromStored(archive, emptyMachine(), roots);
const monthTo = (archive, roots) => toStored(archive, roots).stored;

/** How long a closed item stays live (A1). */
const ARCHIVE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_FILE = /^deck\.archive-(\d{4})-(\d{2})\.json$/;

const monthFile = (month) => path.join(storeDir(), `deck.archive-${month}.json`);

const roots = () => defaultRoots(os.homedir(), hostPlatform()); // derived each call, never stored (portable-store L3)

/** A month file as stored, parsed. A missing file is `null`; one that does not parse is refused, never overwritten. */
function parseMonth(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  let archive;
  try {
    archive = JSON.parse(raw);
  } catch (err) {
    throw new Error(`deck archive ${file} is not readable JSON (${err.message}); it has been left untouched`);
  }
  if (!Array.isArray(archive?.items)) throw new Error(`deck archive ${file} has no list of items; it has been left untouched`);
  return { archive };
}

/** A month file's items with absolute paths, as a version 3 or 4 file holds them; a missing file holds none. */
function readMonth(file) {
  const month = parseMonth(file);
  if (!month) return [];
  try {
    return monthFrom(month.archive, roots()).items;
  } catch (err) {
    throw new Error(`deck archive ${file} holds a path this deck cannot read (${err.message}); it has been left untouched`);
  }
}

/**
 * Rewrites a version 3 month file with its paths stored against `roots`, its bytes backed up first; false when
 * it holds nothing to rewrite. A file that cannot be read or backed up throws and stays as it was.
 */
export function migrateMonthFile(file, roots) {
  const month = parseMonth(file);
  if (!month) return false;
  try {
    monthFrom(month.archive, roots); // a file this machine cannot decode is left as it is
  } catch (err) {
    throw new Error(`deck archive ${file} holds a path this deck cannot read (${err.message}); it has been left untouched`);
  }
  const stored = monthTo(month.archive, roots);
  if (JSON.stringify(stored) === JSON.stringify(month.archive)) return false;
  try {
    setAside(file, 'v3'); // `<file>.v3-<date>[-n]`, never over another copy
  } catch (err) {
    throw new Error(`deck archive ${file} could not be backed up (${err.message}), so it was not rewritten`);
  }
  atomicWriteFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
  return true;
}

/** `migrateMonthFile` over every month file; one that cannot be migrated is named on stderr and passed over. */
function migrateMonths() {
  let names;
  try {
    names = fs.readdirSync(storeDir());
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const name of names.filter((n) => MONTH_FILE.test(n))) {
    try {
      migrateMonthFile(path.join(storeDir(), name), roots());
    } catch (err) {
      console.error(`[deck] ${err.message}; passed over in the migration`);
    }
  }
}

/**
 * The ids that stay: open items, notices, items closed within `ARCHIVE_DAYS` or with no readable close, and,
 * to a fixed point, every id an item that stays names by `ticket` or `mergedInto`.
 */
function keptIds(items, now) {
  const cutoff = now.getTime() - ARCHIVE_DAYS * DAY_MS;
  const kept = new Set();
  for (const item of items) {
    const closedAt = Date.parse(item?.resolvedAt);
    if (isOpen(item) || item?.notice === true || !(closedAt < cutoff)) kept.add(item?.id);
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of items) {
      if (!kept.has(item?.id)) continue;
      for (const named of [item.ticket, item.mergedInto]) {
        if (typeof named === 'string' && !kept.has(named)) {
          kept.add(named);
          grew = true;
        }
      }
    }
  }
  return kept;
}

/** Moves the old closed items to their month files, then writes the live store without them. */
export function archiveOld({ now = new Date(), writeLive = writeDeck } = {}) {
  migrateMonths();
  const deck = readDeck();
  const kept = keptIds(deck.items, now);
  // An item with no id could never be read back by one, so it stays.
  const stays = (item) => typeof item?.id !== 'string' || kept.has(item.id);
  const leaving = deck.items.filter((item) => !stays(item));
  if (leaving.length === 0) return { moved: [] };

  const byMonth = new Map();
  for (const item of leaving) {
    const month = new Date(item.resolvedAt).toISOString().slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
  }
  privateDir(storeDir());
  for (const [month, moving] of byMonth) {
    const file = monthFile(month);
    const ids = new Set(moving.map((item) => item.id));
    const items = [...readMonth(file).filter((item) => !ids.has(item?.id)), ...moving];
    atomicWriteFileSync(file, `${JSON.stringify(monthTo({ items }, roots()), null, 2)}\n`);
  }

  writeLive({ ...deck, items: deck.items.filter(stays) });
  return { moved: leaving.map((item) => item.id) };
}

/**
 * The archived item with this id, newest month file first; null when no month file holds it. A month file
 * that cannot be read is named on stderr and passed over, so one corrupt month fails no other read.
 */
export function archivedItem(id) {
  for (const items of monthsNewestFirst(storeDir(), `the read of ${id}`)) {
    const found = items.find((item) => item?.id === id);
    if (found) return found;
  }
  return null;
}

/**
 * Every archived item in `dir`'s month files, newest month first (archive-page L3): a pure read, with a month
 * file that cannot be read named on stderr and passed over, as `archivedItem` does.
 */
export function archivedItems(dir = storeDir()) {
  return [...monthsNewestFirst(dir, 'the archive listing')].flat();
}

/** Each month file's items in `dir`, newest first; `reading` names the read a corrupt month is passed over in. */
function* monthsNewestFirst(dir, reading) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const name of names.filter((each) => MONTH_FILE.test(each)).sort().reverse()) {
    try {
      yield readMonth(path.join(dir, name));
    } catch (err) {
      console.error(`[deck] ${err.message}; passed over in ${reading}`);
    }
  }
}
