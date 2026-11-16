/**
 * security-reviewer S1, S4 (spec 3, 4; A2, A4): the security trigger list lives in the skill.
 * What stays is the forbidden-pattern lints and the fundamentalist's tool grant; the phrase
 * pins that once held the trigger wording are gone (crew-tests-behaviour S10, L5): prose is
 * not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

const TRIGGER =
  'auth, user input, secrets, an API boundary (a route, a hook input, a CLI argument), a process start, ' +
  'or agent configuration (`agents/`, `hooks/`, `skills/`, `settings*.json`, `.mcp.json`, `CLAUDE.md`)';

const pilotStep = (n) => {
  const match = new RegExp(`### ${n}\. (.*?) ### ${n + 1}\. `).exec(read('agents/pilot.md'));
  assert.ok(match, `agents/pilot.md has no step ${n}`);
  return match[1];
};

test('step 5 holds on the Reviewers line alone', () => {
  // lint: step 5 does not hold on the diff hitting the trigger
  assert.doesNotMatch(pilotStep(5), /diff hits the security trigger/, 'step 5 holds on the Reviewers line alone');
});

test('the fundamentalist does not copy the trigger list', () => {
  const report = /## Report (.*?) ## Voice/.exec(read('agents/pilot-fundamentalist.md'));
  assert.ok(report, 'agents/pilot-fundamentalist.md has no Report section');
  // lint: the trigger list is not copied; no separate item 7
  assert.ok(!report[1].includes(TRIGGER), 'the trigger list is not copied');
  assert.doesNotMatch(report[1], / 7\. /, 'the separate item 7 is gone');
});

test('the fundamentalist still spawns no reviewer', () => {
  // cheaper-crew S2 (spec 4) gave it one child, the evidence runner, and no other (A2).
  const source = fs.readFileSync(path.join(ROOT, 'agents/pilot-fundamentalist.md'), 'utf8');
  const tools = /^tools: (.*)$/m.exec(source);
  assert.ok(tools, 'the fundamentalist has no tools line');
  const grants = [...tools[1].matchAll(/\bAgent\b(\([^)]*\))?/g)].map(([, list]) => list);
  assert.deepEqual(grants, ['(pilot:pilot-evidence-runner)'], 'the fundamentalist may spawn its runner only (A2)');
});
