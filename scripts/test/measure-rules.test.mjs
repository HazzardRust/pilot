/**
 * crew-voice-rules S8 (spec 10, 11; L6, L18): what the shipped rules tree costs a session.
 * A rules file with no `paths:` frontmatter loads into every session and every spawn; one
 * with `paths:` loads only when a file it matches is read. The measure reports both, and
 * the two always-loaded files stand alone, with no CLAUDE.md behind them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureRules } from '../measure-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULES = path.join(ROOT, 'rules');

const fixture = (t, files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-rules-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
};

const mdFiles = (dir) =>
  fs.readdirSync(dir, { recursive: true }).filter((rel) => rel.endsWith('.md')).map((rel) => rel.split(path.sep).join('/'));

const PYTHON = '---\npaths:\n  - "**/*.py"\n---\nonly for python\n';

test('measure-rules counts only paths-less files as always-loaded', (t) => {
  const always = 'always here\n'.repeat(10);
  const dir = fixture(t, { 'always.md': always, 'python/style.md': PYTHON });
  const measured = measureRules(dir);
  assert.deepEqual(measured.always.files, ['always.md']);
  assert.equal(measured.always.tokens, Math.round(Buffer.byteLength(always) / 4));
  assert.deepEqual(measured.trigger['.py'], { dirs: ['python'], tokens: Math.round(Buffer.byteLength(PYTHON) / 4) });
  assert.deepEqual(measured.trigger['.ts'], { dirs: [], tokens: 0 });
});

test('the CLI prints the measure as JSON for --rules', (t) => {
  const dir = fixture(t, { 'python/style.md': PYTHON });
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'measure-rules.mjs'), '--rules', dir, '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), measureRules(dir));
});

test('a .ts sample matches every dir whose paths include **/*.ts', () => {
  const declaring = new Set();
  for (const rel of mdFiles(RULES)) {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(path.join(RULES, rel), 'utf8'))?.[1] ?? '';
    if (front.includes('"**/*.ts"')) declaring.add(rel.split('/')[0]);
  }
  assert.ok(declaring.size > 0, 'the tree has no rules for .ts at all');
  assert.deepEqual(measureRules(RULES).trigger['.ts'].dirs, [...declaring].sort());
});

test('always-loaded is at most 3,500 tokens', () => {
  // L18: orchestration.md and vertical-execution.md stay always-loaded, trimmed.
  const { always } = measureRules(RULES);
  assert.ok(always.tokens <= 3500, `always-loaded is ${always.tokens} tokens: ${always.files.join(', ')}`);
});
