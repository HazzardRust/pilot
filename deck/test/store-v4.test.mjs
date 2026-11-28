/**
 * portable-store S1 (spec 1, 3; L1, L2, L6): a v3 store is backed up byte for byte, then written back as v4 with
 * every structured path stored against a root; prose keeps its absolute paths (A1). The scan below is the guard:
 * it names any field of the written file that still holds a drive or home path and is not prose.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { pathKey } from '../../hooks/lib/platform.js';
import { listItems, registerRun, storeFile } from '../store.mjs';
import { respelt, storedDeck, tempDeck } from '../testUtils.mjs';

const AT = '2026-11-01T00:00:00.000Z';
const today = () => new Date().toLocaleDateString('sv-SE');

/** The prose fields of F2, by their last name: their words are the user's and agents' and keep any path (A1). */
const PROSE = new Set(['body', 'title', 'text', 'url', 'screens[]', 'line', 'what', 'evidence']);
// Any absolute path, not only /Users and /home: the suite's home is under os.tmpdir() (/tmp, macOS /var/folders).
const ABSOLUTE = /^([A-Za-z]:[\\/]|\/(?!\/))/;

/** Every field of `value` holding an absolute drive or home path outside prose, by its `[]`/`{}` name. */
function absoluteFields(value, name = '') {
  if (typeof value === 'string') return ABSOLUTE.test(value) && !PROSE.has(name.split('.').pop()) ? [name] : [];
  if (Array.isArray(value)) return value.flatMap((entry) => absoluteFields(entry, `${name}[]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const keyed = ABSOLUTE.test(key);
    const field = keyed ? `${name}{}` : `${name ? `${name}.` : ''}${key}`;
    return [...(keyed ? [`${field}<key>`] : []), ...absoluteFields(entry, field)];
  });
}

/** A v3 store with a path in every structured field of F2, two spellings of one repo, and prose naming paths. */
function v3(home) {
  const repo = path.join(home, 'Projects', 'pilot');
  fs.mkdirSync(repo, { recursive: true }); // a repo that exists, so its spellings collapse (L2)
  const other = respelt(repo);
  const folded = pathKey(repo);
  const tree = (n) => path.join(home, 'Projects', `pilot-s${n}`);
  return {
    version: 3,
    seq: 2,
    deckSeq: 1,
    decks: { [folded]: 1 },
    coPilots: { [folded]: { ticket: 'itm_000000000001', live: true, at: AT } },
    switches: { [folded]: {} },
    budgets: { [folded]: { main: 7, sub: 5 } },
    added: [{ repo: path.join(home, 'Projects', 'site'), at: AT }],
    runs: [{ id: 'run_1', repo, name: 'pilot', startedAt: AT, slices: [{ slice: 'S1', state: 'yellow', worktree: tree(1) }] }],
    items: [
      { id: 'itm_000000000001', kind: 'ticket', title: `Move ${repo}`, body: `See ${repo}\\docs`, repo, state: 'yellow', sliceCount: 1, author: 'pilot', postedAt: AT },
      { id: 'itm_000000000002', kind: 'question', title: 'Which?', body: 'Which?', repo: other, dir: tree(2), url: `file:///${repo}`, screens: [path.join(home, 'shot.png')], author: 'pilot', postedAt: AT,
        replies: [{ from: 'user', text: `look in ${repo}`, repliedAt: AT, seq: 1 }] },
    ],
    records: [{ repo: folded, record: { slug: 'portable-store', branch: 'feat/portable-store', worktree: tree(0),
      slices: [{ slice: 'S1', state: 'green', worktree: tree(1) }], report: { worktreesLeft: [tree(1), tree(2)] }, qa: { worktree: tree(3) },
      friction: [{ what: `slow in ${repo}`, evidence: `${repo}\\log` }] } }],
  };
}

const seed = (t) => {
  const dir = tempDeck(t);
  const raw = `${JSON.stringify(v3(os.homedir()), null, 2)}\n`;
  fs.writeFileSync(storeFile(), raw);
  return { dir, raw };
};

test('a v3 store migrates with its backup first', (t) => {
  const day = today();
  const { dir, raw } = seed(t);
  const before = JSON.parse(raw);

  const read = listItems();

  assert.equal(fs.readFileSync(path.join(dir, `deck.v3-${day}.json`), 'utf8'), raw, 'the backup holds the v3 bytes');
  const written = fs.readFileSync(storeFile(), 'utf8');
  const stored = JSON.parse(written);
  assert.equal(stored.version, 4);
  assert.deepEqual([stored.items.length, stored.records.length, stored.runs.length], [before.items.length, before.records.length, before.runs.length]);
  assert.deepEqual(read.map((item) => item.id), before.items.map((item) => item.id), 'every item reads back');
  assert.equal(stored.items[0].repo, stored.items[1].repo, 'two spellings of one repo are one stored path');
  assert.equal(stored.items[0].body, before.items[0].body, 'prose keeps its words (A1)');

  const mtime = fs.statSync(storeFile()).mtimeMs;
  listItems();
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), written, 'a second read changes no byte');
  assert.equal(fs.statSync(storeFile()).mtimeMs, mtime, 'a second read writes nothing');
  assert.deepEqual(fs.readdirSync(dir).filter((name) => /^deck\.v\d/.test(name)), [`deck.v3-${day}.json`], 'one backup');
});

test('no structured field keeps an absolute path', (t) => {
  seed(t);
  listItems();
  assert.deepEqual(absoluteFields(JSON.parse(fs.readFileSync(storeFile(), 'utf8'))), []);

  // A path field the codec does not know fails the scan by its name.
  const store = tempDeck(t);
  const deck = v3(os.homedir());
  deck.items[0].elsewhere = path.join(os.homedir(), 'Projects', 'other');
  fs.writeFileSync(path.join(store, 'deck.json'), JSON.stringify(deck));
  listItems();
  assert.deepEqual(absoluteFields(JSON.parse(fs.readFileSync(storeFile(), 'utf8'))), ['items[].elsewhere']);
});

test('a v4 store naming a root this machine lacks is refused, never rolled back to its .bak', (t) => {
  const dir = tempDeck(t);
  const raw = JSON.stringify({ version: 4, items: [{ id: 'itm_000000000001', kind: 'question', title: 'Q', body: 'Q', repo: '@nowhere/x', author: 'pilot', postedAt: AT }] });
  fs.writeFileSync(storeFile(), raw);
  fs.writeFileSync(path.join(dir, 'deck.json.bak'), JSON.stringify({ version: 4, items: [] }));

  assert.throws(() => listItems(), /cannot read/);
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), raw, 'the live store keeps its bytes');
});

test('a session retrying under a respelt repo keeps its one row', (t) => {
  tempDeck(t);
  const repo = path.join(os.homedir(), 'Projects', 'retry');
  fs.mkdirSync(repo, { recursive: true });
  const spelling = respelt(repo);

  registerRun({ repo: spelling, pid: process.pid, session: 'sess-1' });
  registerRun({ repo: spelling, pid: process.pid, session: 'sess-1' });

  assert.equal(storedDeck().runs.length, 1, 'the retry matched the stored, realpath-spelt row');
});
