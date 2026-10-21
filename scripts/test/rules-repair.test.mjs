/**
 * Pins for `install-rules.mjs --repair`, the SessionStart hook that brings an installed
 * rules copy up to the package after an upgrade (ADR 0079, spec 5-7 of audit-fixes).
 *
 * Every run is against a scratch target and a scratch state dir, and the home directory
 * itself is moved first (`lib/fake-home.mjs`): this hook writes into `~/.claude/rules`
 * unattended, so a test that reached the real one would be the bug it guards against.
 */

// First, and before any module that can resolve a path from the home directory.
import { FAKE_HOME } from './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'install-rules.mjs');

const { repairRules, rulesSource } = await import('../install-rules.mjs');

// 0.7.10, a release whose rules every file below differs from today.
const OLD = '975b12c2';
const shippedAt = (rel) => execFileSync('git', ['-C', ROOT, 'show', `${OLD}:rules/${rel}`]);
const hasHistory = () => {
  try {
    shippedAt('orchestration.md');
    return true;
  } catch {
    return false;
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function scratch(t, prefix = 'pilot-repair-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A rules target seeded with `files`, and a state dir of its own. */
function seeded(t, files = {}) {
  const home = scratch(t);
  const target = path.join(home, 'rules');
  for (const [rel, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
    fs.writeFileSync(path.join(target, rel), bytes);
  }
  return { target, state: path.join(home, 'state') };
}

const repair = ({ target, state }) =>
  spawnSync(process.execPath, [SCRIPT, '--repair', '--target', target, '--state', state], { encoding: 'utf8' });

/** The one line the hook prints, parsed, or null when it printed nothing. */
function said(run) {
  assert.equal(run.status, 0, run.stderr);
  if (run.stdout === '') return null;
  const lines = run.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'one line, not a report');
  return JSON.parse(lines[0]).systemMessage;
}

const edit = (rel) => Buffer.concat([fs.readFileSync(path.join(rulesSource(), rel)), Buffer.from('my line\n')]);

test('a shipped copy of an old version is replaced', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const at = seeded(t, { 'orchestration.md': shippedAt('orchestration.md'), 'vertical-execution.md': shippedAt('vertical-execution.md') });

  const message = said(repair(at));

  for (const rel of ['orchestration.md', 'vertical-execution.md']) {
    assert.deepEqual(fs.readFileSync(path.join(at.target, rel)), fs.readFileSync(path.join(rulesSource(), rel)), rel);
  }
  assert.match(message, /brought up to this version/);
  assert.match(message, /2 updated/);
});

test('a retired shipped copy is deleted', (t) => {
  if (!hasHistory()) return t.skip('no git history to recover the shipped bytes from');
  const at = seeded(t, { 'README.md': shippedAt('README.md') });
  assert.ok(!fs.existsSync(path.join(rulesSource(), 'README.md')), 'README.md is retired');

  const message = said(repair(at));

  assert.equal(fs.existsSync(path.join(at.target, 'README.md')), false);
  assert.match(message, /1 deleted/);
});

test('an edited rule keeps its bytes and is named once', (t) => {
  const edited = edit('orchestration.md');
  const at = seeded(t, { 'orchestration.md': edited });

  assert.match(said(repair(at)), /orchestration\.md/);
  assert.deepEqual(fs.readFileSync(path.join(at.target, 'orchestration.md')), edited);
  assert.equal(said(repair(at)), null, 'the second session hears nothing');
  assert.deepEqual(fs.readFileSync(path.join(at.target, 'orchestration.md')), edited);
});

test('a new edited file is named again', (t) => {
  const at = seeded(t, { 'orchestration.md': edit('orchestration.md') });
  said(repair(at));

  fs.writeFileSync(path.join(at.target, 'vertical-execution.md'), edit('vertical-execution.md'));
  const message = said(repair(at));

  assert.match(message, /orchestration\.md/);
  assert.match(message, /vertical-execution\.md/);
});

test('nothing changed prints nothing', (t) => {
  const at = seeded(t);
  said(repair(at));

  const run = repair(at);

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
});

test('a link out of the target is not written through', (t) => {
  const outside = scratch(t, 'pilot-repair-elsewhere-');
  fs.writeFileSync(path.join(outside, 'a.md'), 'old\n');
  const source = scratch(t, 'pilot-repair-src-');
  fs.mkdirSync(path.join(source, 'linked'));
  fs.writeFileSync(path.join(source, 'linked', 'a.md'), 'new\n');
  const at = seeded(t);
  fs.mkdirSync(at.target);
  fs.symlinkSync(outside, path.join(at.target, 'linked'), 'junction');

  const result = repairRules({ source, target: at.target, stateDir: at.state, ledger: { 'linked/a.md': [sha256('old\n')] } });

  assert.equal(fs.readFileSync(path.join(outside, 'a.md'), 'utf8'), 'old\n');
  assert.equal(result.changed, false);
  assert.match(result.message, /linked\/a\.md/, 'a write it refused is said, not swallowed');
});

test('the default target is repaired only from the plugin cache', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--repair'], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
  assert.equal(fs.existsSync(path.join(FAKE_HOME, '.claude', 'rules')), false, 'a worktree never writes the home');
});

test('the hook entry runs --repair at SessionStart with a 5 s timeout', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  const entry = hooks.hooks.SessionStart.find((row) => row.id === 'start:any:rules-repair');

  assert.ok(entry, 'a SessionStart entry of its own');
  assert.equal(entry.hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/install-rules.mjs" --repair');
  assert.equal(entry.hooks[0].timeout, 5);
});

test('a state dir that cannot be written still lets the message out', (t) => {
  const at = seeded(t, { 'orchestration.md': edit('orchestration.md') });
  fs.writeFileSync(at.state, 'a file where the state dir goes\n');

  assert.match(said(repair(at)), /orchestration\.md/);
});

test('--repair refuses --dry-run rather than writing anyway', (t) => {
  const at = seeded(t);
  const run = spawnSync(process.execPath, [SCRIPT, '--repair', '--dry-run', '--target', at.target, '--state', at.state], { encoding: 'utf8' });

  assert.equal(run.status, 2);
  assert.equal(fs.existsSync(at.target), false);
});
