/**
 * archive-page S10: no local store can be added without the page showing it or naming why not (spec 3; L9).
 *
 * Thread kinds are checked through the seam, `archiveRows`, over a store holding one settled item of each kind.
 * Store files are checked against the kind modules' own `files` and `NEVER_SHOWN`, the file names being every
 * string literal ending `.json`, `.jsonl` or `.log` in the deck's and the hooks' source.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { postStored, tempDeck } from '../testUtils.mjs';

const { POSTABLE_KINDS } = await import('../items.mjs');
const { archiveKinds, archiveRows, NEVER_SHOWN } = await import('../archive.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const globOf = (pattern) =>
  new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '[^/]*')}$`, 'i');

/**
 * Literals the grep finds that are not files of the deck's store directory, each with why. Kept explicit so a new
 * store file is never swallowed by a pattern: only these exact names are skipped.
 */
const NOT_A_STORE_FILE = new Map([
  ['../package.json', 'the plugin manifest, read for its version'],
  ['package.json', 'a repository manifest the spawn root looks for'],
  ['hooks.json', 'the hooks manifest'],
  ['hooks/hooks.json', 'the hooks manifest'],
  ['settings.json', 'Claude Code\'s own settings file'],
  ['./prices.json', 'a table shipped with the plugin'],
  ['prices.json', 'a table shipped with the plugin'],
  ['deck/prices.json', 'a table shipped with the plugin'],
  ['run.json', 'a run record inside a repository\'s docs/design folder'],
  ['surface.json', 'a surface file in a repository'],
  ['context-usage-state.json', 'written under ~/.claude, beside the store, not in it'],
  ['pilot-scratch-${pid}.json', 'a scratch deck\'s registry in the OS temp dir'],
  ['agent-${id}.meta.json', 'a session transcript\'s sidecar, owned by Claude Code'],
  ['.jsonl', 'a transcript extension, not a name'],
  ['.json', 'an extension, not a name'],
  ['.held.json', 'a suffix on a per-session hook state file in the hooks\' own state dir'],
  ['.posted.json', 'a suffix on a per-session hook state file in the hooks\' own state dir'],
  ['${base}.json', 'the audit report path, which `audits/*/*.json` covers'],
  ['record.json', 'a file inside an audit folder, which `audits/*/*.json` covers'],
]);

/**
 * Store files whose content another view already carries, so a view of their own would only repeat a row.
 */
const SHOWN_THROUGH_ANOTHER = new Map([
  ['deck.v${version}-${day}.json', 'a pre-upgrade copy of deck.json'],
  ['deck.v${version}-${day}-${n}.json', 'a pre-upgrade copy of deck.json'],
  ['defender-advised.json', 'a two-field marker whose only meaning is that it exists'],
]);

const SKIPPED_DIRS = new Set(['node_modules', 'target', 'test', 'rune', 'archive-kinds', 'ui']);

/** Every `.json`, `.jsonl` or `.log` string literal in the source under `deck/` and `hooks/`, tests and kinds aside. */
function literalsUnder(dir, found = new Set()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) literalsUnder(file, found);
    } else if (/\.(mjs|js)$/.test(entry.name)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(['"`])([A-Za-z0-9_.\/*${}-]*\.(?:jsonl?|log))\1/g)) found.add(match[2]);
    }
  }
  return found;
}

const STORE_FILES = [...literalsUnder(path.join(ROOT, 'deck')), ...literalsUnder(path.join(ROOT, 'hooks'))]
  .filter((name) => !NOT_A_STORE_FILE.has(name))
  .sort();

/** A file name as a glob: a template's `${...}` is any run of characters. */
const asName = (literal) => literal.replace(/\$\{[^}]*\}/g, '*');

const viewed = (name) =>
  archiveKinds().some((kind) => kind.files.some((pattern) => pattern === name || globOf(pattern).test(asName(name)))) ||
  NEVER_SHOWN.some((pattern) => globOf(pattern).test(asName(name)));

test('every thread kind has one view', (t) => {
  tempDeck(t);
  const kinds = [...new Set([...POSTABLE_KINDS, 'chat', 'user'])];
  const posted = kinds.map((kind) => ({
    kind,
    id: postStored({ kind, title: `a settled ${kind}`, body: 'x', repo: 'D:/work/alpha', resolvedAt: new Date().toISOString() }).id,
  }));
  const rows = archiveRows();
  for (const { kind, id } of posted) {
    const claiming = rows.filter((row) => row.id === id).map((row) => row.kind);
    assert.equal(claiming.length, 1, `thread kind ${kind} is claimed by ${claiming.length} kinds: ${claiming.join(', ')}`);
  }
});

test('every store file is viewed or never shown', () => {
  assert.ok(STORE_FILES.includes('handoff-trace.jsonl'), 'the scan finds the hand-off trace writer');
  assert.ok(STORE_FILES.length > 10, 'the scan finds the store writers');
  const unviewed = STORE_FILES.filter((name) => !SHOWN_THROUGH_ANOTHER.has(name) && !viewed(name));
  assert.deepEqual(unviewed, [], `store files with neither a kind's files nor a NEVER_SHOWN entry: ${unviewed.join(', ')}`);
});
