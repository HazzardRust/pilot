#!/usr/bin/env node
/**
 * S2 of wait-deadlines: a pilot lane's unbounded wait loop is refused before it runs (spec 2; L2-L4, L8).
 * Waits A and B are copied verbatim from their transcripts; C is rebuilt from its friction row (§3).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { decide, unboundedWaits } = require('../shell-write-guard.js');

const lane = { agent_type: 'pilot:pilot-implementer', agent_id: 'a1', tool_name: 'Bash', cwd: process.cwd() };
const noGit = { isTracked: () => [] };
const call = (command, extra) => decide({ ...lane, tool_input: { command, ...extra } }, noGit);
const decisionOf = (out) => out && out.hookSpecificOutput.permissionDecision;
const reasonOf = (out) => (out && out.hookSpecificOutput.permissionDecisionReason) || '';

const TASKS = 'C:/Users/Hazzard/AppData/Local/Temp/claude/7a69d4d978d8168b/cfcac5b0-fb40-4125-9d49-5518e21aebe4/tasks';
const WAIT_A = `until grep -q "Verdict:" "${TASKS}/aae774cecc9aca02a.output"; do sleep 5; done; echo done`;
const WAIT_B = `until grep -q NODE-DONE ${TASKS}/bjiht9qfr.output || grep -q "^# fail" ${TASKS}/bjiht9qfr.output; ` +
  `do sleep 3; done; cat ${TASKS}/bjiht9qfr.output`;
const WAIT_C = 'until grep -q "^exit" /tmp/s8-npm.log; do sleep 10; done';

test('the recorded loops are refused', () => {
  for (const [command, timeout] of [[WAIT_A, 300000], [WAIT_B, 590000], [WAIT_C, undefined]]) {
    const out = call(command, timeout === undefined ? {} : { timeout });
    assert.strictEqual(decisionOf(out), 'deny', command);
    assert.match(reasonOf(out), /pilot wait-for --file F --match RE --timeout M/);
    assert.match(reasonOf(out), /This is not a blocked step: post nothing and carry on\.$/);
  }
  assert.match(reasonOf(call(WAIT_A)), /not its output file/, 'a tasks/*.output condition names the message');
  assert.doesNotMatch(reasonOf(call(WAIT_C)), /not its output file/, 'a plain log does not');
});

test('unbounded shapes are refused', () => {
  const shapes = [
    ['until grep -q x f.log; do sleep 5; done', 'until', 'x'],
    ['while ! grep -q "ready" out.txt; do sleep 1; done', 'while', 'ready'],
    ['until grep -q a f || grep -q b f; do sleep 2; done', 'until', 'a'],
    ['until [ "$(grep -c ok f)" -gt 0 ]; do sleep 2; done', 'until', null],
    ['until test $(wc -l < f) -gt 3; do sleep 2; done', 'until', null],
    ['cd x && until grep -q done f; do sleep 4; done', 'until', 'done'],
    ['until grep -q x f; do sleep 5; done; echo done', 'until', 'x'],
    ['while true; do grep -q x f && break; sleep 5; done', 'while', null],
  ];
  for (const [command, form, marker] of shapes) {
    const found = unboundedWaits(command);
    assert.strictEqual(found.length, 1, command);
    assert.strictEqual(found[0].form, form, command);
    if (marker !== null) assert.strictEqual(found[0].marker, marker, command);
  }
  assert.strictEqual(unboundedWaits('until [ -s out.json ]; do sleep 1; done')[0].marker, 'out.json');
  assert.strictEqual(unboundedWaits("bash -c 'until grep -q x f; do sleep 1; done'").length, 1, 'bash -c with no timeout');
  assert.strictEqual(unboundedWaits("timeout 0 bash -c 'until grep -q x f; do sleep 1; done'").length, 1, 'timeout 0 never fires');
});

test('bounded shapes run', () => {
  const loop = 'until grep -q x f; do sleep 5; done';
  for (const command of [
    'pilot wait-for --file out.log --match "^ok" --timeout 30',
    `timeout 600 bash -c '${loop}'`,
    `timeout 50m sh -c '${loop}'`,
    `timeout -k 5 3000 bash -c '${loop}'`,
    'for i in $(seq 60); do grep -q x f && break; sleep 1; done',
    'while read -r line; do echo "$line"; done < f',
    'until git push; do git pull --rebase; done',
    'echo "until grep -q x f; do sleep 5; done"',
  ]) assert.strictEqual(call(command), null, command);
  assert.strictEqual(decisionOf(call(`timeout 7200 bash -c '${loop}'`)), 'deny', 'over 3000 s is no bound');
  assert.strictEqual(decisionOf(call(`timeout 1h bash -c '${loop}'`)), 'deny', 'an hour is over 3000 s');
  assert.strictEqual(decisionOf(call(loop, { timeout: 300000 })), 'deny', 'tool_input.timeout is never a bound');
});

test('only pilot lanes, and it fails open', () => {
  const loop = 'until grep -q x f; do sleep 5; done';
  assert.strictEqual(decisionOf(call(loop)), 'deny', 'the control: the same loop on a pilot lane');
  assert.strictEqual(decide({ agent_type: 'general-purpose', agent_id: 'a2', tool_input: { command: loop } }, noGit), null);
  assert.strictEqual(decide({ tool_input: { command: loop } }, noGit), null, 'no agent type');
  for (const payload of [null, 'text', { ...lane }, { ...lane, tool_input: { command: 42 } }]) {
    assert.strictEqual(decide(payload, noGit), null, JSON.stringify(payload));
  }
  for (const command of ['until grep -q x f; do sleep 5', "until grep -q 'x f; do sleep 5; done", 'do sleep 5; done']) {
    assert.strictEqual(call(command), null, command);
  }
});
