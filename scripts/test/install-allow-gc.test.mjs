/**
 * The install allows the process-gc commands (process-gc spec 4; L14): an agent can list,
 * reap and stop scratch decks without a permission prompt. Every test runs against a
 * scratch file under a moved home directory.
 */

// First, and before any module that can resolve a path from the home directory.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { installSettings } = await import('../install-settings.mjs');

// Written out rather than imported, so a rule dropped or widened in the script fails here.
const GC = ['Bash(pilot ps)', 'Bash(pilot gc)', 'Bash(pilot deck --stop *)'];

function settingsFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-gc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const install = (file) => installSettings({ settingsPath: file, pluginRoot: '/opt/pilot', pilotMerge: true });

test('the install writes the three rules', (t) => {
  const file = settingsFile(t, '{}');

  const report = install(file);

  const allow = readJson(file).permissions.allow;
  for (const rule of GC) assert.ok(allow.includes(rule), `${rule} is allowed`);
  for (const rule of GC) assert.ok(report.pilotMerge.added.includes(rule));
  assert.ok(!allow.some((r) => /^Bash\(pilot \*\)/.test(r)), 'nothing wider');
});

const SCRATCH = 'Bash(pilot deck --scratch *)';

test('the install writes the scratch rule', (t) => {
  const file = settingsFile(t, '{}');

  const report = install(file);

  assert.ok(report.pilotMerge.added.includes(SCRATCH), 'reported as added');
  assert.ok(readJson(file).permissions.allow.includes(SCRATCH), 'written to the file');
});

test('nothing wider', (t) => {
  const file = settingsFile(t, '{}');

  install(file);

  const allow = readJson(file).permissions.allow;
  assert.ok(!allow.includes('Bash(pilot *)'), 'no pilot wildcard');
  assert.ok(!allow.some((r) => r.startsWith('Bash(pilot deck --scratch') && r !== SCRATCH), 'no scratch rule without the space');
  assert.ok(!allow.includes('Bash(pilot deck *)'), 'no deck wildcard');
});

test("a user's deny on the scratch rule wins", (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { deny: [SCRATCH] } }));

  const report = install(file);

  assert.ok(!readJson(file).permissions.allow.includes(SCRATCH), 'the rule is not written');
  assert.deepEqual(report.pilotMerge.covered, [SCRATCH]);
  assert.match(report.pilotMerge.notes.join('\n'), /deck --scratch/, 'the report says so');
});

test("a user's deny on pilot gc wins", (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { deny: ['Bash(pilot gc)'] } }));

  const report = install(file);

  assert.ok(!readJson(file).permissions.allow.includes('Bash(pilot gc)'), 'the rule is not written');
  assert.deepEqual(report.pilotMerge.covered, ['Bash(pilot gc)']);
  assert.match(report.pilotMerge.notes.join('\n'), /Bash\(pilot gc\)/, 'the report says so');
});

test('a second install adds nothing', (t) => {
  const file = settingsFile(t, '{}');
  install(file);
  const before = fs.readFileSync(file, 'utf8');

  const report = install(file);

  assert.equal(fs.readFileSync(file, 'utf8'), before, 'byte-identical');
  assert.equal(report.changed, false);
});
