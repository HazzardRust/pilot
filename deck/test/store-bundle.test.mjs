/**
 * The bundle (portable-store S4; spec 4, 12; L4, A5): `packBundle` carries the portable part of a store and
 * nothing of the machine's, logs only when asked, and a manifest that counts the store and hashes each entry.
 * The scratch store is written by the deck's own writers (posting, a run's record, the month archive); only the
 * machine-only files the bundle must leave behind are planted by hand, each holding the store's secret.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { readSecret } from '../../hooks/lib/deck-secret.js';
import { packBundle } from '../store-bundle.mjs';
import { archiveOld, postItem, registerRun, resolveItem, setSlices } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A scratch store with two live items, one archived month, one run record and a live run, by the deck's writers. */
function aStore(t) {
  const dir = tempDeck(t);
  const repo = path.join(dir, 'repo');
  // A hand-off closes silently, so it leaves no notice to keep it live (an agent's closed question would).
  const old = postItem({ kind: 'handoff', title: 'Context is at 40%', body: 'Stash at x.md.', repo });
  resolveItem(old.id, 'done');
  archiveOld({ now: new Date(Date.now() + 40 * DAY_MS) });
  postItem({ kind: 'question', title: 'One?', body: 'The first question.', repo });
  postItem({ kind: 'question', title: 'Two?', body: 'The second question.', repo });
  setSlices(registerRun({ repo, pid: process.pid, session: 'a-session' }).id, [], undefined, { slug: 'x', worktree: path.join(dir, 'wt') });
  return dir;
}

const opened = (bytes) => JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));

test('a bundle carries no secret', (t) => {
  const dir = aStore(t);
  const secret = readSecret(dir);
  assert.ok(secret && secret.length >= 16, 'the scratch store has a secret');
  assert.ok(fs.existsSync(path.join(dir, 'machine.json')), 'the run wrote a machine file');
  fs.writeFileSync(path.join(dir, 'machine.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(dir, 'machine.json'), 'utf8')), note: secret }));
  for (const name of ['deck.pid', 'deck.v3-2026-11-01.json', 'deck-open.html']) fs.writeFileSync(path.join(dir, name), `${process.pid} ${secret}`);
  // A deck.json from before the machine split, put back by hand, still names its run's pid (spec 2).
  const deck = JSON.parse(fs.readFileSync(path.join(dir, 'deck.json'), 'utf8'));
  deck.runs[0].pid = process.pid;
  fs.writeFileSync(path.join(dir, 'deck.json'), JSON.stringify(deck));

  const { bytes } = packBundle(dir, { logs: true });
  const text = zlib.gunzipSync(bytes).toString('utf8');
  const names = Object.keys(JSON.parse(text).entries);
  for (const name of ['deck.secret', 'machine.json', 'deck.pid', 'deck.v3-2026-11-01.json', 'deck-open.html']) {
    assert.equal(names.includes(name), false, `${name} stays on this machine`);
  }
  assert.equal(text.split(secret).length - 1, 0, "the secret's value is nowhere in the bundle");
  assert.equal(/"pid"\s*:/.test(text), false, 'no pid key travels');
});

test('logs travel only when asked', (t) => {
  const dir = aStore(t);
  const log = 'a deck log line\n'.repeat(200);
  fs.writeFileSync(path.join(dir, 'deck.log'), log);

  const without = packBundle(dir, { logs: false });
  const withLogs = packBundle(dir, { logs: true });
  assert.deepEqual(Object.keys(opened(without.bytes).entries).filter((name) => /\.log$|\.jsonl$/.test(name)), []);
  assert.equal(opened(withLogs.bytes).entries['deck.log'], log);
  assert.ok(zlib.gunzipSync(withLogs.bytes).length - zlib.gunzipSync(without.bytes).length >= log.length, 'larger by the log at least');
});

test('the manifest counts the store', (t) => {
  const dir = aStore(t);
  const deck = JSON.parse(fs.readFileSync(path.join(dir, 'deck.json'), 'utf8'));
  const months = fs.readdirSync(dir).filter((name) => /^deck\.archive-\d{4}-\d{2}\.json$/.test(name));
  assert.equal(months.length, 1, 'the scratch store has one month archive');

  const { bytes, manifest } = packBundle(dir, { logs: false, host: 'source-host', now: new Date('2026-11-28T10:00:00.000Z') });
  assert.deepEqual(manifest.counts, { items: deck.items.length, records: deck.records.length, archives: 1 });
  assert.ok(manifest.counts.items >= 2 && manifest.counts.records === 1, JSON.stringify(manifest.counts));
  assert.deepEqual([manifest.format, manifest.storeVersion, manifest.host, manifest.exportedAt], [1, 4, 'source-host', '2026-11-28T10:00:00.000Z']);
  const { entries } = opened(bytes);
  assert.deepEqual(Object.keys(manifest.entries).sort(), Object.keys(entries).sort());
  for (const [name, text] of Object.entries(entries)) {
    assert.equal(manifest.entries[name], crypto.createHash('sha256').update(text, 'utf8').digest('hex'), name);
  }
  assert.deepEqual(opened(bytes).manifest, manifest, 'the bundle carries the manifest it returns');
});

test('an older store is refused, not exported with its absolute paths', (t) => {
  const dir = tempDeck(t);
  fs.writeFileSync(path.join(dir, 'deck.json'), JSON.stringify({ version: 3, items: [], runs: [], seq: 0 }));
  assert.throws(() => packBundle(dir, { logs: false }), /version 3/);
});
