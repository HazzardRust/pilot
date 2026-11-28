/**
 * `pilot store import` (portable-store S5; spec 5, 12; L3, L5): a bundle the deck wrote opens under another home,
 * a root this machine lacks must be named, a store in use is kept unless `--replace` sets it aside, and a dry run
 * writes nothing. The source store is written by the deck's own writers and bundled by `pilot store export`; the
 * import goes into a second scratch store under a second home.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hostPlatform, pathKey } from '../../hooks/lib/platform.js';
import { ticketQueueOf } from '../items.mjs';
import { exportStore, importStore } from '../store-move.mjs';
import { listItems, postItem, registerRun, setSlices } from '../store.mjs';
import { shapedTicketBody, storedDeck, tempDeck } from '../testUtils.mjs';

const NOW = () => new Date('2026-11-28T10:00:00.000Z');
const quiet = () => ({ status: 0, stdout: '', stderr: '' });

/** `HOME` and `USERPROFILE` pointed at a fresh directory for the rest of the test, so `os.homedir()` reads it. */
function aHome(t, name) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-${name}-`));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    Object.assign(process.env, before);
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

/**
 * A store under one home with a run, its record and chat, and three tickets queued in one repository, all by the
 * deck's writers, exported to a bundle outside it. Returns the bundle and the queue's ids in order.
 */
function aBundle(t, { roots } = {}) {
  const home = aHome(t, 'source');
  const dir = tempDeck(t);
  if (roots) fs.writeFileSync(path.join(dir, 'machine.json'), JSON.stringify({ roots }));
  const repo = path.join(roots?.['drive-d'] ?? home, 'Projects', 'alpha');
  const run = registerRun({ repo, pid: process.pid, session: 'a-session' });
  setSlices(run.id, [{ slice: 'S1', worktree: path.join(home, 'Projects', 'alpha-s1') }], undefined, { slug: 'x', worktree: path.join(home, 'Projects', 'alpha-feat') });
  for (const title of ['First', 'Second', 'Third']) postItem({ kind: 'ticket', title, body: shapedTicketBody(title), repo, sliceCount: 2 });
  const queue = ticketQueueOf(listItems(), repo).map((item) => item.id);
  const file = path.join(home, 'moved.pilotstore');
  const said = [];
  assert.equal(exportStore([file], { git: quiet, now: NOW, host: 'source-host', out: (line) => said.push(line), err: (line) => said.push(line) }), 0, said.join('\n'));
  return { file, queue, items: listItems().length };
}

/** Every file under `dir` and its bytes, so a refusal can be shown to have changed none of them. */
function snapshot(dir) {
  const files = {};
  for (const name of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isFile()) files[name] = fs.readFileSync(file).toString('base64');
  }
  return files;
}

/** `importStore` on this host, nothing serving the store, its lines kept. */
function anImport(argv, home, more = {}) {
  const said = [];
  const code = importStore(argv, { storePid: () => null, home, platform: hostPlatform(), now: NOW, out: (line) => said.push(line), err: (line) => said.push(line), ...more });
  return { code, said: said.join('\n') };
}

/** `pathKey` of the deepest existing ancestor of `value`, then the rest: a missing leaf is keyed through the same link its parent is (macOS /var is /private/var). */
const keyOf = (value) => {
  const rest = [];
  let head = path.resolve(value);
  while (!fs.existsSync(head) && path.dirname(head) !== head) {
    rest.unshift(path.basename(head));
    head = path.dirname(head);
  }
  return path.join(pathKey(head), ...rest);
};
const under = (home) => (value) => keyOf(value).startsWith(keyOf(home) + path.sep);

test('a bundle opens under another home', (t) => {
  const { file, queue, items } = aBundle(t);
  const home = aHome(t, 'target');
  const dir = tempDeck(t);

  const { code, said } = anImport([file], home);

  assert.equal(code, 0, said);
  const read = listItems();
  assert.equal(read.length, items, said);
  const repos = read.map((item) => item.repo).filter((repo) => typeof repo === 'string');
  assert.ok(repos.length >= 4 && repos.every(under(home)), repos.join('\n'));
  assert.ok(read.some((item) => item.kind === 'chat' && under(home)(item.repo)), 'the chat decodes under the new home');
  const deck = storedDeck();
  const record = deck.records[0];
  assert.ok(under(home)(record.repo) && under(home)(record.record.worktree) && under(home)(record.record.slices[0].worktree), JSON.stringify(record));
  assert.deepEqual(ticketQueueOf(read, path.join(home, 'Projects', 'alpha')).map((item) => item.id), queue);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'machine.json'), 'utf8')).roots, {}, 'a fresh machine file');
});

test('an unknown root must be named', (t) => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-drive-d-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  const { file } = aBundle(t, { roots: { 'drive-d': elsewhere } });
  const home = aHome(t, 'target');
  const dir = tempDeck(t);
  const before = snapshot(dir);

  const refused = anImport([file], home, { hasDrive: () => false });

  assert.notEqual(refused.code, 0, refused.said);
  assert.ok(refused.said.includes('--root drive-d=<path>'), refused.said);
  assert.deepEqual(snapshot(dir), before, '0 files written');

  const target = path.join(home, 'D');
  const named = anImport([file, '--root', `drive-d=${target}`], home, { hasDrive: () => false });
  assert.equal(named.code, 0, named.said);
  assert.ok(listItems().some((item) => item.kind === 'ticket' && under(target)(item.repo)), named.said);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'machine.json'), 'utf8')).roots, { 'drive-d': target });
});

test('a non-empty store is kept', (t) => {
  const { file } = aBundle(t);
  const home = aHome(t, 'target');
  const dir = tempDeck(t);
  assert.equal(anImport([file], home).code, 0);
  postItem({ kind: 'question', title: 'Only here?', body: 'Posted after the import.', repo: path.join(home, 'Projects', 'alpha') });
  const before = snapshot(dir);

  const refused = anImport([file], home);

  assert.notEqual(refused.code, 0, refused.said);
  assert.ok(refused.said.includes('--replace'), refused.said);
  assert.deepEqual(snapshot(dir), before, "the store's bytes unchanged");

  const replaced = anImport([file, '--replace'], home);
  assert.equal(replaced.code, 0, replaced.said);
  const aside = path.join(dir, 'replaced-2026-11-28');
  assert.equal(fs.readFileSync(path.join(aside, 'deck.json'), 'utf8'), Buffer.from(before['deck.json'], 'base64').toString('utf8'));
  assert.equal(listItems().some((item) => item.title === 'Only here?'), false, 'the bundle replaced the store');
  assert.equal(fs.readdirSync(dir).some((name) => name.startsWith('.import-')), false, 'no staging left behind');

  const first = snapshot(aside);
  assert.equal(anImport([file, '--replace'], home).code, 0);
  assert.deepEqual(snapshot(aside), first, 'a second replace the same day never overwrites the first');
  assert.ok(fs.existsSync(path.join(dir, 'replaced-2026-11-28-2', 'deck.json')));
});

test('a dry run writes nothing', (t) => {
  const { file } = aBundle(t);
  const home = aHome(t, 'target');
  const dir = tempDeck(t);
  const before = snapshot(dir);

  const { code, said } = anImport([file, '--dry-run'], home);

  assert.equal(code, 0, said);
  assert.match(said, /^entry deck\.json \d+ bytes$/m);
  assert.ok(said.includes(`root home = ${home}`), said);
  assert.deepEqual(snapshot(dir), before, '0 files written');
});

test('an import is refused while a deck serves the store, or when that cannot be told', (t) => {
  const { file } = aBundle(t);
  const home = aHome(t, 'target');
  const dir = tempDeck(t);
  const before = snapshot(dir);
  for (const pid of [4242, undefined]) {
    const { code, said } = anImport([file], home, { storePid: () => pid });
    assert.notEqual(code, 0, said);
    assert.deepEqual(snapshot(dir), before);
  }
});
