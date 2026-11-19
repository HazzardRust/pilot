#!/usr/bin/env node
/**
 * S1 of audit-f12: a pilot lane's `sed -i` on a tracked file is refused (spec 1, 4-7; L1-L5, L7).
 * Tracked is answered by a real `git ls-files` in a temp repo, so swapping the lookup keeps these.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { decide } = require('../shell-write-guard.js');
const { isWindows } = require('../lib/platform.js');

const HOOK = path.join(__dirname, '..', 'shell-write-guard.js');
const lane = { agent_type: 'pilot:pilot-implementer', agent_id: 'a1', tool_name: 'Bash' };

/** A temp repo: f.md and sub/f.md tracked, loose.md untracked, junk.md ignored. */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swg-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  for (const f of ['f.md', 'sub/f.md', 'loose.md', 'junk.md']) fs.writeFileSync(path.join(dir, f), 'a\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'junk.md\n');
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'add', 'f.md', 'sub/f.md', '.gitignore']);
  return dir;
}

const repo = makeRepo();
const call = (command, extra) => decide({ ...lane, cwd: repo, tool_input: { command }, ...extra });
const reasonOf = (out) => out && out.hookSpecificOutput.permissionDecisionReason;

test('sed -i on a tracked file is refused', (t) => {
  const abs = path.join(repo, 'f.md').replace(/\\/g, '/');
  const forms = [`sed -i 's/a/b/' f.md`, `sed --in-place 's/a/b/' ${abs}`, `cd sub && sed -i 's/a/b/' f.md`];
  if (isWindows()) forms.push(`sed -i 's/a/b/' ${abs.replace(/^([A-Za-z]):/, (_m, d) => '/' + d.toLowerCase())}`);
  else t.diagnostic('the /c/... form maps on win32 only');
  for (const command of forms) {
    const out = call(command);
    assert.strictEqual(out && out.hookSpecificOutput.permissionDecision, 'deny', command);
    assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    for (const word of ['f.md', 'Edit', 'Write']) assert.ok(reasonOf(out).includes(word), `${command}: ${word}`);
  }
});

test('sed -i on an untracked file runs', () => {
  for (const command of [`sed -i 's/a/b/' loose.md`, `sed -i 's/a/b/' junk.md`]) assert.strictEqual(call(command), null, command);
  // f.md is tracked at cwd, but after a non-literal cd the relative path names an unknown dir (L7).
  assert.strictEqual(call(`cd "$D" && sed -i 's/a/b/' f.md`), null, 'a non-literal cd');
});

test('the refusal is not a blocked step', () => {
  const reason = reasonOf(call(`sed -i 's/a/b/' f.md`));
  assert.ok(reason.includes('not a blocked step'), reason);
  assert.ok(!reason.startsWith('Refused:'), reason);
});

test('the hook fails open', () => {
  assert.strictEqual(decide('not an object'), null);
  assert.strictEqual(decide(null), null);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'swg-out-'));
  fs.writeFileSync(path.join(outside, 'f.md'), 'a\n');
  assert.strictEqual(call(`sed -i 's/a/b/' f.md`, { cwd: outside }), null, 'a dir outside any repo');
  const throwing = () => { throw new Error('git missing'); };
  assert.strictEqual(decide({ ...lane, cwd: repo, tool_input: { command: `sed -i 's/a/b/' f.md` } }, { isTracked: throwing }), null);
});

test('no candidate spawns no git', () => {
  let calls = 0;
  const isTracked = (paths) => { calls += 1; return paths; };
  for (const command of ['ls -la', 'git status', 'npm test', `sed -n 's/a/b/p' f.md`]) {
    assert.strictEqual(decide({ ...lane, cwd: repo, tool_input: { command } }, { isTracked }), null, command);
  }
  assert.strictEqual(calls, 0);
});

test('only pilot lanes are guarded', () => {
  assert.strictEqual(call(`sed -i 's/a/b/' f.md`, { agent_type: 'Explore' }), null, 'Explore with an agent_id');
  assert.strictEqual(call(`sed -i 's/a/b/' f.md`, { agent_type: undefined, agent_id: undefined }), null, 'no agent_type');
});

test('the manifest wires it on Bash', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks.json'), 'utf8'));
  const entry = manifest.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('shell-write-guard.js')));
  assert.ok(entry, 'shell-write-guard.js is registered on PreToolUse');
  assert.strictEqual(entry.matcher, '^Bash$');
  const run = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ ...lane, hook_event_name: 'PreToolUse', cwd: repo, tool_input: { command: `sed -i 's/a/b/' f.md` } }),
    encoding: 'utf8',
  });
  assert.strictEqual(run.status, 0);
  assert.strictEqual(JSON.parse(run.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
