/**
 * Store backups as archive rows (archive-page spec 3, 6; L9): one row per upgrade copy `deck.v<version>-<day>.json`
 * or `deck.v<version>-<day>-<n>.json` (`backUp` in `store-core.mjs`), per write backup `deck.json.bak`, and per store
 * set aside as `deck.json.corrupt-<day>[-n]` or `deck.json.replaced-<day>[-n]` (`setAside` in `store-recovery.mjs`).
 * The item count is read as the month-file kind reads it, from the file's `items` list. An upgrade copy that is not
 * a store copy (a truncated one, a foreign one) is no row; a set-aside store is kept because it may not parse, so it
 * is a row whose count reads `not a deck`.
 */

import fs from 'node:fs';
import path from 'node:path';

const UPGRADE = /^deck\.v(\d+)-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.json$/;
const SET_ASIDE = /^deck\.json\.(?:corrupt|replaced)-(\d{4}-\d{2}-\d{2})(?:-\d+)?$/;
const WRITE_BACKUP = 'deck.json.bak';

/** The name's version and day, or null for no backup's name; the write backup's day is its last write. */
function named(dir, name) {
  const upgrade = UPGRADE.exec(name);
  if (upgrade) return { version: upgrade[1], day: upgrade[2] };
  const aside = SET_ASIDE.exec(name);
  if (aside) return { day: aside[1] };
  if (name !== WRITE_BACKUP) return null;
  try {
    return { day: new Date(fs.statSync(path.join(dir, name)).mtimeMs).toLocaleDateString('sv-SE') };
  } catch {
    return null;
  }
}

function rowOf(dir, name) {
  const match = named(dir, name);
  if (match === null) return null;
  let items;
  try {
    items = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))?.items;
  } catch {
    items = undefined;
  }
  if (!Array.isArray(items) && match.version !== undefined) return null;
  const { version, day } = match;
  const at = new Date(`${day}T00:00:00`);
  return {
    kind: 'backup',
    id: `backup:${name}`,
    at: Number.isNaN(at.getTime()) ? null : at.toISOString(),
    title: name,
    fields: [
      { label: 'File', value: name },
      ...(version === undefined ? [] : [{ label: 'Version', value: version }]),
      { label: 'Day', value: day },
      { label: 'Items', value: Array.isArray(items) ? String(items.length) : 'not a deck' },
    ],
  };
}

function rowsOf({ dir }) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .sort()
    .map((name) => rowOf(dir, name))
    .filter((row) => row !== null);
}

export default {
  kind: 'backup',
  label: 'Store backups',
  files: ['deck.v*-*.json', WRITE_BACKUP, 'deck.json.corrupt-*', 'deck.json.replaced-*'],
  rowsOf,
};
