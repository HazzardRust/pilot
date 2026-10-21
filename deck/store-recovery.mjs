/**
 * The store's backup and its recovery (store-durability S1, spec 2, 3; L1-L3, A4, A7). Every store write
 * first keeps the store it replaces as `deck.json.bak`, and only one this process last parsed as a deck, so a
 * backup always parses. A read that finds deck.json corrupt sets it aside as `deck.json.corrupt-<date>[-n]`,
 * never overwriting one, and puts the backup's bytes in its place. A newer version is not corrupt and is never
 * recovered (L3): `readDeck` refuses it before it would call here. Imported by `store-core.mjs`, and by
 * `store-restore.mjs` for `pilot store restore` (S3, spec 4), which swaps deck.json and its backup by hand.
 */

import fs from 'node:fs';

import { atomicWriteFileSync } from '../hooks/lib/atomic-write.js';

/** What this process last parsed, per store file: the size, mtime and inode a backup must still match. */
const parsed = new Map();

/** Today as `YYYY-MM-DD`, the local date, as every dated sibling of the store is named. */
export function localDay(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

/** `readDeck` calls this with the stat of the bytes it has just parsed as a deck. */
export function noteParsed(file, stat) {
  parsed.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino });
}

/**
 * Links `file` onto `${file}.bak` before a write replaces it (L1), only when the file on disk is still the one
 * this process last parsed; a file changed behind the deck's back is not backed up. The link is made at a
 * temporary name and renamed into place, so `.bak` is always whole; a copy where linking fails.
 */
export function keepBackup(file) {
  const seen = parsed.get(file);
  if (!seen) return;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  if (stat.size !== seen.size || stat.mtimeMs !== seen.mtimeMs || stat.ino !== seen.ino) return;
  const tmp = `${file}.bak.${process.pid}.tmp`;
  try {
    fs.rmSync(tmp, { force: true });
    try {
      fs.linkSync(file, tmp);
    } catch {
      fs.copyFileSync(file, tmp);
    }
    fs.renameSync(tmp, `${file}.bak`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Recovers a corrupt store from its backup (A4): when `${file}.bak` reads and parses as a deck, `file` is set
 * aside by hard link (a copy where linking fails) at `${file}.corrupt-<YYYY-MM-DD>`, or `-2`, `-3` on a clash,
 * never overwriting one (L2);
 * the backup's bytes replace it; one line on stderr (deck.log, under the daemon) names both; and the restored
 * text is returned. A missing, unreadable or non-deck backup returns null, and the caller keeps its refusal.
 */
export function recoverStore(file, why) {
  const backup = `${file}.bak`;
  const raw = readDeckFile(backup);
  if (raw === null) return null;
  const aside = setAside(file, 'corrupt');
  atomicWriteFileSync(file, raw);
  console.error(`[deck] deck store ${file} ${why}: set aside as ${aside} and restored from ${backup}`);
  return raw;
}

/** Whether a parsed store is a deck: an object, not an array, with an items array. */
export function isDeck(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.items);
}

/** The text of `file` when it reads and parses as a deck, else null. */
export function readDeckFile(file) {
  let raw;
  let deck;
  try {
    raw = fs.readFileSync(file, 'utf8');
    deck = JSON.parse(raw);
  } catch {
    return null;
  }
  return isDeck(deck) ? raw : null;
}

/** Links (a copy where linking fails) `file` at `${file}.<why>-<YYYY-MM-DD>[-n]`, never overwriting one. */
export function setAside(file, why) {
  const day = localDay();
  for (let n = 1; ; n += 1) {
    const aside = `${file}.${why}-${day}${n === 1 ? '' : `-${n}`}`;
    try {
      try {
        fs.linkSync(file, aside);
      } catch (err) {
        if (err.code === 'EEXIST') throw err;
        fs.copyFileSync(file, aside, fs.constants.COPYFILE_EXCL);
      }
      return aside;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}
