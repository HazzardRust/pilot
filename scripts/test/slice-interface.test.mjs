/**
 * S1 (architect-depth): the slice-file shape. Lints stay for the anatomy table's fields and
 * order, the worked example's Reviewers field, and item 8 leaving the path to the skill. The
 * phrase pins are gone (crew-tests-behaviour S10, L5): prose is not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ANATOMY_FIELDS = [
  'Source spec',
  'Dependencies',
  'Reviewers',
  'Model',
  'Files owned',
  'Interface',
  'Behaviours',
  'Expected behaviour',
  'Verification commands',
  'Evidence required',
  'Prohibited shortcuts',
  'Completion condition',
];

const anatomySection = () => {
  const skill = read('skills/vertical-slicing/SKILL.md');
  const match = /## Anatomy of a slice\r?\n([\s\S]*?)\r?\n## Sizing/.exec(skill);
  assert.ok(match, 'skills/vertical-slicing/SKILL.md has no "## Anatomy of a slice" section');
  return match[1];
};

const architectItem8 = () => {
  const architect = read('agents/pilot-architect.md');
  const match = /8\.\s+\*\*Slices\*\*:([\s\S]*?)\r?\n9\./.exec(architect);
  assert.ok(match, 'agents/pilot-architect.md has no numbered item 8, "Slices"');
  return match[1];
};

test('vertical-slicing names twelve fields, Interface and Behaviours among them, in order', () => {
  const section = anatomySection();
  const rows = [...section.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|/gm)].map((m) => m[1]);
  // lint: the anatomy table lists these fields, in this order
  assert.deepEqual(rows, ANATOMY_FIELDS, 'the anatomy table must list exactly these twelve fields, in this order');
});

test('the worked slice carries a Reviewers line', () => {
  const section = anatomySection();
  const worked = /````markdown\r?\n([\s\S]*?)\r?\n````/.exec(section);
  assert.ok(worked, 'the anatomy section has no worked slice-file example fenced with four backticks');
  // lint: the worked slice file has a Reviewers field
  assert.match(worked[1], /^Reviewers: `pilot:[a-z-]+`/m, 'the worked example carries no Reviewers line');
});

test("a slice's fields live in its own slice file", () => {
  // lint: item 8 leaves the slice-file path and field count to the skill (L3)
  assert.doesNotMatch(architectItem8(), /slices\/S<n>\.md|ten fields/, 'item 8 must leave the slice-file path and field count to the skill (L3)');
});
