/**
 * A bundle the deck did not write (portable-store S5; spec 5; L4, L5): each crafted bundle starts from one
 * `pilot store export` wrote and changes one thing, its checksum recomputed where the attack would recompute it.
 * `unpackBundle` throws naming the check, and `pilot store import` exits non-zero with the store dir unchanged.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { hostPlatform } from '../../hooks/lib/platform.js';
import { unpackBundle } from '../store-bundle.mjs';
import { exportStore, importStore } from '../store-move.mjs';
import { registerRun } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

const MAX = 64 * 1024 * 1024;
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** The bytes `pilot store export` writes for a store with one run and its chat. */
function exported(t) {
  const dir = tempDeck(t);
  registerRun({ repo: path.join(os.homedir(), 'Projects', 'alpha'), pid: process.pid, session: 'a-session' });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-bundle-')), 'moved.pilotstore');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  assert.equal(exportStore([file], { git: () => ({ status: 0, stdout: '', stderr: '' }), out: () => {}, err: () => {} }), 0);
  fs.rmSync(dir, { recursive: true, force: true });
  return fs.readFileSync(file);
}

/** `bytes` opened, changed by `change`, and gzipped again. */
function crafted(bytes, change) {
  const doc = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
  change(doc);
  return zlib.gzipSync(JSON.stringify(doc));
}

/** An entry added under `name`, hashed as the deck hashes one. */
const plant = (name) => (doc) => {
  doc.entries[name] = '{}';
  doc.manifest.entries[name] = sha256('{}');
};

/** deck.json's first item's repo set to `repo`, the checksum recomputed. */
const repoOf = (repo) => (doc) => {
  const deck = JSON.parse(doc.entries['deck.json']);
  deck.items[0].repo = repo;
  doc.entries['deck.json'] = JSON.stringify(deck);
  doc.manifest.entries['deck.json'] = sha256(doc.entries['deck.json']);
};

/** deck.json's `decks` map set to the JSON text `json`, parsed so a `__proto__` key stays an own key, the checksum recomputed. */
const decksOf = (json) => (doc) => {
  const deck = JSON.parse(doc.entries['deck.json']);
  deck.decks = JSON.parse(json);
  doc.entries['deck.json'] = JSON.stringify(deck);
  doc.manifest.entries['deck.json'] = sha256(doc.entries['deck.json']);
};

/** `importStore` of `bytes` into a fresh scratch store: its exit code, its lines, and whether the store dir changed. */
function imported(t, bytes) {
  const dir = tempDeck(t);
  const before = fs.readdirSync(dir, { recursive: true }).sort();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-hostile-')), 'hostile.pilotstore');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  fs.writeFileSync(file, bytes);
  const said = [];
  const code = importStore([file], { storePid: () => null, home: os.homedir(), platform: hostPlatform(), out: (line) => said.push(line), err: (line) => said.push(line) });
  return { code, said: said.join('\n'), unchanged: JSON.stringify(fs.readdirSync(dir, { recursive: true }).sort()) === JSON.stringify(before) };
}

const CASES = [
  ['an entry ../x', (bytes) => crafted(bytes, plant('../x')), /entry/],
  ['an entry outside the allowlist', (bytes) => crafted(bytes, plant('machine.json')), /entry/],
  ['an audit entry Windows reads as a device', (bytes) => crafted(bytes, plant('audits/CON/record.json')), /entry/],
  ['a stored path with ..', (bytes) => crafted(bytes, repoOf('@home/Projects/../../../etc')), /climbs/],
  ['an absolute structured path', (bytes) => crafted(bytes, repoOf(hostPlatform() === 'win32' ? 'C:\\Windows\\System32' : '/etc')), /absolute/],
  ['a UNC structured path', (bytes) => crafted(bytes, repoOf('\\\\attacker\\share\\repo')), /absolute/],
  ['a stored path naming no root', (bytes) => crafted(bytes, repoOf('@home')), /stored path/],
  [
    'store version 5',
    (bytes) =>
      crafted(bytes, (doc) => {
        doc.manifest.storeVersion = 5;
        const deck = { ...JSON.parse(doc.entries['deck.json']), version: 5 };
        doc.entries['deck.json'] = JSON.stringify(deck);
        doc.manifest.entries['deck.json'] = sha256(doc.entries['deck.json']);
      }),
    /version 5/,
  ],
  [
    'a sha256 mismatch',
    (bytes) =>
      crafted(bytes, (doc) => {
        doc.entries['deck.json'] = doc.entries['deck.json'].replace('"items"', '"items" ');
      }),
    /sha256/,
  ],
  ['not a gzipped bundle', (bytes) => bytes.subarray(0, 20), /gzip/],
  ['a map key __proto__', (bytes) => crafted(bytes, decksOf('{"__proto__":{"polluted":true}}')), /not a path/],
  ['two entry names that differ by case', (bytes) => crafted(bytes, (doc) => ['audits/a-1/record.json', 'audits/A-1/record.json'].forEach((name) => plant(name)(doc))), /case/],
  [
    'an absolute path in a month archive',
    (bytes) =>
      crafted(bytes, (doc) => {
        const name = 'deck.archive-2026-01.json';
        doc.entries[name] = JSON.stringify({ items: [{ id: 'itm_000000000001', repo: hostPlatform() === 'win32' ? 'C:\\Windows' : '/etc' }] });
        doc.manifest.entries[name] = sha256(doc.entries[name]);
      }),
    /absolute/,
  ],
];

for (const [name, craft, check] of CASES) {
  test(`a hostile bundle writes nothing: ${name}`, (t) => {
    const bytes = craft(exported(t));
    assert.throws(() => unpackBundle(bytes, { maxBytes: MAX }), check);

    const { code, said, unchanged } = imported(t, bytes);
    assert.equal(code, 1, said);
    assert.match(said, check, 'refused for the same reason');
    assert.ok(unchanged, 'the store dir is unchanged');
  });
}

test('a hostile bundle writes nothing: two map keys that read as one path', (t) => {
  const bytes = crafted(exported(t), decksOf('{"@home/Projects/x":1,"@home/Projects/x/":2}'));
  const { code, said, unchanged } = imported(t, bytes);
  assert.equal(code, 1, said);
  assert.match(said, /load: deck\.json would not load/);
  assert.ok(unchanged, 'the store dir is unchanged');
});

test('a hostile bundle writes nothing: a stored path a drive segment carries off its root', { skip: hostPlatform() !== 'win32' && 'a drive segment is a plain name off Windows' }, (t) => {
  const bytes = crafted(exported(t), repoOf('@home/C:/Windows'));
  const { code, said, unchanged } = imported(t, bytes);
  assert.equal(code, 1, said);
  assert.match(said, /reads outside its root/);
  assert.ok(unchanged, 'the store dir is unchanged');
});

test('a hostile bundle writes nothing: gunzipped size over the bound', (t) => {
  const bytes = exported(t);
  const size = zlib.gunzipSync(bytes).length;
  assert.throws(() => unpackBundle(bytes, { maxBytes: size - 1 }), /size/);
  assert.doesNotThrow(() => unpackBundle(bytes, { maxBytes: size }));

  const dir = tempDeck(t);
  const before = fs.readdirSync(dir, { recursive: true }).sort();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-hostile-')), 'big.pilotstore');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  fs.writeFileSync(file, bytes);
  const code = importStore([file], { storePid: () => null, home: os.homedir(), platform: hostPlatform(), maxBytes: size - 1, out: () => {}, err: () => {} });
  assert.equal(code, 1);
  assert.deepEqual(fs.readdirSync(dir, { recursive: true }).sort(), before);
});
