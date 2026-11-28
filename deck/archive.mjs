/**
 * The archive's one read-only seam (archive-page L3, L4, L5): every record kind's rows, read straight off the
 * store files. It never calls `readDeck`, `listItems` or a store writer, because `readDeck` upgrades the store
 * and recovers it from `.bak`, and both are writes. Credentials are withheld here, once, on every string of
 * every row; a kind naming a never-shown file is refused by name before anything is read.
 */

import path from 'node:path';

import audits from './archive-kinds/audits.mjs';
import backups from './archive-kinds/backups.mjs';
import classifier from './archive-kinds/classifier.mjs';
import friction from './archive-kinds/friction.mjs';
import handoffs from './archive-kinds/handoffs.mjs';
import memory from './archive-kinds/memory.mjs';
import reports from './archive-kinds/reports.mjs';
import runs from './archive-kinds/runs.mjs';
import switches from './archive-kinds/switches.mjs';
import textlogs from './archive-kinds/textlogs.mjs';
import threads from './archive-kinds/threads.mjs';
import tickets from './archive-kinds/tickets.mjs';
import trace from './archive-kinds/trace.mjs';
import usage from './archive-kinds/usage.mjs';
import { WITHHELD } from './classifier-log.mjs';
import { findCredential } from './credential.mjs';
import { isOpen } from './items.mjs';
import { archivedItems } from './store-archive.mjs';
import { storeDir } from './store-dir.mjs';
import { readDeckFile } from './store-recovery.mjs';

/**
 * The store files the archive never opens (spec 8, L9): they hold the secret or raw test output, this machine's
 * process state (F4), or a deck file set aside unread.
 */
export const NEVER_SHOWN = ['deck.secret', 'deck-open.html', 'logs/*.log', 'machine.json', 'deck.json.unreadable-*'];

/**
 * Every record kind, a fixed list in file-name order (L4, moved by the user on itm_96d80caf8aee): a new kind adds
 * its import here, and a kind module that fails to load fails the deck's start instead of vanishing from the page.
 */
const KINDS = [audits, backups, classifier, friction, handoffs, memory, reports, runs, switches, textlogs, threads, tickets, trace, usage];

export function archiveKinds() {
  return KINDS;
}

const NEVER = NEVER_SHOWN.map((pattern) => new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '[^/]*')}$`, 'i'));

/**
 * Whether a store file name, relative to the store, is one the archive never opens; `./` and `..` are resolved
 * first. A kind module is repository code: its `files` are what review holds it to, and this refuses by name.
 */
const neverShown = (file) => NEVER.some((pattern) => pattern.test(path.posix.normalize(file.replaceAll('\\', '/'))));

export const withheld = (value) => (typeof value === 'string' && findCredential(value) ? WITHHELD : value);

/** One row as text (null as ''), every string through `findCredential` (L5); a field's `markdown` flag (spec 6) is kept. */
const shown = (row) => ({
  kind: withheld(row.kind),
  id: withheld(row.id),
  at: withheld(row.at ?? null),
  title: withheld(String(row.title ?? '')),
  fields: (row.fields ?? []).map((field) => ({
    label: withheld(String(field.label ?? '')),
    value: withheld(String(field.value ?? '')),
    ...(field.markdown === true && { markdown: true }),
  })),
});

/** The live store as it stands on disk, or an empty one where it is missing or unreadable: never recovered here. */
export function liveDeck(dir) {
  const raw = readDeckFile(path.join(dir, 'deck.json'));
  return raw === null ? { items: [] } : JSON.parse(raw);
}

/** The settled items with an id, one per id, the live copy first where a failed archive pass left one in both. */
function settledOnce(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (isOpen(item) || typeof item?.id !== 'string' || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Every kind's rows from `dir`, every string withheld where it holds a credential. */
export function archiveRows(dir = storeDir()) {
  const kinds = archiveKinds().filter((kind) => {
    const refused = kind.files.filter(neverShown);
    if (refused.length) console.error(`[deck] archive kind ${kind.kind} names never-shown ${refused.join(', ')}; refused`);
    return refused.length === 0;
  });
  const deck = liveDeck(dir);
  const months = archivedItems(dir);
  const source = { dir, deck, months, settled: settledOnce([...(deck.items ?? []), ...months]) };
  return kinds.flatMap((kind) => kind.rowsOf(source).map(shown));
}
