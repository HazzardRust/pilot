/**
 * The install allows the read-only pilot commands and the source-tree scratch deck
 * (blocked-steps spec 5, 6; A3, A6): `pilot wait`, `pilot budget`, `pilot tickets` and
 * `node bin/pilot.mjs deck --scratch …` never reach the classifier, and nothing wider is
 * written. Every test runs against a scratch file under a moved home directory.
 */

// First, and before any module that can resolve a path from the home directory.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { installSettings, readSettings, removeOwnSettings, PILOT_MERGE_ALLOW } = await import('../install-settings.mjs');
const { allowRow } = await import('../../deck/doctor.mjs');

// Written out rather than imported, so a rule dropped or widened in the script fails here.
const READS = [
  'Bash(pilot wait)',
  'Bash(pilot wait *)',
  'Bash(pilot budget)',
  'Bash(pilot tickets)',
  'Bash(node bin/pilot.mjs deck --scratch *)',
];
const WAIT = 'Bash(pilot wait *)';
const NODE_SCRATCH = 'Bash(node bin/pilot.mjs deck --scratch *)';

function settingsFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-reads-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const install = (file) => installSettings({ settingsPath: file, pluginRoot: '/opt/pilot', pilotMerge: true });

test('the install writes the five rules', (t) => {
  const file = settingsFile(t, '{}');

  const report = install(file);

  const allow = readJson(file).permissions.allow;
  for (const rule of READS) {
    assert.equal(allow.filter((r) => r === rule).length, 1, `${rule} is allowed once`);
    assert.equal(report.pilotMerge.added.filter((r) => r === rule).length, 1, `${rule} is reported added once`);
  }
});

test('nothing wider', (t) => {
  const file = settingsFile(t, '{}');

  install(file);

  const allow = readJson(file).permissions.allow;
  for (const wide of ['Bash(pilot *)', 'Bash(node *)', 'Bash(node bin/pilot.mjs *)']) {
    assert.ok(!allow.includes(wide), `no ${wide}`);
  }
  assert.ok(!allow.some((r) => r.startsWith('Bash(git')), 'no git rule');
  assert.ok(!allow.some((r) => r.startsWith('Bash(node ') && !READS.includes(r)), 'no other node rule');
});

test("a user's deny on pilot wait wins", (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { deny: [WAIT] } }));

  const report = install(file);

  assert.ok(!readJson(file).permissions.allow.includes(WAIT), 'the rule is not written');
  assert.deepEqual(report.pilotMerge.covered, [WAIT]);
  assert.match(report.pilotMerge.notes.join('\n'), /Bash\(pilot wait \*\)/, 'the report says so');
});

test("a user's deny on node wins over the source-tree rule", (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { deny: ['Bash(node *)'] } }));

  const report = install(file);

  assert.ok(!readJson(file).permissions.allow.includes(NODE_SCRATCH), 'the rule is not written');
  assert.deepEqual(report.pilotMerge.covered, [NODE_SCRATCH]);
});

test('a second install adds nothing', (t) => {
  const file = settingsFile(t, '{}');
  install(file);
  const before = fs.readFileSync(file, 'utf8');

  const report = install(file);

  assert.equal(fs.readFileSync(file, 'utf8'), before, 'byte-identical');
  assert.equal(report.changed, false);
});

test('the doctor names a missing read rule', (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { allow: PILOT_MERGE_ALLOW.filter((r) => r !== WAIT) } }));

  const row = allowRow({ readSettings: () => readSettings(file).settings });

  assert.equal(row.verdict, 'fail');
  assert.equal(row.detail, `missing ${WAIT}`);
});

test('uninstall removes the node-spelling rule', (t) => {
  // Seeded, not installed, so the rules are present whatever the install writes.
  const file = settingsFile(t, JSON.stringify({ permissions: { allow: [...READS, 'Bash(node foo.js)'] } }));

  removeOwnSettings({ settingsPath: file });

  const allow = readJson(file).permissions.allow;
  assert.ok(!allow.includes(NODE_SCRATCH), 'the node-spelling rule is gone');
  assert.ok(!allow.some((r) => READS.includes(r)), 'none of the five remains');
  assert.ok(allow.includes('Bash(node foo.js)'), "the user's own node rule stays");
});

test("a user's own bin/pilot.mjs rule survives uninstall", (t) => {
  const BUILD = 'Bash(node bin/pilot.mjs build)';
  const file = settingsFile(t, JSON.stringify({ permissions: { allow: [NODE_SCRATCH, BUILD] } }));

  removeOwnSettings({ settingsPath: file });

  assert.deepEqual(readJson(file).permissions.allow, [BUILD]);
});
