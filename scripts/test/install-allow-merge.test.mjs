/**
 * The install's merge allow rules (ADR 0110, amending L22): the pilot's own `sync`,
 * `integrate` and `land` are allowed, so an auto-mode classifier that reads only the
 * command text does not refuse a landing the user has already signed. Every test runs
 * against a scratch file under a moved home directory.
 */

// First, and before any module that can resolve a path from the home directory.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { installSettings } = await import('../install-settings.mjs');

const PLUGIN_ROOT = '/opt/pilot';

// Written out rather than imported, so a rule dropped or widened in the script fails here.
const GC = ['Bash(pilot ps)', 'Bash(pilot gc)', 'Bash(pilot deck --stop *)', 'Bash(pilot deck --scratch *)']; // install-allow-gc.test.mjs pins these
const MERGE = ['Bash(pilot sync *)', 'Bash(pilot integrate *)', 'Bash(pilot land *)', 'Bash(pilot landing *)', ...GC];

function settingsFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-merge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  if (contents !== undefined) fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const backupsBeside = (file) =>
  fs.readdirSync(path.dirname(file)).filter((name) => name.includes('pilot-backup'));
const install = (file) => installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, pilotMerge: true });

test('the CLI writes the four merge allow rules', (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { allow: ['Bash(git status)'] } }));

  const report = install(file);

  assert.deepEqual(readJson(file).permissions.allow, ['Bash(git status)', ...MERGE], 'after theirs, once each');
  assert.deepEqual(report.pilotMerge.added, MERGE);
  assert.equal(report.pilotMerge.state, 'added');
  assert.deepEqual(report.pilotMerge.notes, [
    `Added ${MERGE.length} allow rule(s) to ${file}, so the pilot's own commands are not refused in auto mode:`,
    ...MERGE.map((rule) => `    ${rule}`),
  ]);
  for (const rule of MERGE) assert.match(report.notes.join('\n'), new RegExp(rule.replace(/[()*]/g, '\\$&')));
});

test('a second run adds nothing', (t) => {
  const file = settingsFile(t, '{}');
  install(file);
  const before = fs.readFileSync(file, 'utf8');
  const backups = backupsBeside(file);

  const report = install(file);

  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(backupsBeside(file), backups, 'no write, so no backup');
  assert.equal(report.pilotMerge.state, 'nothing-to-add');
  assert.deepEqual(report.pilotMerge.added, []);
  assert.deepEqual(report.pilotMerge.alreadyPresent, MERGE);
  assert.deepEqual(report.pilotMerge.notes, [
    `Merge allow rules already present, left as they were: ${MERGE.join(', ')}.`,
  ]);
});

// pilotMergeStep is driven through installSettings: the module's export list is pinned
// in install.test.mjs, and a step is not an entry point.
test('a deny covering pilot land is named', (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { deny: ['Bash(pilot land*)'] } }));

  const { pilotMerge: result } = install(file);

  assert.deepEqual(result.covered, ['Bash(pilot land *)', 'Bash(pilot landing *)'], 'the glob covers both');
  assert.deepEqual(result.added, MERGE.filter((rule) => !rule.startsWith('Bash(pilot land')));
  assert.match(result.notes.join('\n'), /Bash\(pilot land \*\)/, 'the land rule is named');
  assert.deepEqual(readJson(file).permissions.allow, result.added, 'no land allow rule is written');
});

test('an ask covering pilot is named', (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { ask: ['Bash(pilot *)'] } }));

  const { pilotMerge: result } = install(file);

  assert.deepEqual(result.covered, MERGE);
  assert.deepEqual(result.added, []);
  assert.equal(result.state, 'nothing-to-add');
  assert.equal(readJson(file).permissions.allow, undefined, 'no allow rule is written');
  assert.deepEqual(result.notes, [
    'Covered by your deny or ask list, so not added to allow (yours wins either way):',
    ...MERGE.map((rule) => `    ${rule}`),
  ]);
});

test("the user's rules survive byte for byte", (t) => {
  const theirs = {
    deny: ['Read(./.env)', 'Bash(rm -rf *)'],
    allow: ['Bash(git status)', 'Bash(pilot land *)', 'WebFetch(domain:nodejs.org)'],
    ask: ['Bash(npm publish)'],
    defaultMode: 'default',
  };
  const file = settingsFile(t, JSON.stringify({ permissions: theirs }, null, 2));

  const report = install(file);

  const { permissions } = readJson(file);
  assert.deepEqual(Object.keys(permissions), ['deny', 'allow', 'ask', 'defaultMode'], 'in their order');
  assert.deepEqual(permissions.deny, theirs.deny);
  assert.deepEqual(permissions.ask.slice(0, theirs.ask.length), theirs.ask);
  assert.deepEqual(
    permissions.allow,
    [...theirs.allow, ...MERGE.filter((rule) => rule !== 'Bash(pilot land *)')],
    'theirs first, as written, and a rule they already allow is not added twice',
  );
  assert.deepEqual(report.pilotMerge.alreadyPresent, ['Bash(pilot land *)']);
});

test('the library writes no merge rule unless asked', (t) => {
  const file = settingsFile(t, '{}');

  const report = installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });

  assert.equal(report.pilotMerge, null);
  assert.equal(readJson(file).permissions.allow, undefined);
});
