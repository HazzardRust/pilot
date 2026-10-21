// S4 of gate-no-stall: the install allows `pilot landing`, so the pilot's
// `pilot landing <gate2>` never meets the classifier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { installSettings } = await import('../install-settings.mjs');

const LANDING = 'Bash(pilot landing *)';

function settingsFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-landing-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const install = (file) => installSettings({ settingsPath: file, pluginRoot: '/opt/pilot', pilotMerge: true });

test('the install writes the landing rule', (t) => {
  const file = settingsFile(t, '{}');

  const report = install(file);

  assert.ok(readJson(file).permissions.allow.includes(LANDING));
  assert.ok(report.pilotMerge.added.includes(LANDING));
});

test("a user's ask on pilot landing wins", (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { ask: [LANDING] } }));

  const report = install(file);

  assert.ok(!readJson(file).permissions.allow.includes(LANDING));
  assert.deepEqual(report.pilotMerge.covered, [LANDING]);
  assert.match(report.notes.join('\n'), /Bash\(pilot landing \*\)/);
});

test('a second install adds nothing', (t) => {
  const file = settingsFile(t, '{}');
  install(file);
  const before = fs.readFileSync(file, 'utf8');

  const report = install(file);

  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
