/**
 * The bundle (portable-store L4, A5): one gzipped JSON document `{ manifest, entries }` holding the portable part of
 * a store directory. Entry names are held to an allowlist, never a denylist, so `machine.json`, `deck.secret`,
 * `deck.pid`, version backups, `deck-open.html` and anything added to the store dir later stay on this machine.
 * Pure over the files it reads; writes nothing.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { toStored } from './store-codec.mjs';

export const BUNDLE_FORMAT = 1;
export const BUNDLE_STORE_VERSION = 4;

/** The portable part (L4): every name a bundle may carry without `--logs`, with `/` separators. */
export const ENTRY_NAMES = Object.freeze([
  /^deck\.json$/,
  /^deck\.archive-\d{4}-\d{2}\.json$/,
  /^audits\/[A-Za-z0-9_-][A-Za-z0-9._-]*\/record\.json$/,
  /^rune-deck\.json$/,
]);

/** The log names `--logs` adds (L4). */
export const LOG_NAMES = Object.freeze([/^deck\.log$/, /^classifier\.log$/, /^usage\.jsonl$/, /^memory\.jsonl$/]);

const MONTH = ENTRY_NAMES[1];
const STORED_ROOT = /^@([^/\\]+)\//;

/** Whether `name` is one a bundle may carry (L4); `logs` admits the log names too. */
export const allowedEntry = (name, { logs = false } = {}) =>
  [...ENTRY_NAMES, ...(logs ? LOG_NAMES : [])].some((pattern) => pattern.test(name));

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** A regular file's text, or null for anything else (a link, a directory): a link could carry a file from outside. */
function fileText(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  return stat?.isFile() ? fs.readFileSync(file, 'utf8') : null;
}

/** Every candidate name in `dir`: its own files, and `audits/<name>/record.json` under each audit directory. */
function candidateNames(dir) {
  const own = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  const audits = path.join(dir, 'audits');
  const auditDirs = fs.lstatSync(audits, { throwIfNoEntry: false })?.isDirectory()
    ? fs.readdirSync(audits, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `audits/${entry.name}/record.json`)
    : [];
  return [...own, ...auditDirs];
}

/** The root names the stored paths of `value` use, keys and strings alike, so an import knows which it must map. */
function rootsIn(value, into) {
  if (typeof value === 'string') {
    const match = STORED_ROOT.exec(value);
    if (match) into.add(match[1]);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (!Array.isArray(value)) rootsIn(key, into);
      rootsIn(entry, into);
    }
  }
  return into;
}

/**
 * The bundle of the store in `dir` (spec 4, 12): `bytes`, the gzipped `{ manifest, entries }`, and its `manifest`.
 * `deck.json` must be a version 4 store, since only that holds stored paths; it travels with no machine state, even
 * one a hand put back from before the split (spec 2), through the codec's own split. Throws, writing nothing, on a
 * missing or older store.
 */
export function packBundle(dir, { logs = false, host = os.hostname(), now = new Date() } = {}) {
  const entries = {};
  for (const name of candidateNames(dir).sort()) {
    if (!allowedEntry(name, { logs })) continue;
    const text = fileText(path.join(dir, ...name.split('/')));
    if (text !== null) entries[name] = text;
  }
  if (entries['deck.json'] === undefined) throw new Error(`${path.join(dir, 'deck.json')} is missing; there is no store to export`);
  const deck = JSON.parse(entries['deck.json']);
  if (deck?.version !== BUNDLE_STORE_VERSION) {
    throw new Error(`${path.join(dir, 'deck.json')} is version ${deck?.version}; start the deck once to upgrade it to ${BUNDLE_STORE_VERSION}, then export`);
  }
  const { stored } = toStored(deck, {});
  entries['deck.json'] = `${JSON.stringify(stored, null, 2)}\n`;

  const months = Object.keys(entries).filter((name) => MONTH.test(name));
  const roots = rootsIn(stored, new Set());
  for (const name of months) rootsIn(JSON.parse(entries[name]), roots);
  const manifest = {
    format: BUNDLE_FORMAT,
    storeVersion: BUNDLE_STORE_VERSION,
    host,
    exportedAt: now.toISOString(),
    counts: { items: stored.items.length, records: Array.isArray(stored.records) ? stored.records.length : 0, archives: months.length },
    roots: [...roots].sort(),
    entries: Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, sha256(text)])),
  };
  return { bytes: zlib.gzipSync(JSON.stringify({ manifest, entries })), manifest };
}
