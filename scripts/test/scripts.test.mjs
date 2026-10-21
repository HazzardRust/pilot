/**
 * Tests for the settings merge, the one place this package writes into a
 * friend's live Claude Code configuration. Every case here is run against a
 * scratch settings file and never against the real one.
 *
 * "Never against the real one" rested entirely on each call passing an explicit
 * path, and on 2026-09-15 a mutation run dropped that argument and the suite
 * merged its fixtures into someone's actual `~/.claude/settings.json`. The import
 * below moves the home directory itself, so the fallback path this file can reach
 * through `installStatusLine` leads somewhere temporary. Nothing else here changed.
 */

// First, and before the module whose default path it exists to redirect.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { installStatusLine, statusLineCommand, resolvePluginRoot } =
  await import('../install-settings.mjs');

// --- the settings merge ----------------------------------------------------

function scratch(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  if (contents !== undefined) fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('a machine with no settings file at all gets one with the status line in it', (t) => {
  const file = scratch(t);

  const report = installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });

  assert.equal(report.statusLine, 'installed');
  assert.equal(report.changed, true);
  assert.equal(report.backupPath, null, 'nothing existed, so there was nothing to back up');

  const settings = readJson(file);
  assert.equal(settings.statusLine.type, 'command');
  assert.equal(settings.statusLine.refreshInterval, 30);
  assert.match(settings.statusLine.command, /context-usage-statusline\.js/);
});

test('an empty settings file is a settings file with nothing in it, not a broken one', (t) => {
  const file = scratch(t, '   \n');

  const report = installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });

  assert.equal(report.statusLine, 'installed');
  assert.match(readJson(file).statusLine.command, /context-usage-statusline\.js/);
});

test('the keys a friend already had are all still there afterwards', (t) => {
  const file = scratch(t, JSON.stringify({
    includeCoAuthoredBy: true,
    permissions: { allow: ['Bash(git status)'] },
    hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'node other.js' }] }] },
  }, null, 2));

  installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });

  const settings = readJson(file);
  assert.equal(settings.includeCoAuthoredBy, true);
  assert.deepEqual(settings.permissions.allow, ['Bash(git status)']);
  assert.equal(settings.hooks.PostToolUse[0].hooks[0].command, 'node other.js');
  assert.ok(settings.statusLine, 'and the status line was added alongside them');
});

test('a status line that is already someone else\'s is reported, never overwritten', (t) => {
  const theirs = { type: 'command', command: 'node /opt/theirs/my-own-statusline.js' };
  const file = scratch(t, JSON.stringify({ statusLine: theirs }, null, 2));
  const before = fs.readFileSync(file, 'utf8');

  const report = installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });

  assert.equal(report.statusLine, 'left-alone');
  assert.equal(report.changed, false);
  assert.deepEqual(readJson(file).statusLine, theirs, 'their status line survives untouched');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'the file is not even reformatted');
  assert.equal(report.backupPath, null, 'nothing changed, so nothing was backed up');

  // Reporting it is the whole point: they have to be able to act on it.
  const said = report.notes.join('\n');
  assert.match(said, /my-own-statusline\.js/, 'the report must quote what is already there');
  assert.match(said, /context-usage-statusline\.js/, 'and what it would have set');
});

test('running the merge twice changes nothing the second time', (t) => {
  const file = scratch(t, '{}');

  assert.equal(installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' }).statusLine, 'installed');
  const after = fs.readFileSync(file, 'utf8');

  const second = installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });
  assert.equal(second.statusLine, 'already-installed');
  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), after);
});

test('a settings file about to be changed is backed up first', (t) => {
  const file = scratch(t, JSON.stringify({ includeCoAuthoredBy: true }));
  const before = fs.readFileSync(file, 'utf8');

  const report = installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });

  assert.ok(report.backupPath, 'an existing settings file must be recoverable');
  assert.equal(fs.readFileSync(report.backupPath, 'utf8'), before);
  assert.equal(path.dirname(report.backupPath), path.dirname(file), 'the backup sits beside it');
});

// Windows PowerShell's Set-Content -Encoding utf8 writes one of these in front
// of the file, so a friend who has ever edited settings.json from a script has
// one. JSON.parse throws on it, which turned a perfectly valid settings file
// into "not readable JSON — fix it or move it aside".
const BOM = '\uFEFF';

