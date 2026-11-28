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

import { eachStructuredPath, toStored } from './store-codec.mjs';
import { isDeck } from './store-recovery.mjs';

const BUNDLE_FORMAT = 1;
const BUNDLE_STORE_VERSION = 4;

/** The portable part (L4): every name a bundle may carry without `--logs`, with `/` separators. */
const ENTRY_NAMES = Object.freeze([
  /^deck\.json$/,
  /^deck\.archive-\d{4}-\d{2}\.json$/,
  /^audits\/[A-Za-z0-9_-][A-Za-z0-9._-]*\/record\.json$/,
  /^rune-deck\.json$/,
]);

/** The log names `--logs` adds (L4). */
const LOG_NAMES = Object.freeze([/^deck\.log$/, /^classifier\.log$/, /^usage\.jsonl$/, /^memory\.jsonl$/]);

const MONTH = ENTRY_NAMES[1];

/** Whether `name` is one a bundle may carry (L4); `logs` admits the log names too. */
const allowedEntry = (name, { logs = false } = {}) =>
  [...ENTRY_NAMES, ...(logs ? LOG_NAMES : [])].some((pattern) => pattern.test(name));

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** A regular file's text, or null for anything else (a link, a directory): a link could carry a file from outside. */
function fileText(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  return stat?.isFile() ? fs.readFileSync(file, 'utf8') : null;
}

/** The portable files `dir` holds, logs included: what an import would set aside (L5). */
export const storeEntries = (dir) =>
  candidateNames(dir).filter((name) => allowedEntry(name, { logs: true }) && fs.lstatSync(path.join(dir, ...name.split('/')), { throwIfNoEntry: false })?.isFile());

/** Every candidate name in `dir`: its own files, and `audits/<name>/record.json` under each audit directory. */
function candidateNames(dir) {
  const own = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  const audits = path.join(dir, 'audits');
  const auditDirs = fs.lstatSync(audits, { throwIfNoEntry: false })?.isDirectory()
    ? fs.readdirSync(audits, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `audits/${entry.name}/record.json`)
    : [];
  return [...own, ...auditDirs];
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
  const manifest = {
    format: BUNDLE_FORMAT,
    storeVersion: BUNDLE_STORE_VERSION,
    host,
    exportedAt: now.toISOString(),
    counts: { items: stored.items.length, records: Array.isArray(stored.records) ? stored.records.length : 0, archives: months.length },
    entries: Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, sha256(text)])),
  };
  return { bytes: zlib.gzipSync(JSON.stringify({ manifest, entries })), manifest };
}

/** A root's name as the deck writes one and `--root` takes one. */
export const ROOT_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const STORED_PATH = /^@([^/\\]*)\/(.*)$/s;
/** A folder name Windows reads as a device or trims, so two entries could meet in one file there. */
const UNSAFE_DIR = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)|\.$/i;

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const climbs = (rel) => rel.split(/[\\/]/).includes('..');

/** `text` parsed as JSON, or a throw naming the entry. */
function parsedEntry(name, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`entry ${name} is not JSON (${error.message})`);
  }
}

/**
 * The root names `doc`'s structured paths use, each path checked first (L5): a stored path names a root and never
 * climbs with `..`; anything else is neither absolute in either flavour (a drive, a UNC share, `/`) nor climbs, so
 * it reads back as the relative text the source held (A8). Throws naming the field and the value.
 */
function checkedRoots(name, doc, roots) {
  eachStructuredPath(doc, (value, field) => {
    const where = `${name} ${field} ${JSON.stringify(value)}`;
    // As a map key the codec assigns it, which would set the decoded map's prototype rather than add an entry.
    if (value === '__proto__') throw new Error(`stored path: ${where} is not a path`);
    const stored = STORED_PATH.exec(value);
    if (stored) {
      if (!ROOT_NAME.test(stored[1])) throw new Error(`stored path: ${where} names no root a deck writes`);
      if (climbs(stored[2])) throw new Error(`stored path: ${where} climbs out of its root`);
      roots.add(stored[1]);
    } else if (value.startsWith('@')) {
      throw new Error(`stored path: ${where} names no root a deck writes`);
    } else if (path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
      throw new Error(`absolute path: ${where} is not a stored path`);
    } else if (climbs(value)) {
      throw new Error(`stored path: ${where} climbs out of its root`);
    }
  });
  return roots;
}

