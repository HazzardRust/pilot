/**
 * Pins for `pilot reach <level>` (plain-session S4, L1 L4 L5): one apply per level over a
 * scratch home writes `reach.json` and exactly what L4's row says each place holds, and an
 * unknown level changes nothing.
 *
 * Every home here sits under a moved home directory (`lib/fake-home.mjs`), because an apply
 * writes into `~/.claude`.
 */

// First, and before any module that can resolve a path from the home directory.
import { FAKE_HOME } from './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { applyReach } = await import('../apply-reach.mjs');
const { filesUnder } = await import('../build-rules-ledger.mjs');
const { rulesRoot, readReach, PLUGIN_ID } = await import('../reach.mjs');
const { statusLineSetting, subagentStatusLineSetting } = await import('../install-settings.mjs');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGIN_ROOT = path.join(FAKE_HOME, 'plugins', 'cache', 'pilot', 'pilot', '9.9.9');

function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(FAKE_HOME, 'apply-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

const count = (dir) => (fs.existsSync(dir) ? filesUnder(dir).length : 0);
const homeRules = (home) => path.join(home, '.claude', 'rules');
const rootRules = (home) => path.join(rulesRoot({ home }), '.claude', 'rules');
const settingsOf = (home) => JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
const stored = (home) => JSON.parse(fs.readFileSync(path.join(home, '.claude', 'pilot', 'reach.json'), 'utf8'));
const apply = (home, level) => applyReach(level, { home, pluginRoot: PLUGIN_ROOT });

test('nothing leaves no pilot in a plain session', (t) => {
  const home = scratchHome(t);
  apply(home, 'everything'); // a machine moving down, so the status line and the rules are there to remove

  const report = apply(home, 'nothing');

  assert.equal(report.level, 'nothing');
  assert.equal(count(homeRules(home)), 0);
  assert.equal(count(rootRules(home)), 113);
  assert.equal(settingsOf(home).enabledPlugins[PLUGIN_ID], false);
  assert.equal(Object.hasOwn(settingsOf(home), 'statusLine'), false);
  assert.equal(stored(home).level, 'nothing');
  assert.equal(typeof stored(home).at, 'string');
  assert.deepEqual(readReach({ home }), { level: 'nothing', chosen: true });
});

test('everything restores today\'s install', (t) => {
  const home = scratchHome(t);
  apply(home, 'nothing'); // and back up again

  apply(home, 'everything');

  assert.equal(count(homeRules(home)), 113);
  assert.equal(count(rootRules(home)), 0);
  assert.equal(settingsOf(home).enabledPlugins[PLUGIN_ID], true);
  assert.deepEqual(settingsOf(home).statusLine, statusLineSetting(PLUGIN_ROOT));
  assert.equal(stored(home).level, 'everything');
});

test('rules is the middle', (t) => {
  const home = scratchHome(t);
  apply(home, 'everything');

  apply(home, 'rules');

  assert.equal(count(homeRules(home)), 111);
  assert.deepEqual(filesUnder(rootRules(home)).sort(), ['orchestration.md', 'vertical-execution.md']);
  assert.equal(settingsOf(home).enabledPlugins[PLUGIN_ID], false);
  assert.equal(Object.hasOwn(settingsOf(home), 'statusLine'), false);
  assert.equal(stored(home).level, 'rules');
});

test('moving down leaves a user\'s own status line', (t) => {
  const home = scratchHome(t);
  const theirs = { type: 'command', command: 'node "C:/mine/statusline.js"' };
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), `${JSON.stringify({ statusLine: theirs })}\n`);

  apply(home, 'nothing');

  assert.deepEqual(settingsOf(home).statusLine, theirs);
});

test('moving down leaves an edited rule and names it', (t) => {
  const home = scratchHome(t);
  apply(home, 'everything');
  const edited = path.join(homeRules(home), 'orchestration.md');
  fs.appendFileSync(edited, '\nmine\n');
  const bytes = fs.readFileSync(edited);

  const report = apply(home, 'nothing');

  assert.deepEqual(fs.readFileSync(edited), bytes);
  assert.deepEqual(report.rules.home.differing, [{ file: 'orchestration.md', reason: 'edited' }]);
});

test('an apply that throws leaves the stored level', (t) => {
  const home = scratchHome(t);
  apply(home, 'everything');
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{ not json');

  assert.throws(() => apply(home, 'nothing'));

  assert.equal(stored(home).level, 'everything');
});

/** Every file under `dir` with its bytes, so a run that changes one byte is seen. */
function snapshot(dir) {
  return Object.fromEntries(filesUnder(dir).sort().map((file) => [file, fs.readFileSync(path.join(dir, file)).toString('base64')]));
}

test('an unknown level changes nothing', (t) => {
  const home = scratchHome(t);
  apply(home, 'rules');
  const before = snapshot(home);

  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') };
  const result = spawnSync(process.execPath, [path.join(REPO, 'bin', 'pilot.mjs'), 'reach', 'some'], { env, encoding: 'utf8' });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /nothing\|rules\|everything/);
  assert.deepEqual(snapshot(home), before);
});

test('nothing leaves no subagent status line', (t) => {
  const home = scratchHome(t);
  apply(home, 'everything');
  apply(home, 'nothing');
  assert.equal(Object.hasOwn(settingsOf(home), 'subagentStatusLine'), false);

  const mine = scratchHome(t);
  const theirs = { type: 'command', command: 'node "C:/mine/sub.js"' };
  fs.mkdirSync(path.join(mine, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(mine, '.claude', 'settings.json'), `${JSON.stringify({ subagentStatusLine: theirs })}
`);
  apply(mine, 'nothing');
  assert.deepEqual(settingsOf(mine).subagentStatusLine, theirs, "a user's own line is kept");
});

test('everything restores the subagent status line', (t) => {
  const home = scratchHome(t);
  apply(home, 'nothing');
  apply(home, 'everything');
  assert.deepEqual(settingsOf(home).subagentStatusLine, subagentStatusLineSetting(PLUGIN_ROOT));
});
