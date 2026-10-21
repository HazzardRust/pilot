/**
 * S3 of plain-session: the settings merge follows the reach (L1, L3, L4, A5).
 *
 * `installSettings` writes `enabledPlugins["pilot@pilot"]` when told to and skips the status
 * line when told to; `repairSettings` below `everything` never writes `statusLine`, so a
 * session started by `pilot run` cannot put back what `pilot reach nothing` took out.
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
  // A pilot status line left at an older root: today's repair would repoint it. At `nothing`
  // the user's statusLine is not the pilot's to write, so the file stays byte for byte.
  const stale = JSON.stringify({ statusLine: statusLineSetting(OLD_ROOT) }, null, 2);
  const { home, settingsPath } = fixture(t, stale, 'nothing');

  const report = repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });

  assert.equal(fs.readFileSync(settingsPath, 'utf8'), stale);
  assert.equal(report.changed, false);

  // And a fixture without one gains none.
  const bare = fixture(t, '{}\n', 'nothing');
  repairSettings({ home: bare.home, settingsPath: bare.settingsPath, pluginRoot: PLUGIN_ROOT });
  assert.equal(fs.readFileSync(bare.settingsPath, 'utf8'), '{}\n');
});

test('an enabledPlugins that is not an object is refused and left byte for byte', (t) => {
  for (const raw of ['{"enabledPlugins": ["pilot@pilot"]}', '{"enabledPlugins": "pilot@pilot"}', '{ not json']) {
    const { settingsPath } = fixture(t, raw);
    assert.throws(() => installSettings({ settingsPath, pluginRoot: PLUGIN_ROOT, enablePlugin: false }), /left untouched/);
    assert.equal(fs.readFileSync(settingsPath, 'utf8'), raw);
    assert.deepEqual(fs.readdirSync(path.dirname(settingsPath)), ['settings.json'], 'no backup either');
  }
});

test('repair with no reach file repoints as today', (t) => {
  const { home, settingsPath } = fixture(
    t,
    JSON.stringify(
      { statusLine: statusLineSetting(OLD_ROOT), subagentStatusLine: subagentStatusLineSetting(OLD_ROOT) },
      null,
      2,
    ),
  );

  const report = repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });

  assert.equal(report.statusLine, 'repaired');
  assert.equal(report.subagentStatusLine, 'repaired');
  assert.deepEqual(readJson(settingsPath).statusLine, statusLineSetting(PLUGIN_ROOT));
  assert.deepEqual(readJson(settingsPath).subagentStatusLine, subagentStatusLineSetting(PLUGIN_ROOT));
});

test('repair below everything leaves the subagent status line alone', (t) => {
  const stale = JSON.stringify({ subagentStatusLine: subagentStatusLineSetting(OLD_ROOT) }, null, 2);
  const { home, settingsPath } = fixture(t, stale, 'nothing');

  const report = repairSettings({ home, settingsPath, pluginRoot: PLUGIN_ROOT });

  assert.equal(fs.readFileSync(settingsPath, 'utf8'), stale);
  assert.equal(report.changed, false);
});
