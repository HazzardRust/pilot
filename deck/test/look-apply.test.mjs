/**
 * Slice S4 of ui-design-workflow: `pilot look apply` changes only the touched tokens (ADR NNNN).
 *
 * The current text is Rune's real `theme.json`, and every export is made by the same
 * `tokens.exportText` the playground page runs, so no fixture is typed in the exporter's format.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { look, loadTokens } from '../look.mjs';

const tokens = loadTokens();
const THEME = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'rune', 'theme.json'), 'utf8');

/** An export of `text` made the page's way, with `edits` (dotted path to value) set first. */
function exported(text, edits = {}) {
  const doc = tokens.leaves(text);
  for (const [path, value] of Object.entries(edits)) {
    const leaf = doc.leaves.find((l) => l.path.join('.') === path);
    assert.ok(leaf, `theme.json has a leaf ${path}`);
    leaf.value = value;
  }
  return tokens.exportText(doc);
}

/** The lines of `b` that differ from `a`, which has the same line count. */
function changedLines(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  assert.equal(x.length, y.length);
  return y.filter((line, i) => line !== x[i]);
}

test('an untouched export is byte-identical', () => {
  const result = tokens.applyExport(THEME, exported(THEME));
  assert.equal(result.text, THEME);
  assert.deepEqual([...result.changed], []);
  assert.deepEqual([...result.refused], []);
});

test('one changed colour changes one leaf', () => {
  const result = tokens.applyExport(THEME, exported(THEME, { 'by.qa': '#123456' }));
  assert.deepEqual([...result.changed], ['by.qa']);
  assert.deepEqual([...result.refused], []);
  assert.deepEqual(changedLines(THEME, result.text), ['    "qa": "#123456",']);
});

test('an unknown key or a wrong shape is refused whole', () => {
  const number = tokens.leaves(THEME).leaves.find((l) => typeof l.value === 'number');
  const cases = {
    'a new key': exported(THEME, { 'by.qa': '#123456' }).replace('"pilot": "#2563eb",', '"pilot": "#2563eb", "intruder": "#000000",'),
    'a dropped key': THEME.replace(/\n\s*"qa": "#059669",/, ''),
    'a hex where a number stood': exported(THEME, { 'by.qa': '#123456', [number.path.join('.')]: '#abcdef' }),
    'an object where a leaf stood': THEME.replace('"qa": "#059669"', '"qa": { "light": "#000000", "dark": "#ffffff" }'),
    'a duplicate key': THEME.replace('"qa": "#059669",', '"qa": "#059669", "qa": "#111111",'),
    'not JSON': '{ "by": ',
  };
  for (const [name, text] of Object.entries(cases)) {
    const result = tokens.applyExport(THEME, text);
    assert.ok(result.refused.length > 0, `${name} is refused`);
    assert.equal(result.text, THEME, `${name} leaves the text as it was`);
  }
});

/** A repository holding a web surface whose token file is a copy of `theme.json`; returns its paths. */
function surface() {
  const root = mkdtempSync(join(tmpdir(), 'look-apply-'));
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'theme.json'), THEME);
  writeFileSync(join(root, 'rules.md'), '# rules\n');
  writeFileSync(join(root, 'page.html'), '<!doctype html>\n');
  const file = join(root, 'surface.json');
  writeFileSync(file, JSON.stringify({ name: 'web', tokens: 'theme.json', rules: 'rules.md', screens: { home: '' }, open: { kind: 'web', page: 'page.html' } }));
  return { root, file, tokens: join(root, 'theme.json') };
}

/** `look(argv)` with its output captured. */
function run(argv) {
  let out = '', err = '';
  const status = look(argv, { out: { write: (s) => { out += s; } }, err: { write: (s) => { err += s; } } });
  return { status, out, err };
}

test('pilot look apply writes the touched leaves and prints their paths', () => {
  const s = surface();
  const exportFile = join(s.root, 'export.json');
  writeFileSync(exportFile, exported(THEME, { 'by.qa': '#123456' }));
  const { status, out } = run(['apply', exportFile, s.file]);
  assert.equal(status, 0);
  assert.equal(out, 'by.qa\n');
  assert.deepEqual(changedLines(THEME, readFileSync(s.tokens, 'utf8')), ['    "qa": "#123456",']);
});

test('pilot look apply writes nothing on a refusal', () => {
  const s = surface();
  const exportFile = join(s.root, 'export.json');
  writeFileSync(exportFile, exported(THEME, { 'by.qa': '#123456' }).replace('"pilot": "#2563eb",', '"pilot": "#2563eb", "intruder": "#000000",'));
  const { status, out, err } = run(['apply', exportFile, s.file]);
  assert.equal(status, 1);
  assert.equal(out, '');
  assert.match(err, /by\.intruder/);
  assert.equal(readFileSync(s.tokens, 'utf8'), THEME);
});
