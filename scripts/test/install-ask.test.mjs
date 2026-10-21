/**
 * The install's ask rules (L22): a session asks before a push or a merge to the default
 * branch, written in the usual forms. Kept apart from `install.test.mjs`, which another
 * plan edits. Every test runs against a scratch file under a moved home directory.
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

// Written out rather than imported, so a rule dropped from the script fails here.
const ASK = [
  'Bash(git push origin main)',
  'Bash(git push origin main *)',
  'Bash(git push origin *:main)',
  'Bash(git push origin master)',
  'Bash(git push origin master *)',
  'Bash(git push origin *:master)',
  'Bash(gh pr merge)',
  'Bash(gh pr merge *)',
];

function settingsFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-ask-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  if (contents !== undefined) fs.writeFileSync(file, contents, 'utf8');
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const backupsBeside = (file) =>
  fs.readdirSync(path.dirname(file)).filter((name) => name.includes('pilot-backup'));
const install = (file) => installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT });

test('the install adds the ask rules to an empty settings file', (t) => {
  const file = settingsFile(t, '{}');

  const report = install(file);

  const { permissions } = readJson(file);
  assert.deepEqual(permissions, { ask: ASK }, 'ask rules only: no allow and no deny rule');
  assert.deepEqual(report.ask.added, ASK);
  assert.match(report.notes.join('\n'), /git push origin \*:main/, 'the report names what it added');
  assert.ok(permissions.ask.includes('Bash(gh pr merge)'), 'the bare merge of the current branch\'s PR asks too (A15)');
});

test('a second install adds nothing and writes nothing', (t) => {
  const file = settingsFile(t, '{}');
  install(file);
  const before = fs.readFileSync(file, 'utf8');
  const backups = backupsBeside(file);

  const report = install(file);

  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(backupsBeside(file), backups, 'no write, so no backup');
  assert.deepEqual(report.ask.added, []);
  assert.deepEqual(report.ask.alreadyPresent, ASK);
});

test("the user's own allow, ask and deny rules are kept byte for byte", (t) => {
  const theirs = {
    deny: ['Read(./.env)', 'Bash(rm -rf *)'],
    allow: ['Bash(git status)', 'WebFetch(domain:nodejs.org)'],
    ask: ['Bash(npm publish)', 'Bash(git push origin main)'],
    defaultMode: 'default',
  };
  const file = settingsFile(t, JSON.stringify({ permissions: theirs }, null, 2));

  const report = install(file);

  const { permissions } = readJson(file);
  assert.deepEqual(Object.keys(permissions), ['deny', 'allow', 'ask', 'defaultMode'], 'in their order');
  assert.deepEqual(permissions.deny, theirs.deny);
  assert.deepEqual(permissions.allow, theirs.allow);
  assert.equal(permissions.defaultMode, 'default');
  assert.deepEqual(
    permissions.ask,
    [...theirs.ask, ...ASK.filter((rule) => rule !== 'Bash(git push origin main)')],
    'theirs first, as written, and a rule they already ask on is not added twice',
  );
  assert.deepEqual(report.ask.alreadyPresent, ['Bash(git push origin main)']);
});

test('a rule the user already denies is reported and not added to ask', (t) => {
  const file = settingsFile(
    t,
    JSON.stringify({ permissions: { deny: ['Bash(gh pr merge *)', 'Bash(git push origin master:*)'] } }),
  );

  const report = install(file);

  const { permissions } = readJson(file);
  const denied = ['Bash(git push origin master)', 'Bash(git push origin master *)', 'Bash(gh pr merge *)'];
  assert.deepEqual(report.ask.denied, denied);
  assert.deepEqual(permissions.ask, ASK.filter((rule) => !denied.includes(rule)));
  assert.deepEqual(permissions.deny, ['Bash(gh pr merge *)', 'Bash(git push origin master:*)']);
  assert.match(report.notes.join('\n'), /deny/, 'the report says why they were left alone');
});

test('a deny rule covers an ask rule only when it matches the rule as written', (t) => {
  for (const [deny, denied] of [
    [['Bash'], ASK],
    [['Bash(*)'], ASK],
    [['Bash(git push *)'], ASK.slice(0, 6)],
    [['Bash(git push origin main)'], ['Bash(git push origin main)']],
    [['Read(./.env)', 'WebFetch'], []],
  ]) {
    const file = settingsFile(t, JSON.stringify({ permissions: { deny } }));
    assert.deepEqual(install(file).ask.denied, denied, deny.join(', '));
  }
});

test('the WebFetch allowlist and the ask rules land in one write, neither losing the other', (t) => {
  const file = settingsFile(t);

  installSettings({ settingsPath: file, pluginRoot: PLUGIN_ROOT, domains: ['nodejs.org'] });

  assert.deepEqual(readJson(file).permissions, { allow: ['WebFetch(domain:nodejs.org)'], ask: ASK });
});

test('an unreadable permissions block refuses as today', (t) => {
  for (const [name, settings] of Object.entries({
    'permissions as a list': { permissions: ['Bash(git push origin main)'] },
    'ask as a string': { permissions: { ask: 'Bash(git push origin main)' } },
    'deny as a string': { permissions: { deny: 'Bash' } },
  })) {
    const original = JSON.stringify(settings, null, 2);
    const file = settingsFile(t, original);

    assert.throws(() => install(file), /permissions/, name);
    assert.equal(fs.readFileSync(file, 'utf8'), original, `${name}: left untouched`);
    assert.deepEqual(backupsBeside(file), [], `${name}: nothing written, nothing backed up`);
  }
});
