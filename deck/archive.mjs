/**
 * The archive's one read-only seam (archive-page L3, L4, L5): every record kind's rows, read straight off the
 * store files. It never calls `readDeck`, `listItems` or a store writer, because `readDeck` upgrades the store
 * and recovers it from `.bak`, and both are writes. Credentials are withheld here, once, on every string of
 * every row; a kind naming a never-shown file is refused by name before anything is read.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findCredential } from './credential.mjs';
import { archivedItems } from './store-archive.mjs';
import { storeDir } from './store-dir.mjs';
import { readDeckFile } from './store-recovery.mjs';

/** The store files the archive never opens (spec 8, L9): they hold the secret or raw test output. */
export const NEVER_SHOWN = ['deck.secret', 'deck-open.html', 'logs/*.log'];

const WITHHELD = '<withheld: credential>';

const KINDS_DIR = fileURLToPath(new URL('./archive-kinds/', import.meta.url));

/**
 * Each kind module under `deck/archive-kinds/`, in file-name order (L4): a kind slice adds one file. A module whose
 * default export is no kind (a helper beside them) is not one.
 */
const KINDS = (
  await Promise.all(
    fs
      .readdirSync(KINDS_DIR)
      .filter((name) => name.endsWith('.mjs'))
      .sort()
      .map(async (name) => (await import(pathToFileURL(path.join(KINDS_DIR, name)).href)).default),
  )
).filter((kind) => typeof kind?.kind === 'string' && Array.isArray(kind.files) && typeof kind.rowsOf === 'function');

export function archiveKinds() {
  return KINDS;
}

const NEVER = NEVER_SHOWN.map((pattern) => new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '[^/]*')}$`, 'i'));

/**
 * Whether a store file name, relative to the store, is one the archive never opens; `./` and `..` are resolved
 * first. A kind module is repository code: its `files` are what review holds it to, and this refuses by name.
 */
const neverShown = (file) => NEVER.some((pattern) => pattern.test(path.posix.normalize(file.replaceAll('\\', '/'))));

const withheld = (value) => (typeof value === 'string' && findCredential(value) ? WITHHELD : value);

/** One row with every string through `findCredential` (L5). */
const shown = (row) => ({
  kind: withheld(row.kind),
  id: withheld(row.id),
  at: withheld(row.at ?? null),
  title: withheld(row.title),
  fields: (row.fields ?? []).map((field) => ({ ...field, label: withheld(field.label), value: withheld(field.value) })),
});

/** The live store as it stands on disk, or an empty one where it is missing or unreadable: never recovered here. */
function liveDeck(dir) {
  const raw = readDeckFile(path.join(dir, 'deck.json'));
  return raw === null ? { items: [] } : JSON.parse(raw);
}

/** Every kind's rows from `dir`, every string withheld where it holds a credential. */
export function archiveRows(dir = storeDir()) {
  const kinds = archiveKinds().filter((kind) => {
    const refused = kind.files.filter(neverShown);
    if (refused.length) console.error(`[deck] archive kind ${kind.kind} names never-shown ${refused.join(', ')}; refused`);
    return refused.length === 0;
  });
  const source = { dir, deck: liveDeck(dir), months: archivedItems(dir) };
  return kinds.flatMap((kind) => kind.rowsOf(source).map(shown));
}