/**
 * The bundle in `bytes` opened and checked, writing nothing (spec 5; L4, L5): the gunzipped size within `maxBytes`, the
 * format, store version 4, every entry name on the allowlist (logs included), every sha256 matching, `deck.json` a deck,
 * and every structured path of `deck.json` and each month archive stored under a root with no `..` and none absolute.
 * Returns the `manifest` as written, the `entries` as bytes, and the `roots` the structured paths use, which an import
 * must map. Throws naming the check that failed.
 */
export function unpackBundle(bytes, { maxBytes }) {
  if (bytes.length > maxBytes) throw new Error(`size: the bundle is ${bytes.length} bytes, over the bound of ${maxBytes}`);
  let doc;
  try {
    doc = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: maxBytes }).toString('utf8'));
  } catch (error) {
    if (error.code === 'ERR_BUFFER_TOO_LARGE') throw new Error(`size: the bundle opens to more than the bound of ${maxBytes} bytes`);
    throw new Error(`gzip: not a gzipped bundle (${error.message})`);
  }
  const { manifest, entries } = isMap(doc) ? doc : {};
  if (!isMap(manifest) || !isMap(entries) || !isMap(manifest.entries)) throw new Error('format: not a bundle (no manifest and entries)');
  if (manifest.format !== BUNDLE_FORMAT) throw new Error(`format: bundle format ${JSON.stringify(manifest.format)}, not ${BUNDLE_FORMAT}`);
  const version = (v) => {
    if (Number.isInteger(v) && v > BUNDLE_STORE_VERSION) throw new Error(`version: store version ${v} is newer than this plugin reads (${BUNDLE_STORE_VERSION}); upgrade the plugin first`);
    if (v !== BUNDLE_STORE_VERSION) throw new Error(`version: store version ${JSON.stringify(v)}, not ${BUNDLE_STORE_VERSION}`);
  };
  version(manifest.storeVersion);

  const names = Object.keys(entries).sort();
  const hashed = Object.keys(manifest.entries).sort();
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error('entry: two entry names differ only by case, and would meet in one file where case folds');
  for (const name of names) {
    if (!allowedEntry(name, { logs: true }) || (name.startsWith('audits/') && UNSAFE_DIR.test(name.split('/')[1]))) throw new Error(`entry: ${JSON.stringify(name)} is not one a bundle may carry`);
    if (typeof entries[name] !== 'string') throw new Error(`entry: ${name} is not text`);
  }
  if (names.join('\n') !== hashed.join('\n')) throw new Error('sha256: the manifest does not hash exactly the entries the bundle carries');
  for (const name of names) {
    if (sha256(entries[name]) !== manifest.entries[name]) throw new Error(`sha256: ${name} does not match its manifest checksum`);
  }

  if (entries['deck.json'] === undefined) throw new Error('entry: the bundle carries no deck.json');
  const deck = parsedEntry('deck.json', entries['deck.json']);
  if (!isDeck(deck)) throw new Error('entry: deck.json is not a deck');
  version(deck.version);
  const roots = checkedRoots('deck.json', deck, new Set());
  for (const name of names) {
    if (name === 'deck.json' || !/\.json$/.test(name)) continue;
    const value = parsedEntry(name, entries[name]);
    if (MONTH.test(name)) checkedRoots(name, value, roots);
  }
  return { manifest, entries: new Map(names.map((name) => [name, Buffer.from(entries[name], 'utf8')])), roots: [...roots].sort() };
}