test('a settings file written by PowerShell installs, and keeps the mark it came with', (t) => {
  const original = BOM + JSON.stringify({ includeCoAuthoredBy: true, permissions: { allow: ['Bash(git status)'] } }, null, 2) + '\n';
  const file = scratch(t, original);

  const report = installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });

  assert.equal(report.statusLine, 'installed', 'a byte-order mark is not a corrupt file');

  const written = fs.readFileSync(file, 'utf8');
  assert.ok(written.startsWith(BOM), 'the file goes back in the encoding it arrived in');
  const settings = JSON.parse(written.slice(BOM.length));
  assert.equal(settings.includeCoAuthoredBy, true, 'and every key they had is still there');
  assert.deepEqual(settings.permissions.allow, ['Bash(git status)']);
  assert.match(settings.statusLine.command, /context-usage-statusline\.js/);

  // Only the statusLine block changed; the backup proves what it was before.
  assert.equal(fs.readFileSync(report.backupPath, 'utf8'), original);
});

test('a settings file without the mark is not given one', (t) => {
  const file = scratch(t, JSON.stringify({ includeCoAuthoredBy: true }));

  installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' });

  const written = fs.readFileSync(file, 'utf8');
  assert.ok(!written.startsWith(BOM), 'preserving an encoding is not the same as imposing one');
  assert.equal(written[0], '{');
});

test('settings that are not JSON are refused, not clobbered', (t) => {
  const file = scratch(t, '{ "statusLine": ');
  const before = fs.readFileSync(file, 'utf8');

  assert.throws(
    () => installStatusLine({ settingsPath: file, pluginRoot: '/opt/pilot' }),
    /not readable JSON|JSON/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'a file we cannot parse is a file we do not write');
});

test('the resolved plugin root is written, because the variable does not expand here', (t) => {
  // ${CLAUDE_PLUGIN_ROOT} expands in hook commands and plugin skill content. It
  // does not expand in a user's settings.json, which is exactly why this script
  // exists rather than a line in a README.
  const file = scratch(t);
  installStatusLine({ settingsPath: file, pluginRoot: path.join('/opt', 'pilot pkg') });

  const command = readJson(file).statusLine.command;
  assert.ok(!command.includes('${CLAUDE_PLUGIN_ROOT}'), 'an unexpanded variable would just be a broken path');
  assert.ok(path.isAbsolute(statusLineCommand(path.join('/opt', 'pilot pkg')).match(/"(.+)"/)[1]));
  assert.match(command, /"/, 'a root with a space in it has to survive the shell');
});

test('the plugin root is the package, derived from where this script sits', () => {
  // A directory-source marketplace resolves the root to the source directory, not
  // the plugin cache, so the only reliable answer is the script's own location.
  assert.equal(resolvePluginRoot(), ROOT);
  assert.ok(fs.existsSync(path.join(resolvePluginRoot(), 'hooks', 'context-usage-statusline.js')));
});

// --- what ships ------------------------------------------------------------

// What a friend actually runs. The test files are held to the naming rule below
// but not to the path rule: a fictional home is exactly what they need as data.
const RUNTIME = [
  'hooks/context-usage-statusline.js',
  'hooks/context-usage-alert.js',
  'hooks/lib/atomic-write.js',
  'hooks/hooks.json',
  'scripts/install-settings.mjs',
  'scripts/install-command.mjs',
  'scripts/install-path.mjs',
  'bin/launcher.mjs',
];
const SHIPPED = RUNTIME.concat(['hooks/test/context-usage.test.js', 'scripts/test/scripts.test.mjs']);

test('nothing a friend runs carries an absolute home path', () => {
  for (const rel of RUNTIME) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/[Cc]:[\\/]+Users[\\/]+[A-Za-z]/.test(text), rel + ' names a Windows home directory');
    assert.ok(!/\/(?:home|Users)\/[A-Za-z]/.test(text), rel + ' names a posix home directory');
  }
});

test('nothing this slice ships names an upstream project anywhere addressable', () => {
  // L13: no upstream name in a command, a file name, a hook id, or anything else
  // on disk. Assembled from pieces so that this file, which has to spell the
  // forbidden names out to forbid them, does not fail its own rule; the file
  // names are still checked for every shipped file, test files included.
  const upstream = new RegExp(['\\b' + 'e' + 'cc\\b', 'poc' + 'ock'].join('|'), 'i');

  for (const rel of SHIPPED) {
    assert.ok(!upstream.test(rel), rel + ' is named after an upstream project');
  }
  for (const rel of RUNTIME) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!upstream.test(text), rel + ' mentions an upstream project');
  }
});

test('no shipped file carries a byte-order mark as a character of its own source', () => {
  // Two files here have to talk about U+FEFF, and both must spell it
  // rather than embed it. An editor that writes the character instead of the
  // escape produces source that behaves identically and reads as a blank in
  // every diff view — which is how it goes unnoticed until someone re-saves the
  // file and drops or doubles it. It happened three times while this was being
  // written, which is why it is asserted rather than remembered.
  for (const rel of SHIPPED) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(
      !text.includes('\uFEFF'),
      rel + ' contains a literal byte-order mark; write \\uFEFF instead',
    );
  }
});
