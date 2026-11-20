// ci-gate S2: the install allows `pilot checks`, so an agent's `pilot checks --wait` never meets the
// classifier, and nothing wider than the one command is written.
import './lib/fake-home.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { installSettings } = await import('../install-settings.mjs');

const CHECKS = 'Bash(pilot checks *)';

function settingsFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-checks-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const allowOf = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).permissions.allow;
const install = (file) => installSettings({ settingsPath: file, pluginRoot: '/opt/pilot', pilotMerge: true });

test('the install writes the checks rule once, beside no pilot wildcard', (t) => {
  const file = settingsFile(t, '{}');

  install(file);
  install(file);

  const allow = allowOf(file);
  assert.equal(allow.filter((rule) => rule === CHECKS).length, 1);
  assert.ok(!allow.includes('Bash(pilot *)'), 'no pilot wildcard');
  assert.ok(!allow.includes('Bash(pilot:*)'), 'no pilot prefix rule');
});

test("a user's ask on pilot checks wins", (t) => {
  const file = settingsFile(t, JSON.stringify({ permissions: { ask: [CHECKS] } }));

  const report = install(file);

  assert.ok(!(allowOf(file) ?? []).includes(CHECKS));
  assert.ok(report.pilotMerge.covered.includes(CHECKS));
});
