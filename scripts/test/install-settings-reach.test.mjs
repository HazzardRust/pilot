/**
 * S3 of plain-session: the settings merge follows the reach (L1, L3, L4, A5).
 *
 * `installSettings` writes `enabledPlugins["pilot@pilot"]` when told to and skips the status
 * line when told to; `repairSettings` below `everything` never writes `statusLine`, so a
 * session started by `pilot start` cannot put back what `pilot reach nothing` took out.
 *
 * Every test runs over a settings fixture in a scratch directory, with the home itself moved
 * by `lib/fake-home.mjs` first, so nothing here can reach a real `~/.claude`.
 */

// First, and before any module that can resolve a path from the home directory.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  installSettings,
  repairSettings,
  statusLineSetting,
  subagentStatusLineSetting,
} from '../install-settings.mjs';

const PLUGIN_ROOT = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'pilot', 'pilot', '0.3.0');
const OLD_ROOT = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'pilot', 'pilot', '0.1.0');

/** A scratch home with its own settings file and, when `level` is given, a stored reach. */
function fixture(t, settings, level) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s3-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settingsPath = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (settings !== undefined) fs.writeFileSync(settingsPath, settings);
  if (level) {
    fs.mkdirSync(path.join(home, '.claude', 'pilot'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'pilot', 'reach.json'), JSON.stringify({ level }));
  }
  return { home, settingsPath };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('enablePlugin false writes false and keeps other plugins', (t) => {
  const { settingsPath } = fixture(
    t,
    JSON.stringify({ enabledPlugins: { 'other@market': true, 'pilot@pilot': true }, theme: 'dark' }, null, 2),
  );

  installSettings({ settingsPath, pluginRoot: PLUGIN_ROOT, enablePlugin: false });

  assert.deepEqual(readJson(settingsPath).enabledPlugins, { 'other@market': true, 'pilot@pilot': false });
  assert.equal(readJson(settingsPath).theme, 'dark');
  const backups = fs.readdirSync(path.dirname(settingsPath)).filter((name) => name.includes('.pilot-backup-'));
  assert.equal(backups.length, 1, 'one install, one backup');
});

test('statusLine false removes the pilots own status line and subagent status line', (t) => {
  const { settingsPath } = fixture(t, '{}');
  installSettings({ settingsPath, pluginRoot: PLUGIN_ROOT });

  const report = installSettings({ settingsPath, pluginRoot: PLUGIN_ROOT, statusLine: false });

  assert.equal(Object.hasOwn(readJson(settingsPath), 'statusLine'), false);
  assert.equal(Object.hasOwn(readJson(settingsPath), 'subagentStatusLine'), false);
  assert.equal(report.statusLine, 'removed');
  assert.equal(report.subagentStatusLine, 'removed');
});

test('repair at nothing never writes statusLine', (t) => {
  // At `nothing` the user's statusLine is not the pilot's to write: a fixture without one gains none.
  const bare = fixture(t, '{}\n', 'nothing');
  const report = repairSettings({ home: bare.home, settingsPath: bare.settingsPath, pluginRoot: PLUGIN_ROOT });
  assert.equal(fs.readFileSync(bare.settingsPath, 'utf8'), '{}\n');
  assert.equal(report.changed, false);
});

/** An install from before the reach: the plugin and both pilot status lines in user settings. */
const oldInstall = () =>
  JSON.stringify(
    {
      enabledPlugins: { 'other@market': true, 'pilot@pilot': true },
      statusLine: statusLineSetting(OLD_ROOT),
      subagentStatusLine: subagentStatusLineSetting(OLD_ROOT),
      permissions: { allow: ['mcp__plugin_pilot_deck__*', 'Bash(npm test)'] },
      theme: 'dark',
    },
    null,
    2,
  );

test('an old install with no reach file is cleaned once (handoff-cache A1)', (t) => {
  const { home, settingsPath } = fixture(t, oldInstall());

  const report = repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });

  const after = readJson(settingsPath);
  assert.equal(report.changed, true);
  assert.equal(Object.hasOwn(after.enabledPlugins, 'pilot@pilot'), false);
  assert.equal(Object.hasOwn(after, 'statusLine'), false);
  assert.equal(Object.hasOwn(after, 'subagentStatusLine'), false);
  // The user's own settings, and the allow rules a `pilot start` session relies on, stay.
  assert.deepEqual(after.enabledPlugins, { 'other@market': true });
  assert.deepEqual(after.permissions, { allow: ['mcp__plugin_pilot_deck__*', 'Bash(npm test)'] });
  assert.equal(after.theme, 'dark');

  const cleaned = fs.readFileSync(settingsPath, 'utf8');
  const again = repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });
  assert.equal(again.changed, false);
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), cleaned, 'a second run changes 0 bytes');
});

test('a chosen nothing cleans the same way, and leaves a written false alone', (t) => {
  const { home, settingsPath } = fixture(t, oldInstall(), 'nothing');
  repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });
  assert.equal(Object.hasOwn(readJson(settingsPath), 'statusLine'), false);
  assert.equal(Object.hasOwn(readJson(settingsPath).enabledPlugins, 'pilot@pilot'), false);

  const off = JSON.stringify({ enabledPlugins: { 'pilot@pilot': false } }, null, 2);
  const chosen = fixture(t, off, 'nothing');
  const report = repairSettings({ home: chosen.home, settingsPath: chosen.settingsPath, pluginRoot: PLUGIN_ROOT });
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(chosen.settingsPath, 'utf8'), off);
});

test('an enabledPlugins that is not an object is left alone by the repair, which does not throw', (t) => {
  const raw = JSON.stringify({ enabledPlugins: ['pilot@pilot'] }, null, 2);
  const { home, settingsPath } = fixture(t, raw);
  const report = repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), raw);
});

test('repair at everything keeps the plugin and repoints the status lines', (t) => {
  const { home, settingsPath } = fixture(t, oldInstall(), 'everything');
  repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });
  assert.equal(readJson(settingsPath).enabledPlugins['pilot@pilot'], true);
  assert.deepEqual(readJson(settingsPath).statusLine, statusLineSetting(PLUGIN_ROOT));
});

test('an enabledPlugins that is not an object is refused and left byte for byte', (t) => {
  for (const raw of ['{"enabledPlugins": ["pilot@pilot"]}', '{"enabledPlugins": "pilot@pilot"}', '{ not json']) {
    const { settingsPath } = fixture(t, raw);
    assert.throws(() => installSettings({ settingsPath, pluginRoot: PLUGIN_ROOT, enablePlugin: false }), /left untouched/);
    assert.equal(fs.readFileSync(settingsPath, 'utf8'), raw);
    assert.deepEqual(fs.readdirSync(path.dirname(settingsPath)), ['settings.json'], 'no backup either');
  }
});

